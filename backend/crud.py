from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, selectinload

from models import (
    Admin,
    MathDailyTask,
    MathStudentItemProgress,
    MathStudentTextbook,
    MathTextbook,
    MathTextbookItem,
    MathTextbookSection,
    MathTextbookSeries,
    MathTextbookSubject,
    Progress,
    Student,
    Subject,
    Task,
    Unit,
)


TEXTBOOK_PROGRESS_CONFIG = {
    "deep-su1-exp-log": "딥러닝 Deep Learning 수1 - 지수로그",
    "deep-su1-trig-graph": "딥러닝 Deep Learning 수1 - 삼각함수 그래프",
    "deep-su1-sequence-basic": "딥러닝 Deep Learning 수1 - 수열 등차수열·등비수열",
    "deep-su1-sequence-sum": "딥러닝 Deep Learning 수1 - 수열의 합과 시그마",
    "deep-prob-counting": "딥러닝 Deep Learning 확률과 통계 - 경우의 수",
    "deep-su1-trig-shape": "딥러닝 Deep Learning 수1 - 삼각함수 도형",
}
ITEM_PROGRESS_STATUSES = {"not_started", "partial", "done"}
DAILY_TASK_STATUSES = {"todo", "in_progress", "done"}
STUDENT_PROGRESS_SUMMARY_SUBJECTS = ["수1", "수2", "확률과 통계"]
KST = timezone(timedelta(hours=9))

# Canonical multi-select subject tags for the newer `subjects` (plural) system.
# Kept distinct from the legacy single-value `수1`/`수2` used by student routing/pages.
TEXTBOOK_SUBJECT_OPTIONS = ["수학 I", "수학 II", "확률과 통계"]

_LEGACY_SUBJECT_TO_CANONICAL = {
    "수1": "수학 I",
    "수학1": "수학 I",
    "수학I": "수학 I",
    "수학 I": "수학 I",
    "수2": "수학 II",
    "수학2": "수학 II",
    "수학II": "수학 II",
    "수학 II": "수학 II",
    "확통": "확률과 통계",
    "확률과통계": "확률과 통계",
    "확률과 통계": "확률과 통계",
}

_CANONICAL_SUBJECT_TO_LEGACY = {
    "수학 I": "수1",
    "수학 II": "수2",
    "확률과 통계": "확률과 통계",
}

# `MathTextbook.type` doubles as the textbook category: a plain problem set vs. a mock exam.
TEXTBOOK_TYPE_OPTIONS = ["problem", "mock_exam"]


