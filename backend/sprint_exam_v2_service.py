from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

import models
from sprint_exam_v2_validation import (
    SprintExamV2DomainError,
    calculate_assignment_max_score,
    normalize_exam_structure_payload,
    summarize_structure,
)


class SprintExamV2NotFoundError(LookupError):
    pass


class SprintExamV2ConflictError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message

    def detail(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}


def _exam_source_label(exam: models.SprintExamV2) -> str | None:
    return exam.source_label


def _exam_metadata(exam: models.SprintExamV2) -> dict[str, Any]:
    return _json_or_empty(exam.metadata_json)


def _json_or_empty(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _has_assignments(db: Session, exam_id: int) -> bool:
    return db.query(models.SprintExamV2Assignment.id).filter(models.SprintExamV2Assignment.exam_id == exam_id).first() is not None


def _normalize_integrity_error(exc: IntegrityError) -> SprintExamV2ConflictError:
    message = str(getattr(exc, "orig", exc))
    if "score_groups" in message or "exam_code" in message:
        return SprintExamV2ConflictError("DUPLICATE_SCORE_GROUP_CODE", "시험 안에서 점수그룹 코드가 중복되었습니다.")
    if "questions" in message or "paper_no" in message:
        return SprintExamV2ConflictError("DUPLICATE_QUESTION_NO", "시험지 안에서 문항 번호가 중복되었습니다.")
    if "papers" in message or "exam_subject" in message:
        return SprintExamV2ConflictError("DUPLICATE_SUBJECT_CODE", "시험 안에서 subject_code와 slot 조합이 중복되었습니다.")
    return SprintExamV2ConflictError("SPRINT_EXAM_V2_INTEGRITY_ERROR", "시험 저장 중 충돌이 발생했습니다.")


def _load_exam_detail(db: Session, exam_id: int) -> models.SprintExamV2:
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
        raise SprintExamV2NotFoundError("Sprint Exam V2 exam not found.")
    return exam


def _paper_max_score(paper: models.SprintExamV2Paper) -> int:
    if paper.questions:
        return sum(question.points for question in paper.questions)
    return int(paper.total_points or 0)


def serialize_question(question: models.SprintExamV2Question) -> dict[str, Any]:
    return {
        "id": question.id,
        "question_no": question.question_no,
        "question_type": question.answer_type,
        "correct_answers": question.correct_answers or [],
        "score": question.points,
        "metadata": _json_or_empty(question.question_metadata),
    }


def serialize_grade_cut(grade_cut: models.SprintExamV2GradeCut) -> dict[str, Any]:
    return {
        "id": grade_cut.id,
        "grade": grade_cut.grade,
        "min_score": grade_cut.min_score,
        "cut_type": grade_cut.cut_type,
        "metadata": _json_or_empty(grade_cut.cut_metadata),
    }


def serialize_paper(paper: models.SprintExamV2Paper) -> dict[str, Any]:
    questions = sorted(paper.questions, key=lambda question: (question.question_no, question.id or 0))
    return {
        "id": paper.id,
        "subject_code": paper.subject_code,
        "subject_name": paper.subject_name,
        "paper_role": paper.paper_role,
        "slot": paper.slot,
        "display_order": paper.source_order,
        "metadata": _json_or_empty(paper.omr_metadata),
        "listening_youtube_url": paper.listening_youtube_url,
        "questions": [serialize_question(question) for question in questions],
        "question_count": len(questions),
        "paper_max_score": _paper_max_score(paper),
    }


def serialize_score_group(group: models.SprintExamV2ScoreGroup) -> dict[str, Any]:
    papers = [serialize_paper(paper) for paper in sorted(group.papers, key=lambda item: (item.source_order, item.id or 0))]
    grade_cuts = [
        serialize_grade_cut(grade_cut)
        for grade_cut in sorted(group.grade_cuts, key=lambda item: (item.grade, item.id or 0))
    ]
    result = {
        "id": group.id,
        "score_group_code": group.score_group_code,
        "score_group_name": group.score_group_name,
        "subject_area": group.subject_area,
        "aggregation_type": group.aggregation_type,
        "display_order": group.display_order,
        "metadata": _json_or_empty(group.group_metadata),
        "grade_cuts": grade_cuts,
        "papers": papers,
        "solution_drive_file_id": group.solution_drive_file_id,
        "solution_is_published": group.solution_is_published,
    }
    result["source_paper_score_sum"] = sum(paper["paper_max_score"] for paper in papers)
    result["assignment_max_score"] = calculate_assignment_max_score(result)
    return result


def serialize_exam_detail(exam: models.SprintExamV2) -> dict[str, Any]:
    score_groups = [
        serialize_score_group(group)
        for group in sorted(exam.score_groups, key=lambda item: (item.display_order, item.id or 0))
    ]
    summary = summarize_structure(score_groups)
    return {
        "exam": {
            "id": exam.id,
            "title": exam.title,
            "exam_date": exam.exam_date.isoformat() if exam.exam_date else None,
            "source_label": _exam_source_label(exam),
            "description": exam.description,
            "metadata": _exam_metadata(exam),
            "status": exam.status,
            "created_at": exam.created_at.isoformat() if exam.created_at else None,
            "updated_at": exam.updated_at.isoformat() if exam.updated_at else None,
        },
        "score_groups": score_groups,
        **summary,
    }


def _create_children(db: Session, exam: models.SprintExamV2, score_groups: list[dict[str, Any]]) -> None:
    for group_input in score_groups:
        group = models.SprintExamV2ScoreGroup(
            exam=exam,
            score_group_code=group_input["score_group_code"],
            score_group_name=group_input["score_group_name"],
            subject_area=group_input["subject_area"],
            aggregation_type=group_input["aggregation_type"],
            display_order=group_input["display_order"],
            group_metadata=group_input["metadata"],
        )
        db.add(group)
        db.flush()

        for paper_input in group_input["papers"]:
            paper = models.SprintExamV2Paper(
                exam=exam,
                score_group=group,
                subject_code=paper_input["subject_code"],
                subject_name=paper_input["subject_name"],
                paper_role=paper_input["paper_role"],
                slot=paper_input["slot"],
                total_points=paper_input["paper_max_score"],
                question_count=paper_input["question_count"],
                omr_metadata=paper_input["metadata"],
                listening_youtube_url=paper_input.get("listening_youtube_url"),
                source_order=paper_input["display_order"],
            )
            db.add(paper)
            db.flush()

            for question_input in paper_input["questions"]:
                db.add(
                    models.SprintExamV2Question(
                        paper=paper,
                        question_no=question_input["question_no"],
                        answer_type=question_input["question_type"],
                        correct_answers=question_input["correct_answers"],
                        points=question_input["score"],
                        question_metadata=question_input["metadata"],
                    )
                )

        for grade_cut_input in group_input["grade_cuts"]:
            db.add(
                models.SprintExamV2GradeCut(
                    score_group=group,
                    grade=grade_cut_input["grade"],
                    min_score=grade_cut_input["min_score"],
                    cut_type=grade_cut_input["cut_type"],
                    cut_metadata=grade_cut_input["metadata"],
                )
            )


def create_exam(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize_exam_structure_payload(payload)
    exam_input = normalized["exam"]
    try:
        exam = models.SprintExamV2(
            title=exam_input["title"],
            exam_date=exam_input["exam_date"],
            description=exam_input["description"],
            status="draft",
            source_label=exam_input["source_label"],
            metadata_json=exam_input["metadata"],
            parse_summary=None,
        )
        db.add(exam)
        db.flush()
        _create_children(db, exam, normalized["score_groups"])
        db.commit()
        return serialize_exam_detail(_load_exam_detail(db, exam.id))
    except IntegrityError as exc:
        db.rollback()
        raise _normalize_integrity_error(exc) from exc
    except Exception:
        db.rollback()
        raise


def list_exams(
    db: Session,
    *,
    limit: int = 20,
    offset: int = 0,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Any]:
    base_query = db.query(models.SprintExamV2)
    if search:
        like = f"%{search.strip()}%"
        base_query = base_query.filter(
            or_(
                models.SprintExamV2.title.ilike(like),
                models.SprintExamV2.description.ilike(like),
                models.SprintExamV2.source_label.ilike(like),
            )
        )
    if date_from:
        base_query = base_query.filter(models.SprintExamV2.exam_date >= date_from)
    if date_to:
        base_query = base_query.filter(models.SprintExamV2.exam_date <= date_to)

    total = base_query.count()
    exams = (
        base_query.options(
            selectinload(models.SprintExamV2.score_groups)
            .selectinload(models.SprintExamV2ScoreGroup.papers)
            .selectinload(models.SprintExamV2Paper.questions)
        )
        .order_by(models.SprintExamV2.exam_date.desc().nullslast(), models.SprintExamV2.id.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    items: list[dict[str, Any]] = []
    for exam in exams:
        score_groups = list(exam.score_groups)
        papers = [paper for group in score_groups for paper in group.papers]
        items.append(
            {
                "id": exam.id,
                "title": exam.title,
                "exam_date": exam.exam_date.isoformat() if exam.exam_date else None,
                "source_label": _exam_source_label(exam),
                "score_group_count": len(score_groups),
                "paper_count": len(papers),
                "question_count": sum(len(paper.questions) for paper in papers),
                "created_at": exam.created_at.isoformat() if exam.created_at else None,
                "updated_at": exam.updated_at.isoformat() if exam.updated_at else None,
            }
        )

    return {"items": items, "total": total, "limit": limit, "offset": offset}


def get_exam(db: Session, exam_id: int) -> dict[str, Any]:
    return serialize_exam_detail(_load_exam_detail(db, exam_id))


def update_exam(db: Session, exam_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    exam = _load_exam_detail(db, exam_id)
    assigned = _has_assignments(db, exam_id)
    replacing_structure = "score_groups" in payload and payload.get("score_groups") is not None
    if assigned and replacing_structure:
        raise SprintExamV2ConflictError("ASSIGNED_EXAM_STRUCTURE_LOCKED", "배정된 시험은 구조를 수정할 수 없습니다.")

    current_exam_payload = {
        "title": exam.title,
        "exam_date": exam.exam_date.isoformat() if exam.exam_date else None,
        "source_label": _exam_source_label(exam),
        "description": exam.description,
        "metadata": _exam_metadata(exam),
    }
    patch_exam_payload = payload.get("exam") or {}
    merged_payload = {
        **payload,
        "exam": {**current_exam_payload, **patch_exam_payload},
    }
    normalized = normalize_exam_structure_payload(merged_payload, allow_missing_score_groups=not replacing_structure)
    exam_input = normalized["exam"]
    if assigned and exam_input["exam_date"] != exam.exam_date:
        raise SprintExamV2ConflictError("ASSIGNED_EXAM_STRUCTURE_LOCKED", "배정된 시험은 시험일을 수정할 수 없습니다.")
    try:
        exam.title = exam_input["title"]
        exam.description = exam_input["description"]
        exam.source_label = exam_input["source_label"]
        exam.metadata_json = exam_input["metadata"]
        if not assigned:
            exam.exam_date = exam_input["exam_date"]
        if replacing_structure:
            for group in list(exam.score_groups):
                db.delete(group)
            db.flush()
            _create_children(db, exam, normalized["score_groups"])
        db.commit()
        return serialize_exam_detail(_load_exam_detail(db, exam_id))
    except IntegrityError as exc:
        db.rollback()
        raise _normalize_integrity_error(exc) from exc
    except Exception:
        db.rollback()
        raise


def _load_score_group(db: Session, score_group_id: int) -> models.SprintExamV2ScoreGroup:
    group = db.get(models.SprintExamV2ScoreGroup, score_group_id)
    if group is None:
        raise SprintExamV2NotFoundError("Sprint Exam V2 score group not found.")
    return group


def update_score_group_solution(
    db: Session,
    score_group_id: int,
    *,
    drive_link_or_id: str | None,
    is_published: bool,
) -> dict[str, Any]:
    """과목(score group) 해설지 Drive 파일 ID/공개 여부만 갱신한다.
    시험 구조(문항/정답/시험지) 전체 재생성 흐름(update_exam)과는 완전히 분리된, 별도의 최소 변경 경로다."""
    from sprint_exam_v2_validation import extract_drive_file_id

    group = _load_score_group(db, score_group_id)
    file_id = extract_drive_file_id(drive_link_or_id, "drive_link_or_id")
    group.solution_drive_file_id = file_id
    group.solution_is_published = bool(is_published) if file_id else False
    db.commit()
    return serialize_score_group(group)


def delete_exam(db: Session, exam_id: int) -> dict[str, Any]:
    exam = _load_exam_detail(db, exam_id)
    if _has_assignments(db, exam_id):
        raise SprintExamV2ConflictError("EXAM_HAS_ASSIGNMENTS", "배정된 시험은 삭제할 수 없습니다.")
    try:
        db.delete(exam)
        db.commit()
        return {"ok": True, "deleted_exam_id": exam_id}
    except IntegrityError as exc:
        db.rollback()
        raise _normalize_integrity_error(exc) from exc
    except Exception:
        db.rollback()
        raise
