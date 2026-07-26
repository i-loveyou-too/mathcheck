from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

import admin_auth
import sprint_exam_v2_scoring_service as scoring_service
import student_auth
from database import get_db
from sprint_exam_v2_scoring_service import (
    SprintExamV2ScoringConflictError,
    SprintExamV2ScoringNotFoundError,
)
from sprint_exam_v2_scoring_validation import SprintExamV2ScoringDomainError
from sprint_exam_v2_result_publication_service import SprintExamV2PublicationConflictError
from sprint_exam_v2_result_publication_validation import SprintExamV2PublicationDomainError


router = APIRouter(tags=["Sprint Exam V2 Scoring"])


class SprintExamV2ScoreRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reason: Literal["initial_scoring", "manual_rescore"] = "initial_scoring"


class SprintExamV2RescoreRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reason: Literal["manual_rescore", "answer_key_changed", "scoring_version_changed"] = "manual_rescore"


def _raise_http_error(exc: Exception) -> None:
    if isinstance(exc, SprintExamV2ScoringDomainError):
        raise HTTPException(status_code=400, detail=exc.detail()) from exc
    if isinstance(exc, SprintExamV2ScoringConflictError):
        raise HTTPException(status_code=409, detail=exc.detail()) from exc
    if isinstance(exc, SprintExamV2ScoringNotFoundError):
        raise HTTPException(status_code=404, detail="Sprint Exam V2 attempt not found.") from exc
    if isinstance(exc, SprintExamV2PublicationDomainError):
        raise HTTPException(status_code=400, detail=exc.detail()) from exc
    if isinstance(exc, SprintExamV2PublicationConflictError):
        status_code = 403 if exc.code == "RESULT_NOT_PUBLISHED" else 409
        raise HTTPException(status_code=status_code, detail=exc.detail()) from exc
    raise exc


@router.post("/admin/sprint-exam-v2/attempts/{attempt_id}/score")
def admin_score_sprint_exam_v2_attempt(
    attempt_id: int,
    payload: SprintExamV2ScoreRequest,
    db: Session = Depends(get_db),
    _admin=Depends(admin_auth.require_admin),
):
    try:
        return scoring_service.score_attempt(db, attempt_id, reason=payload.reason, rescore=False)
    except Exception as exc:
        _raise_http_error(exc)


@router.post("/admin/sprint-exam-v2/attempts/{attempt_id}/rescore")
def admin_rescore_sprint_exam_v2_attempt(
    attempt_id: int,
    payload: SprintExamV2RescoreRequest,
    db: Session = Depends(get_db),
    _admin=Depends(admin_auth.require_admin),
):
    try:
        return scoring_service.score_attempt(db, attempt_id, reason=payload.reason, rescore=True)
    except Exception as exc:
        _raise_http_error(exc)


@router.get("/student/sprint-exam-v2/attempts/{attempt_id}/result")
def student_get_sprint_exam_v2_result(attempt_id: int, request: Request, db: Session = Depends(get_db)):
    student = student_auth.get_current_student_from_cookie(db, request, touch=False)
    try:
        return scoring_service.get_student_result(db, attempt_id, student.id)
    except Exception as exc:
        _raise_http_error(exc)
