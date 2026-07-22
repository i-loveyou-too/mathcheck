from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

import models
from database import get_db


router = APIRouter(tags=["Lessons"])

TIME_PATTERN = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
EVENT_TYPES = {"regular", "extra", "makeup", "trial", "other"}
WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"]  # 0=월 ... 6=일


def validate_time(value: str) -> str:
    if not TIME_PATTERN.match(value):
        raise ValueError("시간 형식은 HH:MM 이어야 합니다.")
    return value


def times_overlap(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
    return a_start < b_end and b_start < a_end


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ScheduleIn(BaseModel):
    student_id: int
    title: str | None = Field(default=None, max_length=200)
    weekday: int = Field(ge=0, le=6)
    start_time: str
    end_time: str
    effective_start_date: date
    effective_end_date: date | None = None
    location: str | None = Field(default=None, max_length=200)
    memo: str | None = Field(default=None, max_length=500)
    is_active: bool = True

    @model_validator(mode="after")
    def validate(self):
        validate_time(self.start_time)
        validate_time(self.end_time)
        if self.end_time <= self.start_time:
            raise ValueError("종료 시간은 시작 시간보다 늦어야 합니다.")
        if self.effective_end_date and self.effective_end_date < self.effective_start_date:
            raise ValueError("적용 종료일은 적용 시작일보다 빠를 수 없습니다.")
        return self


class ScheduleUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    weekday: int | None = Field(default=None, ge=0, le=6)
    start_time: str | None = None
    end_time: str | None = None
    effective_start_date: date | None = None
    effective_end_date: date | None = None
    location: str | None = Field(default=None, max_length=200)
    memo: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class EventIn(BaseModel):
    student_id: int
    event_date: date
    start_time: str
    end_time: str
    event_type: Literal["regular", "extra", "makeup", "trial", "other"] = "extra"
    title: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    memo: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate(self):
        validate_time(self.start_time)
        validate_time(self.end_time)
        if self.end_time <= self.start_time:
            raise ValueError("종료 시간은 시작 시간보다 늦어야 합니다.")
        return self


class EventUpdate(BaseModel):
    event_date: date | None = None
    start_time: str | None = None
    end_time: str | None = None
    event_type: Literal["regular", "extra", "makeup", "trial", "other"] | None = None
    status: Literal["scheduled", "completed", "cancelled", "rescheduled"] | None = None
    title: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    memo: str | None = Field(default=None, max_length=500)


class CancelIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class CancelOccurrenceIn(BaseModel):
    event_date: date
    reason: str | None = Field(default=None, max_length=500)


class RescheduleOccurrenceIn(BaseModel):
    event_date: date  # 원래 정규 수업 날짜
    new_date: date
    new_start_time: str
    new_end_time: str
    location: str | None = Field(default=None, max_length=200)
    memo: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate(self):
        validate_time(self.new_start_time)
        validate_time(self.new_end_time)
        if self.new_end_time <= self.new_start_time:
            raise ValueError("종료 시간은 시작 시간보다 늦어야 합니다.")
        return self


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def get_student_or_404(db: Session, student_id: int) -> models.Student:
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    return student


def get_schedule_or_404(db: Session, schedule_id: int) -> models.StudentLessonSchedule:
    schedule = db.get(models.StudentLessonSchedule, schedule_id)
    if schedule is None:
        raise HTTPException(status_code=404, detail="정규 수업 일정을 찾을 수 없습니다.")
    return schedule


def get_event_or_404(db: Session, event_id: int) -> models.StudentLessonEvent:
    event = db.get(models.StudentLessonEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="수업 이벤트를 찾을 수 없습니다.")
    return event


def schedule_dict(schedule: models.StudentLessonSchedule) -> dict:
    return {
        "id": schedule.id,
        "student_id": schedule.student_id,
        "title": schedule.title,
        "weekday": schedule.weekday,
        "weekday_label": WEEKDAY_LABELS[schedule.weekday],
        "start_time": schedule.start_time,
        "end_time": schedule.end_time,
        "timezone": schedule.timezone,
        "effective_start_date": schedule.effective_start_date,
        "effective_end_date": schedule.effective_end_date,
        "location": schedule.location,
        "memo": schedule.memo,
        "is_active": schedule.is_active,
    }


def event_row_dict(event: models.StudentLessonEvent) -> dict:
    return {
        "id": event.id,
        "source": "event",
        "student_id": event.student_id,
        "schedule_id": event.schedule_id,
        "event_date": event.event_date,
        "weekday": event.event_date.weekday(),
        "weekday_label": WEEKDAY_LABELS[event.event_date.weekday()],
        "start_time": event.start_time,
        "end_time": event.end_time,
        "timezone": event.timezone,
        "event_type": event.event_type,
        "status": event.status,
        "title": event.title,
        "location": event.location,
        "memo": event.memo,
        "original_event_id": event.original_event_id,
    }


def synthetic_dict(schedule: models.StudentLessonSchedule, on_date: date) -> dict:
    return {
        "id": None,
        "source": "schedule",
        "student_id": schedule.student_id,
        "schedule_id": schedule.id,
        "event_date": on_date,
        "weekday": on_date.weekday(),
        "weekday_label": WEEKDAY_LABELS[on_date.weekday()],
        "start_time": schedule.start_time,
        "end_time": schedule.end_time,
        "timezone": schedule.timezone,
        "event_type": "regular",
        "status": "scheduled",
        "title": schedule.title,
        "location": schedule.location,
        "memo": schedule.memo,
        "original_event_id": None,
    }


def synthesize_events(db: Session, student_id: int, start: date, end: date) -> list[dict]:
    """요청 기간에 대해 저장된 이벤트 + 정규 규칙 파생 발생을 합성한다.
    정규 규칙 날짜에 override 이벤트(schedule_id 일치)가 있으면 그 이벤트가 우선한다."""
    if end < start:
        raise HTTPException(status_code=400, detail="종료일은 시작일보다 빠를 수 없습니다.")
    events = (
        db.query(models.StudentLessonEvent)
        .filter(
            models.StudentLessonEvent.student_id == student_id,
            models.StudentLessonEvent.event_date >= start,
            models.StudentLessonEvent.event_date <= end,
        )
        .all()
    )
    overridden = {
        (event.schedule_id, event.event_date)
        for event in events
        if event.schedule_id is not None
    }
    result = [event_row_dict(event) for event in events]

    schedules = (
        db.query(models.StudentLessonSchedule)
        .filter(
            models.StudentLessonSchedule.student_id == student_id,
            models.StudentLessonSchedule.is_active.is_(True),
        )
        .all()
    )
    cursor = start
    while cursor <= end:
        for schedule in schedules:
            if schedule.weekday != cursor.weekday():
                continue
            if cursor < schedule.effective_start_date:
                continue
            if schedule.effective_end_date and cursor > schedule.effective_end_date:
                continue
            if (schedule.id, cursor) in overridden:
                continue
            result.append(synthetic_dict(schedule, cursor))
        cursor += timedelta(days=1)

    result.sort(key=lambda item: (item["event_date"], item["start_time"]))
    return result


def ensure_no_event_conflict(
    db: Session,
    student_id: int,
    event_date: date,
    start_time: str,
    end_time: str,
    exclude_event_id: int | None = None,
) -> None:
    """같은 학생·같은 날짜에 시간이 겹치는(취소 제외) 일정이 있으면 차단한다.
    저장된 이벤트와 정규 파생 발생을 모두 검사한다."""
    occurrences = synthesize_events(db, student_id, event_date, event_date)
    for item in occurrences:
        if item["status"] == "cancelled":
            continue
        if exclude_event_id is not None and item["id"] == exclude_event_id:
            continue
        if times_overlap(start_time, end_time, item["start_time"], item["end_time"]):
            raise HTTPException(
                status_code=400,
                detail=f"{event_date} {item['start_time']}~{item['end_time']} 수업과 시간이 겹칩니다.",
            )


# ---------------------------------------------------------------------------
# Admin: 정규 수업 일정
# ---------------------------------------------------------------------------


@router.get("/admin/lesson-schedules")
def admin_list_schedules(student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    schedules = (
        db.query(models.StudentLessonSchedule)
        .filter(models.StudentLessonSchedule.student_id == student_id)
        .order_by(
            models.StudentLessonSchedule.is_active.desc(),
            models.StudentLessonSchedule.weekday,
            models.StudentLessonSchedule.start_time,
        )
        .all()
    )
    return [schedule_dict(schedule) for schedule in schedules]


@router.post("/admin/lesson-schedules", status_code=201)
def admin_create_schedule(payload: ScheduleIn, db: Session = Depends(get_db)):
    get_student_or_404(db, payload.student_id)
    # 완전히 동일한 정규 규칙(요일+시간+적용시작일) 중복 차단
    duplicate = (
        db.query(models.StudentLessonSchedule)
        .filter(
            models.StudentLessonSchedule.student_id == payload.student_id,
            models.StudentLessonSchedule.is_active.is_(True),
            models.StudentLessonSchedule.weekday == payload.weekday,
            models.StudentLessonSchedule.start_time == payload.start_time,
            models.StudentLessonSchedule.end_time == payload.end_time,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="동일한 요일·시간의 정규 수업이 이미 있습니다.")
    schedule = models.StudentLessonSchedule(**payload.model_dump())
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule_dict(schedule)


@router.patch("/admin/lesson-schedules/{schedule_id}")
def admin_update_schedule(schedule_id: int, payload: ScheduleUpdate, db: Session = Depends(get_db)):
    schedule = get_schedule_or_404(db, schedule_id)
    values = payload.model_dump(exclude_unset=True)
    start_time = values.get("start_time", schedule.start_time)
    end_time = values.get("end_time", schedule.end_time)
    if "start_time" in values:
        validate_time(start_time)
    if "end_time" in values:
        validate_time(end_time)
    if end_time <= start_time:
        raise HTTPException(status_code=400, detail="종료 시간은 시작 시간보다 늦어야 합니다.")
    eff_start = values.get("effective_start_date", schedule.effective_start_date)
    eff_end = values.get("effective_end_date", schedule.effective_end_date)
    if eff_end and eff_end < eff_start:
        raise HTTPException(status_code=400, detail="적용 종료일은 적용 시작일보다 빠를 수 없습니다.")
    for key, value in values.items():
        setattr(schedule, key, value)
    db.commit()
    db.refresh(schedule)
    return schedule_dict(schedule)


@router.post("/admin/lesson-schedules/{schedule_id}/deactivate")
def admin_deactivate_schedule(schedule_id: int, db: Session = Depends(get_db)):
    schedule = get_schedule_or_404(db, schedule_id)
    schedule.is_active = False
    db.commit()
    return {"deactivated": True, "id": schedule_id}


@router.post("/admin/lesson-schedules/{schedule_id}/cancel-occurrence")
def admin_cancel_occurrence(schedule_id: int, payload: CancelOccurrenceIn, db: Session = Depends(get_db)):
    """정규 수업 특정 날짜 1회 휴강 (override 이벤트 생성, 하드 삭제 금지)."""
    schedule = get_schedule_or_404(db, schedule_id)
    if schedule.weekday != payload.event_date.weekday():
        raise HTTPException(status_code=400, detail="해당 날짜는 이 정규 수업의 요일이 아닙니다.")
    existing = (
        db.query(models.StudentLessonEvent)
        .filter(
            models.StudentLessonEvent.schedule_id == schedule_id,
            models.StudentLessonEvent.event_date == payload.event_date,
        )
        .first()
    )
    if existing:
        existing.status = "cancelled"
        existing.memo = payload.reason or existing.memo
    else:
        existing = models.StudentLessonEvent(
            student_id=schedule.student_id,
            schedule_id=schedule_id,
            event_date=payload.event_date,
            start_time=schedule.start_time,
            end_time=schedule.end_time,
            event_type="regular",
            status="cancelled",
            title=schedule.title,
            location=schedule.location,
            memo=payload.reason,
        )
        db.add(existing)
    db.commit()
    db.refresh(existing)
    return event_row_dict(existing)


@router.post("/admin/lesson-schedules/{schedule_id}/reschedule-occurrence")
def admin_reschedule_occurrence(
    schedule_id: int, payload: RescheduleOccurrenceIn, db: Session = Depends(get_db)
):
    """정규 수업 1회를 다른 날짜/시간으로 변경. 원래 날짜는 rescheduled override, 새 날짜는 새 이벤트."""
    schedule = get_schedule_or_404(db, schedule_id)
    if schedule.weekday != payload.event_date.weekday():
        raise HTTPException(status_code=400, detail="원래 날짜는 이 정규 수업의 요일이 아닙니다.")
    ensure_no_event_conflict(
        db, schedule.student_id, payload.new_date, payload.new_start_time, payload.new_end_time
    )
    # 원래 날짜 override
    origin = (
        db.query(models.StudentLessonEvent)
        .filter(
            models.StudentLessonEvent.schedule_id == schedule_id,
            models.StudentLessonEvent.event_date == payload.event_date,
        )
        .first()
    )
    if origin is None:
        origin = models.StudentLessonEvent(
            student_id=schedule.student_id,
            schedule_id=schedule_id,
            event_date=payload.event_date,
            start_time=schedule.start_time,
            end_time=schedule.end_time,
            event_type="regular",
            status="rescheduled",
            title=schedule.title,
            location=schedule.location,
            memo=payload.memo,
        )
        db.add(origin)
    else:
        origin.status = "rescheduled"
        origin.memo = payload.memo or origin.memo
    db.flush()
    moved = models.StudentLessonEvent(
        student_id=schedule.student_id,
        schedule_id=None,
        event_date=payload.new_date,
        start_time=payload.new_start_time,
        end_time=payload.new_end_time,
        event_type="makeup",
        status="scheduled",
        title=schedule.title,
        location=payload.location or schedule.location,
        memo=payload.memo,
        original_event_id=origin.id,
    )
    db.add(moved)
    db.commit()
    db.refresh(moved)
    return {"original": event_row_dict(origin), "moved": event_row_dict(moved)}


# ---------------------------------------------------------------------------
# Admin: 일회성 / 보강 이벤트
# ---------------------------------------------------------------------------


@router.post("/admin/lesson-events", status_code=201)
def admin_create_event(payload: EventIn, db: Session = Depends(get_db)):
    get_student_or_404(db, payload.student_id)
    ensure_no_event_conflict(
        db, payload.student_id, payload.event_date, payload.start_time, payload.end_time
    )
    event = models.StudentLessonEvent(
        student_id=payload.student_id,
        schedule_id=None,
        event_date=payload.event_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        event_type=payload.event_type,
        status="scheduled",
        title=payload.title,
        location=payload.location,
        memo=payload.memo,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event_row_dict(event)


@router.patch("/admin/lesson-events/{event_id}")
def admin_update_event(event_id: int, payload: EventUpdate, db: Session = Depends(get_db)):
    event = get_event_or_404(db, event_id)
    values = payload.model_dump(exclude_unset=True)
    new_date = values.get("event_date", event.event_date)
    start_time = values.get("start_time", event.start_time)
    end_time = values.get("end_time", event.end_time)
    if "start_time" in values:
        validate_time(start_time)
    if "end_time" in values:
        validate_time(end_time)
    if end_time <= start_time:
        raise HTTPException(status_code=400, detail="종료 시간은 시작 시간보다 늦어야 합니다.")
    status = values.get("status", event.status)
    if status != "cancelled":
        ensure_no_event_conflict(
            db, event.student_id, new_date, start_time, end_time, exclude_event_id=event.id
        )
    for key, value in values.items():
        setattr(event, key, value)
    db.commit()
    db.refresh(event)
    return event_row_dict(event)


@router.post("/admin/lesson-events/{event_id}/cancel")
def admin_cancel_event(event_id: int, payload: CancelIn, db: Session = Depends(get_db)):
    event = get_event_or_404(db, event_id)
    event.status = "cancelled"
    if payload.reason:
        event.memo = payload.reason
    db.commit()
    db.refresh(event)
    return event_row_dict(event)


@router.get("/admin/lesson-events")
def admin_list_events(
    student_id: int,
    start: date = Query(...),
    end: date = Query(...),
    db: Session = Depends(get_db),
):
    get_student_or_404(db, student_id)
    return {
        "student_id": student_id,
        "start": start,
        "end": end,
        "events": synthesize_events(db, student_id, start, end),
    }


# ---------------------------------------------------------------------------
# Student: 조회 전용 (본인 데이터만)
# ---------------------------------------------------------------------------


@router.get("/student/lessons")
def student_lessons(
    student_id: int,
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
):
    get_student_or_404(db, student_id)
    today = date.today()
    range_start = start or today
    range_end = end or (today + timedelta(days=28))
    events = synthesize_events(db, student_id, range_start, range_end)
    upcoming = [item for item in events if item["status"] != "cancelled" and item["event_date"] >= today]
    next_lesson = upcoming[0] if upcoming else None
    return {
        "student_id": student_id,
        "today": today,
        "start": range_start,
        "end": range_end,
        "next_lesson": next_lesson,
        "events": events,
    }


@router.get("/student/lessons/next")
def student_next_lesson(student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    today = date.today()
    events = synthesize_events(db, student_id, today, today + timedelta(days=60))
    upcoming = [item for item in events if item["status"] != "cancelled" and item["event_date"] >= today]
    return {"student_id": student_id, "today": today, "next_lesson": upcoming[0] if upcoming else None}
