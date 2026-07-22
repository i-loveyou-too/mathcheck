from __future__ import annotations

import os
import re
import struct
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from database import get_db
from study_dates import get_study_date


router = APIRouter(tags=["Sprint"])

FEATURE_FLAGS = [
    "enable_seat_check",
    "enable_planner_submission",
    "enable_study_timer",
    "enable_study_time_submission",
    "enable_vocabulary",
    "enable_mock_exam",
    "enable_goals",
    "enable_three_strikes",
    "enable_penalty_assignment",
]

# 1차에서 실제 동작으로 연결되는 기능(영단어 챌린지)과 준비 중 기능을 구분한다.
IMPLEMENTED_FEATURES = {
    "enable_vocabulary",
    "enable_goals",
    "enable_three_strikes",
    "enable_study_time_submission",
    "enable_planner_submission",
    "enable_seat_check",
    "enable_mock_exam",
}

STUDY_SUBMISSION_STATUSES = {"draft", "pending", "approved", "rejected", "cancelled"}
MAX_STUDY_IMAGE_BYTES = 8 * 1024 * 1024
MAX_STUDY_IMAGE_COUNT = 3
STORAGE_ROOT = Path("storage")
SPRINT_STUDY_STORAGE_ROOT = STORAGE_ROOT / "sprint-study"
SEOUL_TZ = timezone(timedelta(hours=9))

STRIKE_TYPES = {
    "seat_check_late",
    "seat_check_missing",
    "planner_late",
    "planner_missing",
    "vocabulary_missing",
    "study_time_shortage",
    "mock_exam_late",
    "mock_exam_missing",
    "manual",
}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class SprintFeatureFlags(BaseModel):
    enable_seat_check: bool = False
    enable_planner_submission: bool = False
    enable_study_timer: bool = False
    enable_study_time_submission: bool = False
    enable_vocabulary: bool = False
    enable_mock_exam: bool = False
    enable_goals: bool = True
    enable_three_strikes: bool = True
    enable_penalty_assignment: bool = False


class SprintProgramIn(SprintFeatureFlags):
    student_id: int
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    start_date: date
    end_date: date
    is_active: bool = True
    daily_study_goal_minutes: int | None = Field(default=None, ge=0, le=1440)
    planner_deadline_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    seat_check_deadline_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    seat_check_open_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    planner_mode: Literal["paper", "today_system", "disabled"] = "paper"
    study_time_deadline_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    study_time_strike_on_missing: bool = False
    study_time_strike_on_shortage: bool = False
    mock_exam_weekday: int | None = Field(default=None, ge=0, le=6)
    mock_exam_start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    mock_exam_submission_deadline_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    first_mock_exam_date: date | None = None
    vocabulary_bank_id: int | None = None
    vocabulary_start_bank_day: int | None = Field(default=None, ge=1, le=365)
    vocabulary_bank_day_direction: Literal["ascending", "descending"] = "ascending"
    vocabulary_bank_days_per_learning_day: int = Field(default=3, ge=1, le=30)
    vocabulary_max_question_count: int = Field(default=100, ge=1, le=2000)
    vocabulary_allow_student_answer_pdf: bool = False
    enable_vocabulary_challenge: bool | None = None
    planner_strike_on_late: bool = True
    planner_strike_on_missing: bool = True
    seat_check_strike_on_late: bool = True
    seat_check_strike_on_missing: bool = True
    daily_auto_strike_limit: int | None = Field(default=None, ge=1, le=10)
    strike_threshold: int = Field(default=3, ge=1, le=20)
    penalty_word_count: int = Field(default=20, ge=1, le=500)
    penalty_repetition_count: int = Field(default=5, ge=1, le=100)
    penalty_due_hours: int = Field(default=24, ge=1, le=720)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("종료일은 시작일보다 빠를 수 없습니다.")
        return self


class SprintProgramUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool | None = None
    daily_study_goal_minutes: int | None = Field(default=None, ge=0, le=1440)
    planner_deadline_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    seat_check_deadline_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    planner_strike_on_late: bool | None = None
    planner_strike_on_missing: bool | None = None
    seat_check_strike_on_late: bool | None = None
    seat_check_strike_on_missing: bool | None = None
    daily_auto_strike_limit: int | None = Field(default=None, ge=1, le=10)
    seat_check_open_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    planner_mode: Literal["paper", "today_system", "disabled"] | None = None
    study_time_deadline_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    study_time_strike_on_missing: bool | None = None
    study_time_strike_on_shortage: bool | None = None
    mock_exam_weekday: int | None = Field(default=None, ge=0, le=6)
    mock_exam_start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    mock_exam_submission_deadline_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    first_mock_exam_date: date | None = None
    vocabulary_bank_id: int | None = None
    vocabulary_start_bank_day: int | None = Field(default=None, ge=1, le=365)
    vocabulary_bank_day_direction: Literal["ascending", "descending"] | None = None
    vocabulary_bank_days_per_learning_day: int | None = Field(default=None, ge=1, le=30)
    vocabulary_max_question_count: int | None = Field(default=None, ge=1, le=2000)
    vocabulary_allow_student_answer_pdf: bool | None = None
    enable_vocabulary_challenge: bool | None = None
    enable_seat_check: bool | None = None
    enable_planner_submission: bool | None = None
    enable_study_timer: bool | None = None
    enable_vocabulary: bool | None = None
    enable_mock_exam: bool | None = None
    enable_goals: bool | None = None
    enable_three_strikes: bool | None = None
    enable_penalty_assignment: bool | None = None
    strike_threshold: int | None = Field(default=None, ge=1, le=20)
    penalty_word_count: int | None = Field(default=None, ge=1, le=500)
    penalty_repetition_count: int | None = Field(default=None, ge=1, le=100)
    penalty_due_hours: int | None = Field(default=None, ge=1, le=720)


class SprintGoalIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    target_value: int | None = Field(default=None, ge=0)
    current_value: int = Field(default=0, ge=0)
    unit: str | None = Field(default=None, max_length=50)
    order_index: int = 0
    is_completed: bool = False


class SprintGoalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    target_value: int | None = Field(default=None, ge=0)
    current_value: int | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=50)
    order_index: int | None = None
    is_completed: bool | None = None


class SprintStrikeIn(BaseModel):
    strike_type: str = "manual"
    reason: str | None = Field(default=None, max_length=500)
    learning_date: date | None = None
    related_entity_type: str | None = Field(default=None, max_length=40)
    related_entity_id: int | None = None
    created_by_admin_id: int | None = None

    @model_validator(mode="after")
    def validate_type(self):
        if self.strike_type not in STRIKE_TYPES:
            raise ValueError("허용되지 않은 strike_type 입니다.")
        return self


class SprintStrikeCancelIn(BaseModel):
    cancelled_reason: str | None = Field(default=None, max_length=500)


class StudySubmissionDraftIn(BaseModel):
    student_id: int
    learning_date: date
    total_minutes: int = Field(ge=1, le=1440)
    subject_breakdown: dict[str, int] | None = None
    memo: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_breakdown(self):
        if self.subject_breakdown:
            total = 0
            for subject, minutes in self.subject_breakdown.items():
                if not subject.strip():
                    raise ValueError("subject name is required")
                if minutes < 0 or minutes > 1440:
                    raise ValueError("subject minutes must be between 0 and 1440")
                total += minutes
            if total != self.total_minutes:
                raise ValueError("subject_breakdown sum must match total_minutes")
        return self


class StudySubmissionActionIn(BaseModel):
    student_id: int


class StudySubmissionReviewIn(BaseModel):
    approved_minutes: int | None = Field(default=None, ge=1, le=1440)
    review_note: str | None = Field(default=None, max_length=500)
    comment: str | None = Field(default=None, max_length=500)
    reviewed_by: int | None = None


class StudySubmissionRejectIn(BaseModel):
    review_note: str | None = Field(default=None, max_length=500)
    comment: str | None = Field(default=None, max_length=500)
    reviewed_by: int | None = None


class DailyProofDraftIn(BaseModel):
    student_id: int
    learning_date: date
    proof_type: Literal["planner", "seat_check"]
    memo: str | None = Field(default=None, max_length=500)


class DailyProofActionIn(BaseModel):
    student_id: int


class DailyProofReviewIn(BaseModel):
    review_note: str | None = Field(default=None, max_length=500)
    comment: str | None = Field(default=None, max_length=500)
    timing_override: Literal["on_time", "late"] | None = None
    timing_override_reason: str | None = Field(default=None, max_length=500)
    reviewed_by: int | None = None


class DailyProofRejectIn(BaseModel):
    review_note: str | None = Field(default=None, max_length=500)
    comment: str | None = Field(default=None, max_length=500)
    reviewed_by: int | None = None


class MissingProofJudgeIn(BaseModel):
    learning_date: date
    proof_type: Literal["planner", "seat_check", "all"] = "all"
    reviewed_by: int | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


HTML_TAG_RE = re.compile(r"<[^>\n]*>")


def normalized_admin_comment(payload: object, *, required: bool = False) -> str | None:
    raw = getattr(payload, "comment", None)
    if raw is None:
        raw = getattr(payload, "review_note", None)
    comment = HTML_TAG_RE.sub("", raw).strip() if isinstance(raw, str) else None
    if required and not comment:
        raise HTTPException(status_code=400, detail="comment is required.")
    return comment or None


def normalize_program_values(values: dict) -> dict:
    if "enable_vocabulary_challenge" in values:
        alias = values.pop("enable_vocabulary_challenge")
        if alias is not None:
            values["enable_vocabulary"] = alias
    planner_mode = values.get("planner_mode")
    if planner_mode is not None:
        values["enable_planner_submission"] = planner_mode == "paper"
        if planner_mode != "paper":
            values["planner_deadline_time"] = None
            values["planner_strike_on_late"] = False
            values["planner_strike_on_missing"] = False
    return values


