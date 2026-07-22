"""SPRINT 주간 반복 모의고사 (5차): OMR 제출 + 자동 채점 + 성적 기록.

기존 SPRINT 기능(sprint.py)은 수정하지 않고, sprint.py가 이 모듈의 대시보드 요약
함수를 지연 import(순환 참조 방지)로 가져다 쓴다.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

import models
from database import get_db


router = APIRouter(tags=["Sprint Mock Exam"])

SEOUL_TZ = timezone(timedelta(hours=9))
WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"]
ACTIVE_SUBMISSION_STATUSES = {"submitted", "graded", "confirmed"}
LOCKED_SUBMISSION_STATUSES = {"submitted", "graded", "confirmed"}


# ---------------------------------------------------------------------------
# 시간/날짜 계산 (Asia/Seoul, 학습일 5시 컷오프와 별개로 달력 날짜 기준)
# ---------------------------------------------------------------------------


def today_seoul() -> date:
    return datetime.now(timezone.utc).astimezone(SEOUL_TZ).date()


def now_seoul() -> datetime:
    return datetime.now(timezone.utc).astimezone(SEOUL_TZ)


def compute_deadline_at(exam_date: date, deadline_time: str) -> datetime:
    """00:00~04:59 마감은 시험일 다음 날 시각으로 해석한다 (proof 마감과 동일 규칙)."""
    hour, minute = (int(part) for part in deadline_time.split(":"))
    deadline_date = exam_date + timedelta(days=1) if hour < 5 else exam_date
    return datetime(deadline_date.year, deadline_date.month, deadline_date.day, hour, minute, tzinfo=SEOUL_TZ)


def compute_exam_status(exam: models.SprintMockExam, now: datetime | None = None) -> str:
    current = (now or now_seoul())
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    current = current.astimezone(SEOUL_TZ)
    if exam.exam_date > current.date():
        return "scheduled"
    deadline = exam.submission_deadline_at
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    if current <= deadline.astimezone(SEOUL_TZ):
        return "open"
    return "closed"


def sync_exam_status(exam: models.SprintMockExam) -> str:
    live = compute_exam_status(exam)
    if exam.status != live:
        exam.status = live
    return live


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class SeriesCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    recurrence_weekday: int = Field(ge=0, le=6)
    first_exam_date: date
    start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    submission_deadline_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    generation_mode: Literal["until_sprint_end", "fixed_rounds"] = "until_sprint_end"
    total_rounds: int | None = Field(default=None, ge=1, le=52)
    subject: str = Field(default="수학", max_length=50)
    default_question_count: int = Field(default=20, ge=1, le=100)
    default_total_score: int = Field(default=100, ge=1, le=1000)
    is_active: bool = True

    @model_validator(mode="after")
    def validate(self):
        if self.first_exam_date.weekday() != self.recurrence_weekday:
            raise ValueError("첫 시험일의 요일이 recurrence_weekday와 일치하지 않습니다.")
        if self.generation_mode == "fixed_rounds" and not self.total_rounds:
            raise ValueError("fixed_rounds 방식에는 total_rounds가 필요합니다.")
        return self


class SeriesUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    is_active: bool | None = None


class RescheduleSingleIn(BaseModel):
    exam_date: date
    start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    submission_deadline_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")


class RescheduleFromIn(BaseModel):
    exam_date: date
    submission_deadline_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")


class RescheduleAllIn(BaseModel):
    recurrence_weekday: int = Field(ge=0, le=6)
    first_exam_date: date
    submission_deadline_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    generation_mode: Literal["until_sprint_end", "fixed_rounds"] = "until_sprint_end"
    total_rounds: int | None = Field(default=None, ge=1, le=52)

    @model_validator(mode="after")
    def validate(self):
        if self.first_exam_date.weekday() != self.recurrence_weekday:
            raise ValueError("첫 시험일의 요일이 recurrence_weekday와 일치하지 않습니다.")
        if self.generation_mode == "fixed_rounds" and not self.total_rounds:
            raise ValueError("fixed_rounds 방식에는 total_rounds가 필요합니다.")
        return self


class ExamUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    subject: str | None = Field(default=None, max_length=50)
    question_count: int | None = Field(default=None, ge=1, le=100)


class AnswerKeyItemIn(BaseModel):
    question_no: int = Field(ge=1)
    correct_answer: int = Field(ge=1, le=5)
    score_points: int | None = Field(default=None, ge=1)
    category: str | None = Field(default=None, max_length=100)
    memo: str | None = Field(default=None, max_length=300)


class AnswerKeySetIn(BaseModel):
    questions: list[AnswerKeyItemIn] = Field(min_length=1)
    total_score: int | None = Field(default=None, ge=1)


class RegradeIn(BaseModel):
    questions: list[AnswerKeyItemIn] = Field(min_length=1)
    total_score: int | None = Field(default=None, ge=1)
    dry_run: bool = True


class OmrAnswerIn(BaseModel):
    question_no: int = Field(ge=1)
    selected_answer: int | None = Field(default=None, ge=1, le=5)


class OmrSaveIn(BaseModel):
    student_id: int
    answers: list[OmrAnswerIn]


class SubmitIn(BaseModel):
    student_id: int
    force: bool = False


class StudentActionIn(BaseModel):
    student_id: int


class ReviewNoteIn(BaseModel):
    review_note: str | None = Field(default=None, max_length=500)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def get_program_or_404(db: Session, program_id: int) -> models.SprintProgram:
    program = db.get(models.SprintProgram, program_id)
    if program is None:
        raise HTTPException(status_code=404, detail="SPRINT 프로그램을 찾을 수 없습니다.")
    return program


def get_series_or_404(db: Session, series_id: int) -> models.SprintMockExamSeries:
    series = db.get(models.SprintMockExamSeries, series_id)
    if series is None:
        raise HTTPException(status_code=404, detail="모의고사 시리즈를 찾을 수 없습니다.")
    return series


def get_exam_or_404(db: Session, exam_id: int) -> models.SprintMockExam:
    exam = db.get(models.SprintMockExam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="모의고사 회차를 찾을 수 없습니다.")
    return exam


def get_student_or_404(db: Session, student_id: int) -> models.Student:
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    return student


def generate_round_dates(
    first_exam_date: date,
    weekday: int,
    mode: str,
    total_rounds: int | None,
    sprint_end_date: date,
) -> list[date]:
    dates: list[date] = []
    cursor = first_exam_date
    if mode == "fixed_rounds":
        for _ in range(total_rounds or 0):
            dates.append(cursor)
            cursor += timedelta(days=7)
    else:
        while cursor <= sprint_end_date:
            dates.append(cursor)
            cursor += timedelta(days=7)
    return dates


def generate_rounds(db: Session, series: models.SprintMockExamSeries) -> list[models.SprintMockExam]:
    """반복 규칙에 따라 회차를 생성한다. 이미 존재하는 (series_id, round_no)는 건너뛰어
    재실행해도 중복 생성되지 않는다."""
    program = get_program_or_404(db, series.sprint_program_id)
    dates = generate_round_dates(
        series.first_exam_date, series.recurrence_weekday, series.generation_mode,
        series.total_rounds, program.end_date,
    )
    existing_rounds = {
        row.round_no: row
        for row in db.query(models.SprintMockExam).filter_by(series_id=series.id).all()
    }
    created: list[models.SprintMockExam] = []
    for index, exam_date in enumerate(dates, start=1):
        if index in existing_rounds:
            continue
        deadline_at = compute_deadline_at(exam_date, series.submission_deadline_time)
        exam = models.SprintMockExam(
            series_id=series.id,
            sprint_program_id=series.sprint_program_id,
            round_no=index,
            title=f"{series.title} {index}회차",
            exam_date=exam_date,
            start_time=series.start_time,
            submission_deadline_at=deadline_at,
            subject=series.subject,
            question_count=series.default_question_count,
            status=compute_exam_status_from_date(exam_date, deadline_at),
        )
        db.add(exam)
        created.append(exam)
    db.flush()
    return created


def compute_exam_status_from_date(exam_date: date, deadline_at: datetime) -> str:
    current = now_seoul()
    if exam_date > current.date():
        return "scheduled"
    if current <= deadline_at.astimezone(SEOUL_TZ):
        return "open"
    return "closed"


def submission_status_set(db: Session, exam_id: int) -> set[str]:
    rows = db.query(models.SprintMockExamSubmission.status).filter_by(exam_id=exam_id).all()
    return {row[0] for row in rows}


def has_locked_submissions(db: Session, exam_id: int) -> bool:
    return bool(submission_status_set(db, exam_id) & LOCKED_SUBMISSION_STATUSES)


def has_draft_submissions(db: Session, exam_id: int) -> bool:
    return "draft" in submission_status_set(db, exam_id)


def equal_split_points(question_nos: list[int], total_score: int) -> dict[int, int]:
    """기본 동일 배점: 나머지는 마지막 문항에 더해 총점이 정확히 맞도록 한다."""
    count = len(question_nos)
    base = total_score // count
    remainder = total_score - base * count
    points = {question_no: base for question_no in question_nos}
    if remainder and question_nos:
        points[question_nos[-1]] += remainder
    return points


# ---------------------------------------------------------------------------
# 채점
# ---------------------------------------------------------------------------


def grade_submission(db: Session, submission: models.SprintMockExamSubmission, exam: models.SprintMockExam) -> tuple[int, int, int]:
    """exam.answer_keys 기준으로 submission.responses를 채점하고 raw_score/correct_count/max_score를 갱신한다."""
    answer_keys = {ak.question_no: ak for ak in exam.answer_keys}
    responses = {r.question_no: r for r in submission.responses}
    correct_count = 0
    raw_score = 0
    max_score = sum(ak.score_points for ak in answer_keys.values())
    for question_no, answer_key in answer_keys.items():
        response = responses.get(question_no)
        if response is None:
            response = models.SprintMockExamResponse(submission_id=submission.id, question_no=question_no, selected_answer=None)
            db.add(response)
            responses[question_no] = response
        is_correct = response.selected_answer is not None and response.selected_answer == answer_key.correct_answer
        response.is_correct = is_correct
        response.awarded_points = answer_key.score_points if is_correct else 0
        if is_correct:
            correct_count += 1
            raw_score += answer_key.score_points
    submission.raw_score = raw_score
    submission.max_score = max_score
    submission.correct_count = correct_count
    return raw_score, correct_count, max_score


def preview_or_apply_regrade(
    db: Session,
    exam: models.SprintMockExam,
    questions: list[AnswerKeyItemIn],
    total_score: int | None,
    dry_run: bool,
) -> dict:
    if len(questions) != exam.question_count:
        raise HTTPException(status_code=400, detail=f"정답 개수({len(questions)})가 문항 수({exam.question_count})와 일치하지 않습니다.")
    question_nos = [item.question_no for item in questions]
    if sorted(question_nos) != list(range(1, exam.question_count + 1)):
        raise HTTPException(status_code=400, detail="문제 번호가 1부터 문항 수까지 빠짐없이 있어야 합니다.")
    missing_points = [item.question_no for item in questions if item.score_points is None]
    resolved_points: dict[int, int] = {item.question_no: item.score_points for item in questions if item.score_points is not None}
    if missing_points:
        resolved_points.update(equal_split_points(missing_points, (total_score or exam.series.default_total_score) - sum(resolved_points.values())))

    submissions = (
        db.query(models.SprintMockExamSubmission)
        .filter(
            models.SprintMockExamSubmission.exam_id == exam.id,
            models.SprintMockExamSubmission.status.in_(ACTIVE_SUBMISSION_STATUSES),
        )
        .all()
    )

    affected = []
    for submission in submissions:
        selected_by_question = {r.question_no: r.selected_answer for r in submission.responses}
        new_correct = 0
        new_score = 0
        for item in questions:
            selected = selected_by_question.get(item.question_no)
            points = resolved_points[item.question_no]
            if selected is not None and selected == item.correct_answer:
                new_correct += 1
                new_score += points
        affected.append({
            "submission_id": submission.id,
            "student_id": submission.student_id,
            "previous_raw_score": submission.raw_score,
            "new_raw_score": new_score,
            "previous_correct_count": submission.correct_count,
            "new_correct_count": new_correct,
            "score_delta": new_score - (submission.raw_score or 0),
        })

    if dry_run:
        return {"dry_run": True, "affected_count": len(affected), "details": affected}

    db.query(models.SprintMockExamAnswerKey).filter_by(exam_id=exam.id).delete(synchronize_session=False)
    db.flush()
    for item in questions:
        db.add(models.SprintMockExamAnswerKey(
            exam_id=exam.id,
            question_no=item.question_no,
            correct_answer=item.correct_answer,
            score_points=resolved_points[item.question_no],
            category=item.category,
            memo=item.memo,
        ))
    db.flush()
    db.refresh(exam)

    for submission in submissions:
        previous_score = submission.raw_score
        previous_correct = submission.correct_count
        raw_score, correct_count, _ = grade_submission(db, submission, exam)
        submission.grading_version += 1
        db.add(models.SprintMockExamScoreLog(
            submission_id=submission.id,
            grading_version=submission.grading_version,
            previous_raw_score=previous_score,
            new_raw_score=raw_score,
            previous_correct_count=previous_correct,
            new_correct_count=correct_count,
            reason="정답 수정 재채점",
        ))
        if submission.status == "submitted":
            submission.status = "graded"
    db.commit()
    return {"dry_run": False, "affected_count": len(affected), "details": affected}


def submit_exam(db: Session, exam: models.SprintMockExam, submission: models.SprintMockExamSubmission) -> None:
    if submission.status in LOCKED_SUBMISSION_STATUSES:
        raise HTTPException(status_code=400, detail="이미 제출된 시험입니다.")
    if not exam.answer_keys:
        raise HTTPException(status_code=400, detail="정답이 아직 등록되지 않아 채점할 수 없습니다.")
    submission.submitted_at = datetime.now(timezone.utc)
    grade_submission(db, submission, exam)
    submission.status = "graded"


# ---------------------------------------------------------------------------
# 재일정 (예외 수정)
# ---------------------------------------------------------------------------


def reschedule_single(db: Session, exam: models.SprintMockExam, payload: RescheduleSingleIn) -> dict:
    if has_locked_submissions(db, exam.id):
        raise HTTPException(status_code=400, detail="이미 제출/채점된 회차는 일정을 변경할 수 없습니다.")
    if exam.original_exam_date is None:
        exam.original_exam_date = exam.exam_date
    exam.is_date_overridden = exam.exam_date != payload.exam_date or exam.is_date_overridden
    exam.exam_date = payload.exam_date
    if payload.start_time is not None:
        exam.start_time = payload.start_time
    deadline_time = payload.submission_deadline_time or exam.series.submission_deadline_time
    exam.submission_deadline_at = compute_deadline_at(payload.exam_date, deadline_time)
    sync_exam_status(exam)
    db.commit()
    db.refresh(exam)
    return {"updated": [exam.id], "skipped_locked": []}


def reschedule_from_round(db: Session, series: models.SprintMockExamSeries, from_exam: models.SprintMockExam, payload: RescheduleFromIn) -> dict:
    if has_locked_submissions(db, from_exam.id):
        raise HTTPException(status_code=400, detail="선택한 회차는 이미 제출/채점되어 일정을 변경할 수 없습니다.")
    later_rounds = (
        db.query(models.SprintMockExam)
        .filter(
            models.SprintMockExam.series_id == series.id,
            models.SprintMockExam.round_no >= from_exam.round_no,
        )
        .order_by(models.SprintMockExam.round_no)
        .all()
    )
    deadline_time = payload.submission_deadline_time or series.submission_deadline_time
    updated: list[int] = []
    skipped_locked: list[int] = []
    for offset, exam in enumerate(later_rounds):
        if has_locked_submissions(db, exam.id):
            skipped_locked.append(exam.round_no)
            continue
        new_date = payload.exam_date + timedelta(days=7 * offset)
        if exam.original_exam_date is None:
            exam.original_exam_date = exam.exam_date
        exam.is_date_overridden = exam.exam_date != new_date or exam.is_date_overridden
        exam.exam_date = new_date
        exam.submission_deadline_at = compute_deadline_at(new_date, deadline_time)
        sync_exam_status(exam)
        updated.append(exam.round_no)
    db.commit()
    return {"updated": updated, "skipped_locked": skipped_locked}


def reschedule_whole_series(db: Session, series: models.SprintMockExamSeries, payload: RescheduleAllIn) -> dict:
    program = get_program_or_404(db, series.sprint_program_id)
    all_exams = db.query(models.SprintMockExam).filter_by(series_id=series.id).order_by(models.SprintMockExam.round_no).all()
    locked_exams = [exam for exam in all_exams if has_locked_submissions(db, exam.id)]
    unlocked_exams = [exam for exam in all_exams if exam not in locked_exams]

    # 아직 제출이 시작되지 않은 회차는 삭제 후 새 규칙으로 재생성한다 (제출/채점 기록은 절대 건드리지 않는다).
    for exam in unlocked_exams:
        db.delete(exam)
    db.flush()

    series.recurrence_weekday = payload.recurrence_weekday
    series.first_exam_date = payload.first_exam_date
    series.submission_deadline_time = payload.submission_deadline_time
    series.generation_mode = payload.generation_mode
    series.total_rounds = payload.total_rounds
    db.flush()

    next_round_no = (max((exam.round_no for exam in locked_exams), default=0)) + 1
    dates = generate_round_dates(
        series.first_exam_date, series.recurrence_weekday, series.generation_mode,
        series.total_rounds, program.end_date,
    )
    locked_dates = {exam.exam_date for exam in locked_exams}
    created: list[int] = []
    round_no = next_round_no
    for exam_date in dates:
        if exam_date in locked_dates:
            continue
        deadline_at = compute_deadline_at(exam_date, series.submission_deadline_time)
        exam = models.SprintMockExam(
            series_id=series.id,
            sprint_program_id=series.sprint_program_id,
            round_no=round_no,
            title=f"{series.title} {round_no}회차",
            exam_date=exam_date,
            start_time=series.start_time,
            submission_deadline_at=deadline_at,
            subject=series.subject,
            question_count=series.default_question_count,
            status=compute_exam_status_from_date(exam_date, deadline_at),
        )
        db.add(exam)
        created.append(round_no)
        round_no += 1
    db.commit()
    return {
        "kept_locked_rounds": [exam.round_no for exam in locked_exams],
        "created_rounds": created,
    }


# ---------------------------------------------------------------------------
# 직렬화
# ---------------------------------------------------------------------------


def series_dict(series: models.SprintMockExamSeries, include_rounds: bool = False) -> dict:
    payload = {
        "id": series.id,
        "sprint_program_id": series.sprint_program_id,
        "title": series.title,
        "recurrence_weekday": series.recurrence_weekday,
        "recurrence_weekday_label": WEEKDAY_LABELS[series.recurrence_weekday],
        "first_exam_date": series.first_exam_date,
        "start_time": series.start_time,
        "submission_deadline_time": series.submission_deadline_time,
        "generation_mode": series.generation_mode,
        "total_rounds": series.total_rounds,
        "subject": series.subject,
        "default_question_count": series.default_question_count,
        "default_total_score": series.default_total_score,
        "is_active": series.is_active,
        "round_count": len(series.exams),
    }
    if include_rounds:
        payload["rounds"] = [exam_dict(exam) for exam in series.exams]
    return payload


def exam_dict(exam: models.SprintMockExam, db: Session | None = None) -> dict:
    live_status = compute_exam_status(exam)
    if db is not None and exam.status != live_status:
        exam.status = live_status
    return {
        "id": exam.id,
        "series_id": exam.series_id,
        "sprint_program_id": exam.sprint_program_id,
        "round_no": exam.round_no,
        "title": exam.title,
        "exam_date": exam.exam_date,
        "weekday_label": WEEKDAY_LABELS[exam.exam_date.weekday()],
        "start_time": exam.start_time,
        "submission_deadline_at": exam.submission_deadline_at,
        "subject": exam.subject,
        "question_count": exam.question_count,
        "status": live_status,
        "is_date_overridden": exam.is_date_overridden,
        "original_exam_date": exam.original_exam_date,
        "has_answer_key": len(exam.answer_keys) == exam.question_count and exam.question_count > 0,
    }


def answer_key_dict(answer_key: models.SprintMockExamAnswerKey, reveal: bool) -> dict:
    payload = {
        "question_no": answer_key.question_no,
        "score_points": answer_key.score_points,
        "category": answer_key.category,
    }
    if reveal:
        payload["correct_answer"] = answer_key.correct_answer
        payload["memo"] = answer_key.memo
    return payload


def response_dict(response: models.SprintMockExamResponse, reveal: bool) -> dict:
    payload = {
        "question_no": response.question_no,
        "selected_answer": response.selected_answer,
    }
    if reveal:
        payload["is_correct"] = response.is_correct
        payload["awarded_points"] = response.awarded_points
    return payload


def submission_dict(submission: models.SprintMockExamSubmission, reveal: bool = False) -> dict:
    payload = {
        "id": submission.id,
        "exam_id": submission.exam_id,
        "student_id": submission.student_id,
        "status": submission.status,
        "submitted_at": submission.submitted_at,
        "raw_score": submission.raw_score,
        "max_score": submission.max_score,
        "correct_count": submission.correct_count,
        "confirmed_at": submission.confirmed_at,
        "grading_version": submission.grading_version,
    }
    if reveal:
        payload["responses"] = [response_dict(response, reveal=True) for response in submission.responses]
    return payload


# ---------------------------------------------------------------------------
# 관리자 API
# ---------------------------------------------------------------------------


@router.post("/admin/sprints/{program_id}/mock-exam-series", status_code=201)
def admin_create_series(program_id: int, payload: SeriesCreateIn, db: Session = Depends(get_db)):
    program = get_program_or_404(db, program_id)
    if payload.first_exam_date > program.end_date:
        raise HTTPException(status_code=400, detail="첫 시험일이 SPRINT 종료일 이후입니다.")
    series = models.SprintMockExamSeries(sprint_program_id=program.id, **payload.model_dump())
    db.add(series)
    db.flush()
    generate_rounds(db, series)
    db.commit()
    db.refresh(series)
    return series_dict(series, include_rounds=True)


@router.get("/admin/sprints/{program_id}/mock-exam-series")
def admin_list_series(program_id: int, db: Session = Depends(get_db)):
    get_program_or_404(db, program_id)
    rows = (
        db.query(models.SprintMockExamSeries)
        .filter_by(sprint_program_id=program_id)
        .order_by(models.SprintMockExamSeries.id.desc())
        .all()
    )
    return [series_dict(series) for series in rows]


@router.get("/admin/mock-exam-series/{series_id}")
def admin_get_series(series_id: int, db: Session = Depends(get_db)):
    series = get_series_or_404(db, series_id)
    return series_dict(series, include_rounds=True)


@router.patch("/admin/mock-exam-series/{series_id}")
def admin_update_series(series_id: int, payload: SeriesUpdateIn, db: Session = Depends(get_db)):
    series = get_series_or_404(db, series_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(series, key, value)
    db.commit()
    db.refresh(series)
    return series_dict(series, include_rounds=True)


@router.post("/admin/mock-exam-series/{series_id}/generate-rounds")
def admin_generate_rounds(series_id: int, db: Session = Depends(get_db)):
    series = get_series_or_404(db, series_id)
    created = generate_rounds(db, series)
    db.commit()
    return {"created_round_nos": [exam.round_no for exam in created]}


@router.post("/admin/mock-exams/{exam_id}/reschedule")
def admin_reschedule_single(exam_id: int, payload: RescheduleSingleIn, db: Session = Depends(get_db)):
    exam = get_exam_or_404(db, exam_id)
    return reschedule_single(db, exam, payload)


@router.post("/admin/mock-exam-series/{series_id}/reschedule-from/{exam_id}")
def admin_reschedule_from(series_id: int, exam_id: int, payload: RescheduleFromIn, db: Session = Depends(get_db)):
    series = get_series_or_404(db, series_id)
    exam = get_exam_or_404(db, exam_id)
    if exam.series_id != series.id:
        raise HTTPException(status_code=400, detail="해당 회차는 이 시리즈에 속하지 않습니다.")
    return reschedule_from_round(db, series, exam, payload)


@router.post("/admin/mock-exam-series/{series_id}/reschedule-all")
def admin_reschedule_all(series_id: int, payload: RescheduleAllIn, db: Session = Depends(get_db)):
    series = get_series_or_404(db, series_id)
    return reschedule_whole_series(db, series, payload)


@router.patch("/admin/mock-exams/{exam_id}")
def admin_update_exam(exam_id: int, payload: ExamUpdateIn, db: Session = Depends(get_db)):
    exam = get_exam_or_404(db, exam_id)
    values = payload.model_dump(exclude_unset=True)
    if "question_count" in values:
        if has_locked_submissions(db, exam.id):
            raise HTTPException(status_code=400, detail="제출/채점된 회차는 문항 수를 변경할 수 없습니다.")
        if has_draft_submissions(db, exam.id) and values["question_count"] < exam.question_count:
            raise HTTPException(status_code=400, detail="임시 답안이 있는 회차는 문항 수를 줄일 수 없습니다.")
    for key, value in values.items():
        setattr(exam, key, value)
    db.commit()
    db.refresh(exam)
    return exam_dict(exam, db)


@router.get("/admin/mock-exams/{exam_id}")
def admin_get_exam(exam_id: int, db: Session = Depends(get_db)):
    exam = get_exam_or_404(db, exam_id)
    submissions = db.query(models.SprintMockExamSubmission).filter_by(exam_id=exam.id).all()
    return {
        "exam": exam_dict(exam, db),
        "answer_key": [answer_key_dict(ak, reveal=True) for ak in exam.answer_keys],
        "locked": has_locked_submissions(db, exam.id),
        "has_draft": has_draft_submissions(db, exam.id),
        "submissions": [submission_dict(submission) for submission in submissions],
    }


@router.put("/admin/mock-exams/{exam_id}/answer-key")
def admin_set_answer_key(exam_id: int, payload: AnswerKeySetIn, db: Session = Depends(get_db)):
    exam = get_exam_or_404(db, exam_id)
    if has_locked_submissions(db, exam.id):
        raise HTTPException(status_code=400, detail="이미 제출/채점된 회차는 '정답 수정 및 재채점' 흐름을 사용해야 합니다.")
    if len(payload.questions) != exam.question_count:
        raise HTTPException(status_code=400, detail=f"정답 개수({len(payload.questions)})가 문항 수({exam.question_count})와 일치하지 않습니다.")
    question_nos = [item.question_no for item in payload.questions]
    if sorted(question_nos) != list(range(1, exam.question_count + 1)):
        raise HTTPException(status_code=400, detail="문제 번호가 1부터 문항 수까지 빠짐없이 있어야 합니다.")
    missing_points = [item.question_no for item in payload.questions if item.score_points is None]
    resolved_points = {item.question_no: item.score_points for item in payload.questions if item.score_points is not None}
    if missing_points:
        resolved_points.update(equal_split_points(missing_points, (payload.total_score or exam.series.default_total_score) - sum(resolved_points.values())))

    db.query(models.SprintMockExamAnswerKey).filter_by(exam_id=exam.id).delete(synchronize_session=False)
    db.flush()
    for item in payload.questions:
        db.add(models.SprintMockExamAnswerKey(
            exam_id=exam.id, question_no=item.question_no, correct_answer=item.correct_answer,
            score_points=resolved_points[item.question_no], category=item.category, memo=item.memo,
        ))
    db.commit()
    db.refresh(exam)
    return [answer_key_dict(ak, reveal=True) for ak in exam.answer_keys]


@router.post("/admin/mock-exams/{exam_id}/answer-key/regrade")
def admin_regrade(exam_id: int, payload: RegradeIn, db: Session = Depends(get_db)):
    exam = get_exam_or_404(db, exam_id)
    return preview_or_apply_regrade(db, exam, payload.questions, payload.total_score, payload.dry_run)


@router.get("/admin/mock-exams/{exam_id}/submissions")
def admin_list_submissions(exam_id: int, db: Session = Depends(get_db)):
    exam = get_exam_or_404(db, exam_id)
    rows = (
        db.query(models.SprintMockExamSubmission, models.Student)
        .join(models.Student, models.SprintMockExamSubmission.student_id == models.Student.id)
        .filter(models.SprintMockExamSubmission.exam_id == exam.id)
        .all()
    )
    submitted_ids = {submission.student_id for submission, _ in rows if submission.status != "cancelled"}
    all_students = db.query(models.Student).filter(models.Student.id == exam.program.student_id).all()
    missing = [student for student in all_students if student.id not in submitted_ids]
    return {
        "exam": exam_dict(exam, db),
        "submitted": [{"submission": submission_dict(submission), "student_name": student.name} for submission, student in rows],
        "missing_students": [{"student_id": student.id, "student_name": student.name} for student in missing],
    }


@router.post("/admin/mock-exam-submissions/{submission_id}/confirm")
def admin_confirm_submission(submission_id: int, db: Session = Depends(get_db)):
    submission = db.get(models.SprintMockExamSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="제출을 찾을 수 없습니다.")
    if submission.status != "graded":
        raise HTTPException(status_code=400, detail="채점 완료된 제출만 확정할 수 있습니다.")
    submission.status = "confirmed"
    submission.confirmed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return submission_dict(submission)


@router.post("/admin/mock-exams/{exam_id}/confirm-all")
def admin_confirm_all(exam_id: int, db: Session = Depends(get_db)):
    exam = get_exam_or_404(db, exam_id)
    rows = db.query(models.SprintMockExamSubmission).filter_by(exam_id=exam.id, status="graded").all()
    now = datetime.now(timezone.utc)
    for submission in rows:
        submission.status = "confirmed"
        submission.confirmed_at = now
    db.commit()
    return {"confirmed_count": len(rows)}


@router.post("/admin/mock-exam-submissions/{submission_id}/reopen")
def admin_reopen_submission(submission_id: int, payload: ReviewNoteIn, db: Session = Depends(get_db)):
    """관리자 허용 시 재응시: 제출을 draft로 되돌려 다시 작성할 수 있게 한다."""
    submission = db.get(models.SprintMockExamSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="제출을 찾을 수 없습니다.")
    submission.status = "draft"
    submission.submitted_at = None
    submission.confirmed_at = None
    db.commit()
    db.refresh(submission)
    return submission_dict(submission)


@router.post("/admin/mock-exam-submissions/{submission_id}/cancel")
def admin_cancel_submission(submission_id: int, payload: ReviewNoteIn, db: Session = Depends(get_db)):
    submission = db.get(models.SprintMockExamSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="제출을 찾을 수 없습니다.")
    submission.status = "cancelled"
    db.commit()
    db.refresh(submission)
    return submission_dict(submission)


# ---------------------------------------------------------------------------
# 학생 API (본인 데이터만 접근)
# ---------------------------------------------------------------------------


def get_submission_or_404(db: Session, exam_id: int, student_id: int) -> models.SprintMockExamSubmission | None:
    return db.query(models.SprintMockExamSubmission).filter_by(exam_id=exam_id, student_id=student_id).first()


def ensure_own_submission(submission: models.SprintMockExamSubmission | None, student_id: int) -> None:
    if submission is not None and submission.student_id != student_id:
        raise HTTPException(status_code=403, detail="다른 학생의 제출에는 접근할 수 없습니다.")


def student_active_program(db: Session, student_id: int, on_date: date) -> models.SprintProgram | None:
    return (
        db.query(models.SprintProgram)
        .filter(
            models.SprintProgram.student_id == student_id,
            models.SprintProgram.is_active.is_(True),
            models.SprintProgram.start_date <= on_date,
            models.SprintProgram.end_date >= on_date,
        )
        .order_by(models.SprintProgram.start_date.desc())
        .first()
    )


@router.get("/student/sprint/mock-exams")
def student_list_mock_exams(student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    program = student_active_program(db, student_id, today_seoul())
    if program is None or not program.enable_mock_exam:
        return {"available": False, "next_exam": None, "available_exams": [], "submitted": [], "graded": [], "past": []}

    exams = (
        db.query(models.SprintMockExam)
        .filter_by(sprint_program_id=program.id)
        .order_by(models.SprintMockExam.exam_date)
        .all()
    )
    submissions = {
        row.exam_id: row
        for row in db.query(models.SprintMockExamSubmission).filter_by(student_id=student_id).all()
        if row.exam_id in {exam.id for exam in exams}
    }

    today = today_seoul()
    next_exam = None
    available_exams = []
    submitted = []
    graded = []
    past = []
    for exam in exams:
        status = compute_exam_status(exam)
        submission = submissions.get(exam.id)
        entry = {"exam": exam_dict(exam, db), "submission": submission_dict(submission) if submission else None}
        if next_exam is None and exam.exam_date >= today and status != "closed":
            next_exam = entry
        sub_status = submission.status if submission else None
        if sub_status in {"graded", "confirmed"}:
            graded.append(entry)
        elif sub_status == "submitted":
            submitted.append(entry)
        elif status == "open" and sub_status in (None, "draft"):
            available_exams.append(entry)
        elif status == "closed" and sub_status not in {"graded", "confirmed"}:
            past.append(entry)
    db.commit()
    return {
        "available": True,
        "today": today,
        "next_exam": next_exam,
        "available_exams": available_exams,
        "submitted": submitted,
        "graded": graded,
        "past": past,
    }


@router.get("/student/sprint/mock-exams/{exam_id}")
def student_get_exam(exam_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    exam = get_exam_or_404(db, exam_id)
    if exam.sprint_program_id and db.get(models.SprintProgram, exam.sprint_program_id).student_id != student_id:
        raise HTTPException(status_code=403, detail="다른 학생의 시험에는 접근할 수 없습니다.")
    submission = get_submission_or_404(db, exam_id, student_id)
    return {"exam": exam_dict(exam, db), "submission": submission_dict(submission) if submission else None}


@router.get("/student/sprint/mock-exams/{exam_id}/omr")
def student_get_omr(exam_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    exam = get_exam_or_404(db, exam_id)
    submission = get_submission_or_404(db, exam_id, student_id)
    ensure_own_submission(submission, student_id)
    if submission is not None and submission.status in LOCKED_SUBMISSION_STATUSES:
        raise HTTPException(status_code=400, detail="이미 제출된 시험은 답안을 수정할 수 없습니다.")
    responses = {r.question_no: r.selected_answer for r in submission.responses} if submission else {}
    return {
        "exam": exam_dict(exam, db),
        "submission_id": submission.id if submission else None,
        "answers": [{"question_no": q, "selected_answer": responses.get(q)} for q in range(1, exam.question_count + 1)],
    }


@router.put("/student/sprint/mock-exams/{exam_id}/omr")
def student_save_omr(exam_id: int, payload: OmrSaveIn, db: Session = Depends(get_db)):
    get_student_or_404(db, payload.student_id)
    exam = get_exam_or_404(db, exam_id)
    submission = get_submission_or_404(db, exam_id, payload.student_id)
    ensure_own_submission(submission, payload.student_id)
    if submission is None:
        submission = models.SprintMockExamSubmission(exam_id=exam.id, student_id=payload.student_id, status="draft")
        db.add(submission)
        db.flush()
    elif submission.status in LOCKED_SUBMISSION_STATUSES:
        raise HTTPException(status_code=400, detail="이미 제출된 시험은 답안을 수정할 수 없습니다.")

    valid_question_nos = set(range(1, exam.question_count + 1))
    existing = {r.question_no: r for r in submission.responses}
    for item in payload.answers:
        if item.question_no not in valid_question_nos:
            raise HTTPException(status_code=400, detail=f"문항 번호 {item.question_no}는 이 시험에 존재하지 않습니다.")
        response = existing.get(item.question_no)
        if response is None:
            response = models.SprintMockExamResponse(submission_id=submission.id, question_no=item.question_no)
            db.add(response)
            existing[item.question_no] = response
        response.selected_answer = item.selected_answer
    db.commit()
    answered = sum(1 for r in existing.values() if r.selected_answer is not None)
    return {"saved": True, "answered_count": answered, "question_count": exam.question_count}


@router.post("/student/sprint/mock-exams/{exam_id}/submit")
def student_submit_exam(exam_id: int, payload: SubmitIn, db: Session = Depends(get_db)):
    get_student_or_404(db, payload.student_id)
    exam = get_exam_or_404(db, exam_id)
    submission = get_submission_or_404(db, exam_id, payload.student_id)
    ensure_own_submission(submission, payload.student_id)
    if submission is None:
        raise HTTPException(status_code=400, detail="답안을 먼저 작성해주세요.")

    unanswered = [
        question_no for question_no in range(1, exam.question_count + 1)
        if not any(r.question_no == question_no and r.selected_answer is not None for r in submission.responses)
    ]
    if unanswered and not payload.force:
        raise HTTPException(
            status_code=409,
            detail=f"미응답 문항이 {len(unanswered)}개 있습니다. 그대로 제출하려면 다시 확인해주세요.",
        )

    submit_exam(db, exam, submission)
    db.commit()
    db.refresh(submission)
    return submission_dict(submission, reveal=True)


@router.get("/student/sprint/mock-exams/{exam_id}/result")
def student_get_result(exam_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    exam = get_exam_or_404(db, exam_id)
    submission = get_submission_or_404(db, exam_id, student_id)
    ensure_own_submission(submission, student_id)
    if submission is None or submission.status not in {"graded", "confirmed"}:
        raise HTTPException(status_code=400, detail="아직 채점되지 않은 시험입니다.")
    return {
        "exam": exam_dict(exam, db),
        "submission": submission_dict(submission, reveal=True),
        "answer_key": [answer_key_dict(ak, reveal=True) for ak in exam.answer_keys],
    }


@router.get("/student/sprint/records/mock-exams")
def student_mock_exam_records(student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    rows = (
        db.query(models.SprintMockExamSubmission, models.SprintMockExam)
        .join(models.SprintMockExam, models.SprintMockExamSubmission.exam_id == models.SprintMockExam.id)
        .filter(
            models.SprintMockExamSubmission.student_id == student_id,
            models.SprintMockExamSubmission.status.in_(["graded", "confirmed"]),
        )
        .order_by(models.SprintMockExam.exam_date)
        .all()
    )
    records = []
    previous_score = None
    for submission, exam in rows:
        unanswered = exam.question_count - len(
            [r for r in submission.responses if r.selected_answer is not None]
        )
        records.append({
            "round_no": exam.round_no,
            "exam_date": exam.exam_date,
            "title": exam.title,
            "raw_score": submission.raw_score,
            "max_score": submission.max_score,
            "correct_count": submission.correct_count,
            "unanswered_count": unanswered,
            "score_change": None if previous_score is None else (submission.raw_score or 0) - previous_score,
        })
        previous_score = submission.raw_score or 0
    average = round(sum(r["raw_score"] or 0 for r in records) / len(records), 1) if records else None
    return {"records": records, "average_score": average}


# ---------------------------------------------------------------------------
# SPRINT 대시보드/기록 연결 (sprint.py가 지연 import로 사용)
# ---------------------------------------------------------------------------


def mock_exam_home_summary(db: Session, program: models.SprintProgram, student_id: int) -> dict:
    if not program.enable_mock_exam:
        return {"available": False, "status": "coming_soon", "path": "/student/sprint/mock-exams"}
    today = today_seoul()
    exams = (
        db.query(models.SprintMockExam)
        .filter_by(sprint_program_id=program.id)
        .order_by(models.SprintMockExam.exam_date)
        .all()
    )
    upcoming = [exam for exam in exams if exam.exam_date >= today and compute_exam_status(exam) != "closed"]
    if not upcoming:
        return {"available": True, "status": "none", "exam": None, "path": "/student/sprint/mock-exams"}
    exam = upcoming[0]
    submission = get_submission_or_404(db, exam.id, student_id)
    return {
        "available": True,
        "status": "scheduled" if compute_exam_status(exam) == "scheduled" else "open",
        "exam": exam_dict(exam, db),
        "days_remaining": (exam.exam_date - today).days,
        "submission_status": submission.status if submission else "not_started",
        "path": f"/student/sprint/mock-exams/{exam.id}",
    }
