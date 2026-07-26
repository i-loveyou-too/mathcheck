from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

import models


ACTIVE_ATTEMPT_STATUSES = {"started", "submitted", "scored"}


class SprintExamV2RetakeApprovalNotFoundError(LookupError):
    pass


class SprintExamV2RetakeApprovalConflictError(RuntimeError):
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


class SprintExamV2RetakeApprovalDomainError(ValueError):
    def __init__(self, code: str, message: str, path: str | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.path = path

    def detail(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "path": self.path}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _json_or_empty(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _approval_query(db: Session):
    return db.query(models.SprintExamV2RetakeApproval).options(
        selectinload(models.SprintExamV2RetakeApproval.assignment).selectinload(models.SprintExamV2Assignment.exam),
        selectinload(models.SprintExamV2RetakeApproval.assignment).selectinload(models.SprintExamV2Assignment.student),
        selectinload(models.SprintExamV2RetakeApproval.assignment).selectinload(models.SprintExamV2Assignment.attempts),
    )


def _used_attempt(db: Session, approval_id: int) -> models.SprintExamV2Attempt | None:
    return (
        db.query(models.SprintExamV2Attempt)
        .filter(models.SprintExamV2Attempt.retake_approval_id == approval_id)
        .order_by(models.SprintExamV2Attempt.id.asc())
        .first()
    )


def compute_approval_status(
    approval: models.SprintExamV2RetakeApproval,
    *,
    now: datetime | None = None,
    used_attempt: models.SprintExamV2Attempt | None = None,
) -> str:
    now = now or now_utc()
    expires_at = aware_utc(approval.expires_at)
    if approval.status == "cancelled":
        return "cancelled"
    if used_attempt is not None or approval.used_at is not None:
        return "used"
    if approval.status == "approved":
        if expires_at is not None and now > expires_at:
            return "expired"
        return "available"
    return approval.status


def active_attempt_counts(assignment: models.SprintExamV2Assignment) -> dict[str, int]:
    attempts = assignment.attempts or []
    base_attempts = [
        attempt
        for attempt in attempts
        if attempt.retake_approval_id is None and attempt.status in ACTIVE_ATTEMPT_STATUSES
    ]
    approval_attempts = [
        attempt
        for attempt in attempts
        if attempt.retake_approval_id is not None and attempt.status in ACTIVE_ATTEMPT_STATUSES
    ]
    return {"base_attempt_count": len(base_attempts), "approval_attempt_count": len(approval_attempts)}


def _available_approvals(
    db: Session,
    assignment_id: int,
    *,
    now: datetime,
    lock: bool = False,
) -> list[models.SprintExamV2RetakeApproval]:
    used_subquery = db.query(models.SprintExamV2Attempt.retake_approval_id).filter(
        models.SprintExamV2Attempt.retake_approval_id.isnot(None)
    )
    query = (
        db.query(models.SprintExamV2RetakeApproval)
        .filter(
            models.SprintExamV2RetakeApproval.assignment_id == assignment_id,
            models.SprintExamV2RetakeApproval.status == "approved",
            models.SprintExamV2RetakeApproval.used_at.is_(None),
            or_(
                models.SprintExamV2RetakeApproval.expires_at.is_(None),
                models.SprintExamV2RetakeApproval.expires_at >= now,
            ),
            ~models.SprintExamV2RetakeApproval.id.in_(used_subquery),
        )
        .order_by(
            models.SprintExamV2RetakeApproval.expires_at.asc().nulls_last(),
            models.SprintExamV2RetakeApproval.created_at.asc(),
            models.SprintExamV2RetakeApproval.id.asc(),
        )
    )
    if lock:
        query = query.with_for_update()
    return query.all()


def available_retake_approval_count(db: Session, assignment_id: int, *, now: datetime | None = None) -> int:
    return len(_available_approvals(db, assignment_id, now=now or now_utc()))


def take_available_retake_approval(
    db: Session,
    assignment_id: int,
    *,
    now: datetime,
) -> models.SprintExamV2RetakeApproval | None:
    approvals = _available_approvals(db, assignment_id, now=now, lock=True)
    return approvals[0] if approvals else None


def start_eligibility(db: Session, assignment: models.SprintExamV2Assignment, *, now: datetime | None = None) -> dict[str, Any]:
    now = now or now_utc()
    counts = active_attempt_counts(assignment)
    has_active_attempt = any(attempt.status == "started" for attempt in assignment.attempts or [])
    available_count = available_retake_approval_count(db, assignment.id, now=now)
    base_remaining = max((assignment.attempt_limit or 1) - counts["base_attempt_count"], 0)
    return {
        "attempt_limit": assignment.attempt_limit,
        **counts,
        "has_active_attempt": has_active_attempt,
        "can_start": has_active_attempt or base_remaining > 0 or available_count > 0,
        "needs_retake_approval": not has_active_attempt and base_remaining <= 0 and available_count <= 0,
        "available_retake_approval_count": available_count,
    }


def _serialize_approval(
    db: Session,
    approval: models.SprintExamV2RetakeApproval,
    *,
    include_admin_fields: bool,
    include_detail: bool = False,
) -> dict[str, Any]:
    used_attempt = _used_attempt(db, approval.id)
    assignment = approval.assignment
    payload: dict[str, Any] = {
        "id": approval.id,
        "assignment_id": approval.assignment_id,
        "student_id": assignment.student_id if assignment else None,
        "exam_id": assignment.exam_id if assignment else None,
        "status": approval.status,
        "computed_status": compute_approval_status(approval, used_attempt=used_attempt),
        "reason": approval.requested_reason,
        "expires_at": approval.expires_at.isoformat() if approval.expires_at else None,
        "used_attempt_id": used_attempt.id if used_attempt else None,
        "created_at": approval.created_at.isoformat() if approval.created_at else None,
        "updated_at": approval.updated_at.isoformat() if approval.updated_at else None,
    }
    if include_admin_fields:
        payload.update(
            {
                "memo": approval.admin_note,
                "approved_by_admin_id": approval.approved_by_admin_id,
                "requested_at": approval.requested_at.isoformat() if approval.requested_at else None,
                "decided_at": approval.decided_at.isoformat() if approval.decided_at else None,
                "used_at": approval.used_at.isoformat() if approval.used_at else None,
                "cancelled_at": approval.cancelled_at.isoformat() if approval.cancelled_at else None,
                "metadata": _json_or_empty(approval.approval_metadata),
            }
        )
    if include_detail and assignment is not None:
        counts = active_attempt_counts(assignment)
        payload.update(
            {
                "assignment": {
                    "id": assignment.id,
                    "status": assignment.status,
                    "attempt_limit": assignment.attempt_limit,
                    **counts,
                },
                "exam": {
                    "id": assignment.exam.id if assignment.exam else None,
                    "title": assignment.exam.title if assignment.exam else None,
                    "exam_date": assignment.exam.exam_date.isoformat() if assignment.exam and assignment.exam.exam_date else None,
                },
                "student": {
                    "id": assignment.student.id if assignment.student else None,
                    "name": assignment.student.name if assignment.student else None,
                    "grade": assignment.student.grade if assignment.student else None,
                },
                "attempts": [
                    {
                        "id": attempt.id,
                        "attempt_no": attempt.attempt_no,
                        "status": attempt.status,
                        "retake_approval_id": attempt.retake_approval_id,
                        "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
                        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
                    }
                    for attempt in sorted(assignment.attempts or [], key=lambda item: (item.attempt_no, item.id or 0))
                ],
                "can_cancel": compute_approval_status(approval, used_attempt=used_attempt) in {"available", "expired"},
                "can_edit": compute_approval_status(approval, used_attempt=used_attempt) in {"available", "expired"},
            }
        )
    return payload


def get_retake_approval(db: Session, approval_id: int, *, lock: bool = False) -> models.SprintExamV2RetakeApproval:
    query = _approval_query(db).filter(models.SprintExamV2RetakeApproval.id == approval_id)
    if lock:
        query = query.with_for_update()
    approval = query.first()
    if approval is None:
        raise SprintExamV2RetakeApprovalNotFoundError("Sprint Exam V2 retake approval not found.")
    return approval


def create_retake_approval(db: Session, payload: dict[str, Any], *, admin_id: int | None = None) -> dict[str, Any]:
    now = now_utc()
    expires_at = aware_utc(payload.get("expires_at"))
    if expires_at is not None and now > expires_at:
        raise SprintExamV2RetakeApprovalDomainError("INVALID_RETAKE_APPROVAL_EXPIRY", "expires_at must be in the future.", "expires_at")
    try:
        assignment = (
            db.query(models.SprintExamV2Assignment)
            .options(selectinload(models.SprintExamV2Assignment.student), selectinload(models.SprintExamV2Assignment.exam))
            .filter(models.SprintExamV2Assignment.id == int(payload["assignment_id"]))
            .with_for_update()
            .first()
        )
        if assignment is None:
            raise SprintExamV2RetakeApprovalNotFoundError("Sprint Exam V2 assignment not found.")
        if assignment.status == "closed":
            raise SprintExamV2RetakeApprovalConflictError("ASSIGNMENT_NOT_STARTABLE", "Closed assignments cannot receive retake approvals.")
        approval = models.SprintExamV2RetakeApproval(
            assignment_id=assignment.id,
            status="approved",
            requested_reason=payload.get("reason"),
            admin_note=payload.get("memo"),
            approved_by_admin_id=admin_id,
            expires_at=expires_at,
            requested_at=now,
            decided_at=now,
            approval_metadata=payload.get("metadata") or {},
        )
        db.add(approval)
        db.commit()
        return {"approval": _serialize_approval(db, get_retake_approval(db, approval.id), include_admin_fields=True)}
    except Exception:
        db.rollback()
        raise


def list_retake_approvals(
    db: Session,
    *,
    limit: int = 20,
    offset: int = 0,
    student_id: int | None = None,
    assignment_id: int | None = None,
    exam_id: int | None = None,
    status: str | None = None,
    computed_status: str | None = None,
    include_expired: bool = True,
) -> dict[str, Any]:
    query = _approval_query(db).join(models.SprintExamV2RetakeApproval.assignment)
    if student_id is not None:
        query = query.filter(models.SprintExamV2Assignment.student_id == student_id)
    if assignment_id is not None:
        query = query.filter(models.SprintExamV2RetakeApproval.assignment_id == assignment_id)
    if exam_id is not None:
        query = query.filter(models.SprintExamV2Assignment.exam_id == exam_id)
    if status:
        query = query.filter(models.SprintExamV2RetakeApproval.status == status)
    approvals = query.order_by(models.SprintExamV2RetakeApproval.created_at.desc(), models.SprintExamV2RetakeApproval.id.desc()).all()
    if not include_expired:
        approvals = [approval for approval in approvals if compute_approval_status(approval, used_attempt=_used_attempt(db, approval.id)) != "expired"]
    if computed_status:
        approvals = [approval for approval in approvals if compute_approval_status(approval, used_attempt=_used_attempt(db, approval.id)) == computed_status]
    total = len(approvals)
    page = approvals[offset : offset + limit]
    return {
        "items": [_serialize_approval(db, approval, include_admin_fields=True) for approval in page],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def get_retake_approval_detail(db: Session, approval_id: int) -> dict[str, Any]:
    return {"approval": _serialize_approval(db, get_retake_approval(db, approval_id), include_admin_fields=True, include_detail=True)}


def update_retake_approval(db: Session, approval_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    now = now_utc()
    expires_at = aware_utc(payload.get("expires_at")) if "expires_at" in payload else None
    if "expires_at" in payload and expires_at is not None and now > expires_at:
        raise SprintExamV2RetakeApprovalDomainError("INVALID_RETAKE_APPROVAL_EXPIRY", "expires_at must be in the future.", "expires_at")
    try:
        approval = get_retake_approval(db, approval_id, lock=True)
        computed = compute_approval_status(approval, used_attempt=_used_attempt(db, approval.id))
        if computed not in {"available", "expired"}:
            raise SprintExamV2RetakeApprovalConflictError("RETAKE_APPROVAL_NOT_EDITABLE", "This retake approval cannot be edited.")
        if "assignment_id" in payload or "student_id" in payload:
            raise SprintExamV2RetakeApprovalDomainError("RETAKE_APPROVAL_NOT_EDITABLE", "assignment_id and student_id cannot be changed.")
        if "reason" in payload:
            approval.requested_reason = payload.get("reason")
        if "memo" in payload:
            approval.admin_note = payload.get("memo")
        if "expires_at" in payload:
            approval.expires_at = expires_at
        if "metadata" in payload:
            approval.approval_metadata = payload.get("metadata") or {}
        db.commit()
        return {"approval": _serialize_approval(db, get_retake_approval(db, approval_id), include_admin_fields=True)}
    except Exception:
        db.rollback()
        raise


def cancel_retake_approval(db: Session, approval_id: int) -> dict[str, Any]:
    now = now_utc()
    try:
        approval = get_retake_approval(db, approval_id, lock=True)
        computed = compute_approval_status(approval, used_attempt=_used_attempt(db, approval.id))
        if computed == "cancelled":
            return {"approval": _serialize_approval(db, approval, include_admin_fields=True)}
        if computed == "used":
            raise SprintExamV2RetakeApprovalConflictError("RETAKE_APPROVAL_NOT_CANCELLABLE", "Used retake approvals cannot be cancelled.")
        approval.status = "cancelled"
        approval.cancelled_at = now
        db.commit()
        return {"approval": _serialize_approval(db, get_retake_approval(db, approval_id), include_admin_fields=True)}
    except IntegrityError as exc:
        db.rollback()
        raise SprintExamV2RetakeApprovalConflictError("RETAKE_APPROVAL_CONFLICT", "Retake approval state conflict occurred.") from exc
    except Exception:
        db.rollback()
        raise