def sync_vocabulary_challenge_from_program(db: Session, program: models.SprintProgram) -> None:
    if not program.enable_vocabulary or not program.vocabulary_bank_id:
        return
    import vocabulary

    bank = db.get(models.VocabularyBank, program.vocabulary_bank_id)
    if bank is None:
        raise HTTPException(status_code=400, detail="Vocabulary bank not found.")
    start_day = program.vocabulary_start_bank_day or (
        bank.total_days if program.vocabulary_bank_day_direction == "descending" else 1
    )
    if start_day < 1 or start_day > bank.total_days:
        raise HTTPException(status_code=400, detail="vocabulary_start_bank_day is outside the selected bank.")
    existing = vocabulary.active_challenge(db, program.student_id, program.start_date)
    if existing and existing.start_date == program.start_date and existing.end_date == program.end_date:
        challenge = existing
    else:
        vocabulary.ensure_no_active_overlap(db, program.student_id, program.start_date, program.end_date, True)
        challenge = models.VocabularyChallenge(
            name=f"{program.title} 영단어 챌린지",
            student_id=program.student_id,
            start_date=program.start_date,
            end_date=program.end_date,
            source_type="word_bank",
            accumulation_type="fixed_cumulative",
            is_active=True,
        )
        db.add(challenge)
    challenge.word_bank_id = bank.id
    challenge.daily_new_word_count = bank.words_per_day
    challenge.daily_test_question_count = program.vocabulary_max_question_count or bank.default_daily_test_question_count
    challenge.max_question_count = program.vocabulary_max_question_count or bank.default_daily_test_question_count
    challenge.start_bank_day = start_day
    challenge.bank_day_direction = program.vocabulary_bank_day_direction
    challenge.bank_days_per_learning_day = program.vocabulary_bank_days_per_learning_day or 3
    challenge.allow_student_answer_pdf = program.vocabulary_allow_student_answer_pdf


def get_student_or_404(db: Session, student_id: int) -> models.Student:
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    return student


def get_program_or_404(db: Session, program_id: int) -> models.SprintProgram:
    program = db.get(models.SprintProgram, program_id)
    if program is None:
        raise HTTPException(status_code=404, detail="SPRINT 프로그램을 찾을 수 없습니다.")
    return program


def active_study_program_for_date(
    db: Session, student_id: int, learning_date: date
) -> models.SprintProgram | None:
    return (
        db.query(models.SprintProgram)
        .filter(
            models.SprintProgram.student_id == student_id,
            models.SprintProgram.is_active.is_(True),
            models.SprintProgram.start_date <= learning_date,
            models.SprintProgram.end_date >= learning_date,
        )
        .order_by(models.SprintProgram.start_date.desc())
        .first()
    )


