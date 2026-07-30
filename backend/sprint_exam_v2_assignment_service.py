from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

import models
import sprint_exam_v2_retake_approval_service as retake_approval_service
from sprint_exam_v2_assignment_validation import (
    SprintExamV2AssignmentDomainError,
    resolve_assignment_papers,
)


class SprintExamV2AssignmentNotFoundError(LookupError):
    pass


class SprintExamV2AssignmentConflictError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message

    def detail(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}


def _aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def validate_time_range(available_from: datetime | None, due_at: datetime | None) -> None:
    if available_from is not None and due_at is not None and _aware_utc(due_at) < _aware_utc(available_from):
        raise SprintExamV2AssignmentDomainError("INVALID_ASSIGNMENT_TIME_RANGE", "due_at은 available_from 이후여야 합니다.")


def _load_exam_for_assignment(db: Session, exam_id: int) -> models.SprintExamV2:
    exam = (
        db.query(models.SprintExamV2)
        .options(
            selectinload(models.SprintExamV2.score_groups)
            .selectinload(models.SprintExamV2ScoreGroup.papers)
            .selectinload(models.SprintExamV2Paper.questions),
            selectinload(models.SprintExamV2.score_groups).selectinload(models.SprintExamV2ScoreGroup.grade_cuts),
        )
        .filter(models.SprintExamV2.id == exam_id)
        .first()
    )
    if exam is None:
        raise SprintExamV2AssignmentNotFoundError("Sprint Exam V2 exam not found.")
    return exam


def _student_program(db: Session, student: models.Student, exam: models.SprintExamV2) -> models.SprintProgram:
    query = db.query(models.SprintProgram).filter(
        models.SprintProgram.student_id == student.id,
        models.SprintProgram.is_active.is_(True),
    )
    if exam.exam_date is not None:
        program = (
            query.filter(
                models.SprintProgram.start_date <= exam.exam_date,
                models.SprintProgram.end_date >= exam.exam_date,
            )
            .order_by(models.SprintProgram.start_date.desc(), models.SprintProgram.id.desc())
            .first()
        )
        if program is not None:
            return program
    program = query.order_by(models.SprintProgram.start_date.desc(), models.SprintProgram.id.desc()).first()
    if program is None:
        raise SprintExamV2AssignmentDomainError(
            "SPRINT_PROGRAM_NOT_FOUND",
            "학생에게 연결할 활성 SprintProgram이 없습니다.",
            student_id=student.id,
        )
    return program


def _load_students(db: Session, student_ids: list[int]) -> list[models.Student]:
    students = db.query(models.Student).filter(models.Student.id.in_(student_ids)).all()
    found = {student.id for student in students}
    missing = [student_id for student_id in student_ids if student_id not in found]
    if missing:
        raise SprintExamV2AssignmentDomainError(
            "STUDENT_NOT_FOUND",
            "존재하지 않는 학생이 포함되어 있습니다.",
            student_id=missing[0],
        )
    return sorted(students, key=lambda student: student_ids.index(student.id))


def _duplicate_assignment_exists(db: Session, exam_id: int, student_ids: list[int]) -> int | None:
    row = (
        db.query(models.SprintExamV2Assignment.student_id)
        .filter(
            models.SprintExamV2Assignment.exam_id == exam_id,
            models.SprintExamV2Assignment.student_id.in_(student_ids),
        )
        .first()
    )
    return row[0] if row else None


def _snapshot_paper(assignment: models.SprintExamV2Assignment, paper: models.SprintExamV2Paper) -> models.SprintExamV2AssignmentPaper:
    group = paper.score_group
    return models.SprintExamV2AssignmentPaper(
        assignment=assignment,
        paper=paper,
        score_group=group,
        subject_code_snapshot=paper.subject_code,
        subject_name_snapshot=paper.subject_name,
        paper_role_snapshot=paper.paper_role,
        slot_snapshot=paper.slot,
        display_order_snapshot=paper.source_order,
        score_group_code_snapshot=group.score_group_code,
        score_group_name_snapshot=group.score_group_name,
        matched_by="student_profile",
    )


