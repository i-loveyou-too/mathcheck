from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

import admin_auth
import sprint_exam_v2_analysis_service as analysis_service
import student_auth
from database import get_db


router = APIRouter(tags=["Sprint Exam V2 Analysis"])


def _raise_http_error(exc: Exception) -> None:
    if isinstance(exc, analysis_service.SprintExamV2AnalysisNotFoundError):
        raise HTTPException(status_code=404, detail="Sprint Exam V2 analysis target not found.") from exc
    raise exc


@router.get("/student/sprint-exam-v2/analysis")
def student_get_sprint_exam_v2_analysis(
    request: Request,
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    student = student_auth.get_current_student_from_cookie(db, request, touch=False)
    try:
        return analysis_service.get_student_analysis(
            db,
            student.id,
            include_unpublished=False,
            limit=limit,
        )
    except Exception as exc:
        _raise_http_error(exc)


@router.get("/admin/students/{student_id}/sprint-exam-v2/analysis")
def admin_get_student_sprint_exam_v2_analysis(
    student_id: int,
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
    _admin=Depends(admin_auth.require_admin),
):
    try:
        return analysis_service.get_student_analysis(
            db,
            student_id,
            include_unpublished=True,
            limit=limit,
        )
    except Exception as exc:
        _raise_http_error(exc)
