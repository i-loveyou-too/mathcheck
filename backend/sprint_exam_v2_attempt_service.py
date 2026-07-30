from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, load_only, selectinload

import models
import sprint_exam_v2_retake_approval_service as retake_approval_service


class SprintExamV2AttemptNotFoundError(LookupError):
    pass


class SprintExamV2AttemptConflictError(RuntimeError):
    def __init__(self, code: str, message: str, **context: Any):
        super().__init__(message)
        self.code = code
        self.message = message
        self.context = context

    def detail(self) -> dict[str, Any]:
        detail: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.context:
            detail["context"] = self.context
        return detail


class SprintExamV2AttemptDomainError(ValueError):
    def __init__(self, code: str, message: str, path: str | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.path = path

    def detail(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "path": self.path}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _json_or_empty(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _attempt_summary(attempt: models.SprintExamV2Attempt) -> dict[str, Any]:
    return {
        "id": attempt.id,
        "assignment_id": attempt.assignment_id,
        "attempt_no": attempt.attempt_no,
        "status": attempt.status,
        "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "retake_approval_id": attempt.retake_approval_id,
    }


def _assignment_query(db: Session):
    return db.query(models.SprintExamV2Assignment).options(
        selectinload(models.SprintExamV2Assignment.exam),
        selectinload(models.SprintExamV2Assignment.papers).selectinload(models.SprintExamV2AssignmentPaper.paper),
        selectinload(models.SprintExamV2Assignment.attempts),
        selectinload(models.SprintExamV2Assignment.retake_approvals),
    )


def _load_student_assignment(
    db: Session,
    assignment_id: int,
    student_id: int,
    *,
    lock: bool = False,
) -> models.SprintExamV2Assignment:
    query = _assignment_query(db).filter(
        models.SprintExamV2Assignment.id == assignment_id,
        models.SprintExamV2Assignment.student_id == student_id,
    )
    if lock:
        query = query.with_for_update()
    assignment = query.first()
    if assignment is None:
        raise SprintExamV2AttemptNotFoundError("Sprint Exam V2 assignment not found.")
    return assignment


def _attempt_query(db: Session):
    return db.query(models.SprintExamV2Attempt).options(
        selectinload(models.SprintExamV2Attempt.assignment).selectinload(models.SprintExamV2Assignment.exam),
        selectinload(models.SprintExamV2Attempt.assignment)
        .selectinload(models.SprintExamV2Assignment.papers)
        .selectinload(models.SprintExamV2AssignmentPaper.paper),
        selectinload(models.SprintExamV2Attempt.responses),
    )


def _load_student_attempt(
    db: Session,
    attempt_id: int,
    student_id: int,
    *,
    lock: bool = False,
) -> models.SprintExamV2Attempt:
    query = (
        _attempt_query(db)
        .join(models.SprintExamV2Attempt.assignment)
        .filter(
            models.SprintExamV2Attempt.id == attempt_id,
            models.SprintExamV2Assignment.student_id == student_id,
        )
    )
    if lock:
        query = query.with_for_update()
    attempt = query.first()
    if attempt is None:
        raise SprintExamV2AttemptNotFoundError("Sprint Exam V2 attempt not found.")
    return attempt


def _validate_assignment_startable(assignment: models.SprintExamV2Assignment, *, now: datetime) -> None:
    if assignment.status == "closed":
        raise SprintExamV2AttemptConflictError("ASSIGNMENT_NOT_STARTABLE", "This assignment is closed.")
    if not assignment.papers:
        raise SprintExamV2AttemptConflictError("ASSIGNMENT_HAS_NO_PAPERS", "This assignment has no selected papers.")
    available_from = _aware_utc(assignment.available_from)
    due_at = _aware_utc(assignment.submission_deadline_at)
    if available_from is not None and now < available_from:
        raise SprintExamV2AttemptConflictError("ASSIGNMENT_NOT_AVAILABLE_YET", "This assignment is not available yet.")
    if due_at is not None and now > due_at:
        raise SprintExamV2AttemptConflictError("ASSIGNMENT_EXPIRED", "This assignment is past its due time.")


def _start_type(attempt: models.SprintExamV2Attempt) -> str:
    return "retake_approval" if attempt.retake_approval_id is not None else "base"


def _start_remaining(db: Session, assignment: models.SprintExamV2Assignment, *, now: datetime) -> dict[str, int]:
    eligibility = retake_approval_service.start_eligibility(db, assignment, now=now)
    return {
        "base_attempts": max(1 - eligibility["base_attempt_count"], 0),
        "available_retake_approvals": eligibility["available_retake_approval_count"],
    }


def start_attempt(db: Session, assignment_id: int, student_id: int) -> dict[str, Any]:
    now = _now_utc()
    try:
        assignment = _load_student_assignment(db, assignment_id, student_id, lock=True)
        _validate_assignment_startable(assignment, now=now)

        started = (
            db.query(models.SprintExamV2Attempt)
            .filter(
                models.SprintExamV2Attempt.assignment_id == assignment.id,
                models.SprintExamV2Attempt.status == "started",
            )
            .first()
        )
        if started is not None:
            return {
                "attempt": _attempt_summary(started),
                "created": False,
                "start_type": _start_type(started),
                "remaining": _start_remaining(db, assignment, now=now),
                "retake_eligibility": retake_approval_service.start_eligibility(db, assignment, now=now),
            }

        base_attempt_count = (
            db.query(models.SprintExamV2Attempt)
            .filter(
                models.SprintExamV2Attempt.assignment_id == assignment.id,
                models.SprintExamV2Attempt.retake_approval_id.is_(None),
                models.SprintExamV2Attempt.status.in_(retake_approval_service.ACTIVE_ATTEMPT_STATUSES),
            )
            .count()
        )
        retake_approval = None
        start_type = "base"
        if base_attempt_count >= 1:
            retake_approval = retake_approval_service.take_available_retake_approval(db, assignment.id, now=now)
            if retake_approval is None:
                raise SprintExamV2AttemptConflictError(
                    "RETAKE_APPROVAL_REQUIRED",
                    "Retake approval is required to start another attempt.",
                    assignment_id=assignment.id,
                    attempt_limit=assignment.attempt_limit,
                    base_attempt_count=base_attempt_count,
                    needs_retake_approval=True,
                )
            start_type = "retake_approval"

        attempt_no = (
            db.query(func.max(models.SprintExamV2Attempt.attempt_no))
            .filter(models.SprintExamV2Attempt.assignment_id == assignment.id)
            .scalar()
            or 0
        ) + 1
        attempt = models.SprintExamV2Attempt(
            assignment_id=assignment.id,
            attempt_no=attempt_no,
            status="started",
            started_at=now,
            retake_approval=retake_approval,
        )
        if retake_approval is not None:
            retake_approval.used_at = now
        assignment.status = "in_progress"
        db.add(attempt)
        db.commit()
        db.refresh(attempt)
        refreshed_assignment = _load_student_assignment(db, assignment_id, student_id)
        return {
            "attempt": _attempt_summary(attempt),
            "created": True,
            "start_type": start_type,
            "remaining": _start_remaining(db, refreshed_assignment, now=now),
            "retake_eligibility": retake_approval_service.start_eligibility(db, refreshed_assignment, now=now),
        }
    except IntegrityError as exc:
        db.rollback()
        existing = (
            db.query(models.SprintExamV2Attempt)
            .join(models.SprintExamV2Attempt.assignment)
            .filter(
                models.SprintExamV2Assignment.id == assignment_id,
                models.SprintExamV2Assignment.student_id == student_id,
                models.SprintExamV2Attempt.status == "started",
            )
            .first()
        )
        if existing is not None:
            assignment = _load_student_assignment(db, assignment_id, student_id)
            return {
                "attempt": _attempt_summary(existing),
                "created": False,
                "start_type": _start_type(existing),
                "remaining": _start_remaining(db, assignment, now=now),
                "retake_eligibility": retake_approval_service.start_eligibility(db, assignment, now=now),
            }
        raise SprintExamV2AttemptConflictError("INVALID_ASSIGNMENT_CONFIGURATION", "Could not start the attempt.") from exc
    except Exception:
        db.rollback()
        raise


def _assigned_papers(assignment: models.SprintExamV2Assignment) -> list[models.SprintExamV2AssignmentPaper]:
    return sorted(
        assignment.papers or [],
        key=lambda item: (
            item.display_order_snapshot or 0,
            item.score_group_code_snapshot or "",
            item.id or 0,
        ),
    )


def _assigned_questions(db: Session, assignment: models.SprintExamV2Assignment) -> list[models.SprintExamV2Question]:
    paper_ids = [paper.paper_id for paper in _assigned_papers(assignment)]
    if not paper_ids:
        return []
    return (
        db.query(models.SprintExamV2Question)
        .options(
            load_only(
                models.SprintExamV2Question.id,
                models.SprintExamV2Question.paper_id,
                models.SprintExamV2Question.question_no,
                models.SprintExamV2Question.answer_type,
                models.SprintExamV2Question.points,
                models.SprintExamV2Question.question_metadata,
            )
        )
        .filter(models.SprintExamV2Question.paper_id.in_(paper_ids))
        .all()
    )


def _assigned_question_ids(db: Session, assignment: models.SprintExamV2Assignment) -> set[int]:
    return {question.id for question in _assigned_questions(db, assignment)}


def _progress(db: Session, attempt: models.SprintExamV2Attempt) -> dict[str, int]:
    total_question_count = len(_assigned_question_ids(db, attempt.assignment))
    answered_count = (
        db.query(models.SprintExamV2Response)
        .filter(models.SprintExamV2Response.attempt_id == attempt.id)
        .count()
    )
    return {
        "answered_count": answered_count,
        "unanswered_count": max(total_question_count - answered_count, 0),
        "total_question_count": total_question_count,
    }


def get_attempt(db: Session, attempt_id: int, student_id: int) -> dict[str, Any]:
    attempt = _load_student_attempt(db, attempt_id, student_id)
    assignment = attempt.assignment
    assignment_papers = _assigned_papers(assignment)
    assignment_paper_by_paper_id = {paper.paper_id: paper for paper in assignment_papers}
    questions = _assigned_questions(db, assignment)
    questions_by_paper_id: dict[int, list[models.SprintExamV2Question]] = {}
    for question in questions:
        questions_by_paper_id.setdefault(question.paper_id, []).append(question)
    response_by_question_id = {response.question_id: response for response in attempt.responses}

    papers_payload: list[dict[str, Any]] = []
    for assignment_paper in assignment_papers:
        paper_questions = sorted(
            questions_by_paper_id.get(assignment_paper.paper_id, []),
            key=lambda question: (question.question_no, question.id or 0),
        )
        papers_payload.append(
            {
                "assignment_paper_id": assignment_paper.id,
                "paper_id": assignment_paper.paper_id,
                "score_group_code": assignment_paper.score_group_code_snapshot,
                "score_group_name": assignment_paper.score_group_name_snapshot,
                "subject_code": assignment_paper.subject_code_snapshot,
                "subject_name": assignment_paper.subject_name_snapshot,
                "paper_role": assignment_paper.paper_role_snapshot,
                "slot": assignment_paper.slot_snapshot,
                "display_order": assignment_paper.display_order_snapshot,
                "listening_youtube_url": assignment_paper.paper.listening_youtube_url if assignment_paper.paper else None,
                "question_count": len(paper_questions),
                "questions": [
                    _serialize_student_question(question, response_by_question_id.get(question.id))
                    for question in paper_questions
                ],
            }
        )

    progress = {
        "answered_count": len(response_by_question_id),
        "total_question_count": sum(item["question_count"] for item in papers_payload),
    }
    progress["unanswered_count"] = max(progress["total_question_count"] - progress["answered_count"], 0)

    return {
        "attempt": _attempt_summary(attempt),
        "assignment": {
            "id": assignment.id,
            "status": assignment.status,
            "available_from": assignment.available_from.isoformat() if assignment.available_from else None,
            "due_at": assignment.submission_deadline_at.isoformat() if assignment.submission_deadline_at else None,
            "attempt_limit": assignment.attempt_limit,
        },
        "exam": {
            "id": assignment.exam.id,
            "title": assignment.exam.title,
            "exam_date": assignment.exam.exam_date.isoformat() if assignment.exam.exam_date else None,
        },
        "papers": papers_payload,
        "progress": progress,
    }


def _serialize_student_question(
    question: models.SprintExamV2Question,
    response: models.SprintExamV2Response | None,
) -> dict[str, Any]:
    return {
        "id": question.id,
        "question_no": question.question_no,
        "question_type": question.answer_type,
        "score": question.points,
        "metadata": _json_or_empty(question.question_metadata),
        "response": None
        if response is None
        else {
            "question_id": response.question_id,
            "answer": response.answer_values or ([] if response.answer_value is None else [response.answer_value]),
            "saved_at": response.updated_at.isoformat() if response.updated_at else response.created_at.isoformat() if response.created_at else None,
        },
    }


def _normalize_answer(answer: Any, question: models.SprintExamV2Question) -> list[str]:
    if answer is None:
        return []
    if not isinstance(answer, list):
        raise SprintExamV2AttemptDomainError("INVALID_RESPONSE_FORMAT", "answer must be a list or null.")
    if len(answer) > 50:
        raise SprintExamV2AttemptDomainError("INVALID_RESPONSE_FORMAT", "answer has too many values.")
    normalized: list[str] = []
    for value in answer:
        text = str(value).strip()
        if not text:
            continue
        if len(text) > 200:
            raise SprintExamV2AttemptDomainError("INVALID_RESPONSE_FORMAT", "answer value is too long.")
        if question.answer_type == "choice" and text not in {"1", "2", "3", "4", "5"}:
            raise SprintExamV2AttemptDomainError("INVALID_RESPONSE_FORMAT", "choice answer must be between 1 and 5.")
        normalized.append(text)
    return normalized


def _validate_attempt_editable(db: Session, attempt: models.SprintExamV2Attempt, *, now: datetime) -> None:
    if attempt.status != "started" or attempt.submitted_at is not None:
        raise SprintExamV2AttemptConflictError("ATTEMPT_ALREADY_SUBMITTED", "Submitted attempts cannot be edited.")
    due_at = _aware_utc(attempt.assignment.submission_deadline_at)
    if attempt.retake_approval_id is None and due_at is not None and now > due_at:
        raise SprintExamV2AttemptConflictError("ASSIGNMENT_EXPIRED", "This assignment is past its due time.")
    if not _assigned_question_ids(db, attempt.assignment):
        raise SprintExamV2AttemptConflictError("INVALID_ASSIGNMENT_CONFIGURATION", "This assignment has no questions.")


def save_responses(
    db: Session,
    attempt_id: int,
    student_id: int,
    responses: list[dict[str, Any]],
) -> dict[str, Any]:
    now = _now_utc()
    if not isinstance(responses, list):
        raise SprintExamV2AttemptDomainError("INVALID_RESPONSE_FORMAT", "responses must be a list.")
    try:
        attempt = _load_student_attempt(db, attempt_id, student_id, lock=True)
        _validate_attempt_editable(db, attempt, now=now)
        assigned_questions = {question.id: question for question in _assigned_questions(db, attempt.assignment)}

        normalized_by_question_id: dict[int, list[str]] = {}
        for index, item in enumerate(responses):
            if not isinstance(item, dict) or "question_id" not in item:
                raise SprintExamV2AttemptDomainError("INVALID_RESPONSE_FORMAT", "Each response must include question_id.", f"responses[{index}]")
            question_id = int(item["question_id"])
            question = assigned_questions.get(question_id)
            if question is None:
                raise SprintExamV2AttemptConflictError("QUESTION_NOT_ASSIGNED", "This question is not assigned to the attempt.")
            normalized_by_question_id[question_id] = _normalize_answer(item.get("answer"), question)

        existing = {
            response.question_id: response
            for response in db.query(models.SprintExamV2Response)
            .filter(
                models.SprintExamV2Response.attempt_id == attempt.id,
                models.SprintExamV2Response.question_id.in_(normalized_by_question_id.keys()),
            )
            .all()
        }
        saved_count = 0
        deleted_count = 0
        for question_id, answer_values in normalized_by_question_id.items():
            response = existing.get(question_id)
            if not answer_values:
                if response is not None:
                    db.delete(response)
                    deleted_count += 1
                continue
            answer_value = answer_values[0] if len(answer_values) == 1 else ",".join(answer_values)
            if response is None:
                db.add(
                    models.SprintExamV2Response(
                        attempt_id=attempt.id,
                        question_id=question_id,
                        answer_value=answer_value,
                        answer_values=answer_values,
                        is_blank=False,
                        is_correct=None,
                        awarded_points=None,
                        graded_at=None,
                    )
                )
            else:
                response.answer_value = answer_value
                response.answer_values = answer_values
                response.is_blank = False
                response.is_correct = None
                response.awarded_points = None
                response.graded_at = None
            saved_count += 1
        db.commit()
        refreshed = _load_student_attempt(db, attempt_id, student_id)
        progress = _progress(db, refreshed)
        return {
            "ok": True,
            "saved_count": saved_count,
            "deleted_count": deleted_count,
            **progress,
            "saved_at": now.isoformat(),
        }
    except Exception:
        db.rollback()
        raise


def save_response(
    db: Session,
    attempt_id: int,
    student_id: int,
    question_id: int,
    answer: Any,
) -> dict[str, Any]:
    return save_responses(db, attempt_id, student_id, [{"question_id": question_id, "answer": answer}])


def submit_attempt(db: Session, attempt_id: int, student_id: int) -> dict[str, Any]:
    now = _now_utc()
    try:
        attempt = _load_student_attempt(db, attempt_id, student_id, lock=True)
        if attempt.status == "scored":
            progress = _progress(db, attempt)
            return {
                "ok": True,
                "attempt_id": attempt.id,
                "status": "scored",
                "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
                "scored_at": attempt.scored_at.isoformat() if attempt.scored_at else None,
                **progress,
            }
        if attempt.status == "submitted" or attempt.submitted_at is not None:
            import sprint_exam_v2_result_publication_service as publication_service
            import sprint_exam_v2_scoring_service as scoring_service

            progress = _progress(db, attempt)
            scoring_service.score_attempt(db, attempt.id, reason="submit", rescore=False)
            publication_service.publish_attempt(
                db,
                attempt.id,
                {"show_correct_answers": True},
                actor_admin_id=None,
            )
            refreshed = _load_student_attempt(db, attempt_id, student_id)
            return {
                "ok": True,
                "attempt_id": refreshed.id,
                "status": refreshed.status,
                "submitted_at": refreshed.submitted_at.isoformat() if refreshed.submitted_at else None,
                "scored_at": refreshed.scored_at.isoformat() if refreshed.scored_at else None,
                **progress,
            }
        _validate_attempt_editable(db, attempt, now=now)
        progress = _progress(db, attempt)
        attempt.status = "submitted"
        attempt.submitted_at = now
        attempt.is_latest_submitted = True
        attempt.submit_warning_snapshot = {"unanswered_count": progress["unanswered_count"]}
        attempt.assignment.status = "submitted"
        (
            db.query(models.SprintExamV2Attempt)
            .filter(
                models.SprintExamV2Attempt.assignment_id == attempt.assignment_id,
                models.SprintExamV2Attempt.id != attempt.id,
            )
            .update({models.SprintExamV2Attempt.is_latest_submitted: False}, synchronize_session=False)
        )
        db.commit()
        import sprint_exam_v2_result_publication_service as publication_service
        import sprint_exam_v2_scoring_service as scoring_service

        scoring_service.score_attempt(db, attempt.id, reason="submit", rescore=False)
        publication_service.publish_attempt(
            db,
            attempt.id,
            {"show_correct_answers": True},
            actor_admin_id=None,
        )
        refreshed = _load_student_attempt(db, attempt_id, student_id)
        return {
            "ok": True,
            "attempt_id": refreshed.id,
            "status": refreshed.status,
            "submitted_at": refreshed.submitted_at.isoformat() if refreshed.submitted_at else now.isoformat(),
            "scored_at": refreshed.scored_at.isoformat() if refreshed.scored_at else None,
            **progress,
        }
    except Exception:
        db.rollback()
        raise


def get_admin_attempt(db: Session, attempt_id: int) -> dict[str, Any]:
    attempt = _attempt_query(db).filter(models.SprintExamV2Attempt.id == attempt_id).first()
    if attempt is None:
        raise SprintExamV2AttemptNotFoundError("Sprint Exam V2 attempt not found.")
    return get_attempt(db, attempt_id, attempt.assignment.student_id)