def _attempt_count(db: Session, assignment_id: int) -> int:
    return db.query(models.SprintExamV2Attempt).filter(models.SprintExamV2Attempt.assignment_id == assignment_id).count()


def _loaded_attempt_count(assignment: models.SprintExamV2Assignment) -> int:
    return len(assignment.attempts or [])


def _normalize_attempt_limit(value: Any | None) -> int:
    if value is None:
        return 1
    try:
        limit = int(value)
    except (TypeError, ValueError) as exc:
        raise SprintExamV2AssignmentDomainError("INVALID_ATTEMPT_LIMIT", "attempt_limit must be an integer greater than or equal to 1.") from exc
    if limit < 1:
        raise SprintExamV2AssignmentDomainError("INVALID_ATTEMPT_LIMIT", "attempt_limit must be greater than or equal to 1.")
    return limit


def _normalize_paper_selection_mode(value: Any | None, *, has_overrides: bool = False) -> str:
    if value is None:
        return "override" if has_overrides else "student_profile"
    mode = str(value).strip() or "student_profile"
    if mode not in {"student_profile", "override"}:
        raise SprintExamV2AssignmentDomainError(
            "INVALID_PAPER_SELECTION_MODE",
            "paper_selection_mode must be student_profile or override.",
        )
    return mode


