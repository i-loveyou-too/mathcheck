from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

import models
from sprint_exam_v2_result_publication_validation import (
    DEFAULT_PUBLICATION_OPTIONS,
    OPTION_KEYS,
    SprintExamV2PublicationDomainError,
    normalize_publication_options,
    publication_snapshot,
)


class SprintExamV2PublicationNotFoundError(LookupError):
    pass


class SprintExamV2PublicationConflictError(RuntimeError):
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


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _attempt_query(db: Session):
    return db.query(models.SprintExamV2Attempt).options(
        selectinload(models.SprintExamV2Attempt.assignment).selectinload(models.SprintExamV2Assignment.exam).selectinload(models.SprintExamV2.papers).selectinload(models.SprintExamV2Paper.questions),
        selectinload(models.SprintExamV2Attempt.assignment).selectinload(models.SprintExamV2Assignment.papers),
        selectinload(models.SprintExamV2Attempt.responses),
        selectinload(models.SprintExamV2Attempt.scores),
        selectinload(models.SprintExamV2Attempt.result_publication).selectinload(models.SprintExamV2ResultPublication.logs),
    )


def _load_attempt(db: Session, attempt_id: int, *, lock: bool = False) -> models.SprintExamV2Attempt:
    query = _attempt_query(db).filter(models.SprintExamV2Attempt.id == attempt_id)
    if lock:
        query = query.with_for_update()
    attempt = query.first()
    if attempt is None:
        raise SprintExamV2PublicationNotFoundError("Sprint Exam V2 attempt not found.")
    return attempt


def _publication_options(publication: models.SprintExamV2ResultPublication | None) -> dict[str, bool]:
    if publication is None:
        return dict(DEFAULT_PUBLICATION_OPTIONS)
    return {key: bool(getattr(publication, key)) for key in OPTION_KEYS}


def _snapshot(publication: models.SprintExamV2ResultPublication | None) -> dict[str, Any]:
    if publication is None:
        return publication_snapshot("unpublished", dict(DEFAULT_PUBLICATION_OPTIONS), published_at=None, unpublished_at=None)
    return publication_snapshot(
        publication.status,
        _publication_options(publication),
        published_at=publication.published_at.isoformat() if publication.published_at else None,
        unpublished_at=publication.unpublished_at.isoformat() if publication.unpublished_at else None,
    )


def computed_publication_status(attempt: models.SprintExamV2Attempt) -> str:
    if attempt.status == "voided":
        return "voided"
    if attempt.status != "scored":
        return "not_scored"
    publication = attempt.result_publication
    if publication is not None and publication.status == "published":
        return "published"
    return "unpublished"


