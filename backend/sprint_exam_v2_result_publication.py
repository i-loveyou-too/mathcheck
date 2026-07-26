from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

import admin_auth
import sprint_exam_v2_result_publication_service as publication_service
from database import get_db
from sprint_exam_v2_result_publication_service import (
    SprintExamV2PublicationConflictError,
    SprintExamV2PublicationNotFoundError,
)
from sprint_exam_v2_result_publication_validation import SprintExamV2PublicationDomainError


router = APIRouter(tags=["Sprint Exam V2 Result Publication"])


class SprintExamV2PublicationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    show_total_score: bool | None = None
    show_grade: bool | None = None
    show_score_groups: bool | None = None
    show_question_results: bool | None = None
    show_correct_answers: bool | None = None
    show_explanations: bool | None = None
    message: str | None = None

    def service_payload(self) -> dict[str, Any]:
        return self.model_dump(exclude_unset=True)


def _raise_http_error(exc: Exception) -> None:
    if isinstance(exc, SprintExamV2PublicationDomainError):
        raise HTTPException(status_code=400, detail=exc.detail()) from exc
    if isinstance(exc, SprintExamV2PublicationConflictError):
        raise HTTPException(status_code=409, detail=exc.detail()) from exc
    if isinstance(exc, SprintExamV2PublicationNotFoundError):
        raise HTTPException(status_code=404, detail="Sprint Exam V2 attempt not found.") from exc
    raise exc


@router.get("/admin/sprint-exam-v2/attempts/{attempt_id}/publication")
def admin_get_sprint_exam_v2_publication(
    attempt_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(admin_auth.require_admin),
):
    try:
        return publication_service.get_publication(db, attempt_id)
    except Exception as exc:
        _raise_http_error(exc)


@router.post("/admin/sprint-exam-v2/attempts/{attempt_id}/publish")
def admin_publish_sprint_exam_v2_result(
    attempt_id: int,
    payload: SprintExamV2PublicationRequest | None = None,
    db: Session = Depends(get_db),
    admin=Depends(admin_auth.require_admin),
):
    try:
        return publication_service.publish_attempt(
            db,
            attempt_id,
            payload.service_payload() if payload else {},
            actor_admin_id=admin.id,
        )
    except Exception as exc:
        _raise_http_error(exc)


@router.post("/admin/sprint-exam-v2/attempts/{attempt_id}/unpublish")
def admin_unpublish_sprint_exam_v2_result(
    attempt_id: int,
    payload: SprintExamV2PublicationRequest | None = None,
    db: Session = Depends(get_db),
    admin=Depends(admin_auth.require_admin),
):
    try:
        return publication_service.unpublish_attempt(
            db,
            attempt_id,
            payload.service_payload() if payload else {},
            actor_admin_id=admin.id,
        )
    except Exception as exc:
        _raise_http_error(exc)


@router.patch("/admin/sprint-exam-v2/attempts/{attempt_id}/publication")
def admin_update_sprint_exam_v2_publication(
    attempt_id: int,
    payload: SprintExamV2PublicationRequest,
    db: Session = Depends(get_db),
    admin=Depends(admin_auth.require_admin),
):
    try:
        return publication_service.update_publication(
            db,
            attempt_id,
            payload.service_payload(),
            actor_admin_id=admin.id,
        )
    except Exception as exc:
        _raise_http_error(exc)
