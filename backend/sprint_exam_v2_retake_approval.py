from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

import admin_auth
from database import get_db
import sprint_exam_v2_retake_approval_service as retake_service
from sprint_exam_v2_retake_approval_service import (
    SprintExamV2RetakeApprovalConflictError,
    SprintExamV2RetakeApprovalDomainError,
    SprintExamV2RetakeApprovalNotFoundError,
)


router = APIRouter(tags=["Sprint Exam V2 Retake Approvals"])


class SprintExamV2RetakeApprovalCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    assignment_id: int
    reason: str | None = None
    expires_at: datetime | None = None
    memo: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SprintExamV2RetakeApprovalUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reason: str | None = None
    expires_at: datetime | None = None
    memo: str | None = None
    metadata: dict[str, Any] | None = None


def _payload(payload: BaseModel) -> dict[str, Any]:
    return payload.model_dump(exclude_unset=True)


def _raise_http_error(exc: Exception) -> None:
    if isinstance(exc, SprintExamV2RetakeApprovalDomainError):
        raise HTTPException(status_code=400, detail=exc.detail()) from exc
    if isinstance(exc, SprintExamV2RetakeApprovalConflictError):
        raise HTTPException(status_code=409, detail=exc.detail()) from exc
    if isinstance(exc, SprintExamV2RetakeApprovalNotFoundError):
        raise HTTPException(status_code=404, detail={"code": "RETAKE_APPROVAL_NOT_FOUND", "message": "Sprint Exam V2 retake approval not found."}) from exc
    raise exc


@router.post("/admin/sprint-exam-v2/retake-approvals")
def admin_create_sprint_exam_v2_retake_approval(
    payload: SprintExamV2RetakeApprovalCreateRequest,
    db: Session = Depends(get_db),
    _admin=Depends(admin_auth.require_admin),
):
    try:
        return retake_service.create_retake_approval(db, _payload(payload), admin_id=_admin.id, check_existing=True)
    except Exception as exc:
        _raise_http_error(exc)


@router.get("/admin/sprint-exam-v2/retake-approvals")
def admin_list_sprint_exam_v2_retake_approvals(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    student_id: int | None = None,
    assignment_id: int | None = None,
    exam_id: int | None = None,
    status: str | None = None,
    computed_status: str | None = None,
    include_expired: bool = True,
    db: Session = Depends(get_db),
    _admin=Depends(admin_auth.require_admin),
):
    return retake_service.list_retake_approvals(
        db,
        limit=limit,
        offset=offset,
        student_id=student_id,
        assignment_id=assignment_id,
        exam_id=exam_id,
        status=status,
        computed_status=computed_status,
        include_expired=include_expired,
    )


@router.get("/admin/sprint-exam-v2/retake-approvals/{approval_id}")
def admin_get_sprint_exam_v2_retake_approval(approval_id: int, db: Session = Depends(get_db), _admin=Depends(admin_auth.require_admin)):
    try:
        return retake_service.get_retake_approval_detail(db, approval_id)
    except Exception as exc:
        _raise_http_error(exc)


@router.patch("/admin/sprint-exam-v2/retake-approvals/{approval_id}")
def admin_update_sprint_exam_v2_retake_approval(
    approval_id: int,
    payload: SprintExamV2RetakeApprovalUpdateRequest,
    db: Session = Depends(get_db),
    _admin=Depends(admin_auth.require_admin),
):
    try:
        return retake_service.update_retake_approval(db, approval_id, _payload(payload))
    except Exception as exc:
        _raise_http_error(exc)


@router.delete("/admin/sprint-exam-v2/retake-approvals/{approval_id}")
def admin_cancel_sprint_exam_v2_retake_approval(approval_id: int, db: Session = Depends(get_db), _admin=Depends(admin_auth.require_admin)):
    try:
        return retake_service.cancel_retake_approval(db, approval_id)
    except Exception as exc:
        _raise_http_error(exc)