def normalize_textbook_subject(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    key = value.strip()
    if not key:
        return None
    return _LEGACY_SUBJECT_TO_CANONICAL.get(key, key)


def canonical_subject_to_legacy(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return _CANONICAL_SUBJECT_TO_LEGACY.get(value, value)


def percentage(completed_tasks: int, total_tasks: int) -> float:
    if total_tasks == 0:
        return 0.0
    return round((completed_tasks / total_tasks) * 100, 1)


def now_kst() -> datetime:
    return datetime.now(KST)


def to_kst_datetime(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=KST)
    return value.astimezone(KST)


def get_task_completion_window(task_date: date) -> tuple[datetime, datetime]:
    day_start = datetime.combine(task_date, time.min, tzinfo=KST)
    deadline = day_start + timedelta(days=1, hours=5)
    return day_start, deadline


def is_task_completed_within_deadline(task: MathDailyTask) -> bool:
    if task.status != "done" or task.completed_at is None:
        return False

    completed_at = to_kst_datetime(task.completed_at)
    if completed_at is None:
        return False

    day_start, deadline = get_task_completion_window(task.task_date)
    return day_start <= completed_at < deadline


def get_student_by_phone(db: Session, phone: str) -> Optional[Student]:
    return db.query(Student).filter(Student.phone == phone).first()


def get_student_by_id(db: Session, student_id: int) -> Optional[Student]:
    return db.query(Student).filter(Student.id == student_id).first()


def get_admin_by_username(db: Session, username: str) -> Optional[Admin]:
    return db.query(Admin).filter(Admin.username == username).first()


def get_subjects_with_units(db: Session) -> list[Subject]:
    return (
        db.query(Subject)
        .options(selectinload(Subject.units))
        .order_by(Subject.order_index, Subject.id)
        .all()
    )


def get_unit(db: Session, unit_id: int) -> Optional[Unit]:
    return db.query(Unit).filter(Unit.id == unit_id).first()


def get_task(db: Session, task_id: int) -> Optional[Task]:
    return db.query(Task).filter(Task.id == task_id).first()


def get_textbook_by_full_title(db: Session, full_title: str) -> Optional[MathTextbook]:
    return db.query(MathTextbook).filter(MathTextbook.full_title == full_title).first()


def sync_textbook_keys(db: Session) -> None:
    for textbook_key, full_title in TEXTBOOK_PROGRESS_CONFIG.items():
        textbook = get_textbook_by_full_title(db, full_title)
        if textbook is None:
            continue
        if textbook.textbook_key != textbook_key:
            textbook.textbook_key = textbook_key

    db.commit()


def resolve_textbook_key(textbook: MathTextbook) -> Optional[str]:
    if textbook.textbook_key:
        return textbook.textbook_key

    for textbook_key, full_title in TEXTBOOK_PROGRESS_CONFIG.items():
        if textbook.full_title == full_title:
            return textbook_key

    return None


def get_textbook_by_key(db: Session, textbook_key: Optional[str]) -> Optional[MathTextbook]:
    if not textbook_key:
        return None

    textbook = (
        db.query(MathTextbook)
        .filter(MathTextbook.textbook_key == textbook_key)
        .first()
    )
    if textbook is not None:
        return textbook

    full_title = TEXTBOOK_PROGRESS_CONFIG.get(textbook_key)
    if full_title is None:
        return None

    return get_textbook_by_full_title(db, full_title)


def build_textbook_short_title(full_title: str) -> str:
    return full_title.replace("딥러닝 Deep Learning", "딥러닝").strip()


def build_textbook_summary_payload(textbook: MathTextbook, item_count: int) -> dict:
    return {
        "id": textbook.id,
        "textbook_key": resolve_textbook_key(textbook),
        "subject": textbook.subject,
        "title": textbook.title,
        "full_title": textbook.full_title,
        "type": textbook.type,
        "is_checkable": textbook.is_checkable,
        "is_published": textbook.is_published,
        "is_active": textbook.is_active,
        "item_count": item_count,
    }


def get_checkable_textbooks(db: Session) -> list[MathTextbook]:
    return (
        db.query(MathTextbook)
        .filter(
            MathTextbook.is_checkable.is_(True),
            MathTextbook.is_active.is_(True),
            MathTextbook.is_published.is_(True),
        )
        .order_by(MathTextbook.order_index, MathTextbook.id)
        .all()
    )


def get_textbook_subjects(db: Session, textbook_id: int) -> list[str]:
    rows = (
        db.query(MathTextbookSubject.subject)
        .filter(MathTextbookSubject.textbook_id == textbook_id)
        .order_by(MathTextbookSubject.id)
        .all()
    )
    return [row.subject for row in rows]


def set_textbook_subjects(db: Session, textbook_id: int, subjects: list[str]) -> list[str]:
    db.query(MathTextbookSubject).filter(MathTextbookSubject.textbook_id == textbook_id).delete()

    canonical_list: list[str] = []
    seen: set[str] = set()
    for value in subjects:
        canonical = normalize_textbook_subject(value)
        if not canonical or canonical in seen:
            continue
        seen.add(canonical)
        canonical_list.append(canonical)
        db.add(MathTextbookSubject(textbook_id=textbook_id, subject=canonical))

    db.flush()
    return canonical_list


def backfill_textbook_subjects(db: Session) -> None:
    tagged_textbook_ids = {
        row.textbook_id for row in db.query(MathTextbookSubject.textbook_id).distinct().all()
    }
    changed = False
    for textbook in db.query(MathTextbook).all():
        if textbook.id in tagged_textbook_ids:
            continue
        canonical = normalize_textbook_subject(textbook.subject)
        if canonical:
            db.add(MathTextbookSubject(textbook_id=textbook.id, subject=canonical))
            changed = True

    if changed:
        db.commit()


def get_active_textbooks_by_subject(db: Session, subject: str, student_id: Optional[int] = None) -> list[dict]:
    canonical_subject = normalize_textbook_subject(subject)
    tagged_textbook_ids = db.query(MathTextbookSubject.textbook_id).filter(
        MathTextbookSubject.subject == canonical_subject
    )

    base_filter = [
        MathTextbook.id.in_(tagged_textbook_ids),
        MathTextbook.is_active.is_(True),
    ]

    if student_id is not None:
        assigned_ids = get_student_textbook_ids(db, student_id)
        visibility = or_(
            and_(MathTextbook.is_student_only.is_(False), MathTextbook.is_published.is_(True)),
            MathTextbook.id.in_(assigned_ids),
        ) if assigned_ids else and_(
            MathTextbook.is_student_only.is_(False), MathTextbook.is_published.is_(True)
        )
        base_filter.append(visibility)
    else:
        base_filter.append(MathTextbook.is_published.is_(True))

    textbooks = (
        db.query(MathTextbook)
        .filter(*base_filter)
        .order_by(MathTextbook.order_index, MathTextbook.id)
        .all()
    )
    return build_student_textbook_payloads(db, textbooks)


def build_student_textbook_payloads(db: Session, textbooks: list[MathTextbook]) -> list[dict]:
    textbook_ids = [textbook.id for textbook in textbooks]
    item_counts = (
        db.query(MathTextbookItem.textbook_id, func.count(MathTextbookItem.id).label("cnt"))
        .filter(
            MathTextbookItem.textbook_id.in_(textbook_ids),
            MathTextbookItem.is_active.is_(True),
        )
        .group_by(MathTextbookItem.textbook_id)
        .all()
        if textbook_ids
        else []
    )
    count_map = {row.textbook_id: row.cnt for row in item_counts}

    payloads = []
    for textbook in textbooks:
        payload = build_textbook_summary_payload(textbook, count_map.get(textbook.id, 0))
        if payload["textbook_key"] is None:
            continue
        payloads.append(payload)
    return payloads


def get_student_textbook_by_key(db: Session, textbook_key: str) -> Optional[dict]:
    textbook = get_textbook_by_key(db, textbook_key)
    if textbook is None:
        return None

    item_count = (
        db.query(func.count(MathTextbookItem.id))
        .filter(
            MathTextbookItem.textbook_id == textbook.id,
            MathTextbookItem.is_active.is_(True),
        )
        .scalar()
        or 0
    )
    payload = build_textbook_summary_payload(textbook, item_count)
    if payload["textbook_key"] is None:
        return None
    return payload


def get_admin_textbook_catalog(db: Session) -> dict:
    textbooks = []

    for textbook in get_checkable_textbooks(db):
        textbook_key = resolve_textbook_key(textbook)
        if textbook_key is None:
            continue

        items = (
            db.query(MathTextbookItem)
            .filter(
                MathTextbookItem.textbook_id == textbook.id,
                MathTextbookItem.is_active.is_(True),
            )
            .order_by(MathTextbookItem.item_number)
            .all()
        )
        if not items:
            continue

        item_numbers = [item.item_number for item in items]
        textbooks.append(
            {
                "id": textbook.id,
                "textbook_key": textbook_key,
                "title": textbook.full_title,
                "short_title": build_textbook_short_title(textbook.full_title),
                "category": textbook.subject,
                "subject": textbook.subject,
                "min_item_number": min(item_numbers),
                "max_item_number": max(item_numbers),
                "total_items": len(items),
                "is_active": textbook.is_active,
                "is_checkable": textbook.is_checkable,
                "is_student_only": textbook.is_student_only,
            }
        )

    return {"textbooks": textbooks}


def get_textbook_item(db: Session, item_id: int) -> Optional[MathTextbookItem]:
    return db.query(MathTextbookItem).filter(MathTextbookItem.id == item_id).first()


def get_daily_task(db: Session, task_id: int) -> Optional[MathDailyTask]:
    return (
        db.query(MathDailyTask)
        .options(selectinload(MathDailyTask.textbook))
        .filter(MathDailyTask.id == task_id)
        .first()
    )


def build_daily_task_summary(tasks: list[MathDailyTask]) -> dict:
    total = len(tasks)
    done = sum(1 for task in tasks if task.status == "done")
    todo = total - done

    return {
        "total": total,
        "done": done,
        "todo": todo,
        "completion_rate": round((done / total) * 100) if total else 0,
    }


def serialize_daily_task(task: MathDailyTask) -> dict:
    textbook = None
    if task.textbook is not None:
        textbook = {
            "id": task.textbook.id,
            "subject": task.textbook.subject,
            "title": task.textbook.title,
            "full_title": task.textbook.full_title,
        }

    return {
        "id": task.id,
        "title": task.title,
        "detail": task.detail,
        "textbook_id": task.textbook_id,
        "textbook_key": task.textbook_key,
        "start_item_number": task.start_item_number,
        "end_item_number": task.end_item_number,
        "status": task.status,
        "difficulty": task.difficulty,
        "category": task.category,
        "order_index": task.order_index,
        "completed_at": task.completed_at,
        "textbook": textbook,
    }


def get_student_daily_tasks(db: Session, student_id: int, task_date: date) -> dict:
    tasks = (
        db.query(MathDailyTask)
        .options(selectinload(MathDailyTask.textbook))
        .filter(MathDailyTask.student_id == student_id, MathDailyTask.task_date == task_date)
        .order_by(MathDailyTask.order_index, MathDailyTask.id)
        .all()
    )

    return {
        "student_id": student_id,
        "date": task_date,
        "summary": build_daily_task_summary(tasks),
        "tasks": [serialize_daily_task(task) for task in tasks],
    }


def get_student_weekly_tasks(db: Session, student_id: int, week_start: date) -> dict:
    week_end = week_start + timedelta(days=6)
    tasks = (
        db.query(MathDailyTask)
        .options(selectinload(MathDailyTask.textbook))
        .filter(
            MathDailyTask.student_id == student_id,
            MathDailyTask.task_date >= week_start,
            MathDailyTask.task_date <= week_end,
        )
        .order_by(MathDailyTask.task_date, MathDailyTask.order_index, MathDailyTask.id)
        .all()
    )
    tasks_by_date = {}
    for task in tasks:
        tasks_by_date.setdefault(task.task_date, []).append(task)

    days = []
    for offset in range(7):
        current_date = week_start + timedelta(days=offset)
        day_tasks = tasks_by_date.get(current_date, [])
        days.append(
            {
                "date": current_date,
                "summary": build_daily_task_summary(day_tasks),
                "tasks": [serialize_daily_task(task) for task in day_tasks],
            }
        )

    return {
        "student_id": student_id,
        "week_start": week_start,
        "days": days,
    }


def build_task_day_bucket(task_date: date, tasks: list[MathDailyTask]) -> dict:
    total = len(tasks)
    done = sum(1 for task in tasks if task.status == "done")
    todo = total - done
    has_tasks = total > 0
    is_completed = has_tasks and all(is_task_completed_within_deadline(task) for task in tasks)

    return {
        "date": task_date,
        "total": total,
        "done": done,
        "todo": todo,
        "is_completed": is_completed,
        "has_tasks": has_tasks,
    }


def get_student_achievement_tracker(
    db: Session,
    student_id: int,
    year: int,
    month: int,
    today: Optional[date] = None,
) -> dict:
    month_last_day = monthrange(year, month)[1]
    month_start = date(year, month, 1)
    month_end = date(year, month, month_last_day)

    monthly_tasks = (
        db.query(MathDailyTask)
        .filter(
            MathDailyTask.student_id == student_id,
            MathDailyTask.task_date >= month_start,
            MathDailyTask.task_date <= month_end,
        )
        .order_by(MathDailyTask.task_date, MathDailyTask.order_index, MathDailyTask.id)
        .all()
    )
    tasks_by_date = {}
    for task in monthly_tasks:
        tasks_by_date.setdefault(task.task_date, []).append(task)

    days = [
        build_task_day_bucket(
            month_start + timedelta(days=offset),
            tasks_by_date.get(month_start + timedelta(days=offset), []),
        )
        for offset in range(month_last_day)
    ]
    monthly_total_task_days = sum(1 for day in days if day["has_tasks"])
    monthly_done_days = sum(1 for day in days if day["is_completed"])
    monthly_completion_rate = (
        round((monthly_done_days / monthly_total_task_days) * 100)
        if monthly_total_task_days
        else 0
    )

    today = today or date.today()
    streak_end = today
    streak_tasks = (
        db.query(MathDailyTask)
        .filter(
            MathDailyTask.student_id == student_id,
            MathDailyTask.task_date <= streak_end,
        )
        .order_by(MathDailyTask.task_date, MathDailyTask.order_index, MathDailyTask.id)
        .all()
    )
    streak_tasks_by_date = {}
    for task in streak_tasks:
        streak_tasks_by_date.setdefault(task.task_date, []).append(task)

    current_streak = 0
    for task_date in sorted(streak_tasks_by_date.keys(), reverse=True):
        task_day = build_task_day_bucket(task_date, streak_tasks_by_date[task_date])
        if task_day["is_completed"]:
            current_streak += 1
        else:
            break

    return {
        "student_id": student_id,
        "year": year,
        "month": month,
        "current_streak": current_streak,
        "monthly_done_days": monthly_done_days,
        "monthly_total_task_days": monthly_total_task_days,
        "monthly_completion_rate": monthly_completion_rate,
        "days": days,
    }


def create_daily_task(db: Session, payload) -> MathDailyTask:
    textbook = get_textbook_by_key(db, payload.textbook_key)
    completed_at = now_kst() if payload.status == "done" else None
    task = MathDailyTask(
        student_id=payload.student_id,
        task_date=payload.task_date,
        title=payload.title,
        detail=payload.detail,
        textbook_id=textbook.id if textbook else None,
        textbook_key=payload.textbook_key,
        start_item_number=payload.start_item_number,
        end_item_number=payload.end_item_number,
        status=payload.status,
        difficulty=payload.difficulty,
        category=payload.category,
        order_index=payload.order_index,
        completed_at=completed_at,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return get_daily_task(db, task.id) or task


def update_daily_task(db: Session, task: MathDailyTask, payload) -> MathDailyTask:
    update_data = payload.model_dump(exclude_unset=True)

    if "textbook_key" in update_data:
        textbook_key = update_data["textbook_key"]
        textbook = get_textbook_by_key(db, textbook_key)
        task.textbook_key = textbook_key
        task.textbook_id = textbook.id if textbook else None

    for field in [
        "task_date",
        "title",
        "detail",
        "start_item_number",
        "end_item_number",
        "status",
        "difficulty",
        "category",
        "order_index",
    ]:
        if field in update_data:
            setattr(task, field, update_data[field])

    now = now_kst()
    if "status" in update_data:
        task.completed_at = now if task.status == "done" else None

    task.updated_at = now
    db.commit()
    db.refresh(task)
    return get_daily_task(db, task.id) or task


def delete_daily_task(db: Session, task: MathDailyTask) -> None:
    db.delete(task)
    db.commit()


def get_unit_tasks_with_progress(db: Session, student_id: int, unit_id: int) -> list[dict]:
    tasks = (
        db.query(Task)
        .filter(Task.unit_id == unit_id)
        .order_by(Task.order_index, Task.id)
        .all()
    )
    task_ids = [task.id for task in tasks]
    progress_rows = (
        db.query(Progress)
        .filter(Progress.student_id == student_id, Progress.task_id.in_(task_ids))
        .all()
        if task_ids
        else []
    )
    progress_map = {row.task_id: row for row in progress_rows}

    result = []
    for task in tasks:
        progress = progress_map.get(task.id)
        result.append(
            {
                "id": task.id,
                "title": task.title,
                "order_index": task.order_index,
                "is_done": bool(progress.is_done) if progress else False,
                "done_at": progress.done_at if progress and progress.is_done else None,
            }
        )
    return result


def upsert_progress(db: Session, student_id: int, task_id: int, is_done: bool) -> Progress:
    progress = (
        db.query(Progress)
        .filter(Progress.student_id == student_id, Progress.task_id == task_id)
        .first()
    )
    now = datetime.now(timezone.utc)

    if progress is None:
        progress = Progress(
            student_id=student_id,
            task_id=task_id,
            is_done=is_done,
            done_at=now if is_done else None,
        )
        db.add(progress)
    else:
        progress.is_done = is_done
        progress.done_at = now if is_done else None

    db.commit()
    db.refresh(progress)
    return progress


def is_textbook_assigned_to_student(db: Session, textbook_id: int, student_id: int) -> bool:
    return (
        db.query(MathStudentTextbook)
        .filter(
            MathStudentTextbook.student_id == student_id,
            MathStudentTextbook.textbook_id == textbook_id,
            MathStudentTextbook.is_active.is_(True),
        )
        .first()
        is not None
    )


def get_textbook_progress(db: Session, student_id: int, textbook_key: str) -> Optional[dict]:
    textbook = get_textbook_by_key(db, textbook_key)
    if textbook is None:
        return None

    items = (
        db.query(MathTextbookItem)
        .filter(MathTextbookItem.textbook_id == textbook.id, MathTextbookItem.is_active.is_(True))
        .order_by(MathTextbookItem.order_index, MathTextbookItem.id)
        .all()
    )
    item_ids = [item.id for item in items]
    progress_rows = (
        db.query(MathStudentItemProgress)
        .filter(
            MathStudentItemProgress.student_id == student_id,
            MathStudentItemProgress.item_id.in_(item_ids),
        )
        .all()
        if item_ids
        else []
    )
    progress_map = {row.item_id: row for row in progress_rows}

    item_payloads = []
    summary = {
        "total": len(items),
        "done": 0,
        "partial": 0,
        "not_started": 0,
    }

    for item in items:
        status = progress_map.get(item.id).status if item.id in progress_map else "not_started"
        if status not in ITEM_PROGRESS_STATUSES:
            status = "not_started"
        summary[status] += 1
        item_payloads.append(
            {
                "id": item.id,
                "item_number": item.item_number,
                "title": item.title,
                "status": status,
            }
        )

    return {
        "textbook": {
            "id": textbook.id,
            "key": textbook_key,
            "subject": textbook.subject,
            "title": textbook.title,
            "full_title": textbook.full_title,
            "problem_count": len(items),
        },
        "summary": summary,
        "items": item_payloads,
    }


def upsert_student_item_progress(
    db: Session,
    student_id: int,
    item_id: int,
    status: str,
) -> MathStudentItemProgress:
    progress = (
        db.query(MathStudentItemProgress)
        .filter(
            MathStudentItemProgress.student_id == student_id,
            MathStudentItemProgress.item_id == item_id,
        )
        .first()
    )
    now = datetime.now(timezone.utc)

    if progress is None:
        progress = MathStudentItemProgress(
            student_id=student_id,
            item_id=item_id,
            status=status,
            updated_at=now,
        )
        db.add(progress)
    else:
        progress.status = status
        progress.updated_at = now

    db.commit()
    db.refresh(progress)
    return progress


def build_item_progress_bucket(done: int, partial: int, total: int) -> dict:
    if total == 0:
        return {
            "total": 0,
            "done": 0,
            "partial": 0,
            "not_started": 0,
            "progress_rate": 0,
        }

    not_started = total - done - partial
    return {
        "total": total,
        "done": done,
        "partial": partial,
        "not_started": max(not_started, 0),
        "progress_rate": round((done / total) * 100),
    }


def build_student_item_progress_summary(db: Session, student_id: int) -> dict:
    rows = (
        db.query(MathTextbookItem.id, MathTextbook.subject)
        .join(MathTextbook, MathTextbookItem.textbook_id == MathTextbook.id)
        .filter(
            MathTextbook.is_published.is_(True),
            MathTextbook.is_active.is_(True),
            MathTextbook.is_checkable.is_(True),
            MathTextbookItem.is_active.is_(True),
        )
        .all()
    )
    item_ids = [row.id for row in rows]
    progress_rows = (
        db.query(MathStudentItemProgress)
        .filter(
            MathStudentItemProgress.student_id == student_id,
            MathStudentItemProgress.item_id.in_(item_ids),
        )
        .all()
        if item_ids
        else []
    )
    progress_map = {row.item_id: row.status for row in progress_rows}

    overall = {"total": 0, "done": 0, "partial": 0}
    subjects = {
        subject: {"total": 0, "done": 0, "partial": 0}
        for subject in STUDENT_PROGRESS_SUMMARY_SUBJECTS
    }

    for row in rows:
        status = progress_map.get(row.id, "not_started")
        if status not in ITEM_PROGRESS_STATUSES:
            status = "not_started"

        overall["total"] += 1
        if status == "done":
            overall["done"] += 1
        elif status == "partial":
            overall["partial"] += 1

        if row.subject in subjects:
            subjects[row.subject]["total"] += 1
            if status == "done":
                subjects[row.subject]["done"] += 1
            elif status == "partial":
                subjects[row.subject]["partial"] += 1

    return {
        "student_id": student_id,
        "overall": build_item_progress_bucket(
            overall["done"],
            overall["partial"],
            overall["total"],
        ),
        "subjects": [
            {
                "subject": subject,
                **build_item_progress_bucket(
                    subject_counts["done"],
                    subject_counts["partial"],
                    subject_counts["total"],
                ),
            }
            for subject, subject_counts in subjects.items()
        ],
    }


def build_progress_tree(db: Session, student_id: int) -> Optional[dict]:
    student = get_student_by_id(db, student_id)
    if student is None:
        return None

    subjects = (
        db.query(Subject)
        .options(selectinload(Subject.units).selectinload(Unit.tasks))
        .order_by(Subject.order_index, Subject.id)
        .all()
    )
    progress_rows = db.query(Progress).filter(Progress.student_id == student_id).all()
    progress_map = {row.task_id: row for row in progress_rows}

    total_tasks = 0
    completed_tasks = 0
    subject_payloads = []

    for subject in subjects:
        subject_total = 0
        subject_completed = 0
        unit_payloads = []

        units = sorted(subject.units, key=lambda item: (item.order_index, item.id))
        for unit in units:
            unit_total = 0
            unit_completed = 0
            task_payloads = []

            tasks = sorted(unit.tasks, key=lambda item: (item.order_index, item.id))
            for task in tasks:
                progress = progress_map.get(task.id)
                is_done = bool(progress.is_done) if progress else False
                done_at = progress.done_at if progress and progress.is_done else None

                unit_total += 1
                subject_total += 1
                total_tasks += 1

                if is_done:
                    unit_completed += 1
                    subject_completed += 1
                    completed_tasks += 1

                task_payloads.append(
                    {
                        "id": task.id,
                        "title": task.title,
                        "order_index": task.order_index,
                        "is_done": is_done,
                        "done_at": done_at,
                    }
                )

            unit_payloads.append(
                {
                    "id": unit.id,
                    "name": unit.name,
                    "order_index": unit.order_index,
                    "total_tasks": unit_total,
                    "completed_tasks": unit_completed,
                    "progress_percentage": percentage(unit_completed, unit_total),
                    "tasks": task_payloads,
                }
            )

        subject_payloads.append(
            {
                "id": subject.id,
                "name": subject.name,
                "order_index": subject.order_index,
                "total_tasks": subject_total,
                "completed_tasks": subject_completed,
                "progress_percentage": percentage(subject_completed, subject_total),
                "units": unit_payloads,
            }
        )

    return {
        "student_id": student.id,
        "name": student.name,
        "grade": student.grade,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "progress_percentage": percentage(completed_tasks, total_tasks),
        "subjects": subject_payloads,
    }


def get_admin_student_list(db: Session) -> list[dict]:
    students = db.query(Student).order_by(Student.id).all()
    result = []

    for student in students:
        summary = build_progress_tree(db, student.id)
        result.append(
            {
                "id": student.id,
                "name": student.name,
                "phone": student.phone,
                "grade": student.grade,
                "total_tasks": summary["total_tasks"] if summary else 0,
                "completed_tasks": summary["completed_tasks"] if summary else 0,
                "progress_percentage": summary["progress_percentage"] if summary else 0.0,
            }
        )

    return result


# Textbook management CRUD

def get_textbook_series_list(db: Session) -> list[MathTextbookSeries]:
    return (
        db.query(MathTextbookSeries)
        .order_by(MathTextbookSeries.order_index, MathTextbookSeries.id)
        .all()
    )


def create_or_get_textbook_series(db: Session, data: dict) -> tuple[MathTextbookSeries, bool]:
    existing = (
        db.query(MathTextbookSeries)
        .filter(
            MathTextbookSeries.display_name == data["display_name"],
            MathTextbookSeries.type == data["type"],
        )
        .first()
    )
    if existing:
        return existing, False
    series = MathTextbookSeries(**data)
    db.add(series)
    db.commit()
    db.refresh(series)
    return series, True


def get_textbook_sections(db: Session, textbook_id: int) -> list[MathTextbookSection]:
    return (
        db.query(MathTextbookSection)
        .filter(MathTextbookSection.textbook_id == textbook_id)
        .order_by(MathTextbookSection.order_index, MathTextbookSection.id)
        .all()
    )


def replace_textbook_sections(db: Session, textbook_id: int, sections: list) -> list[MathTextbookSection]:
    db.query(MathTextbookSection).filter(MathTextbookSection.textbook_id == textbook_id).delete()
    for i, s in enumerate(sections):
        db.add(MathTextbookSection(
            textbook_id=textbook_id,
            unit_title=getattr(s, "unit_title", None),
            section_title=s.section_title,
            start_problem=getattr(s, "start_problem", None),
            end_problem=getattr(s, "end_problem", None),
            start_page=getattr(s, "start_page", None),
            end_page=getattr(s, "end_page", None),
            order_index=s.order_index if s.order_index != 0 else i,
            show_to_student=getattr(s, "show_to_student", True),
            use_for_homework=getattr(s, "use_for_homework", True),
        ))
    db.commit()
    return get_textbook_sections(db, textbook_id)


def create_textbook_with_items(db: Session, payload) -> MathTextbook:
    existing = db.query(MathTextbook).filter(MathTextbook.full_title == payload.full_title).first()
    if existing:
        raise ValueError(f"이미 존재하는 교재입니다: {payload.full_title}")

    legacy_subject = getattr(payload, "subject", None)
    canonical_subjects = []
    seen = set()
    for value in getattr(payload, "subjects", None) or []:
        canonical = normalize_textbook_subject(value)
        if canonical and canonical not in seen:
            seen.add(canonical)
            canonical_subjects.append(canonical)
    if not canonical_subjects:
        fallback = normalize_textbook_subject(legacy_subject)
        if fallback:
            canonical_subjects = [fallback]

    primary_subject = legacy_subject or (
        canonical_subject_to_legacy(canonical_subjects[0]) if canonical_subjects else None
    )

    textbook = MathTextbook(
        series_id=payload.series_id,
        textbook_key=getattr(payload, "textbook_key", None),
        subject=primary_subject,
        title=payload.title,
        full_title=payload.full_title,
        type=payload.type,
        structure_type=getattr(payload, "structure_type", "none"),
        is_checkable=payload.is_checkable,
        is_published=payload.is_published,
        is_active=payload.is_active,
        order_index=payload.order_index,
    )
    db.add(textbook)
    db.flush()

    for subject in canonical_subjects:
        db.add(MathTextbookSubject(textbook_id=textbook.id, subject=subject))

    for i in range(1, payload.item_count + 1):
        item = MathTextbookItem(
            textbook_id=textbook.id,
            item_number=i,
            title=f"{i}번",
            item_type="problem",
            order_index=i,
            is_active=True,
        )
        db.add(item)

    for i, s in enumerate(getattr(payload, "sections", [])):
        db.add(MathTextbookSection(
            textbook_id=textbook.id,
            unit_title=getattr(s, "unit_title", None),
            section_title=s.section_title,
            start_problem=getattr(s, "start_problem", None),
            end_problem=getattr(s, "end_problem", None),
            start_page=getattr(s, "start_page", None),
            end_page=getattr(s, "end_page", None),
            order_index=s.order_index if s.order_index != 0 else i,
            show_to_student=getattr(s, "show_to_student", True),
            use_for_homework=getattr(s, "use_for_homework", True),
        ))

    db.commit()
    db.refresh(textbook)
    return textbook


def update_textbook(db: Session, textbook_id: int, payload) -> Optional[MathTextbook]:
    textbook = db.query(MathTextbook).filter(MathTextbook.id == textbook_id).first()
    if textbook is None:
        return None

    update_data = payload.model_dump(exclude_unset=True)

    full_title = update_data.get("full_title")
    if full_title is not None:
        existing = (
            db.query(MathTextbook)
            .filter(
                MathTextbook.full_title == full_title,
                MathTextbook.id != textbook_id,
            )
            .first()
        )
        if existing:
            raise ValueError(f"이미 존재하는 교재입니다: {full_title}")

    if "textbook_key" in update_data:
        textbook_key = update_data["textbook_key"]
        if textbook_key:
            existing = (
                db.query(MathTextbook)
                .filter(
                    MathTextbook.textbook_key == textbook_key,
                    MathTextbook.id != textbook_id,
                )
                .first()
            )
            if existing:
                raise ValueError(f"이미 존재하는 교재 키입니다: {textbook_key}")

    subjects_input = update_data.pop("subjects", None)

    for field in [
        "subject",
        "title",
        "full_title",
        "textbook_key",
        "type",
        "is_checkable",
        "is_published",
        "is_active",
        "order_index",
    ]:
        if field in update_data:
            setattr(textbook, field, update_data[field])

    if subjects_input is not None:
        canonical_subjects = set_textbook_subjects(db, textbook.id, subjects_input)
        if "subject" not in update_data and canonical_subjects:
            textbook.subject = canonical_subject_to_legacy(canonical_subjects[0])

    db.commit()
    db.refresh(textbook)
    return textbook


def delete_textbook_soft(db: Session, textbook_id: int) -> bool:
    textbook = db.query(MathTextbook).filter(MathTextbook.id == textbook_id).first()
    if textbook is None:
        return False

    textbook.is_active = False
    db.commit()
    return True


def get_admin_textbook_list(db: Session) -> list[dict]:
    textbooks = (
        db.query(MathTextbook, MathTextbookSeries.korean_name)
        .join(MathTextbookSeries, MathTextbook.series_id == MathTextbookSeries.id)
        .order_by(MathTextbook.order_index, MathTextbook.id)
        .all()
    )

    item_counts = (
        db.query(MathTextbookItem.textbook_id, func.count(MathTextbookItem.id).label("cnt"))
        .filter(MathTextbookItem.is_active.is_(True))
        .group_by(MathTextbookItem.textbook_id)
        .all()
    )
    count_map = {row.textbook_id: row.cnt for row in item_counts}

    textbook_ids = [textbook.id for textbook, _ in textbooks]
    subject_rows = (
        db.query(MathTextbookSubject.textbook_id, MathTextbookSubject.subject)
        .filter(MathTextbookSubject.textbook_id.in_(textbook_ids))
        .order_by(MathTextbookSubject.id)
        .all()
        if textbook_ids
        else []
    )
    subjects_map: dict[int, list[str]] = {}
    for row in subject_rows:
        subjects_map.setdefault(row.textbook_id, []).append(row.subject)

    return [
        {
            "id": textbook.id,
            "series_id": textbook.series_id,
            "series_name": series_name,
            "subject": textbook.subject,
            "subjects": subjects_map.get(textbook.id, []),
            "title": textbook.title,
            "full_title": textbook.full_title,
            "type": textbook.type,
            "is_checkable": textbook.is_checkable,
            "is_published": textbook.is_published,
            "is_active": textbook.is_active,
            "is_student_only": textbook.is_student_only,
            "item_count": count_map.get(textbook.id, 0),
            "order_index": textbook.order_index,
            "created_at": textbook.created_at,
        }
        for textbook, series_name in textbooks
    ]


def get_textbook_detail_admin(db: Session, textbook_id: int) -> Optional[dict]:
    result = (
        db.query(MathTextbook, MathTextbookSeries.korean_name)
        .join(MathTextbookSeries, MathTextbook.series_id == MathTextbookSeries.id)
        .filter(MathTextbook.id == textbook_id)
        .first()
    )
    if result is None:
        return None

    textbook, series_name = result
    items = (
        db.query(MathTextbookItem)
        .filter(MathTextbookItem.textbook_id == textbook_id)
        .order_by(MathTextbookItem.order_index, MathTextbookItem.id)
        .all()
    )
    sections = get_textbook_sections(db, textbook_id)

    return {
        "id": textbook.id,
        "series_id": textbook.series_id,
        "series_name": series_name,
        "textbook_key": textbook.textbook_key,
        "subject": textbook.subject,
        "subjects": get_textbook_subjects(db, textbook_id),
        "title": textbook.title,
        "full_title": textbook.full_title,
        "type": textbook.type,
        "structure_type": getattr(textbook, "structure_type", "none") or "none",
        "is_checkable": textbook.is_checkable,
        "is_published": textbook.is_published,
        "is_active": textbook.is_active,
        "is_student_only": textbook.is_student_only,
        "order_index": textbook.order_index,
        "item_count": len(items),
        "items": [
            {
                "id": item.id,
                "item_number": item.item_number,
                "title": item.title,
                "item_type": item.item_type,
                "is_active": item.is_active,
            }
            for item in items
        ],
        "sections": [
            {
                "id": s.id,
                "textbook_id": s.textbook_id,
                "unit_title": s.unit_title,
                "section_title": s.section_title,
                "start_problem": s.start_problem,
                "end_problem": s.end_problem,
                "start_page": s.start_page,
                "end_page": s.end_page,
                "order_index": s.order_index,
                "show_to_student": s.show_to_student,
                "use_for_homework": s.use_for_homework,
            }
            for s in sections
        ],
    }


# ── Student textbook assignment ──────────────────────────────────────────────

def get_student_textbook_ids(db: Session, student_id: int) -> list[int]:
    rows = (
        db.query(MathStudentTextbook.textbook_id)
        .filter(
            MathStudentTextbook.student_id == student_id,
            MathStudentTextbook.is_active.is_(True),
        )
        .all()
    )
    return [r.textbook_id for r in rows]


def get_textbook_assignments(db: Session, textbook_id: int) -> list[dict]:
    rows = (
        db.query(MathStudentTextbook, Student)
        .join(Student, MathStudentTextbook.student_id == Student.id)
        .filter(MathStudentTextbook.textbook_id == textbook_id)
        .order_by(MathStudentTextbook.assigned_at)
        .all()
    )
    return [
        {
            "student_id": assignment.student_id,
            "student_name": student.name,
            "student_grade": student.grade,
            "is_active": assignment.is_active,
            "assigned_at": assignment.assigned_at,
        }
        for assignment, student in rows
    ]


def assign_student_textbook(db: Session, textbook_id: int, student_id: int) -> None:
    existing = (
        db.query(MathStudentTextbook)
        .filter(
            MathStudentTextbook.textbook_id == textbook_id,
            MathStudentTextbook.student_id == student_id,
        )
        .first()
    )
    if existing:
        existing.is_active = True
    else:
        db.add(MathStudentTextbook(student_id=student_id, textbook_id=textbook_id, is_active=True))
    db.commit()


def unassign_student_textbook(db: Session, textbook_id: int, student_id: int) -> None:
    existing = (
        db.query(MathStudentTextbook)
        .filter(
            MathStudentTextbook.textbook_id == textbook_id,
            MathStudentTextbook.student_id == student_id,
        )
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()


def set_textbook_student_only(db: Session, textbook_id: int, is_student_only: bool) -> bool:
    textbook = db.query(MathTextbook).filter(MathTextbook.id == textbook_id).first()
    if textbook is None:
        return False
    textbook.is_student_only = is_student_only
    db.commit()
    return True


def get_textbooks_for_student_catalog(db: Session, student_id: int) -> dict:
    assigned_ids = get_student_textbook_ids(db, student_id)
    if assigned_ids:
        visibility = or_(
            and_(MathTextbook.is_student_only.is_(False), MathTextbook.is_published.is_(True)),
            MathTextbook.id.in_(assigned_ids),
        )
    else:
        visibility = and_(MathTextbook.is_student_only.is_(False), MathTextbook.is_published.is_(True))

    checkable_textbooks = (
        db.query(MathTextbook)
        .filter(
            MathTextbook.is_active.is_(True),
            visibility,
        )
        .order_by(MathTextbook.order_index, MathTextbook.id)
        .all()
    )

    result = []
    for textbook in checkable_textbooks:
        textbook_key = resolve_textbook_key(textbook)
        if textbook_key is None:
            continue
        items = (
            db.query(MathTextbookItem)
            .filter(
                MathTextbookItem.textbook_id == textbook.id,
                MathTextbookItem.is_active.is_(True),
            )
            .order_by(MathTextbookItem.item_number)
            .all()
        )
        if not items:
            continue
        item_numbers = [item.item_number for item in items]
        result.append(
            {
                "id": textbook.id,
                "textbook_key": textbook_key,
                "title": textbook.full_title,
                "short_title": build_textbook_short_title(textbook.full_title),
                "category": textbook.subject,
                "subject": textbook.subject,
                "min_item_number": min(item_numbers),
                "max_item_number": max(item_numbers),
                "total_items": len(items),
                "is_active": textbook.is_active,
                "is_checkable": textbook.is_checkable,
                "is_student_only": textbook.is_student_only,
            }
        )

    return {"textbooks": result}
