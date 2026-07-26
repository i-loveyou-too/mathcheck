from __future__ import annotations

from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

import admin_auth
import sprint_exam_v2_assignment_service as assignment_service
import student_auth
from database import get_db
from sprint_exam_v2_assignment_service import (
    SprintExamV2AssignmentConflictError,
    SprintExamV2AssignmentNotFoundError,
)
from sprint_exam_v2_assignment_validation import SprintExamV2AssignmentDomainError


router = APIRouter(tags=["Sprint Exam V2 Assignments"])


class SprintExamV2AssignmentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    exam_id: int
    student_ids: list[int] = Field(min_length=1)
    available_from: datetime | None = None
    due_at: datetime | None = None
    attempt_limit: int | None = Field(default=None, ge=1)
    memo: str | None = None
    paper_selection_mode: str = "student_profile"
    paper_overrides: dict[str, dict[str, str]] | None = None


class SprintExamV2AssignmentUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    available_from: datetime | None = None
    due_at: datetime | None = None
    attempt_limit: int | None = Field(default=None, ge=1)
    memo: str | None = None
    paper_selection_mode: str | None = None
    paper_overrides: dict[str, str] | None = None


class SprintExamV2AssignmentCreateResponse(BaseModel):
    ok: bool
    created: list[dict[str, Any]]
    skipped: list[dict[str, Any]]
    errors: list[dict[str, Any]]


class SprintExamV2AssignmentListResponse(BaseModel):
    items: list[dict[str, Any]]
    total: int | None = None
    limit: int | None = None
    offset: int | None = None


class SprintExamV2AssignmentDeleteResponse(BaseModel):
    ok: bool
    deleted_assignment_id: int


def _payload(payload: BaseModel) -> dict[str, Any]:
    return payload.model_dump(exclude_none=True)


def _raise_http_error(exc: Exception) -> None:
    if isinstance(exc, SprintExamV2AssignmentDomainError):
        raise HTTPException(status_code=400, detail=exc.detail()) from exc
    if isinstance(exc, SprintExamV2AssignmentConflictError):
        raise HTTPException(status_code=409, detail=exc.detail()) from exc
    if isinstance(exc, SprintExamV2AssignmentNotFoundError):
        raise HTTPException(status_code=404, detail="Sprint Exam V2 assignment not found.") from exc
    raise exc


@router.post("/admin/sprint-exam-v2/assignments", response_model=SprintExamV2AssignmentCreateResponse)
def admin_create_sprint_exam_v2_assignments(payload: SprintExamV2AssignmentCreateRequest, db: Session = Depends(get_db), _admin=Depends(admin_auth.require_admin)):
    try:
        return assignment_service.create_assignments(db, _payload(payload))
    except Exception as exc:
        _raise_http_error(exc)


@router.get("/admin/sprint-exam-v2/assignments", response_model=SprintExamV2AssignmentListResponse)
def admin_list_sprint_exam_v2_assignments(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    student_id: int | None = None,
    exam_id: int | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    _admin=Depends(admin_auth.require_admin),
):
    return assignment_service.list_admin_assignments(
        db,
        limit=limit,
        offset=offset,
        student_id=student_id,
        exam_id=exam_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )


@router.get("/admin/sprint-exam-v2/assignments/{assignment_id}")
def admin_get_sprint_exam_v2_assignment(assignment_id: int, db: Session = Depends(get_db), _admin=Depends(admin_auth.require_admin)):
    try:
        return assignment_service.serialize_assignment_detail(db, assignment_service.get_assignment(db, assignment_id))
    except Exception as exc:
        _raise_http_error(exc)


@router.patch("/admin/sprint-exam-v2/assignments/{assignment_id}")
def admin_update_sprint_exam_v2_assignment(
    assignment_id: int,
    payload: SprintExamV2AssignmentUpdateRequest,
    db: Session = Depends(get_db),
    _admin=Depends(admin_auth.require_admin),
):
    try:
        return assignment_service.update_assignment(db, assignment_id, _payload(payload))
    except Exception as exc:
        _raise_http_error(exc)


@router.delete("/admin/sprint-exam-v2/assignments/{assignment_id}", response_model=SprintExamV2AssignmentDeleteResponse)
def admin_delete_sprint_exam_v2_assignment(assignment_id: int, db: Session = Depends(get_db), _admin=Depends(admin_auth.require_admin)):
    try:
        return assignment_service.delete_assignment(db, assignment_id)
    except Exception as exc:
        _raise_http_error(exc)


@router.get("/student/sprint-exam-v2/assignments", response_model=SprintExamV2AssignmentListResponse)
def student_list_sprint_exam_v2_assignments(request: Request, db: Session = Depends(get_db)):
    student = student_auth.get_current_student_from_cookie(db, request)
    return assignment_service.list_student_assignments(db, student.id)


@router.get("/student/sprint-exam-v2/assignments/{assignment_id}")
def student_get_sprint_exam_v2_assignment(assignment_id: int, request: Request, db: Session = Depends(get_db)):
    student = student_auth.get_current_student_from_cookie(db, request)
    try:
        return assignment_service.get_student_assignment(db, assignment_id, student.id)
    except Exception as exc:
        _raise_http_error(exc)