def _serialize_log(log: models.SprintExamV2ResultPublicationLog) -> dict[str, Any]:
    return {
        "id": log.id,
        "action": log.action,
        "actor_admin_id": log.actor_admin_id,
        "message": log.message,
        "previous_snapshot": log.previous_snapshot,
        "new_snapshot": log.new_snapshot,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


def serialize_publication(attempt: models.SprintExamV2Attempt, *, include_logs: bool = False) -> dict[str, Any]:
    publication = attempt.result_publication
    payload = {
        "id": publication.id if publication else None,
        "attempt_id": attempt.id,
        "status": publication.status if publication else "unpublished",
        "computed_status": computed_publication_status(attempt),
        "published_at": publication.published_at.isoformat() if publication and publication.published_at else None,
        "unpublished_at": publication.unpublished_at.isoformat() if publication and publication.unpublished_at else None,
        "published_by_admin_id": publication.published_by_admin_id if publication else None,
        "options": _publication_options(publication),
        "can_publish": attempt.status == "scored" and _has_scores(attempt),
        "can_unpublish": publication is not None and publication.status == "published",
    }
    if include_logs and publication is not None:
        payload["logs"] = [_serialize_log(log) for log in sorted(publication.logs, key=lambda item: (item.created_at or datetime.min.replace(tzinfo=timezone.utc), item.id or 0))]
    return payload


def get_publication(db: Session, attempt_id: int) -> dict[str, Any]:
    return {"publication": serialize_publication(_load_attempt(db, attempt_id), include_logs=True)}


def _has_scores(attempt: models.SprintExamV2Attempt) -> bool:
    return bool(attempt.scores)


def _ensure_explanations_available(attempt: models.SprintExamV2Attempt, options: dict[str, bool]) -> None:
    if not options.get("show_explanations"):
        return
    questions = _assigned_questions(attempt)
    if not any((question.explanation or "").strip() for question in questions):
        raise SprintExamV2PublicationDomainError(
            "EXPLANATION_NOT_AVAILABLE",
            "No explanations are available for this attempt.",
            "show_explanations",
        )


def _assigned_questions(attempt: models.SprintExamV2Attempt) -> list[models.SprintExamV2Question]:
    paper_ids = {paper.paper_id for paper in attempt.assignment.papers}
    return sorted(
        [question for paper in attempt.assignment.exam.papers for question in paper.questions if question.paper_id in paper_ids],
        key=lambda item: (item.paper_id, item.question_no, item.id or 0),
    )


def _validate_ready_for_publication(attempt: models.SprintExamV2Attempt) -> None:
    if attempt.status == "voided":
        raise SprintExamV2PublicationConflictError("RESULT_VOIDED", "Voided attempts cannot be published.")
    if attempt.status != "scored":
        raise SprintExamV2PublicationConflictError("RESULT_NOT_SCORED", "Only scored attempts can be published.")
    assigned_group_ids = {paper.score_group_id for paper in attempt.assignment.papers}
    score_by_group = {score.score_group_id: score for score in attempt.scores}
    if not assigned_group_ids or not score_by_group:
        raise SprintExamV2PublicationConflictError("SCORE_DATA_INCOMPLETE", "Score data is incomplete.")
    if set(score_by_group) != assigned_group_ids:
        raise SprintExamV2PublicationConflictError(
            "SCORE_DATA_INCOMPLETE",
            "Score groups do not match assignment papers.",
            expected=sorted(assigned_group_ids),
            actual=sorted(score_by_group),
        )
    max_by_group = {group_id: 0 for group_id in assigned_group_ids}
    assignment_paper_by_paper_id = {paper.paper_id: paper for paper in attempt.assignment.papers}
    assigned_question_ids: set[int] = set()
    for question in _assigned_questions(attempt):
        assignment_paper = assignment_paper_by_paper_id.get(question.paper_id)
        if assignment_paper is None:
            continue
        assigned_question_ids.add(question.id)
        max_by_group[assignment_paper.score_group_id] += question.points
    for group_id, expected_max in max_by_group.items():
        if score_by_group[group_id].max_score != expected_max:
            raise SprintExamV2PublicationConflictError("SCORE_DATA_INCONSISTENT", "Score max does not match assignment paper questions.")
    for response in attempt.responses:
        if response.question_id not in assigned_question_ids:
            continue
        if response.is_correct is None or response.awarded_points is None or response.graded_at is None:
            raise SprintExamV2PublicationConflictError("SCORE_DATA_INCOMPLETE", "Response grading data is incomplete.")


def _ensure_publication(db: Session, attempt: models.SprintExamV2Attempt) -> models.SprintExamV2ResultPublication:
    if attempt.result_publication is not None:
        return attempt.result_publication
    publication = models.SprintExamV2ResultPublication(attempt_id=attempt.id, status="unpublished", **dict(DEFAULT_PUBLICATION_OPTIONS))
    db.add(publication)
    db.flush()
    attempt.result_publication = publication
    return publication


def _apply_options(publication: models.SprintExamV2ResultPublication, options: dict[str, bool]) -> None:
    for key in OPTION_KEYS:
        setattr(publication, key, bool(options[key]))


def _add_log(
    db: Session,
    publication: models.SprintExamV2ResultPublication,
    *,
    action: str,
    actor_admin_id: int | None,
    previous_snapshot: dict[str, Any],
    message: str | None,
) -> None:
    db.add(
        models.SprintExamV2ResultPublicationLog(
            publication_id=publication.id,
            attempt_id=publication.attempt_id,
            action=action,
            actor_admin_id=actor_admin_id,
            previous_snapshot=previous_snapshot,
            new_snapshot=_snapshot(publication),
            message=message,
        )
    )


def publish_attempt(
    db: Session,
    attempt_id: int,
    payload: dict[str, Any] | None = None,
    *,
    actor_admin_id: int | None = None,
) -> dict[str, Any]:
    now = _now_utc()
    try:
        attempt = _load_attempt(db, attempt_id, lock=True)
        _validate_ready_for_publication(attempt)
        publication = _ensure_publication(db, attempt)
        options = normalize_publication_options(payload, base=_publication_options(publication))
        _ensure_explanations_available(attempt, options)
        previous = _snapshot(publication)
        changed_options = options != _publication_options(publication)
        was_published = publication.status == "published"
        if was_published and not changed_options:
            db.rollback()
            return {"publication": serialize_publication(attempt, include_logs=True)}
        _apply_options(publication, options)
        publication.status = "published"
        publication.published_by_admin_id = actor_admin_id
        publication.published_at = now
        publication.unpublished_at = None
        db.flush()
        _add_log(
            db,
            publication,
            action="settings_updated" if was_published else "published",
            actor_admin_id=actor_admin_id,
            previous_snapshot=previous,
            message=(payload or {}).get("message"),
        )
        db.commit()
        return get_publication(db, attempt_id)
    except IntegrityError as exc:
        db.rollback()
        raise SprintExamV2PublicationConflictError("PUBLICATION_CONFLICT", "Publication conflict occurred.") from exc
    except Exception:
        db.rollback()
        raise


def unpublish_attempt(
    db: Session,
    attempt_id: int,
    payload: dict[str, Any] | None = None,
    *,
    actor_admin_id: int | None = None,
) -> dict[str, Any]:
    now = _now_utc()
    try:
        attempt = _load_attempt(db, attempt_id, lock=True)
        publication = attempt.result_publication
        if publication is None or publication.status == "unpublished":
            db.rollback()
            return {"publication": serialize_publication(attempt, include_logs=True)}
        previous = _snapshot(publication)
        publication.status = "unpublished"
        publication.unpublished_at = now
        db.flush()
        _add_log(
            db,
            publication,
            action="unpublished",
            actor_admin_id=actor_admin_id,
            previous_snapshot=previous,
            message=(payload or {}).get("message"),
        )
        db.commit()
        return get_publication(db, attempt_id)
    except IntegrityError as exc:
        db.rollback()
        raise SprintExamV2PublicationConflictError("PUBLICATION_CONFLICT", "Publication conflict occurred.") from exc
    except Exception:
        db.rollback()
        raise


def update_publication(
    db: Session,
    attempt_id: int,
    payload: dict[str, Any],
    *,
    actor_admin_id: int | None = None,
) -> dict[str, Any]:
    try:
        attempt = _load_attempt(db, attempt_id, lock=True)
        publication = _ensure_publication(db, attempt)
        options = normalize_publication_options(payload, base=_publication_options(publication))
        _ensure_explanations_available(attempt, options)
        if options == _publication_options(publication):
            db.rollback()
            return {"publication": serialize_publication(attempt, include_logs=True)}
        previous = _snapshot(publication)
        _apply_options(publication, options)
        db.flush()
        _add_log(
            db,
            publication,
            action="settings_updated",
            actor_admin_id=actor_admin_id,
            previous_snapshot=previous,
            message=payload.get("message"),
        )
        db.commit()
        return get_publication(db, attempt_id)
    except IntegrityError as exc:
        db.rollback()
        raise SprintExamV2PublicationConflictError("PUBLICATION_CONFLICT", "Publication conflict occurred.") from exc
    except Exception:
        db.rollback()
        raise


FORBIDDEN_ALWAYS = {
    "grade_cuts",
    "raw_score_min",
    "min_score",
    "score_logs",
    "previous_score_snapshot",
    "new_score_snapshot",
    "parse_diagnostics",
    "parser_diagnostics",
    "diagnostics",
    "publication_logs",
    "logs",
    "published_by",
    "published_by_admin_id",
}


def _strip_keys_recursive(payload: Any, forbidden: set[str]) -> Any:
    if isinstance(payload, dict):
        return {
            key: _strip_keys_recursive(value, forbidden)
            for key, value in payload.items()
            if key not in forbidden
        }
    if isinstance(payload, list):
        return [_strip_keys_recursive(item, forbidden) for item in payload]
    return payload


def sanitize_student_result(result: dict[str, Any], publication: models.SprintExamV2ResultPublication) -> dict[str, Any]:
    sanitized = deepcopy(result)
    options = _publication_options(publication)
    forbidden = set(FORBIDDEN_ALWAYS)
    if not options["show_total_score"]:
        sanitized.pop("summary", None)
        forbidden.update({"total_score", "max_score", "percentage", "raw_score"})
    if not options["show_grade"]:
        forbidden.update({"grade", "absolute_band", "percentile"})
    if not options["show_score_groups"]:
        if options["show_grade"] and isinstance(sanitized.get("scores"), list):
            sanitized["grades"] = [
                {
                    "score_group_code": score.get("score_group_code"),
                    "score_group_name": score.get("score_group_name"),
                    "grade": score.get("grade"),
                }
                for score in sanitized["scores"]
            ]
        sanitized.pop("scores", None)
        forbidden.update({"scores", "score_groups", "subject_scores", "score_group_id"})
    if not options["show_question_results"]:
        sanitized.pop("questions", None)
        forbidden.update({"questions", "responses", "question_results", "is_correct", "awarded_points", "max_points"})
    if not options["show_correct_answers"]:
        forbidden.update({"correct_answers", "correct_answer", "answer_key", "normalized_correct_answer"})
    if not options["show_explanations"]:
        forbidden.update({"explanation", "solution", "commentary"})
    sanitized["result_status"] = "published"
    return _strip_keys_recursive(sanitized, forbidden)


def require_student_result_publication(attempt: models.SprintExamV2Attempt) -> models.SprintExamV2ResultPublication:
    if attempt.status == "voided":
        raise SprintExamV2PublicationConflictError("RESULT_VOIDED", "Result is not available for voided attempts.")
    if attempt.status != "scored":
        raise SprintExamV2PublicationConflictError("RESULT_NOT_SCORED", "Result is not scored yet.")
    publication = attempt.result_publication
    if publication is None or publication.status != "published":
        raise SprintExamV2PublicationConflictError("RESULT_NOT_PUBLISHED", "Result has not been published yet.")
    return publication
