"""SPRINT 문제지 배정 + 풀이 제출 (6차).

기존 SPRINT 기능(sprint.py)은 수정하지 않고, sprint.py가 이 모듈의 대시보드 요약
함수를 지연 import(순환 참조 방지)로 가져다 쓴다. mock_exam.py / sprint_goals.py와
동일한 모듈 분리 패턴을 따른다.
"""

from __future__ import annotations

import os
import struct
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models
from database import get_db


router = APIRouter(tags=["Sprint Worksheets"])

WORKSHEET_SUBMISSION_STATUSES = {"draft", "pending", "approved", "rejected"}
MAX_WORKSHEET_PDF_BYTES = 20 * 1024 * 1024
MAX_WORKSHEET_IMAGE_BYTES = 8 * 1024 * 1024
MAX_WORKSHEET_IMAGE_COUNT = 10
STORAGE_ROOT = Path("storage")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class WorksheetPatchIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    subject: str | None = Field(default=None, max_length=50)
    due_date: date | None = None
    is_active: bool | None = None


class WorksheetSubmissionActionIn(BaseModel):
    student_id: int


class WorksheetSubmissionReviewIn(BaseModel):
    review_note: str | None = Field(default=None, max_length=500)
    comment: str | None = Field(default=None, max_length=500)
    reviewed_by: int | None = None


class WorksheetSubmissionRejectIn(BaseModel):
    review_note: str | None = Field(default=None, max_length=500)
    comment: str | None = Field(default=None, max_length=500)
    reviewed_by: int | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def normalized_admin_comment(payload: object, *, required: bool = False) -> str | None:
    raw = getattr(payload, "comment", None)
    if raw is None:
        raw = getattr(payload, "review_note", None)
    comment = raw.strip() if isinstance(raw, str) else None
    if required and not comment:
        raise HTTPException(status_code=400, detail="comment is required.")
    return comment or None


def get_program_or_404(db: Session, program_id: int) -> models.SprintProgram:
    program = db.get(models.SprintProgram, program_id)
    if program is None:
        raise HTTPException(status_code=404, detail="SPRINT 프로그램을 찾을 수 없습니다.")
    return program


def get_student_or_404(db: Session, student_id: int) -> models.Student:
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    return student