def computed_status(assignment: models.SprintExamV2Assignment, *, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    if assignment.status in {"submitted", "closed"}:
        return "completed" if assignment.status == "submitted" else "expired"
    available_from = _aware_utc(assignment.available_from)
    due_at = _aware_utc(assignment.submission_deadline_at)
    if due_at is not None and now > due_at:
        return "expired"
    if available_from is not None and now < available_from:
        return "upcoming"
    return "available"


def _can_start_assignment(assignment: models.SprintExamV2Assignment, eligibility: dict[str, Any]) -> bool:
    status = computed_status(assignment)
    return status == "available" or bool(eligibility.get("has_active_attempt")) or bool(eligibility.get("available_retake_approval_count"))


def serialize_assignment_list_item(db: Session, assignment: models.SprintExamV2Assignment) -> dict[str, Any]:
    eligibility = retake_approval_service.start_eligibility(db, assignment)
    latest_attempt = _latest_attempt(assignment)
    return {
        "id": assignment.id,
        "student_id": assignment.student_id,
        "student_name": assignment.student.name if assignment.student else None,
        "exam_id": assignment.exam_id,
        "exam_title": assignment.exam.title if assignment.exam else None,
        "status": assignment.status,
        "computed_status": computed_status(assignment),
        "paper_count": len(assignment.papers),
        "attempt_count": _loaded_attempt_count(assignment),
        "base_attempt_count": eligibility["base_attempt_count"],
        "available_retake_approval_count": eligibility["available_retake_approval_count"],
        "available_retake_approval_id": eligibility["available_retake_approval_id"],
        "has_started_attempt": eligibility["has_active_attempt"],
        "can_start": _can_start_assignment(assignment, eligibility),
        "attempt_limit": assignment.attempt_limit,
        "paper_selection_mode": assignment.paper_selection_mode,
        "memo": assignment.memo,
        "available_from": assignment.available_from.isoformat() if assignment.available_from else None,
        "due_at": assignment.submission_deadline_at.isoformat() if assignment.submission_deadline_at else None,
        "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
        "latest_attempt": _attempt_payload(latest_attempt),
    }


def _latest_attempt(assignment: models.SprintExamV2Assignment) -> models.SprintExamV2Attempt | None:
    attempts = sorted(
        assignment.attempts or [],
        key=lambda attempt: (attempt.attempt_no or 0, attempt.id or 0),
        reverse=True,
    )
    return attempts[0] if attempts else None


def _active_attempt(assignment: models.SprintExamV2Assignment) -> models.SprintExamV2Attempt | None:
    attempts = sorted(
        [attempt for attempt in assignment.attempts or [] if attempt.status == "started"],
        key=lambda attempt: (attempt.attempt_no or 0, attempt.id or 0),
        reverse=True,
    )
    return attempts[0] if attempts else None


def _attempt_payload(attempt: models.SprintExamV2Attempt | None) -> dict[str, Any] | None:
    if attempt is None:
        return None
    return {
        "id": attempt.id,
        "attempt_no": attempt.attempt_no,
        "status": attempt.status,
        "retake_approval_id": attempt.retake_approval_id,
        "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "scored_at": attempt.scored_at.isoformat() if attempt.scored_at else None,
    }


def serialize_assignment_detail(db: Session, assignment: models.SprintExamV2Assignment) -> dict[str, Any]:
    attempt_count = _loaded_attempt_count(assignment)
    eligibility = retake_approval_service.start_eligibility(db, assignment)
    papers = sorted(assignment.papers, key=lambda paper: paper.id or 0)
    attempts = sorted(assignment.attempts or [], key=lambda attempt: (attempt.attempt_no or 0, attempt.id or 0))
    active_attempt = _active_attempt(assignment)
    latest_attempt = _latest_attempt(assignment)
    return {
        "assignment": {
            "id": assignment.id,
            "exam_id": assignment.exam_id,
            "student_id": assignment.student_id,
            "sprint_program_id": assignment.sprint_program_id,
            "status": assignment.status,
            "computed_status": computed_status(assignment),
            "available_from": assignment.available_from.isoformat() if assignment.available_from else None,
            "due_at": assignment.submission_deadline_at.isoformat() if assignment.submission_deadline_at else None,
            "assigned_at": assignment.assigned_at.isoformat() if assignment.assigned_at else None,
            "attempt_count": attempt_count,
            "base_attempt_count": eligibility["base_attempt_count"],
            "approval_attempt_count": eligibility["approval_attempt_count"],
            "attempt_limit": assignment.attempt_limit,
            "paper_selection_mode": assignment.paper_selection_mode,
            "memo": assignment.memo,
            "can_start": _can_start_assignment(assignment, eligibility),
            "needs_retake_approval": eligibility["needs_retake_approval"],
            "available_retake_approval_count": eligibility["available_retake_approval_count"],
            "available_retake_approval_id": eligibility["available_retake_approval_id"],
            "cannot_start_reason": None if _can_start_assignment(assignment, eligibility) else "NOT_AVAILABLE",
        },
        "student": {
            "id": assignment.student.id,
            "name": assignment.student.name,
            "grade": assignment.student.grade,
            "korean_elective": assignment.korean_elective_snapshot,
            "math_elective": assignment.math_elective_snapshot,
            "inquiry_subject_1": assignment.inquiry_subject_1_snapshot,
            "inquiry_subject_2": assignment.inquiry_subject_2_snapshot,
        },
        "exam": {
            "id": assignment.exam.id,
            "title": assignment.exam.title,
            "exam_date": assignment.exam.exam_date.isoformat() if assignment.exam.exam_date else None,
        },
        "papers": [
            {
                "assignment_paper_id": paper.id,
                "paper_id": paper.paper_id,
                "score_group_id": paper.score_group_id,
                "subject_code": paper.subject_code_snapshot,
                "subject_name": paper.subject_name_snapshot,
                "paper_role": paper.paper_role_snapshot,
                "slot": paper.slot_snapshot,
                "display_order": paper.display_order_snapshot,
                "score_group_code": paper.score_group_code_snapshot,
                "score_group_name": paper.score_group_name_snapshot,
            }
            for paper in papers
        ],
        "active_attempt": _attempt_payload(active_attempt),
        "latest_attempt": _attempt_payload(latest_attempt),
        "attempts": [_attempt_payload(attempt) for attempt in attempts],
    }


def _assignment_query(db: Session):
    return db.query(models.SprintExamV2Assignment).options(
        selectinload(models.SprintExamV2Assignment.exam),
        selectinload(models.SprintExamV2Assignment.student),
        selectinload(models.SprintExamV2Assignment.papers),
        selectinload(models.SprintExamV2Assignment.attempts),
    )


def get_assignment(db: Session, assignment_id: int) -> models.SprintExamV2Assignment:
    assignment = _assignment_query(db).filter(models.SprintExamV2Assignment.id == assignment_id).first()
    if assignment is None:
        raise SprintExamV2AssignmentNotFoundError("Sprint Exam V2 assignment not found.")
    return assignment


def create_assignments(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    exam_id = int(payload["exam_id"])
    student_ids = list(dict.fromkeys(int(student_id) for student_id in payload["student_ids"]))
    if not student_ids:
        raise SprintExamV2AssignmentDomainError("MISSING_STUDENT_IDS", "student_ids는 비어 있을 수 없습니다.")
    available_from = payload.get("available_from")
    due_at = payload.get("due_at")
    validate_time_range(available_from, due_at)
    paper_overrides = payload.get("paper_overrides") or {}
    attempt_limit = 1
    paper_selection_mode = _normalize_paper_selection_mode(
        payload.get("paper_selection_mode"),
        has_overrides=bool(paper_overrides),
    )
    memo = payload.get("memo")

    try:
        exam = _load_exam_for_assignment(db, exam_id)
        duplicate_student_id = _duplicate_assignment_exists(db, exam_id, student_ids)
        if duplicate_student_id is not None:
            raise SprintExamV2AssignmentConflictError("DUPLICATE_EXAM_ASSIGNMENT", "이미 배정된 학생이 포함되어 있습니다.")
        students = _load_students(db, student_ids)
        planned: list[tuple[models.Student, models.SprintProgram, list[models.SprintExamV2Paper], dict[str, str | None]]] = []
        for student in students:
            program = _student_program(db, student, exam)
            overrides = paper_overrides.get(str(student.id)) or paper_overrides.get(student.id) or None
            papers, selections = resolve_assignment_papers(exam, student, program, overrides)
            if not papers:
                raise SprintExamV2AssignmentDomainError(
                    "MATCHING_PAPER_NOT_FOUND",
                    "배정할 시험지가 없습니다.",
                    student_id=student.id,
                )
            planned.append((student, program, papers, selections))

        created: list[dict[str, Any]] = []
        for student, program, papers, selections in planned:
            assignment = models.SprintExamV2Assignment(
                exam=exam,
                program=program,
                student=student,
                status="assigned",
                korean_elective_snapshot=selections["korean"],
                math_elective_snapshot=selections["math"],
                inquiry_subject_1_snapshot=selections["inquiry_1"],
                inquiry_subject_2_snapshot=selections["inquiry_2"],
                available_from=available_from,
                submission_deadline_at=due_at,
                attempt_limit=attempt_limit,
                memo=memo,
                paper_selection_mode=paper_selection_mode,
            )
            db.add(assignment)
            db.flush()
            for paper in papers:
                db.add(_snapshot_paper(assignment, paper))
            created.append({"assignment_id": assignment.id, "student_id": student.id, "status": assignment.status})
        db.commit()
        return {"ok": True, "created": created, "skipped": [], "errors": []}
    except IntegrityError as exc:
        db.rollback()
        raise SprintExamV2AssignmentConflictError("DUPLICATE_EXAM_ASSIGNMENT", "이미 배정된 학생이 포함되어 있습니다.") from exc
    except Exception:
        db.rollback()
        raise


def list_admin_assignments(
    db: Session,
    *,
    limit: int = 20,
    offset: int = 0,
    student_id: int | None = None,
    exam_id: int | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    query = _assignment_query(db).join(models.SprintExamV2Assignment.exam).join(models.SprintExamV2Assignment.student)
    if student_id is not None:
        query = query.filter(models.SprintExamV2Assignment.student_id == student_id)
    if exam_id is not None:
        query = query.filter(models.SprintExamV2Assignment.exam_id == exam_id)
    if status:
        query = query.filter(models.SprintExamV2Assignment.status == status)
    if date_from:
        query = query.filter(models.SprintExamV2.exam_date >= date_from)
    if date_to:
        query = query.filter(models.SprintExamV2.exam_date <= date_to)
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(or_(models.SprintExamV2.title.ilike(like), models.Student.name.ilike(like)))
    total = query.count()
    assignments = (
        query.order_by(models.SprintExamV2Assignment.assigned_at.desc(), models.SprintExamV2Assignment.id.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    return {"items": [serialize_assignment_list_item(db, item) for item in assignments], "total": total, "limit": limit, "offset": offset}


def update_assignment(db: Session, assignment_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    assignment = get_assignment(db, assignment_id)
    attempt_count = _attempt_count(db, assignment.id)
    replacing_papers = "paper_overrides" in payload and payload.get("paper_overrides") is not None
    if replacing_papers and attempt_count > 0:
        raise SprintExamV2AssignmentConflictError("ASSIGNMENT_PAPERS_LOCKED", "응시가 시작된 배정은 paper 구성을 바꿀 수 없습니다.")
    validate_time_range(payload.get("available_from", assignment.available_from), payload.get("due_at", assignment.submission_deadline_at))
    if "attempt_limit" in payload:
        next_attempt_limit = _normalize_attempt_limit(payload.get("attempt_limit"))
        if next_attempt_limit < attempt_count:
            raise SprintExamV2AssignmentConflictError(
                "ATTEMPT_LIMIT_BELOW_CURRENT_ATTEMPTS",
                "attempt_limit cannot be lower than the existing attempt count.",
            )
    if "paper_selection_mode" in payload and not replacing_papers:
        next_paper_selection_mode = _normalize_paper_selection_mode(payload.get("paper_selection_mode"))
    try:
        if "available_from" in payload:
            assignment.available_from = payload["available_from"]
        if "due_at" in payload:
            assignment.submission_deadline_at = payload["due_at"]
        if "attempt_limit" in payload:
            assignment.attempt_limit = next_attempt_limit
        if "memo" in payload:
            assignment.memo = payload["memo"]
        if "paper_selection_mode" in payload and not replacing_papers:
            assignment.paper_selection_mode = next_paper_selection_mode
        if replacing_papers:
            assignment.paper_selection_mode = "override"
            for assignment_paper in list(assignment.papers):
                db.delete(assignment_paper)
            db.flush()
            papers, selections = resolve_assignment_papers(
                assignment.exam,
                assignment.student,
                assignment.program,
                payload.get("paper_overrides") or {},
            )
            for paper in papers:
                db.add(_snapshot_paper(assignment, paper))
            assignment.korean_elective_snapshot = selections["korean"]
            assignment.math_elective_snapshot = selections["math"]
            assignment.inquiry_subject_1_snapshot = selections["inquiry_1"]
            assignment.inquiry_subject_2_snapshot = selections["inquiry_2"]
        db.commit()
        return serialize_assignment_detail(db, get_assignment(db, assignment_id))
    except Exception:
        db.rollback()
        raise


def delete_assignment(db: Session, assignment_id: int) -> dict[str, Any]:
    assignment = get_assignment(db, assignment_id)
    if _attempt_count(db, assignment.id) > 0:
        raise SprintExamV2AssignmentConflictError("ASSIGNMENT_HAS_ATTEMPTS", "응시가 시작된 배정은 삭제할 수 없습니다.")
    if db.query(models.SprintExamV2RetakeApproval.id).filter(models.SprintExamV2RetakeApproval.assignment_id == assignment.id).first() is not None:
        raise SprintExamV2AssignmentConflictError("ASSIGNMENT_HAS_RETAKE_APPROVALS", "Retake approvals exist for this assignment.")
    try:
        db.delete(assignment)
        db.commit()
        return {"ok": True, "deleted_assignment_id": assignment_id}
    except Exception:
        db.rollback()
        raise


def list_student_assignments(db: Session, student_id: int) -> dict[str, Any]:
    assignments = (
        _assignment_query(db)
        .filter(models.SprintExamV2Assignment.student_id == student_id)
        .order_by(models.SprintExamV2Assignment.assigned_at.desc(), models.SprintExamV2Assignment.id.desc())
        .all()
    )
    return {"items": [serialize_assignment_list_item(db, item) for item in assignments]}


def get_student_assignment(db: Session, assignment_id: int, student_id: int) -> dict[str, Any]:
    assignment = get_assignment(db, assignment_id)
    if assignment.student_id != student_id:
        raise SprintExamV2AssignmentNotFoundError("Sprint Exam V2 assignment not found.")
    return serialize_assignment_detail(db, assignment)