def get_submission_or_404(db: Session, submission_id: int) -> models.SprintStudySubmission:
    submission = db.get(models.SprintStudySubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Study submission not found.")
    return submission


def ensure_student_submission_access(submission: models.SprintStudySubmission, student_id: int) -> None:
    if submission.student_id != student_id:
        raise HTTPException(status_code=403, detail="Cannot access another student's submission.")


def validate_study_submission_program(program: models.SprintProgram, learning_date: date) -> None:
    if not program.enable_study_time_submission:
        raise HTTPException(status_code=400, detail="Study time submission is disabled for this SPRINT.")
    if not program.start_date <= learning_date <= program.end_date:
        raise HTTPException(status_code=400, detail="learning_date is outside the SPRINT period.")
    if learning_date > get_study_date():
        raise HTTPException(status_code=400, detail="Future learning dates cannot be submitted.")


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


def safe_storage_key(student_id: int, learning_date: date, extension: str) -> str:
    return f"sprint-study/{student_id}/{learning_date.isoformat()}/{uuid.uuid4().hex}.{extension}"


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


def image_dict(image: models.SprintStudySubmissionImage) -> dict:
    return {
        "id": image.id,
        "submission_id": image.submission_id,
        "original_filename": image.original_filename,
        "mime_type": image.mime_type,
        "size_bytes": image.size_bytes,
        "width": image.width,
        "height": image.height,
        "order_index": image.order_index,
        "created_at": image.created_at,
        "student_url": f"/student/sprint/study-time/images/{image.id}",
        "admin_url": f"/admin/sprint-study-images/{image.id}",
    }


def study_submission_dict(submission: models.SprintStudySubmission, include_images: bool = True) -> dict:
    payload = {
        "id": submission.id,
        "sprint_program_id": submission.sprint_program_id,
        "student_id": submission.student_id,
        "learning_date": submission.learning_date,
        "total_minutes": submission.total_minutes,
        "subject_breakdown": submission.subject_breakdown or {},
        "memo": submission.memo,
        "status": submission.status,
        "submitted_at": submission.submitted_at,
        "reviewed_at": submission.reviewed_at,
        "reviewed_by": submission.reviewed_by,
        "review_note": submission.review_note,
        "approved_minutes": submission.approved_minutes,
        "created_at": submission.created_at,
        "updated_at": submission.updated_at,
    }
    if include_images:
        payload["images"] = [image_dict(image) for image in submission.images]
    return payload


def proof_enabled(program: models.SprintProgram, proof_type: str) -> bool:
    return bool(program.enable_planner_submission if proof_type == "planner" else program.enable_seat_check)


def proof_deadline_value(program: models.SprintProgram, proof_type: str) -> str | None:
    return program.planner_deadline_time if proof_type == "planner" else program.seat_check_deadline_time


def proof_open_value(program: models.SprintProgram, proof_type: str) -> str | None:
    return program.seat_check_open_time if proof_type == "seat_check" else None


def proof_strike_type(proof_type: str, timing_status: str) -> str:
    return f"{proof_type}_{timing_status}"


def proof_strike_enabled(program: models.SprintProgram, proof_type: str, violation: str) -> bool:
    return bool(getattr(program, f"{proof_type}_strike_on_{violation}", False))


def proof_deadline_at(program: models.SprintProgram, proof_type: str, learning_date: date) -> datetime | None:
    value = proof_deadline_value(program, proof_type)
    if not value:
        return None
    hour, minute = [int(part) for part in value.split(":")]
    deadline_date = learning_date + timedelta(days=1) if hour < 5 else learning_date
    return datetime(deadline_date.year, deadline_date.month, deadline_date.day, hour, minute, tzinfo=SEOUL_TZ)


def proof_open_at(program: models.SprintProgram, proof_type: str, learning_date: date) -> datetime | None:
    value = proof_open_value(program, proof_type)
    if not value:
        return None
    hour, minute = [int(part) for part in value.split(":")]
    open_date = learning_date + timedelta(days=1) if hour < 5 else learning_date
    return datetime(open_date.year, open_date.month, open_date.day, hour, minute, tzinfo=SEOUL_TZ)


def ensure_proof_is_open(program: models.SprintProgram, proof_type: str, learning_date: date, now: datetime | None = None) -> None:
    opens_at = proof_open_at(program, proof_type, learning_date)
    if opens_at is None:
        return
    current = (now or datetime.now(timezone.utc)).astimezone(SEOUL_TZ)
    if current < opens_at:
        raise HTTPException(status_code=400, detail="This proof is not open yet.")


def proof_timing_status(
    program: models.SprintProgram,
    proof_type: str,
    learning_date: date,
    submitted_at: datetime | None,
    now: datetime | None = None,
) -> str:
    if not proof_enabled(program, proof_type):
        return "disabled"
    deadline = proof_deadline_at(program, proof_type, learning_date)
    if deadline is None:
        return "not_due"
    if submitted_at is not None:
        submitted = submitted_at.astimezone(SEOUL_TZ)
        return "on_time" if submitted <= deadline else "late"
    current = (now or datetime.now(timezone.utc)).astimezone(SEOUL_TZ)
    return "missing" if current > deadline else "not_due"


def get_daily_proof_or_404(db: Session, submission_id: int) -> models.SprintDailyProofSubmission:
    submission = db.get(models.SprintDailyProofSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Daily proof submission not found.")
    return submission


def ensure_student_proof_access(submission: models.SprintDailyProofSubmission, student_id: int) -> None:
    if submission.student_id != student_id:
        raise HTTPException(status_code=403, detail="Cannot access another student's proof.")


def validate_daily_proof_program(program: models.SprintProgram, proof_type: str, learning_date: date) -> None:
    if proof_type not in {"planner", "seat_check"}:
        raise HTTPException(status_code=400, detail="Invalid proof_type.")
    if not proof_enabled(program, proof_type):
        raise HTTPException(status_code=400, detail="This proof feature is disabled.")
    if not program.start_date <= learning_date <= program.end_date:
        raise HTTPException(status_code=400, detail="learning_date is outside the SPRINT period.")
    if learning_date > get_study_date():
        raise HTTPException(status_code=400, detail="Future learning dates cannot be submitted.")


def proof_image_dict(image: models.SprintDailyProofImage) -> dict:
    return {
        "id": image.id,
        "submission_id": image.submission_id,
        "original_filename": image.original_filename,
        "mime_type": image.mime_type,
        "size_bytes": image.size_bytes,
        "width": image.width,
        "height": image.height,
        "order_index": image.order_index,
        "created_at": image.created_at,
        "student_url": f"/student/sprint/proofs/images/{image.id}",
        "admin_url": f"/admin/sprint-proof-images/{image.id}",
    }


def proof_attempt_dict(attempt: models.SprintDailyProofAttempt) -> dict:
    return {
        "id": attempt.id,
        "attempt_no": attempt.attempt_no,
        "submitted_at": attempt.submitted_at,
        "timing_status": attempt.timing_status,
        "memo": attempt.memo,
        "review_status": attempt.review_status,
        "reviewed_at": attempt.reviewed_at,
        "review_note": attempt.review_note,
    }


def daily_proof_dict(submission: models.SprintDailyProofSubmission | None, program: models.SprintProgram | None = None) -> dict | None:
    if submission is None:
        return None
    timing = submission.timing_override or submission.timing_status
    return {
        "id": submission.id,
        "sprint_program_id": submission.sprint_program_id,
        "student_id": submission.student_id,
        "learning_date": submission.learning_date,
        "proof_type": submission.proof_type,
        "workflow_status": submission.workflow_status,
        "timing_status": timing,
        "raw_timing_status": submission.timing_status,
        "deadline_time": proof_deadline_value(program, submission.proof_type) if program else None,
        "open_time": proof_open_value(program, submission.proof_type) if program else None,
        "open_at": proof_open_at(program, submission.proof_type, submission.learning_date) if program else None,
        "submitted_at": submission.submitted_at,
        "approved_at": submission.approved_at,
        "rejected_at": submission.rejected_at,
        "reviewed_by": submission.reviewed_by,
        "review_note": submission.review_note,
        "memo": submission.memo,
        "timing_override": submission.timing_override,
        "timing_override_reason": submission.timing_override_reason,
        "images": [proof_image_dict(image) for image in submission.images],
        "attempts": [proof_attempt_dict(attempt) for attempt in submission.attempts],
    }


def daily_proof_storage_key(student_id: int, learning_date: date, proof_type: str, extension: str) -> str:
    return f"sprint-proofs/{student_id}/{learning_date.isoformat()}/{proof_type}/{uuid.uuid4().hex}.{extension}"


def auto_strike_source_ref(program_id: int, student_id: int, learning_date: date, proof_type: str, violation: str) -> str:
    return f"daily-proof:{program_id}:{student_id}:{learning_date.isoformat()}:{proof_type}:{violation}"


def upsert_auto_strike(
    db: Session,
    program: models.SprintProgram,
    learning_date: date,
    proof_type: str,
    violation: Literal["late", "missing"],
    submission_id: int | None = None,
) -> models.SprintStrike | None:
    if not proof_strike_enabled(program, proof_type, violation):
        return None
    strike_type = proof_strike_type(proof_type, violation)
    source_ref = auto_strike_source_ref(program.id, program.student_id, learning_date, proof_type, violation)
    strike = db.query(models.SprintStrike).filter_by(source_ref=source_ref).first()
    reason = f"{proof_type} {violation}"
    if strike:
        if strike.is_cancelled and violation == "late":
            strike.is_cancelled = False
            strike.cancelled_reason = None
            strike.cancelled_at = None
        return strike
    strike = models.SprintStrike(
        sprint_program_id=program.id,
        student_id=program.student_id,
        strike_type=strike_type,
        reason=reason,
        learning_date=learning_date,
        related_entity_type="sprint_daily_proof",
        related_entity_id=submission_id,
        source_type="auto_daily_proof",
        source_ref=source_ref,
    )
    db.add(strike)
    return strike


def cancel_auto_late_strike(db: Session, program: models.SprintProgram, submission: models.SprintDailyProofSubmission, reason: str) -> None:
    source_ref = auto_strike_source_ref(program.id, submission.student_id, submission.learning_date, submission.proof_type, "late")
    strike = db.query(models.SprintStrike).filter_by(source_ref=source_ref).first()
    if strike and not strike.is_cancelled:
        strike.is_cancelled = True
        strike.cancelled_reason = reason
        strike.cancelled_at = datetime.now(timezone.utc)


def approved_minutes_between(db: Session, program_id: int, start: date, end: date) -> int:
    return db.query(func.coalesce(func.sum(models.SprintStudySubmission.approved_minutes), 0)).filter(
        models.SprintStudySubmission.sprint_program_id == program_id,
        models.SprintStudySubmission.status == "approved",
        models.SprintStudySubmission.learning_date >= start,
        models.SprintStudySubmission.learning_date <= end,
    ).scalar() or 0


def sprint_study_stats(db: Session, program: models.SprintProgram, today: date) -> dict:
    end = min(today, program.end_date)
    if end < program.start_date:
        end = program.start_date - timedelta(days=1)
    week_start = today - timedelta(days=today.weekday())
    week_start = max(week_start, program.start_date)
    week_end = min(today, program.end_date)
    approved_rows = db.query(models.SprintStudySubmission).filter(
        models.SprintStudySubmission.sprint_program_id == program.id,
        models.SprintStudySubmission.learning_date >= program.start_date,
        models.SprintStudySubmission.learning_date <= end,
        models.SprintStudySubmission.status == "approved",
    ).all()
    approved_by_date = {row.learning_date: row for row in approved_rows}
    submissions = db.query(models.SprintStudySubmission).filter(
        models.SprintStudySubmission.sprint_program_id == program.id,
        models.SprintStudySubmission.learning_date >= program.start_date,
        models.SprintStudySubmission.learning_date <= end,
    ).all()
    status_by_date = {row.learning_date: row.status for row in submissions}
    goal = program.daily_study_goal_minutes
    cursor = program.start_date
    achieved_days = 0
    missing_days = 0
    pending_days = 0
    rejected_days = 0
    daily = []
    while cursor <= end:
        row = approved_by_date.get(cursor)
        approved = row.approved_minutes if row else 0
        status = status_by_date.get(cursor)
        achieved = bool(goal and approved >= goal)
        if achieved:
            achieved_days += 1
        if status == "pending":
            pending_days += 1
        if status == "rejected":
            rejected_days += 1
        if status is None:
            missing_days += 1
        daily.append({
            "learning_date": cursor,
            "submission_status": status or "missing",
            "approved_minutes": approved,
            "daily_goal_minutes": goal,
            "goal_achieved": achieved,
            "is_missing": status is None,
            "is_pending": status == "pending",
            "is_rejected": status == "rejected",
        })
        cursor += timedelta(days=1)
    sprint_total = sum(row.approved_minutes or 0 for row in approved_rows)
    today_total = approved_by_date.get(today).approved_minutes if approved_by_date.get(today) else 0
    week_total = approved_minutes_between(db, program.id, week_start, week_end) if week_start <= week_end else 0
    return {
        "today_approved_minutes": today_total,
        "week_approved_minutes": week_total,
        "sprint_approved_minutes": sprint_total,
        "daily_goal_minutes": goal,
        "goal_achieved_days": achieved_days,
        "goal_missed_days": missing_days,
        "pending_days": pending_days,
        "rejected_days": rejected_days,
        "achievement_rate": round(achieved_days * 100 / len(daily), 1) if daily and goal else None,
        "daily": daily,
    }


def sprint_today_study_submission(db: Session, program: models.SprintProgram, today: date) -> dict | None:
    submission = db.query(models.SprintStudySubmission).filter_by(
        sprint_program_id=program.id,
        student_id=program.student_id,
        learning_date=today,
    ).first()
    return study_submission_dict(submission, include_images=False) if submission else None


def daily_proof_summary(db: Session, program: models.SprintProgram, proof_type: str, today: date) -> dict:
    enabled = proof_enabled(program, proof_type)
    planner_mode = program.planner_mode if proof_type == "planner" else None
    deadline = proof_deadline_value(program, proof_type)
    submission = db.query(models.SprintDailyProofSubmission).filter_by(
        sprint_program_id=program.id,
        student_id=program.student_id,
        learning_date=today,
        proof_type=proof_type,
    ).first()
    timing = "disabled"
    if enabled:
        timing = (submission.timing_override or submission.timing_status) if submission else proof_timing_status(program, proof_type, today, None)
    return {
        "proof_type": proof_type,
        "enabled": enabled,
        "available": enabled,
        "planner_mode": planner_mode,
        "deadline_time": deadline,
        "open_time": proof_open_value(program, proof_type),
        "open_at": proof_open_at(program, proof_type, today),
        "workflow_status": submission.workflow_status if submission else None,
        "timing_status": timing,
        "submitted_at": submission.submitted_at if submission else None,
        "review_note": submission.review_note if submission else None,
        "path": "/student/sprint/planner" if proof_type == "planner" else "/student/sprint/seat-check",
    }


def sprint_weekly_summary(db: Session, program: models.SprintProgram, today: date) -> dict:
    week_start = max(today - timedelta(days=today.weekday()), program.start_date)
    week_end = min(today, program.end_date)
    if week_start > week_end:
        return {
            "week_start": week_start,
            "week_end": week_end,
            "study_minutes": 0,
            "study_goal_achieved_days": 0,
            "seat_check_submitted_days": None,
            "planner_submitted_days": None,
            "vocabulary_average_score": None,
        }
    study_minutes = approved_minutes_between(db, program.id, week_start, week_end)
    goal = program.daily_study_goal_minutes
    approved_rows = db.query(models.SprintStudySubmission).filter(
        models.SprintStudySubmission.sprint_program_id == program.id,
        models.SprintStudySubmission.status == "approved",
        models.SprintStudySubmission.learning_date >= week_start,
        models.SprintStudySubmission.learning_date <= week_end,
    ).all()
    achieved_days = sum(1 for row in approved_rows if goal and (row.approved_minutes or 0) >= goal)

    def proof_count(proof_type: str) -> int | None:
        if not proof_enabled(program, proof_type):
            return None
        return db.query(models.SprintDailyProofSubmission).filter(
            models.SprintDailyProofSubmission.sprint_program_id == program.id,
            models.SprintDailyProofSubmission.student_id == program.student_id,
            models.SprintDailyProofSubmission.proof_type == proof_type,
            models.SprintDailyProofSubmission.learning_date >= week_start,
            models.SprintDailyProofSubmission.learning_date <= week_end,
            models.SprintDailyProofSubmission.workflow_status.in_(["pending", "approved"]),
        ).count()

    submitted_scores = [
        row.score for row in db.query(models.VocabularyTestSession).filter(
            models.VocabularyTestSession.student_id == program.student_id,
            models.VocabularyTestSession.study_date >= week_start,
            models.VocabularyTestSession.study_date <= week_end,
            models.VocabularyTestSession.session_type == "main",
            models.VocabularyTestSession.status == "submitted",
            models.VocabularyTestSession.score.isnot(None),
        ).all()
    ]
    return {
        "week_start": week_start,
        "week_end": week_end,
        "study_minutes": study_minutes,
        "study_goal_achieved_days": achieved_days,
        "seat_check_submitted_days": proof_count("seat_check"),
        "planner_submitted_days": proof_count("planner"),
        "vocabulary_average_score": round(sum(submitted_scores) / len(submitted_scores)) if submitted_scores else None,
    }


def mock_exam_home_summary_safe(db: Session, program: models.SprintProgram, student_id: int) -> dict:
    """mock_exam.py는 sprint.py를 import하지 않으므로 순환참조 없이 지역 import로 재사용한다."""
    import mock_exam
    return mock_exam.mock_exam_home_summary(db, program, student_id)


def subject_goal_home_summary_safe(db: Session, program: models.SprintProgram) -> dict:
    """sprint_goals.py는 sprint.py를 import하지 않으므로 순환참조 없이 지역 import로 재사용한다."""
    import sprint_goals
    return sprint_goals.subject_goal_home_summary(db, program)


def vocabulary_home_summary(db: Session, student_id: int, today: date) -> dict:
    import vocabulary

    challenge = db.query(models.VocabularyChallenge).filter(
        models.VocabularyChallenge.student_id == student_id,
        models.VocabularyChallenge.is_active.is_(True),
        models.VocabularyChallenge.start_date <= today,
        models.VocabularyChallenge.end_date >= today,
    ).first()
    if challenge is None:
        return {"available": False, "status": "none", "path": "/student/vocabulary"}

    session = db.query(models.VocabularyTestSession).filter_by(
        challenge_id=challenge.id,
        student_id=student_id,
        study_date=today,
        session_type="main",
    ).first()
    latest = db.query(models.VocabularyTestSession).filter(
        models.VocabularyTestSession.challenge_id == challenge.id,
        models.VocabularyTestSession.student_id == student_id,
        models.VocabularyTestSession.session_type == "main",
        models.VocabularyTestSession.status == "submitted",
    ).order_by(models.VocabularyTestSession.study_date.desc(), models.VocabularyTestSession.id.desc()).first()

    day_no = (today - challenge.start_date).days + 1
    question_count = session.total_count if session else None
    if question_count is None and challenge.source_type == "word_bank" and challenge.word_bank_id:
        question_count = vocabulary.vocabulary_day_info(db, challenge, today)["question_count"]
    if question_count is None and challenge.source_type == "direct":
        question_count = db.query(models.VocabularyDailyAssignment.id).filter_by(
            challenge_id=challenge.id,
            assignment_date=today,
        ).count()

    day_info = vocabulary.vocabulary_day_info(db, challenge, today)
    return {
        "available": True,
        "status": session.status if session else "not_started",
        "challenge_id": challenge.id,
        "challenge_name": challenge.name,
        "day_number": day_no,
        "learning_day": day_info.get("learning_day"),
        "new_bank_day_label": day_info.get("new_bank_day_label"),
        "cumulative_bank_day_label": day_info.get("cumulative_bank_day_label"),
        "cumulative_pool_count": day_info.get("cumulative_pool_count"),
        "question_count": question_count,
        "session_id": session.id if session else None,
        "latest_score": latest.score if latest else None,
        "path": "/student/sprint/vocabulary",
    }


def ensure_no_active_overlap(
    db: Session,
    student_id: int,
    start_date: date,
    end_date: date,
    is_active: bool,
    exclude_id: int | None = None,
) -> None:
    """활성 SPRINT 기간이 겹치면 400. is_active가 False면 검사하지 않는다."""
    if not is_active:
        return
    query = db.query(models.SprintProgram).filter(
        models.SprintProgram.student_id == student_id,
        models.SprintProgram.is_active.is_(True),
        models.SprintProgram.start_date <= end_date,
        models.SprintProgram.end_date >= start_date,
    )
    if exclude_id is not None:
        query = query.filter(models.SprintProgram.id != exclude_id)
    if query.first():
        raise HTTPException(
            status_code=400,
            detail="해당 학생에게 기간이 겹치는 활성 SPRINT가 있습니다.",
        )


def compute_status(program: models.SprintProgram, today: date) -> str:
    """날짜 기준 상태 (is_active 플래그와는 별개)."""
    if today < program.start_date:
        return "scheduled"
    if today > program.end_date:
        return "completed"
    return "active"


def compute_day_info(program: models.SprintProgram, today: date) -> dict:
    total_days = (program.end_date - program.start_date).days + 1
    status = compute_status(program, today)
    if status == "scheduled":
        day_number = 0
        days_remaining = (program.start_date - today).days
        days_elapsed = 0
    elif status == "completed":
        day_number = total_days
        days_remaining = 0
        days_elapsed = total_days
    else:
        day_number = (today - program.start_date).days + 1
        days_elapsed = day_number
        days_remaining = (program.end_date - today).days
    return {
        "status": status,
        "total_days": total_days,
        "day_number": day_number,
        "days_elapsed": days_elapsed,
        "days_remaining": days_remaining,
    }


def goal_progress(goal: models.SprintGoal) -> float | None:
    """단일 목표 진행률(0~100, 화면 표시용 상한 100). 계산 불가면 None."""
    if goal.target_value and goal.target_value > 0:
        return min(100.0, round(goal.current_value * 100 / goal.target_value, 1))
    # 정성 목표: 완료 여부만
    return 100.0 if goal.is_completed else 0.0


def overall_goal_progress(goals: list[models.SprintGoal]) -> float | None:
    values = [goal_progress(goal) for goal in goals]
    values = [value for value in values if value is not None]
    if not values:
        return None
    return round(sum(values) / len(values), 1)


def active_strike_count(db: Session, program_id: int) -> int:
    return (
        db.query(models.SprintStrike)
        .filter(
            models.SprintStrike.sprint_program_id == program_id,
            models.SprintStrike.is_cancelled.is_(False),
        )
        .count()
    )


def approved_penalty_count(db: Session, program_id: int) -> int:
    return (
        db.query(models.SprintPenaltyAssignment)
        .filter(
            models.SprintPenaltyAssignment.sprint_program_id == program_id,
            models.SprintPenaltyAssignment.status == "approved",
        )
        .count()
    )


def strike_summary(db: Session, program: models.SprintProgram) -> dict:
    """유효 스트라이크 = 취소되지 않은 스트라이크 - (승인된 깜지 수 * 기준). 초기화 방식 금지."""
    total_active = active_strike_count(db, program.id)
    approved = approved_penalty_count(db, program.id)
    consumed = approved * program.strike_threshold
    effective = max(0, total_active - consumed)
    latest = (
        db.query(models.SprintStrike)
        .filter(
            models.SprintStrike.sprint_program_id == program.id,
            models.SprintStrike.is_cancelled.is_(False),
        )
        .order_by(models.SprintStrike.created_at.desc())
        .first()
    )
    return {
        "threshold": program.strike_threshold,
        "total_active": total_active,
        "consumed_by_penalties": consumed,
        "effective": effective,
        "latest_reason": latest.reason if latest else None,
        "latest_strike_type": latest.strike_type if latest else None,
        "latest_learning_date": latest.learning_date if latest else None,
    }


def penalty_summary(db: Session, program_id: int) -> dict:
    rows = (
        db.query(models.SprintPenaltyAssignment)
        .filter(models.SprintPenaltyAssignment.sprint_program_id == program_id)
        .all()
    )
    by_status: dict[str, int] = {}
    for row in rows:
        by_status[row.status] = by_status.get(row.status, 0) + 1
    in_progress = by_status.get("assigned", 0) + by_status.get("submitted", 0)
    return {
        "total": len(rows),
        "in_progress": in_progress,
        "approved": by_status.get("approved", 0),
        "by_status": by_status,
        # 1차: 제출/승인 UI 미구현
        "submission_enabled": False,
    }


def program_dict(db: Session, program: models.SprintProgram, today: date, include_detail: bool = False) -> dict:
    student = db.get(models.Student, program.student_id)
    goals = list(program.goals) if include_detail else []
    day_info = compute_day_info(program, today)
    payload = {
        "id": program.id,
        "student_id": program.student_id,
        "student_name": student.name if student else "",
        "title": program.title,
        "description": program.description,
        "start_date": program.start_date,
        "end_date": program.end_date,
        "is_active": program.is_active,
        "daily_study_goal_minutes": program.daily_study_goal_minutes,
        "planner_deadline_time": program.planner_deadline_time,
        "seat_check_deadline_time": program.seat_check_deadline_time,
        "seat_check_open_time": program.seat_check_open_time,
        "planner_mode": program.planner_mode,
        "study_time_deadline_time": program.study_time_deadline_time,
        "study_time_strike_on_missing": program.study_time_strike_on_missing,
        "study_time_strike_on_shortage": program.study_time_strike_on_shortage,
        "mock_exam_weekday": program.mock_exam_weekday,
        "mock_exam_start_time": program.mock_exam_start_time,
        "mock_exam_submission_deadline_time": program.mock_exam_submission_deadline_time,
        "first_mock_exam_date": program.first_mock_exam_date,
        "vocabulary_bank_id": program.vocabulary_bank_id,
        "vocabulary_start_bank_day": program.vocabulary_start_bank_day,
        "vocabulary_bank_day_direction": program.vocabulary_bank_day_direction,
        "vocabulary_bank_days_per_learning_day": program.vocabulary_bank_days_per_learning_day,
        "vocabulary_max_question_count": program.vocabulary_max_question_count,
        "vocabulary_allow_student_answer_pdf": program.vocabulary_allow_student_answer_pdf,
        "planner_strike_on_late": program.planner_strike_on_late,
        "planner_strike_on_missing": program.planner_strike_on_missing,
        "seat_check_strike_on_late": program.seat_check_strike_on_late,
        "seat_check_strike_on_missing": program.seat_check_strike_on_missing,
        "daily_auto_strike_limit": program.daily_auto_strike_limit,
        "strike_threshold": program.strike_threshold,
        "penalty_word_count": program.penalty_word_count,
        "penalty_repetition_count": program.penalty_repetition_count,
        "penalty_due_hours": program.penalty_due_hours,
        "features": {flag: getattr(program, flag) for flag in FEATURE_FLAGS},
        "status": day_info["status"],
        "day_info": day_info,
        "strike_summary": strike_summary(db, program),
        "created_at": program.created_at,
        "updated_at": program.updated_at,
    }
    if include_detail:
        payload["goals"] = [goal_dict(goal) for goal in goals]
        payload["overall_goal_progress"] = overall_goal_progress(goals)
    else:
        payload["overall_goal_progress"] = overall_goal_progress(list(program.goals))
    return payload


def goal_dict(goal: models.SprintGoal) -> dict:
    return {
        "id": goal.id,
        "sprint_program_id": goal.sprint_program_id,
        "title": goal.title,
        "description": goal.description,
        "target_value": goal.target_value,
        "current_value": goal.current_value,
        "unit": goal.unit,
        "order_index": goal.order_index,
        "is_completed": goal.is_completed,
        "progress": goal_progress(goal),
    }


def strike_dict(strike: models.SprintStrike) -> dict:
    return {
        "id": strike.id,
        "sprint_program_id": strike.sprint_program_id,
        "student_id": strike.student_id,
        "strike_type": strike.strike_type,
        "reason": strike.reason,
        "learning_date": strike.learning_date,
        "related_entity_type": strike.related_entity_type,
        "related_entity_id": strike.related_entity_id,
        "created_by_admin_id": strike.created_by_admin_id,
        "is_cancelled": strike.is_cancelled,
        "cancelled_reason": strike.cancelled_reason,
        "created_at": strike.created_at,
        "cancelled_at": strike.cancelled_at,
    }


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@router.get("/admin/sprints")
def admin_list_sprints(
    status: Literal["all", "scheduled", "active", "completed"] = Query(default="all"),
    db: Session = Depends(get_db),
):
    today = get_study_date()
    programs = (
        db.query(models.SprintProgram)
        .order_by(models.SprintProgram.start_date.desc(), models.SprintProgram.id.desc())
        .all()
    )
    result = [program_dict(db, program, today) for program in programs]
    if status != "all":
        result = [item for item in result if item["status"] == status]
    return result


@router.post("/admin/sprints", status_code=201)
def admin_create_sprint(payload: SprintProgramIn, db: Session = Depends(get_db)):
    get_student_or_404(db, payload.student_id)
    ensure_no_active_overlap(
        db, payload.student_id, payload.start_date, payload.end_date, payload.is_active
    )
    values = normalize_program_values(payload.model_dump())
    program = models.SprintProgram(**values)
    db.add(program)
    db.flush()
    sync_vocabulary_challenge_from_program(db, program)
    db.commit()
    db.refresh(program)
    return program_dict(db, program, get_study_date(), include_detail=True)


@router.get("/admin/sprints/{program_id}")
def admin_get_sprint(program_id: int, db: Session = Depends(get_db)):
    program = get_program_or_404(db, program_id)
    return program_dict(db, program, get_study_date(), include_detail=True)


@router.patch("/admin/sprints/{program_id}")
def admin_update_sprint(program_id: int, payload: SprintProgramUpdate, db: Session = Depends(get_db)):
    program = get_program_or_404(db, program_id)
    values = normalize_program_values(payload.model_dump(exclude_unset=True))
    start_date = values.get("start_date", program.start_date)
    end_date = values.get("end_date", program.end_date)
    is_active = values.get("is_active", program.is_active)
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="종료일은 시작일보다 빠를 수 없습니다.")
    ensure_no_active_overlap(
        db, program.student_id, start_date, end_date, is_active, exclude_id=program.id
    )
    for key, value in values.items():
        setattr(program, key, value)
    sync_vocabulary_challenge_from_program(db, program)
    db.commit()
    db.refresh(program)
    return program_dict(db, program, get_study_date(), include_detail=True)


# --- Goals ---


@router.post("/admin/sprints/{program_id}/goals", status_code=201)
def admin_create_goal(program_id: int, payload: SprintGoalIn, db: Session = Depends(get_db)):
    get_program_or_404(db, program_id)
    goal = models.SprintGoal(sprint_program_id=program_id, **payload.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal_dict(goal)


@router.patch("/admin/sprint-goals/{goal_id}")
def admin_update_goal(goal_id: int, payload: SprintGoalUpdate, db: Session = Depends(get_db)):
    goal = db.get(models.SprintGoal, goal_id)
    if goal is None:
        raise HTTPException(status_code=404, detail="목표를 찾을 수 없습니다.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(goal, key, value)
    db.commit()
    db.refresh(goal)
    return goal_dict(goal)


@router.delete("/admin/sprint-goals/{goal_id}")
def admin_delete_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.get(models.SprintGoal, goal_id)
    if goal is None:
        raise HTTPException(status_code=404, detail="목표를 찾을 수 없습니다.")
    db.delete(goal)
    db.commit()
    return {"deleted": True}


# --- Strikes ---


@router.get("/admin/sprints/{program_id}/strikes")
def admin_list_strikes(program_id: int, db: Session = Depends(get_db)):
    program = get_program_or_404(db, program_id)
    strikes = (
        db.query(models.SprintStrike)
        .filter(models.SprintStrike.sprint_program_id == program_id)
        .order_by(models.SprintStrike.created_at.desc())
        .all()
    )
    return {
        "summary": strike_summary(db, program),
        "strikes": [strike_dict(strike) for strike in strikes],
    }


@router.post("/admin/sprints/{program_id}/strikes", status_code=201)
def admin_add_strike(program_id: int, payload: SprintStrikeIn, db: Session = Depends(get_db)):
    program = get_program_or_404(db, program_id)
    strike = models.SprintStrike(
        sprint_program_id=program_id,
        student_id=program.student_id,
        strike_type=payload.strike_type,
        reason=payload.reason,
        learning_date=payload.learning_date or get_study_date(),
        related_entity_type=payload.related_entity_type,
        related_entity_id=payload.related_entity_id,
        created_by_admin_id=payload.created_by_admin_id,
    )
    db.add(strike)
    db.commit()
    db.refresh(strike)
    return strike_dict(strike)


@router.post("/admin/sprint-strikes/{strike_id}/cancel")
def admin_cancel_strike(strike_id: int, payload: SprintStrikeCancelIn, db: Session = Depends(get_db)):
    strike = db.get(models.SprintStrike, strike_id)
    if strike is None:
        raise HTTPException(status_code=404, detail="스트라이크를 찾을 수 없습니다.")
    if strike.is_cancelled:
        raise HTTPException(status_code=400, detail="이미 취소된 스트라이크입니다.")
    strike.is_cancelled = True
    strike.cancelled_reason = payload.cancelled_reason
    strike.cancelled_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(strike)
    return strike_dict(strike)


# ---------------------------------------------------------------------------
# Student endpoints (본인 데이터만 접근)
# ---------------------------------------------------------------------------


def feature_cards(program: models.SprintProgram, student_id: int) -> list[dict]:
    """활성화된 기능만 카드로 반환. 미구현 기능은 status='coming_soon'."""
    definitions = [
        ("enable_seat_check", "착석 인증", "seat_check"),
        ("enable_planner_submission", "플래너 제출", "planner"),
        ("enable_study_timer", "공부시간 기록", "study_timer"),
        ("enable_vocabulary", "영단어 챌린지", "vocabulary"),
        ("enable_mock_exam", "모의고사", "mock_exam"),
        ("enable_goals", "기간 목표", "goals"),
        ("enable_three_strikes", "삼진아웃·깜지", "three_strikes"),
    ]
    cards = []
    for flag, label, key in definitions:
        if not getattr(program, flag):
            continue
        implemented = flag in IMPLEMENTED_FEATURES
        card = {
            "key": key,
            "label": label,
            "status": "available" if implemented else "coming_soon",
            "path": None,
        }
        # 영단어만 실제 학생 경로 연결 (중복 구현 금지)
        if key == "vocabulary":
            card["path"] = f"/student/vocabulary"
        cards.append(card)
    return cards


def student_active_program(db: Session, student_id: int, today: date) -> models.SprintProgram | None:
    return (
        db.query(models.SprintProgram)
        .filter(
            models.SprintProgram.student_id == student_id,
            models.SprintProgram.is_active.is_(True),
            models.SprintProgram.start_date <= today,
            models.SprintProgram.end_date >= today,
        )
        .order_by(models.SprintProgram.start_date.desc())
        .first()
    )


@router.get("/student/sprint/dashboard")
def student_sprint_dashboard(
    student_id: int,
    study_date: date | None = None,
    db: Session = Depends(get_db),
):
    get_student_or_404(db, student_id)
    today = study_date or get_study_date()
    program = student_active_program(db, student_id, today)

    # 예정 / 과거 요약 (현재 활성 프로그램 유무와 무관하게 함께 제공)
    upcoming = (
        db.query(models.SprintProgram)
        .filter(
            models.SprintProgram.student_id == student_id,
            models.SprintProgram.is_active.is_(True),
            models.SprintProgram.start_date > today,
        )
        .order_by(models.SprintProgram.start_date.asc())
        .first()
    )
    past_count = (
        db.query(models.SprintProgram)
        .filter(
            models.SprintProgram.student_id == student_id,
            models.SprintProgram.end_date < today,
        )
        .count()
    )
    any_count = (
        db.query(models.SprintProgram)
        .filter(models.SprintProgram.student_id == student_id)
        .count()
    )

    if program is None:
        # 빈 상태 구분: 예정 있음 / 과거만 있음 / 아예 없음
        if upcoming is not None:
            empty_state = "upcoming_only"
        elif past_count > 0:
            empty_state = "past_only"
        else:
            empty_state = "none"
        return {
            "today": today,
            "program": None,
            "empty_state": empty_state,
            "upcoming": program_dict(db, upcoming, today) if upcoming else None,
            "past_count": past_count,
            "total_count": any_count,
        }

    goals = list(program.goals)
    return {
        "today": today,
        "program": program_dict(db, program, today, include_detail=True),
        "empty_state": None,
        "feature_cards": feature_cards(program, student_id),
        "goals": [goal_dict(goal) for goal in goals],
        "overall_goal_progress": overall_goal_progress(goals),
        "strike_summary": strike_summary(db, program),
        "penalty_summary": penalty_summary(db, program.id),
        "study_time_stats": sprint_study_stats(db, program, today),
        "study_time_submission": sprint_today_study_submission(db, program, today),
        "proof_summaries": {
            "seat_check": daily_proof_summary(db, program, "seat_check", today),
            "planner": daily_proof_summary(db, program, "planner", today),
        },
        "vocabulary_summary": vocabulary_home_summary(db, student_id, today),
        "progress_summary": subject_goal_home_summary_safe(db, program),
        "mock_exam_summary": mock_exam_home_summary_safe(db, program, student_id),
        "weekly_summary": sprint_weekly_summary(db, program, today),
        "upcoming": program_dict(db, upcoming, today) if upcoming else None,
        "past_count": past_count,
        "total_count": any_count,
    }


@router.get("/student/sprint/history")
def student_sprint_history(student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    today = get_study_date()
    programs = (
        db.query(models.SprintProgram)
        .filter(models.SprintProgram.student_id == student_id)
        .order_by(models.SprintProgram.start_date.desc())
        .all()
    )
    return [program_dict(db, program, today) for program in programs]


# The original feature card labels above may contain legacy mojibake; this
# later definition is the one used at request time.
def feature_cards(program: models.SprintProgram, student_id: int) -> list[dict]:
    definitions = [
        ("enable_seat_check", "착석 인증", "seat_check"),
        ("enable_planner_submission", "플래너 제출", "planner"),
        ("enable_study_timer", "공부시간 타이머", "study_timer"),
        ("enable_study_time_submission", "공부시간 인증", "study_time_submission"),
        ("enable_vocabulary", "영단어 챌린지", "vocabulary"),
        ("enable_mock_exam", "모의고사", "mock_exam"),
        ("enable_goals", "기간 목표", "goals"),
        ("enable_three_strikes", "삼진아웃", "three_strikes"),
    ]
    paths = {
        "seat_check": "/student/sprint/seat-check",
        "planner": "/student/sprint/planner",
        "study_time_submission": "/student/sprint/study-time",
        "vocabulary": "/student/vocabulary",
        "mock_exam": "/student/sprint/mock-exams",
    }
    return [
        {
            "key": key,
            "label": label,
            "status": "available" if flag in IMPLEMENTED_FEATURES else "coming_soon",
            "path": paths.get(key),
        }
        for flag, label, key in definitions
        if getattr(program, flag)
    ]


def submission_detail_response(db: Session, program: models.SprintProgram, submission: models.SprintStudySubmission | None, learning_date: date) -> dict:
    return {
        "today": get_study_date(),
        "program": program_dict(db, program, learning_date),
        "learning_date": learning_date,
        "daily_goal_minutes": program.daily_study_goal_minutes,
        "submission": study_submission_dict(submission) if submission else None,
        "stats": sprint_study_stats(db, program, get_study_date()),
    }


@router.get("/student/sprint/study-time/current")
def student_study_time_current(
    student_id: int,
    learning_date: date | None = None,
    db: Session = Depends(get_db),
):
    get_student_or_404(db, student_id)
    target_date = learning_date or get_study_date()
    program = active_study_program_for_date(db, student_id, target_date)
    if program is None:
        raise HTTPException(status_code=404, detail="No active SPRINT for this date.")
    validate_study_submission_program(program, target_date)
    submission = db.query(models.SprintStudySubmission).filter_by(
        sprint_program_id=program.id,
        student_id=student_id,
        learning_date=target_date,
    ).first()
    return submission_detail_response(db, program, submission, target_date)


@router.post("/student/sprint/study-time/drafts", status_code=201)
def student_save_study_time_draft(payload: StudySubmissionDraftIn, db: Session = Depends(get_db)):
    get_student_or_404(db, payload.student_id)
    program = active_study_program_for_date(db, payload.student_id, payload.learning_date)
    if program is None:
        raise HTTPException(status_code=404, detail="No active SPRINT for this date.")
    validate_study_submission_program(program, payload.learning_date)
    submission = db.query(models.SprintStudySubmission).filter_by(
        sprint_program_id=program.id,
        student_id=payload.student_id,
        learning_date=payload.learning_date,
    ).first()
    if submission and submission.status == "approved":
        raise HTTPException(status_code=400, detail="Approved submissions cannot be edited by students.")
    if submission and submission.status == "pending":
        raise HTTPException(status_code=400, detail="Pending submissions must be cancelled before editing.")
    if submission is None:
        submission = models.SprintStudySubmission(
            sprint_program_id=program.id,
            student_id=payload.student_id,
            learning_date=payload.learning_date,
            total_minutes=payload.total_minutes,
            subject_breakdown=payload.subject_breakdown or {},
            memo=payload.memo,
            status="draft",
        )
        db.add(submission)
    else:
        submission.total_minutes = payload.total_minutes
        submission.subject_breakdown = payload.subject_breakdown or {}
        submission.memo = payload.memo
        submission.status = "draft"
        submission.submitted_at = None
        submission.reviewed_at = None
        submission.approved_minutes = None
    db.commit()
    db.refresh(submission)
    return submission_detail_response(db, program, submission, payload.learning_date)


@router.post("/student/sprint/study-time/{submission_id}/images", status_code=201)
async def student_upload_study_time_image(
    submission_id: int,
    student_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    submission = get_submission_or_404(db, submission_id)
    ensure_student_submission_access(submission, student_id)
    if submission.status not in {"draft", "rejected", "cancelled"}:
        raise HTTPException(status_code=400, detail="Images can only be changed before submission.")
    if len(submission.images) >= MAX_STUDY_IMAGE_COUNT:
        raise HTTPException(status_code=400, detail=f"Up to {MAX_STUDY_IMAGE_COUNT} images are allowed.")
    data = await file.read(MAX_STUDY_IMAGE_BYTES + 1)
    if len(data) > MAX_STUDY_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large.")
    extension, mime_type, width, height = detect_image(data)
    storage_key = safe_storage_key(submission.student_id, submission.learning_date, extension)
    path = storage_file_path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    image = models.SprintStudySubmissionImage(
        submission_id=submission.id,
        storage_key=storage_key,
        original_filename=os.path.basename(file.filename or ""),
        mime_type=mime_type,
        size_bytes=len(data),
        width=width,
        height=height,
        order_index=len(submission.images) + 1,
    )
    submission.status = "draft"
    db.add(image)
    try:
        db.commit()
    except Exception:
        db.rollback()
        delete_storage_file(storage_key)
        raise
    db.refresh(image)
    return image_dict(image)


@router.delete("/student/sprint/study-time/images/{image_id}")
def student_delete_study_time_image(image_id: int, student_id: int, db: Session = Depends(get_db)):
    image = db.get(models.SprintStudySubmissionImage, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    submission = get_submission_or_404(db, image.submission_id)
    ensure_student_submission_access(submission, student_id)
    if submission.status not in {"draft", "rejected", "cancelled"}:
        raise HTTPException(status_code=400, detail="Images can only be deleted before submission.")
    storage_key = image.storage_key
    db.delete(image)
    db.commit()
    delete_storage_file(storage_key)
    return {"deleted": True}


@router.post("/student/sprint/study-time/{submission_id}/submit")
def student_submit_study_time(submission_id: int, payload: StudySubmissionActionIn, db: Session = Depends(get_db)):
    submission = get_submission_or_404(db, submission_id)
    ensure_student_submission_access(submission, payload.student_id)
    program = get_program_or_404(db, submission.sprint_program_id)
    validate_study_submission_program(program, submission.learning_date)
    if submission.status == "approved":
        raise HTTPException(status_code=400, detail="Approved submissions cannot be resubmitted.")
    if submission.status == "pending":
        raise HTTPException(status_code=400, detail="This submission is already pending review.")
    if not submission.images:
        raise HTTPException(status_code=400, detail="At least one verification image is required.")
    submission.status = "pending"
    submission.submitted_at = datetime.now(timezone.utc)
    submission.reviewed_at = None
    submission.approved_minutes = None
    db.commit()
    db.refresh(submission)
    return study_submission_dict(submission)


@router.post("/student/sprint/study-time/{submission_id}/cancel")
def student_cancel_study_time(submission_id: int, payload: StudySubmissionActionIn, db: Session = Depends(get_db)):
    submission = get_submission_or_404(db, submission_id)
    ensure_student_submission_access(submission, payload.student_id)
    if submission.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending submissions can be cancelled by students.")
    submission.status = "cancelled"
    db.commit()
    db.refresh(submission)
    return study_submission_dict(submission)


@router.get("/student/sprint/study-time/images/{image_id}")
def student_get_study_time_image(image_id: int, student_id: int, db: Session = Depends(get_db)):
    image = db.get(models.SprintStudySubmissionImage, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    submission = get_submission_or_404(db, image.submission_id)
    ensure_student_submission_access(submission, student_id)
    path = storage_file_path(image.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=image.mime_type, filename=image.original_filename or path.name)


@router.get("/admin/sprints/{program_id}/study-submissions")
def admin_list_study_submissions(
    program_id: int,
    status: Literal["all", "draft", "pending", "approved", "rejected", "cancelled"] = Query(default="all"),
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    program = get_program_or_404(db, program_id)
    query = db.query(models.SprintStudySubmission).filter_by(sprint_program_id=program_id)
    if status != "all":
        query = query.filter(models.SprintStudySubmission.status == status)
    if start_date:
        query = query.filter(models.SprintStudySubmission.learning_date >= start_date)
    if end_date:
        query = query.filter(models.SprintStudySubmission.learning_date <= end_date)
    submissions = query.order_by(models.SprintStudySubmission.learning_date.desc()).all()
    return {
        "program": program_dict(db, program, get_study_date()),
        "stats": sprint_study_stats(db, program, get_study_date()),
        "submissions": [study_submission_dict(row) for row in submissions],
    }


@router.get("/admin/sprint-study-submissions/{submission_id}")
def admin_get_study_submission(submission_id: int, db: Session = Depends(get_db)):
    return study_submission_dict(get_submission_or_404(db, submission_id))


@router.post("/admin/sprint-study-submissions/{submission_id}/approve")
def admin_approve_study_submission(
    submission_id: int,
    payload: StudySubmissionReviewIn,
    db: Session = Depends(get_db),
):
    submission = get_submission_or_404(db, submission_id)
    if submission.status == "cancelled":
        raise HTTPException(status_code=400, detail="Cancelled submissions cannot be approved.")
    if not submission.images:
        raise HTTPException(status_code=400, detail="Cannot approve a submission without images.")
    approved_minutes = payload.approved_minutes if payload.approved_minutes is not None else submission.total_minutes
    submission.status = "approved"
    submission.approved_minutes = approved_minutes
    submission.review_note = normalized_admin_comment(payload)
    submission.reviewed_by = payload.reviewed_by
    submission.reviewed_at = datetime.now(timezone.utc)
    if submission.submitted_at is None:
        submission.submitted_at = submission.reviewed_at
    db.commit()
    db.refresh(submission)
    return study_submission_dict(submission)


@router.post("/admin/sprint-study-submissions/{submission_id}/reject")
def admin_reject_study_submission(
    submission_id: int,
    payload: StudySubmissionRejectIn,
    db: Session = Depends(get_db),
):
    submission = get_submission_or_404(db, submission_id)
    if submission.status == "approved":
        raise HTTPException(status_code=400, detail="Approved submissions should be cancelled before rejection.")
    submission.status = "rejected"
    submission.approved_minutes = None
    submission.review_note = normalized_admin_comment(payload, required=True)
    submission.reviewed_by = payload.reviewed_by
    submission.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return study_submission_dict(submission)


@router.post("/admin/sprint-study-submissions/{submission_id}/cancel")
def admin_cancel_study_submission(
    submission_id: int,
    payload: StudySubmissionRejectIn,
    db: Session = Depends(get_db),
):
    submission = get_submission_or_404(db, submission_id)
    submission.status = "cancelled"
    submission.approved_minutes = None
    submission.review_note = normalized_admin_comment(payload, required=True)
    submission.reviewed_by = payload.reviewed_by
    submission.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return study_submission_dict(submission)


@router.get("/admin/sprint-study-images/{image_id}")
def admin_get_study_time_image(image_id: int, db: Session = Depends(get_db)):
    image = db.get(models.SprintStudySubmissionImage, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    path = storage_file_path(image.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=image.mime_type, filename=image.original_filename or path.name)


@router.get("/student/sprint/proofs/current")
def student_daily_proof_current(
    student_id: int,
    proof_type: Literal["planner", "seat_check"],
    learning_date: date | None = None,
    db: Session = Depends(get_db),
):
    get_student_or_404(db, student_id)
    target_date = learning_date or get_study_date()
    program = active_study_program_for_date(db, student_id, target_date)
    if program is None:
        raise HTTPException(status_code=404, detail="No active SPRINT for this date.")
    if not program.start_date <= target_date <= program.end_date:
        raise HTTPException(status_code=400, detail="learning_date is outside the SPRINT period.")
    submission = db.query(models.SprintDailyProofSubmission).filter_by(
        sprint_program_id=program.id,
        student_id=student_id,
        learning_date=target_date,
        proof_type=proof_type,
    ).first()
    timing_status = proof_timing_status(program, proof_type, target_date, submission.submitted_at if submission else None)
    if submission and submission.workflow_status in {"draft", "cancelled"}:
        submission.timing_status = timing_status
        db.commit()
    return {
        "program": program_dict(db, program, target_date),
        "learning_date": target_date,
        "proof_type": proof_type,
        "deadline_time": proof_deadline_value(program, proof_type),
        "deadline_at": proof_deadline_at(program, proof_type, target_date),
        "open_time": proof_open_value(program, proof_type),
        "open_at": proof_open_at(program, proof_type, target_date),
        "timing_status": timing_status,
        "submission": daily_proof_dict(submission, program),
    }


@router.post("/student/sprint/proofs/drafts", status_code=201)
def student_save_daily_proof_draft(payload: DailyProofDraftIn, db: Session = Depends(get_db)):
    get_student_or_404(db, payload.student_id)
    program = active_study_program_for_date(db, payload.student_id, payload.learning_date)
    if program is None:
        raise HTTPException(status_code=404, detail="No active SPRINT for this date.")
    validate_daily_proof_program(program, payload.proof_type, payload.learning_date)
    ensure_proof_is_open(program, payload.proof_type, payload.learning_date)
    submission = db.query(models.SprintDailyProofSubmission).filter_by(
        sprint_program_id=program.id,
        student_id=payload.student_id,
        learning_date=payload.learning_date,
        proof_type=payload.proof_type,
    ).first()
    if submission and submission.workflow_status == "approved":
        raise HTTPException(status_code=400, detail="Approved submissions cannot be edited by students.")
    if submission and submission.workflow_status == "pending":
        raise HTTPException(status_code=400, detail="Pending submissions cannot be edited.")
    if submission is None:
        submission = models.SprintDailyProofSubmission(
            sprint_program_id=program.id,
            student_id=payload.student_id,
            learning_date=payload.learning_date,
            proof_type=payload.proof_type,
            workflow_status="draft",
            timing_status=proof_timing_status(program, payload.proof_type, payload.learning_date, None),
            memo=payload.memo,
        )
        db.add(submission)
    else:
        submission.workflow_status = "draft"
        submission.timing_status = proof_timing_status(program, payload.proof_type, payload.learning_date, None)
        submission.memo = payload.memo
        submission.timing_override = None
        submission.timing_override_reason = None
    db.commit()
    db.refresh(submission)
    return daily_proof_dict(submission, program)


@router.post("/student/sprint/proofs/{submission_id}/images", status_code=201)
async def student_upload_daily_proof_image(
    submission_id: int,
    student_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    submission = get_daily_proof_or_404(db, submission_id)
    ensure_student_proof_access(submission, student_id)
    program = get_program_or_404(db, submission.sprint_program_id)
    ensure_proof_is_open(program, submission.proof_type, submission.learning_date)
    if submission.workflow_status not in {"draft", "rejected", "cancelled"}:
        raise HTTPException(status_code=400, detail="Images can only be changed before submission.")
    if len(submission.images) >= MAX_STUDY_IMAGE_COUNT:
        raise HTTPException(status_code=400, detail=f"Up to {MAX_STUDY_IMAGE_COUNT} images are allowed.")
    data = await file.read(MAX_STUDY_IMAGE_BYTES + 1)
    if len(data) > MAX_STUDY_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large.")
    extension, mime_type, width, height = detect_image(data)
    storage_key = daily_proof_storage_key(submission.student_id, submission.learning_date, submission.proof_type, extension)
    path = storage_file_path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    image = models.SprintDailyProofImage(
        submission_id=submission.id,
        storage_key=storage_key,
        original_filename=os.path.basename(file.filename or ""),
        mime_type=mime_type,
        size_bytes=len(data),
        width=width,
        height=height,
        order_index=len(submission.images) + 1,
    )
    db.add(image)
    try:
        db.commit()
    except Exception:
        db.rollback()
        delete_storage_file(storage_key)
        raise
    db.refresh(image)
    return proof_image_dict(image)


@router.delete("/student/sprint/proofs/images/{image_id}")
def student_delete_daily_proof_image(image_id: int, student_id: int, db: Session = Depends(get_db)):
    image = db.get(models.SprintDailyProofImage, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    submission = get_daily_proof_or_404(db, image.submission_id)
    ensure_student_proof_access(submission, student_id)
    if submission.workflow_status not in {"draft", "rejected", "cancelled"}:
        raise HTTPException(status_code=400, detail="Images can only be deleted before submission.")
    storage_key = image.storage_key
    db.delete(image)
    db.commit()
    delete_storage_file(storage_key)
    return {"deleted": True}


@router.post("/student/sprint/proofs/{submission_id}/submit")
def student_submit_daily_proof(submission_id: int, payload: DailyProofActionIn, db: Session = Depends(get_db)):
    submission = get_daily_proof_or_404(db, submission_id)
    ensure_student_proof_access(submission, payload.student_id)
    program = get_program_or_404(db, submission.sprint_program_id)
    validate_daily_proof_program(program, submission.proof_type, submission.learning_date)
    ensure_proof_is_open(program, submission.proof_type, submission.learning_date)
    if submission.workflow_status == "approved":
        raise HTTPException(status_code=400, detail="Approved submissions cannot be resubmitted.")
    if submission.workflow_status == "pending":
        raise HTTPException(status_code=400, detail="This submission is already pending review.")
    if not submission.images:
        raise HTTPException(status_code=400, detail="At least one image is required.")
    submitted_at = datetime.now(timezone.utc)
    timing = proof_timing_status(program, submission.proof_type, submission.learning_date, submitted_at)
    attempt_no = (db.query(func.max(models.SprintDailyProofAttempt.attempt_no)).filter_by(submission_id=submission.id).scalar() or 0) + 1
    db.add(models.SprintDailyProofAttempt(
        submission_id=submission.id,
        attempt_no=attempt_no,
        submitted_at=submitted_at,
        timing_status=timing,
        memo=submission.memo,
        review_status="pending",
    ))
    submission.workflow_status = "pending"
    submission.timing_status = timing
    submission.submitted_at = submitted_at
    submission.approved_at = None
    submission.rejected_at = None
    submission.timing_override = None
    submission.timing_override_reason = None
    db.commit()
    db.refresh(submission)
    return daily_proof_dict(submission, program)


@router.get("/student/sprint/proofs/images/{image_id}")
def student_get_daily_proof_image(image_id: int, student_id: int, db: Session = Depends(get_db)):
    image = db.get(models.SprintDailyProofImage, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    submission = get_daily_proof_or_404(db, image.submission_id)
    ensure_student_proof_access(submission, student_id)
    path = storage_file_path(image.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=image.mime_type, filename=image.original_filename or path.name)


@router.get("/admin/sprints/{program_id}/daily-proofs")
def admin_list_daily_proofs(
    program_id: int,
    proof_type: Literal["all", "planner", "seat_check"] = Query(default="all"),
    workflow_status: Literal["all", "draft", "pending", "approved", "rejected", "cancelled"] = Query(default="all"),
    timing_status: Literal["all", "on_time", "late", "missing", "not_due", "disabled"] = Query(default="all"),
    learning_date: date | None = None,
    db: Session = Depends(get_db),
):
    program = get_program_or_404(db, program_id)
    start = learning_date or program.start_date
    end = learning_date or min(get_study_date(), program.end_date)
    rows = db.query(models.SprintDailyProofSubmission).filter(
        models.SprintDailyProofSubmission.sprint_program_id == program_id,
        models.SprintDailyProofSubmission.learning_date >= start,
        models.SprintDailyProofSubmission.learning_date <= end,
    ).all()
    by_key = {(row.learning_date, row.proof_type): row for row in rows}
    proof_types = ["planner", "seat_check"] if proof_type == "all" else [proof_type]
    items = []
    cursor = start
    while cursor <= end:
        for kind in proof_types:
            if not proof_enabled(program, kind):
                timing = "disabled"
            else:
                row = by_key.get((cursor, kind))
                timing = row.timing_override or row.timing_status if row else proof_timing_status(program, kind, cursor, None)
            row = by_key.get((cursor, kind))
            workflow = row.workflow_status if row else "missing"
            if workflow_status != "all" and workflow != workflow_status:
                continue
            if timing_status != "all" and timing != timing_status:
                continue
            items.append({
                "learning_date": cursor,
                "proof_type": kind,
                "deadline_time": proof_deadline_value(program, kind),
                "open_time": proof_open_value(program, kind),
                "open_at": proof_open_at(program, kind, cursor),
                "workflow_status": workflow,
                "timing_status": timing,
                "submission": daily_proof_dict(row, program) if row else None,
            })
        cursor += timedelta(days=1)
    pending_count = sum(1 for item in items if item["workflow_status"] == "pending")
    missing_count = sum(1 for item in items if item["timing_status"] == "missing")
    return {"program": program_dict(db, program, get_study_date()), "pending_count": pending_count, "missing_count": missing_count, "items": items}


@router.post("/admin/sprint-daily-proofs/{submission_id}/approve")
def admin_approve_daily_proof(submission_id: int, payload: DailyProofReviewIn, db: Session = Depends(get_db)):
    submission = get_daily_proof_or_404(db, submission_id)
    program = get_program_or_404(db, submission.sprint_program_id)
    if not submission.images:
        raise HTTPException(status_code=400, detail="Cannot approve a submission without images.")
    now = datetime.now(timezone.utc)
    final_timing = payload.timing_override or submission.timing_status
    if payload.timing_override and not payload.timing_override_reason:
        raise HTTPException(status_code=400, detail="timing_override_reason is required.")
    submission.workflow_status = "approved"
    submission.timing_override = payload.timing_override
    submission.timing_override_reason = payload.timing_override_reason
    submission.review_note = normalized_admin_comment(payload)
    submission.reviewed_by = payload.reviewed_by
    submission.approved_at = now
    attempt = submission.attempts[-1] if submission.attempts else None
    if attempt:
        attempt.review_status = "approved"
        attempt.reviewed_at = now
        attempt.review_note = normalized_admin_comment(payload)
    if final_timing == "late":
        upsert_auto_strike(db, program, submission.learning_date, submission.proof_type, "late", submission.id)
    elif payload.timing_override == "on_time":
        cancel_auto_late_strike(db, program, submission, payload.timing_override_reason or "timing override on_time")
    db.commit()
    db.refresh(submission)
    return daily_proof_dict(submission, program)


@router.post("/admin/sprint-daily-proofs/{submission_id}/reject")
def admin_reject_daily_proof(submission_id: int, payload: DailyProofRejectIn, db: Session = Depends(get_db)):
    submission = get_daily_proof_or_404(db, submission_id)
    now = datetime.now(timezone.utc)
    submission.workflow_status = "rejected"
    submission.rejected_at = now
    submission.review_note = normalized_admin_comment(payload, required=True)
    submission.reviewed_by = payload.reviewed_by
    attempt = submission.attempts[-1] if submission.attempts else None
    if attempt:
        attempt.review_status = "rejected"
        attempt.reviewed_at = now
        attempt.review_note = normalized_admin_comment(payload, required=True)
    db.commit()
    db.refresh(submission)
    return daily_proof_dict(submission, get_program_or_404(db, submission.sprint_program_id))


@router.post("/admin/sprint-daily-proofs/{submission_id}/cancel")
def admin_cancel_daily_proof(submission_id: int, payload: DailyProofRejectIn, db: Session = Depends(get_db)):
    submission = get_daily_proof_or_404(db, submission_id)
    submission.workflow_status = "cancelled"
    submission.review_note = normalized_admin_comment(payload, required=True)
    submission.reviewed_by = payload.reviewed_by
    db.commit()
    db.refresh(submission)
    return daily_proof_dict(submission, get_program_or_404(db, submission.sprint_program_id))


@router.post("/admin/sprints/{program_id}/daily-proofs/judge-missing")
def admin_judge_missing_daily_proofs(program_id: int, payload: MissingProofJudgeIn, db: Session = Depends(get_db)):
    program = get_program_or_404(db, program_id)
    if not program.start_date <= payload.learning_date <= program.end_date:
        raise HTTPException(status_code=400, detail="learning_date is outside the SPRINT period.")
    proof_types = ["planner", "seat_check"] if payload.proof_type == "all" else [payload.proof_type]
    created = []
    for kind in proof_types:
        timing = proof_timing_status(program, kind, payload.learning_date, None)
        if timing != "missing":
            continue
        valid = db.query(models.SprintDailyProofSubmission).filter(
            models.SprintDailyProofSubmission.sprint_program_id == program.id,
            models.SprintDailyProofSubmission.student_id == program.student_id,
            models.SprintDailyProofSubmission.learning_date == payload.learning_date,
            models.SprintDailyProofSubmission.proof_type == kind,
            models.SprintDailyProofSubmission.workflow_status.in_(["pending", "approved"]),
        ).first()
        if valid:
            continue
        upsert_auto_strike(db, program, payload.learning_date, kind, "missing", None)
        created.append(kind)
    db.commit()
    return {"learning_date": payload.learning_date, "created_or_existing": created}


@router.get("/admin/sprint-proof-images/{image_id}")
def admin_get_daily_proof_image(image_id: int, db: Session = Depends(get_db)):
    image = db.get(models.SprintDailyProofImage, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    path = storage_file_path(image.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=image.mime_type, filename=image.original_filename or path.name)