def get_assignment_or_404(db: Session, assignment_id: int) -> models.SprintWorksheetAssignment:
    assignment = db.get(models.SprintWorksheetAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Worksheet assignment not found.")
    return assignment


def ensure_student_assignment_access(assignment: models.SprintWorksheetAssignment, student_id: int) -> None:
    if assignment.student_id != student_id:
        raise HTTPException(status_code=403, detail="Cannot access another student's worksheet.")


def get_submission_or_404(db: Session, submission_id: int) -> models.SprintWorksheetSubmission:
    submission = db.get(models.SprintWorksheetSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Worksheet submission not found.")
    return submission


def ensure_student_submission_access(submission: models.SprintWorksheetSubmission, student_id: int) -> None:
    if submission.student_id != student_id:
        raise HTTPException(status_code=403, detail="Cannot access another student's submission.")


def detect_pdf(data: bytes) -> None:
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported for this upload.")


def detect_image(data: bytes) -> tuple[str, str, int | None, int | None]:
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width, height = struct.unpack(">II", data[16:24])
        return "png", "image/png", width, height
    if data.startswith(b"\xff\xd8"):
        index = 2
        while index + 9 < len(data):
            if data[index] != 0xFF:
                index += 1
                continue
            marker = data[index + 1]
            index += 2
            if marker in {0xD8, 0xD9}:
                continue
            if index + 2 > len(data):
                break
            length = int.from_bytes(data[index:index + 2], "big")
            if marker in {0xC0, 0xC2} and index + 7 < len(data):
                height = int.from_bytes(data[index + 3:index + 5], "big")
                width = int.from_bytes(data[index + 5:index + 7], "big")
                return "jpg", "image/jpeg", width, height
            index += max(length, 2)
        return "jpg", "image/jpeg", None, None
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        if data[12:16] == b"VP8X" and len(data) >= 30:
            width = int.from_bytes(data[24:27], "little") + 1
            height = int.from_bytes(data[27:30], "little") + 1
            return "webp", "image/webp", width, height
        return "webp", "image/webp", None, None
    raise HTTPException(status_code=400, detail="Only JPEG, PNG, and WEBP images are supported.")


def storage_file_path(storage_key: str) -> Path:
    root = STORAGE_ROOT.resolve()
    path = (STORAGE_ROOT / storage_key).resolve()
    if root not in path.parents:
        raise HTTPException(status_code=400, detail="Invalid storage key.")
    return path


def delete_storage_file(storage_key: str) -> None:
    try:
        storage_file_path(storage_key).unlink(missing_ok=True)
    except OSError:
        pass


def assignment_storage_key(student_id: int, assigned_date: date, extension: str) -> str:
    return f"sprint-worksheets/{student_id}/{assigned_date.isoformat()}/{uuid.uuid4().hex}.{extension}"


def submission_file_storage_key(student_id: int, assignment_id: int, extension: str) -> str:
    return f"sprint-worksheet-submissions/{student_id}/{assignment_id}/{uuid.uuid4().hex}.{extension}"


def submission_file_dict(file: models.SprintWorksheetSubmissionFile) -> dict:
    return {
        "id": file.id,
        "submission_id": file.submission_id,
        "file_kind": file.file_kind,
        "original_filename": file.original_filename,
        "mime_type": file.mime_type,
        "size_bytes": file.size_bytes,
        "width": file.width,
        "height": file.height,
        "order_index": file.order_index,
        "created_at": file.created_at,
        "student_url": f"/student/sprint/worksheets/submission-files/{file.id}",
        "admin_url": f"/admin/sprint-worksheet-submission-files/{file.id}",
    }


def submission_dict(submission: models.SprintWorksheetSubmission | None) -> dict | None:
    if submission is None:
        return None
    return {
        "id": submission.id,
        "assignment_id": submission.assignment_id,
        "student_id": submission.student_id,
        "submission_method": submission.submission_method,
        "status": submission.status,
        "submitted_at": submission.submitted_at,
        "reviewed_at": submission.reviewed_at,
        "reviewed_by": submission.reviewed_by,
        "review_note": submission.review_note,
        "created_at": submission.created_at,
        "updated_at": submission.updated_at,
        "files": [submission_file_dict(file) for file in submission.files],
    }


def assignment_dict(assignment: models.SprintWorksheetAssignment, include_submission: bool = True) -> dict:
    payload = {
        "id": assignment.id,
        "sprint_program_id": assignment.sprint_program_id,
        "student_id": assignment.student_id,
        "title": assignment.title,
        "subject": assignment.subject,
        "assigned_date": assignment.assigned_date,
        "due_date": assignment.due_date,
        "is_active": assignment.is_active,
        "original_filename": assignment.original_filename,
        "mime_type": assignment.mime_type,
        "size_bytes": assignment.size_bytes,
        "created_at": assignment.created_at,
        "updated_at": assignment.updated_at,
        "student_file_url": f"/student/sprint/worksheets/{assignment.id}/file",
        "admin_file_url": f"/admin/sprint-worksheets/{assignment.id}/file",
        "submission_status": assignment.submission.status if assignment.submission else "not_submitted",
    }
    if include_submission:
        payload["submission"] = submission_dict(assignment.submission)
    return payload


# ---------------------------------------------------------------------------
# Admin: 배정 관리
# ---------------------------------------------------------------------------


@router.post("/admin/sprints/{program_id}/worksheets", status_code=201)
async def admin_create_worksheet(
    program_id: int,
    title: str = Form(...),
    subject: str | None = Form(default=None),
    assigned_date: date = Form(...),
    due_date: date | None = Form(default=None),
    created_by_admin_id: int | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    program = get_program_or_404(db, program_id)
    data = await file.read(MAX_WORKSHEET_PDF_BYTES + 1)
    if len(data) > MAX_WORKSHEET_PDF_BYTES:
        raise HTTPException(status_code=400, detail="Worksheet file is too large.")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file is not allowed.")
    detect_pdf(data)
    storage_key = assignment_storage_key(program.student_id, assigned_date, "pdf")
    path = storage_file_path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    assignment = models.SprintWorksheetAssignment(
        sprint_program_id=program.id,
        student_id=program.student_id,
        title=title,
        subject=subject or None,
        assigned_date=assigned_date,
        due_date=due_date,
        storage_key=storage_key,
        original_filename=os.path.basename(file.filename or ""),
        mime_type="application/pdf",
        size_bytes=len(data),
        created_by_admin_id=created_by_admin_id,
    )
    db.add(assignment)
    try:
        db.commit()
    except Exception:
        db.rollback()
        delete_storage_file(storage_key)
        raise
    db.refresh(assignment)
    return assignment_dict(assignment)


@router.get("/admin/sprints/{program_id}/worksheets")
def admin_list_worksheets(
    program_id: int,
    status: Literal["all", "active", "inactive"] = Query(default="all"),
    db: Session = Depends(get_db),
):
    get_program_or_404(db, program_id)
    query = db.query(models.SprintWorksheetAssignment).filter_by(sprint_program_id=program_id)
    if status == "active":
        query = query.filter(models.SprintWorksheetAssignment.is_active.is_(True))
    elif status == "inactive":
        query = query.filter(models.SprintWorksheetAssignment.is_active.is_(False))
    assignments = query.order_by(models.SprintWorksheetAssignment.assigned_date.desc()).all()
    return [assignment_dict(assignment) for assignment in assignments]


@router.get("/admin/sprint-worksheets/{assignment_id}")
def admin_get_worksheet(assignment_id: int, db: Session = Depends(get_db)):
    return assignment_dict(get_assignment_or_404(db, assignment_id))


@router.patch("/admin/sprint-worksheets/{assignment_id}")
def admin_update_worksheet(assignment_id: int, payload: WorksheetPatchIn, db: Session = Depends(get_db)):
    assignment = get_assignment_or_404(db, assignment_id)
    values = payload.model_dump(exclude_unset=True)
    for key, value in values.items():
        setattr(assignment, key, value)
    db.commit()
    db.refresh(assignment)
    return assignment_dict(assignment)


@router.delete("/admin/sprint-worksheets/{assignment_id}")
def admin_delete_worksheet(assignment_id: int, db: Session = Depends(get_db)):
    assignment = get_assignment_or_404(db, assignment_id)
    if assignment.submission is not None and assignment.submission.files:
        raise HTTPException(status_code=400, detail="학생이 제출한 파일이 있는 배정은 삭제할 수 없습니다. 비활성화를 사용하세요.")
    storage_key = assignment.storage_key
    db.delete(assignment)
    db.commit()
    delete_storage_file(storage_key)
    return {"deleted": True}


@router.get("/admin/sprint-worksheets/{assignment_id}/file")
def admin_get_worksheet_file(assignment_id: int, db: Session = Depends(get_db)):
    assignment = get_assignment_or_404(db, assignment_id)
    path = storage_file_path(assignment.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=assignment.mime_type, filename=assignment.original_filename or path.name)


@router.get("/admin/sprint-worksheet-submission-files/{file_id}")
def admin_get_worksheet_submission_file(file_id: int, db: Session = Depends(get_db)):
    file = db.get(models.SprintWorksheetSubmissionFile, file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="File not found.")
    path = storage_file_path(file.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=file.mime_type, filename=file.original_filename or path.name)


@router.post("/admin/sprint-worksheet-submissions/{submission_id}/approve")
def admin_approve_worksheet_submission(
    submission_id: int,
    payload: WorksheetSubmissionReviewIn,
    db: Session = Depends(get_db),
):
    submission = get_submission_or_404(db, submission_id)
    if not submission.files:
        raise HTTPException(status_code=400, detail="Cannot approve a submission without files.")
    submission.status = "approved"
    submission.review_note = normalized_admin_comment(payload)
    submission.reviewed_by = payload.reviewed_by
    submission.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return submission_dict(submission)


@router.post("/admin/sprint-worksheet-submissions/{submission_id}/reject")
def admin_reject_worksheet_submission(
    submission_id: int,
    payload: WorksheetSubmissionRejectIn,
    db: Session = Depends(get_db),
):
    submission = get_submission_or_404(db, submission_id)
    submission.status = "rejected"
    submission.review_note = normalized_admin_comment(payload, required=True)
    submission.reviewed_by = payload.reviewed_by
    submission.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return submission_dict(submission)


# ---------------------------------------------------------------------------
# Student: 다운로드 + 제출
# ---------------------------------------------------------------------------


@router.get("/student/sprint/worksheets")
def student_list_worksheets(
    student_id: int,
    status: Literal["all", "pending_action", "in_review", "approved", "rejected"] = Query(default="all"),
    db: Session = Depends(get_db),
):
    get_student_or_404(db, student_id)
    query = db.query(models.SprintWorksheetAssignment).filter_by(
        student_id=student_id,
        is_active=True,
    )
    assignments = query.order_by(models.SprintWorksheetAssignment.assigned_date.desc()).all()
    rows = [assignment_dict(assignment) for assignment in assignments]
    if status == "all":
        return rows
    if status == "pending_action":
        return [row for row in rows if row["submission_status"] in {"not_submitted", "draft", "rejected"}]
    if status == "in_review":
        return [row for row in rows if row["submission_status"] == "pending"]
    return [row for row in rows if row["submission_status"] == status]


@router.get("/student/sprint/worksheets/{assignment_id}")
def student_get_worksheet(assignment_id: int, student_id: int, db: Session = Depends(get_db)):
    assignment = get_assignment_or_404(db, assignment_id)
    ensure_student_assignment_access(assignment, student_id)
    return assignment_dict(assignment)


@router.get("/student/sprint/worksheets/{assignment_id}/file")
def student_get_worksheet_file(assignment_id: int, student_id: int, db: Session = Depends(get_db)):
    assignment = get_assignment_or_404(db, assignment_id)
    ensure_student_assignment_access(assignment, student_id)
    path = storage_file_path(assignment.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=assignment.mime_type, filename=assignment.original_filename or path.name)


@router.post("/student/sprint/worksheets/{assignment_id}/submission-files", status_code=201)
async def student_upload_worksheet_submission_file(
    assignment_id: int,
    student_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    assignment = get_assignment_or_404(db, assignment_id)
    ensure_student_assignment_access(assignment, student_id)
    submission = assignment.submission
    if submission is None:
        submission = models.SprintWorksheetSubmission(
            assignment_id=assignment.id,
            student_id=student_id,
            status="draft",
        )
        db.add(submission)
        db.flush()
    if submission.status not in {"draft", "rejected"}:
        raise HTTPException(status_code=400, detail="Files can only be changed before submission or after rejection.")

    data = await file.read(MAX_WORKSHEET_PDF_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="Empty file is not allowed.")

    is_pdf = data.startswith(b"%PDF-")
    if is_pdf:
        if len(data) > MAX_WORKSHEET_PDF_BYTES:
            raise HTTPException(status_code=400, detail="File is too large.")
        if submission.submission_method == "images" or submission.files:
            raise HTTPException(status_code=400, detail="PDF와 사진 제출을 함께 사용할 수 없습니다. 기존 파일을 먼저 삭제하세요.")
        extension, mime_type, width, height, file_kind = "pdf", "application/pdf", None, None, "pdf"
    else:
        if len(data) > MAX_WORKSHEET_IMAGE_BYTES:
            raise HTTPException(status_code=400, detail="Image is too large.")
        if submission.submission_method == "pdf":
            raise HTTPException(status_code=400, detail="PDF와 사진 제출을 함께 사용할 수 없습니다. 기존 파일을 먼저 삭제하세요.")
        if len(submission.files) >= MAX_WORKSHEET_IMAGE_COUNT:
            raise HTTPException(status_code=400, detail=f"Up to {MAX_WORKSHEET_IMAGE_COUNT} images are allowed.")
        extension, mime_type, width, height = detect_image(data)
        file_kind = "image"

    storage_key = submission_file_storage_key(student_id, assignment_id, extension)
    path = storage_file_path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    submission_file = models.SprintWorksheetSubmissionFile(
        submission_id=submission.id,
        file_kind=file_kind,
        storage_key=storage_key,
        original_filename=os.path.basename(file.filename or ""),
        mime_type=mime_type,
        size_bytes=len(data),
        width=width,
        height=height,
        order_index=len(submission.files) + 1,
    )
    submission.submission_method = "pdf" if is_pdf else "images"
    submission.status = "draft"
    db.add(submission_file)
    try:
        db.commit()
    except Exception:
        db.rollback()
        delete_storage_file(storage_key)
        raise
    db.refresh(submission_file)
    return submission_file_dict(submission_file)


@router.delete("/student/sprint/worksheets/submission-files/{file_id}")
def student_delete_worksheet_submission_file(file_id: int, student_id: int, db: Session = Depends(get_db)):
    file = db.get(models.SprintWorksheetSubmissionFile, file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="File not found.")
    submission = get_submission_or_404(db, file.submission_id)
    ensure_student_submission_access(submission, student_id)
    if submission.status not in {"draft", "rejected"}:
        raise HTTPException(status_code=400, detail="Files can only be deleted before submission or after rejection.")
    storage_key = file.storage_key
    db.delete(file)
    db.commit()
    delete_storage_file(storage_key)
    remaining = db.get(models.SprintWorksheetSubmission, submission.id)
    if remaining is not None and not remaining.files:
        remaining.submission_method = None
        db.commit()
    return {"deleted": True}


@router.get("/student/sprint/worksheets/submission-files/{file_id}")
def student_get_worksheet_submission_file(file_id: int, student_id: int, db: Session = Depends(get_db)):
    file = db.get(models.SprintWorksheetSubmissionFile, file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="File not found.")
    submission = get_submission_or_404(db, file.submission_id)
    ensure_student_submission_access(submission, student_id)
    path = storage_file_path(file.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=file.mime_type, filename=file.original_filename or path.name)


@router.post("/student/sprint/worksheets/{assignment_id}/submit")
def student_submit_worksheet(assignment_id: int, payload: WorksheetSubmissionActionIn, db: Session = Depends(get_db)):
    assignment = get_assignment_or_404(db, assignment_id)
    ensure_student_assignment_access(assignment, payload.student_id)
    submission = assignment.submission
    if submission is None or not submission.files:
        raise HTTPException(status_code=400, detail="제출할 파일이 없습니다.")
    if submission.status == "approved":
        raise HTTPException(status_code=400, detail="Approved submissions cannot be resubmitted.")
    if submission.status == "pending":
        raise HTTPException(status_code=400, detail="This submission is already pending review.")
    submission.status = "pending"
    submission.submitted_at = datetime.now(timezone.utc)
    submission.reviewed_at = None
    submission.review_note = None
    db.commit()
    db.refresh(submission)
    return submission_dict(submission)


# ---------------------------------------------------------------------------
# 대시보드 요약 (sprint.py가 지연 import로 재사용)
# ---------------------------------------------------------------------------


def worksheet_home_summary(db: Session, program: models.SprintProgram, student_id: int) -> dict:
    assignments = (
        db.query(models.SprintWorksheetAssignment)
        .filter_by(sprint_program_id=program.id, student_id=student_id, is_active=True)
        .all()
    )
    if not assignments:
        return {"available": True, "assigned_count": 0, "pending_action_count": 0, "in_review_count": 0, "approved_count": 0, "path": "/student/sprint/worksheets"}
    pending_action = 0
    in_review = 0
    approved = 0
    for assignment in assignments:
        submission_status = assignment.submission.status if assignment.submission else "not_submitted"
        if submission_status in {"not_submitted", "draft", "rejected"}:
            pending_action += 1
        elif submission_status == "pending":
            in_review += 1
        elif submission_status == "approved":
            approved += 1
    return {
        "available": True,
        "assigned_count": len(assignments),
        "pending_action_count": pending_action,
        "in_review_count": in_review,
        "approved_count": approved,
        "path": "/student/sprint/worksheets",
    }
