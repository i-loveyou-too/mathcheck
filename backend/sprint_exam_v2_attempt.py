from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

import admin_auth
import sprint_exam_v2_attempt_service as attempt_service
import sprint_exam_v2_scoring_service as scoring_service
import student_auth
from database import get_db
from sprint_exam_v2_attempt_service import (
    SprintExamV2AttemptConflictError,
    SprintExamV2AttemptDomainError,
    SprintExamV2AttemptNotFoundError,
)
from sprint_exam_v2_scoring_service import (
    SprintExamV2ScoringConflictError,
    SprintExamV2ScoringNotFoundError,
)
from sprint_exam_v2_scoring_validation import SprintExamV2ScoringDomainError


router = APIRouter(tags=["Sprint Exam V2 Attempts"])


class SprintExamV2ResponseInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    question_id: int
    answer: list[Any] | None = None


class SprintExamV2BulkResponsesRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    responses: list[SprintExamV2ResponseInput]


class SprintExamV2SingleResponseRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    answer: list[Any] | None = None


def _current_student_id(db: Session, request: Request) -> int:
    return student_auth.get_current_student_from_cookie(db, request).id


def _raise_http_error(exc: Exception) -> None:
    if isinstance(exc, SprintExamV2AttemptDomainError):
        raise HTTPException(status_code=400, detail=exc.detail()) from exc
    if isinstance(exc, SprintExamV2AttemptConflictError):
        raise HTTPException(status_code=409, detail=exc.detail()) from exc
    if isinstance(exc, SprintExamV2AttemptNotFoundError):
        raise HTTPException(status_code=404, detail="Sprint Exam V2 attempt not found.") from exc
    if isinstance(exc, SprintExamV2ScoringDomainError):
        raise HTTPException(status_code=400, detail=exc.detail()) from exc
    if isinstance(exc, SprintExamV2ScoringConflictError):
        raise HTTPException(status_code=409, detail=exc.detail()) from exc
    if isinstance(exc, SprintExamV2ScoringNotFoundError):
        raise HTTPException(status_code=404, detail="Sprint Exam V2 attempt not found.") from exc
    raise exc


@router.post("/student/sprint-exam-v2/assignments/{assignment_id}/start")
def student_start_sprint_exam_v2_attempt(
    assignment_id: int,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
):
    student_id = _current_student_id(db, request)
    try:
        result = attempt_service.start_attempt(db, assignment_id, student_id)
        if result.get("created"):
            response.status_code = status.HTTP_201_CREATED
        return result
    except Exception as exc:
        _raise_http_error(exc)


@router.get("/student/sprint-exam-v2/attempts/{attempt_id}")
def student_get_sprint_exam_v2_attempt(attempt_id: int, request: Request, db: Session = Depends(get_db)):
    student_id = _current_student_id(db, request)
    try:
        return attempt_service.get_attempt(db, attempt_id, student_id)
    except Exception as exc:
        _raise_http_error(exc)


@router.put("/student/sprint-exam-v2/attempts/{attempt_id}/responses")
def student_save_sprint_exam_v2_responses(
    attempt_id: int,
    payload: SprintExamV2BulkResponsesRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    student_id = _current_student_id(db, request)
    try:
        return attempt_service.save_responses(
            db,
            attempt_id,
            student_id,
            [item.model_dump() for item in payload.responses],
        )
    except Exception as exc:
        _raise_http_error(exc)


@router.patch("/student/sprint-exam-v2/attempts/{attempt_id}/responses/{question_id}")
def student_save_sprint_exam_v2_response(
    attempt_id: int,
    question_id: int,
    payload: SprintExamV2SingleResponseRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    student_id = _current_student_id(db, request)
    try:
        return attempt_service.save_response(db, attempt_id, student_id, question_id, payload.answer)
    except Exception as exc:
        _raise_http_error(exc)


@router.post("/student/sprint-exam-v2/attempts/{attempt_id}/submit")
def student_submit_sprint_exam_v2_attempt(attempt_id: int, request: Request, db: Session = Depends(get_db)):
    student_id = _current_student_id(db, request)
    try:
        return attempt_service.submit_attempt(db, attempt_id, student_id)
    except Exception as exc:
        _raise_http_error(exc)


@router.get("/admin/sprint-exam-v2/attempts/{attempt_id}")
def admin_get_sprint_exam_v2_attempt(attempt_id: int, db: Session = Depends(get_db), _admin=Depends(admin_auth.require_admin)):
    try:
        return scoring_service.get_admin_attempt_detail(db, attempt_id)
    except Exception as exc:
        _raise_http_error(exc)
