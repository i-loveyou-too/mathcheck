import math
from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from models import (
    Admin,
    HomeworkAssignment,
    LectureAssignment,
    MathDailyTask,
    MathStudentItemProgress,
    MathStudentLectureProgress,
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
    "수학Ⅰ": "수학 I",
    "수학 Ⅰ": "수학 I",
    "수2": "수학 II",
    "수학2": "수학 II",
    "수학II": "수학 II",
    "수학 II": "수학 II",
    "수학Ⅱ": "수학 II",
    "수학 Ⅱ": "수학 II",
    "확통": "확률과 통계",
    "확률과통계": "확률과 통계",
    "확률과 통계": "확률과 통계",
}

# Space-insensitive fallback lookup: legacy `subject` values were free-typed over time, so
# "수학I" / "수학 I" / "수학  I" must all resolve to the same canonical tag regardless of
# whichever exact spacing ended up on a given row.
_LEGACY_SUBJECT_TO_CANONICAL_COMPACT = {
    key.replace(" ", ""): value for key, value in _LEGACY_SUBJECT_TO_CANONICAL.items()
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
    if key in _LEGACY_SUBJECT_TO_CANONICAL:
        return _LEGACY_SUBJECT_TO_CANONICAL[key]
    return _LEGACY_SUBJECT_TO_CANONICAL_COMPACT.get(key.replace(" ", ""), key)


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


def is_completed_within_deadline(
    status: str, completed_at: Optional[datetime], task_date: date
) -> bool:
    if status != "done" or completed_at is None:
        return False

    completed_at = to_kst_datetime(completed_at)
    if completed_at is None:
        return False

    day_start, deadline = get_task_completion_window(task_date)
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


def repair_textbook_subject_tags(db: Session) -> None:
    """Re-normalize `MathTextbookSubject` rows written before Roman-numeral/whitespace
    variants (e.g. "수학Ⅰ") were added to `_LEGACY_SUBJECT_TO_CANONICAL` — those rows are
    already "tagged" so `backfill_textbook_subjects` skips them forever, leaving them
    permanently invisible to canonical-subject lookups like `get_active_textbooks_by_subject`.
    """
    rows = db.query(MathTextbookSubject).all()
    existing_by_textbook: dict[int, set[str]] = {}
    for row in rows:
        existing_by_textbook.setdefault(row.textbook_id, set()).add(row.subject)

    changed = False
    for row in rows:
        if row.subject in TEXTBOOK_SUBJECT_OPTIONS:
            continue
        canonical = normalize_textbook_subject(row.subject)
        if canonical == row.subject or canonical not in TEXTBOOK_SUBJECT_OPTIONS:
            continue
        if canonical in existing_by_textbook.get(row.textbook_id, set()):
            # Correct tag already exists on this textbook — drop the stale duplicate.
            db.delete(row)
        else:
            existing_by_textbook[row.textbook_id].discard(row.subject)
            existing_by_textbook[row.textbook_id].add(canonical)
            row.subject = canonical
        changed = True

    if changed:
        db.commit()


# Single policy shared by every student-facing textbook endpoint (list, detail, sections,
# progress, progress-summary): a textbook is visible to a student iff it's active/published/
# checkable, and either public (is_student_only=False) or actively assigned to that student.
# Listing, detail lookup, and the progress-rate denominator must never disagree on this set.
def get_visible_textbook_ids(db: Session, student_id: int) -> list[int]:
    assigned_ids = get_student_textbook_ids(db, student_id)

    visibility = (
        or_(
            MathTextbook.is_student_only.is_(False),
            MathTextbook.id.in_(assigned_ids),
        )
        if assigned_ids
        else MathTextbook.is_student_only.is_(False)
    )

    return [
        row.id
        for row in db.query(MathTextbook.id).filter(
            visibility,
            MathTextbook.is_published.is_(True),
            MathTextbook.is_active.is_(True),
            MathTextbook.is_checkable.is_(True),
        )
    ]


def is_textbook_visible_to_student(db: Session, textbook: MathTextbook, student_id: int) -> bool:
    if not (textbook.is_active and textbook.is_published and textbook.is_checkable):
        return False
    if not textbook.is_student_only:
        return True
    return is_textbook_assigned_to_student(db, textbook.id, student_id)


def get_active_textbooks_by_subject(db: Session, subject: str, student_id: int) -> list[dict]:
    visible_ids = get_visible_textbook_ids(db, student_id)
    if not visible_ids:
        return []

    canonical_subject = normalize_textbook_subject(subject)
    tagged_textbook_ids = db.query(MathTextbookSubject.textbook_id).filter(
        MathTextbookSubject.subject == canonical_subject
    )

    textbooks = (
        db.query(MathTextbook)
        .filter(
            MathTextbook.id.in_(tagged_textbook_ids),
            MathTextbook.id.in_(visible_ids),
        )
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


def get_student_textbook_by_key(db: Session, textbook_key: str, student_id: int) -> Optional[dict]:
    textbook = get_textbook_by_key(db, textbook_key)
    if textbook is None:
        return None

    if not is_textbook_visible_to_student(db, textbook, student_id):
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


def resolve_task_statuses(
    db: Session, tasks: list[MathDailyTask]
) -> dict[int, dict]:
    """{"status", "completed_at", "progress_rate"} per task, derived from
    MathStudentItemProgress for any task with completion_mode="item_progress" — those tasks
    never store their own completion directly (see `update_daily_task`'s guard), so every
    reader must go through here instead of trusting `task.status`/`task.completed_at` for
    that subset. `progress_rate` is the fractional item-completion percentage for item tasks,
    or a plain 0/100 for status-based (manual) tasks.
    """
    result: dict[int, dict] = {
        task.id: {
            "status": task.status,
            "completed_at": task.completed_at,
            "progress_rate": 100 if task.status == "done" else 0,
        }
        for task in tasks
    }

    lecture_tasks = [
        task
        for task in tasks
        if task.source_type == "lecture"
        and task.lecture_start_number is not None
        and task.lecture_end_number is not None
    ]
    if lecture_tasks:
        lecture_task_ids = [task.id for task in lecture_tasks]
        lecture_progress_rows = (
            db.query(MathStudentLectureProgress)
            .filter(MathStudentLectureProgress.daily_task_id.in_(lecture_task_ids))
            .all()
        )
        lecture_progress_by_task: dict[int, dict[int, MathStudentLectureProgress]] = {}
        for row in lecture_progress_rows:
            lecture_progress_by_task.setdefault(row.daily_task_id, {})[row.lecture_number] = row

        for task in lecture_tasks:
            start = task.lecture_start_number
            end = task.lecture_end_number
            if start is None or end is None or end < start:
                continue

            lecture_numbers = list(range(start, end + 1))
            progress_map = lecture_progress_by_task.get(task.id, {})
            done_rows = [
                progress_map[number]
                for number in lecture_numbers
                if progress_map.get(number) is not None and progress_map[number].is_done
            ]
            done_count = len(done_rows)

            if done_count == len(lecture_numbers):
                completed_at = max((row.updated_at for row in done_rows), default=None)
                result[task.id] = {
                    "status": "done",
                    "completed_at": completed_at,
                    "progress_rate": 100,
                }
            elif done_count > 0:
                result[task.id] = {
                    "status": "in_progress",
                    "completed_at": None,
                    "progress_rate": round((done_count / len(lecture_numbers)) * 100),
                }
            else:
                result[task.id] = {"status": "todo", "completed_at": None, "progress_rate": 0}

    item_tasks = [t for t in tasks if t.completion_mode == "item_progress"]
    if not item_tasks:
        return result

    textbook_ids = {t.textbook_id for t in item_tasks if t.textbook_id is not None}
    items = (
        db.query(MathTextbookItem)
        .filter(
            MathTextbookItem.textbook_id.in_(textbook_ids),
            MathTextbookItem.is_active.is_(True),
        )
        .all()
        if textbook_ids
        else []
    )
    items_by_textbook: dict[int, list[MathTextbookItem]] = {}
    for item in items:
        items_by_textbook.setdefault(item.textbook_id, []).append(item)

    all_item_ids = [item.id for item in items]
    student_id = item_tasks[0].student_id
    progress_rows = (
        db.query(MathStudentItemProgress)
        .filter(
            MathStudentItemProgress.student_id == student_id,
            MathStudentItemProgress.item_id.in_(all_item_ids),
        )
        .all()
        if all_item_ids
        else []
    )
    progress_by_item = {row.item_id: row for row in progress_rows}

    for task in item_tasks:
        candidate_items = [
            item
            for item in items_by_textbook.get(task.textbook_id, [])
            if task.start_value is not None
            and task.end_value is not None
            and task.start_value <= item.item_number <= task.end_value
        ]
        if not candidate_items:
            result[task.id] = {"status": "todo", "completed_at": None, "progress_rate": 0}
            continue

        progress_for_items = [progress_by_item.get(item.id) for item in candidate_items]
        completed_count = sum(
            1 for row in progress_for_items if row and row.status != "not_started"
        )
        any_progress = completed_count > 0
        progress_rate = round((completed_count / len(candidate_items)) * 100)

        if completed_count == len(candidate_items):
            completed_at = max(
                (
                    row.updated_at
                    for row in progress_for_items
                    if row and row.status != "not_started"
                ),
                default=None,
            )
            result[task.id] = {
                "status": "done",
                "completed_at": completed_at,
                "progress_rate": 100,
            }
        elif any_progress:
            result[task.id] = {
                "status": "in_progress",
                "completed_at": None,
                "progress_rate": progress_rate,
            }
        else:
            result[task.id] = {"status": "todo", "completed_at": None, "progress_rate": 0}

    return result


def build_daily_task_summary(db: Session, tasks: list[MathDailyTask]) -> dict:
    resolved = resolve_task_statuses(db, tasks)
    total = len(tasks)
    done = sum(1 for task in tasks if resolved[task.id]["status"] == "done")
    todo = total - done

    return {
        "total": total,
        "done": done,
        "todo": todo,
        "completion_rate": round((done / total) * 100) if total else 0,
    }


def serialize_lecture_task_items(db: Session, task: MathDailyTask) -> list[dict]:
    if (
        task.source_type != "lecture"
        or task.lecture_start_number is None
        or task.lecture_end_number is None
        or task.lecture_end_number < task.lecture_start_number
    ):
        return []

    progress_rows = (
        db.query(MathStudentLectureProgress)
        .filter(MathStudentLectureProgress.daily_task_id == task.id)
        .all()
    )
    progress_map = {row.lecture_number: row for row in progress_rows}

    return [
        {
            "lecture_number": lecture_number,
            "title": f"{lecture_number}강",
            "is_done": bool(progress_map.get(lecture_number).is_done)
            if progress_map.get(lecture_number) is not None
            else False,
            "updated_at": progress_map.get(lecture_number).updated_at
            if progress_map.get(lecture_number) is not None
            else None,
        }
        for lecture_number in range(task.lecture_start_number, task.lecture_end_number + 1)
    ]


def serialize_daily_task(db: Session, task: MathDailyTask) -> dict:
    textbook = None
    if task.textbook is not None:
        textbook = {
            "id": task.textbook.id,
            "subject": task.textbook.subject,
            "title": task.textbook.title,
            "full_title": task.textbook.full_title,
        }

    resolved = resolve_task_statuses(db, [task])[task.id]
    due_date = None
    if task.homework_assignment is not None:
        due_date = task.homework_assignment.due_date
    elif task.lecture_assignment is not None:
        due_date = task.lecture_assignment.due_date
    start_item_number = task.start_item_number
    end_item_number = task.end_item_number

    if task.range_type == "item":
        if start_item_number is None:
            start_item_number = task.start_value
        if end_item_number is None:
            end_item_number = task.end_value

    return {
        "id": task.id,
        "title": task.title,
        "detail": task.detail,
        "task_date": task.task_date,
        "textbook_id": task.textbook_id,
        "textbook_key": task.textbook_key,
        "start_item_number": start_item_number,
        "end_item_number": end_item_number,
        "range_type": task.range_type,
        "completion_mode": task.completion_mode,
        "progress_rate": resolved["progress_rate"],
        "due_date": due_date,
        "status": resolved["status"],
        "difficulty": task.difficulty,
        "category": task.category,
        "order_index": task.order_index,
        "completed_at": resolved["completed_at"],
        "textbook": textbook,
        "lecture_items": serialize_lecture_task_items(db, task),
        "source_type": task.source_type,
        "lecture_assignment_id": task.lecture_assignment_id,
        "lecture_start_number": task.lecture_start_number,
        "lecture_end_number": task.lecture_end_number,
    }


def get_student_daily_tasks(db: Session, student_id: int, task_date: date) -> dict:
    tasks = (
        db.query(MathDailyTask)
        .options(
            selectinload(MathDailyTask.textbook),
            selectinload(MathDailyTask.homework_assignment),
            selectinload(MathDailyTask.lecture_assignment),
        )
        .filter(MathDailyTask.student_id == student_id, MathDailyTask.task_date == task_date)
        .order_by(MathDailyTask.order_index, MathDailyTask.id)
        .all()
    )

    return {
        "student_id": student_id,
        "date": task_date,
        "summary": build_daily_task_summary(db, tasks),
        "tasks": [serialize_daily_task(db, task) for task in tasks],
    }


def get_student_weekly_tasks(db: Session, student_id: int, week_start: date) -> dict:
    week_end = week_start + timedelta(days=6)
    tasks = (
        db.query(MathDailyTask)
        .options(
            selectinload(MathDailyTask.textbook),
            selectinload(MathDailyTask.homework_assignment),
            selectinload(MathDailyTask.lecture_assignment),
        )
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
                "summary": build_daily_task_summary(db, day_tasks),
                "tasks": [serialize_daily_task(db, task) for task in day_tasks],
            }
        )

    return {
        "student_id": student_id,
        "week_start": week_start,
        "days": days,
    }


def build_task_day_bucket(db: Session, task_date: date, tasks: list[MathDailyTask]) -> dict:
    resolved = resolve_task_statuses(db, tasks)
    total = len(tasks)
    done = sum(1 for task in tasks if resolved[task.id]["status"] == "done")
    todo = total - done
    has_tasks = total > 0
    is_completed = has_tasks and all(
        is_completed_within_deadline(
            resolved[task.id]["status"], resolved[task.id]["completed_at"], task.task_date
        )
        for task in tasks
    )

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
            db,
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
        task_day = build_task_day_bucket(db, task_date, streak_tasks_by_date[task_date])
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


def get_week_start(d: date) -> date:
    """Monday of the calendar week containing `d` — matches the Monday-start convention the
    frontend already uses (`getMondayOf`/`getLocalWeekStart`) for the existing weekly views.
    """
    return d - timedelta(days=d.weekday())


def describe_task_range(task: MathDailyTask) -> Optional[str]:
    if task.range_type == "item" and task.start_value is not None and task.end_value is not None:
        return f"{task.start_value}~{task.end_value}번"
    if task.range_type == "page" and task.start_page is not None and task.end_page is not None:
        return f"{task.start_page}~{task.end_page}페이지"
    if task.range_type == "section" and task.textbook_section is not None:
        return task.textbook_section.section_title
    return None


def build_student_homework_task_card(
    task: MathDailyTask, resolved: dict, today: date
) -> dict:
    info = resolved[task.id]
    due_date = (
        task.homework_assignment.due_date if task.homework_assignment is not None else None
    )
    textbook_title = task.textbook.full_title if task.textbook is not None else None

    return {
        "id": task.id,
        "title": task.title,
        "detail": task.detail,
        "task_date": task.task_date,
        "due_date": due_date,
        "textbook_id": task.textbook_id,
        "textbook_key": task.textbook_key,
        "textbook_title": textbook_title,
        "range_type": task.range_type,
        "range_label": describe_task_range(task),
        "source_type": task.source_type,
        "completion_mode": task.completion_mode,
        "status": info["status"],
        "progress_rate": info["progress_rate"],
        "is_overdue": task.task_date < today and info["status"] != "done",
    }


def get_student_today_tasks(db: Session, student_id: int, today: date) -> dict:
    """밀린 할 일 / 오늘 할 일 / 이번 주 할 일 buckets for homework-generated tasks only —
    manual tasks keep using the existing `/student/daily-tasks` and `/student/weekly-tasks`
    views untouched. `overdue_tasks` has no lower date bound by design (see project memory):
    a homework task only ever leaves "overdue" by being completed, never by aging out.
    """
    week_end = get_week_start(today) + timedelta(days=6)

    tasks = (
        db.query(MathDailyTask)
        .options(
            selectinload(MathDailyTask.textbook),
            selectinload(MathDailyTask.textbook_section),
            selectinload(MathDailyTask.homework_assignment),
        )
        .filter(
            MathDailyTask.student_id == student_id,
            MathDailyTask.source_type == "homework",
            MathDailyTask.task_date <= week_end,
        )
        .order_by(MathDailyTask.task_date, MathDailyTask.id)
        .all()
    )

    resolved = resolve_task_statuses(db, tasks)

    overdue_tasks = []
    today_tasks = []
    week_tasks = []

    for task in tasks:
        card = build_student_homework_task_card(task, resolved, today)

        if task.task_date < today:
            if card["status"] != "done":
                overdue_tasks.append(card)
        elif task.task_date == today:
            today_tasks.append(card)

        if today <= task.task_date <= week_end:
            week_tasks.append(card)

    return {
        "student_id": student_id,
        "today": today,
        "week_end": week_end,
        "overdue_tasks": overdue_tasks,
        "today_tasks": today_tasks,
        "week_tasks": week_tasks,
    }


def build_admin_homework_task_detail(task: MathDailyTask, resolved: dict) -> dict:
    info = resolved[task.id]
    due_date = (
        task.homework_assignment.due_date if task.homework_assignment is not None else None
    )
    textbook_title = task.textbook.full_title if task.textbook is not None else None

    return {
        "id": task.id,
        "title": task.title,
        "textbook_title": textbook_title,
        "range_label": describe_task_range(task),
        "task_date": task.task_date,
        "due_date": due_date,
        "progress_rate": info["progress_rate"],
        "status": info["status"],
        "memo": task.detail,
    }


def get_admin_homework_dashboard(db: Session, target_date: date) -> dict:
    students = db.query(Student).order_by(Student.id).all()
    if not students:
        return {"date": target_date, "students": []}

    week_end = get_week_start(target_date) + timedelta(days=6)
    student_ids = [student.id for student in students]
    tasks = (
        db.query(MathDailyTask)
        .options(
            selectinload(MathDailyTask.textbook),
            selectinload(MathDailyTask.textbook_section),
            selectinload(MathDailyTask.homework_assignment),
        )
        .filter(
            MathDailyTask.student_id.in_(student_ids),
            MathDailyTask.source_type == "homework",
            MathDailyTask.task_date <= week_end,
        )
        .order_by(MathDailyTask.student_id, MathDailyTask.task_date, MathDailyTask.id)
        .all()
    )

    tasks_by_student: dict[int, list[MathDailyTask]] = {student.id: [] for student in students}
    for task in tasks:
        tasks_by_student.setdefault(task.student_id, []).append(task)

    rows = []
    for student in students:
        student_tasks = tasks_by_student.get(student.id, [])
        resolved = resolve_task_statuses(db, student_tasks)

        today_total = 0
        today_completed = 0
        overdue_count = 0
        week_total = 0
        week_completed = 0

        for task in student_tasks:
            status = resolved[task.id]["status"]
            if task.task_date < target_date and status != "done":
                overdue_count += 1
            if task.task_date == target_date:
                today_total += 1
                if status == "done":
                    today_completed += 1
            if target_date <= task.task_date <= week_end:
                week_total += 1
                if status == "done":
                    week_completed += 1

        rows.append(
            {
                "student_id": student.id,
                "name": student.name,
                "today_total": today_total,
                "today_completed": today_completed,
                "today_completion_rate": round((today_completed / today_total) * 100)
                if today_total
                else 0,
                "overdue_count": overdue_count,
                "week_total": week_total,
                "week_completed": week_completed,
            }
        )

    return {"date": target_date, "students": rows}


def get_admin_student_homework(db: Session, student_id: int, target_date: date) -> dict:
    week_end = get_week_start(target_date) + timedelta(days=6)
    tasks = (
        db.query(MathDailyTask)
        .options(
            selectinload(MathDailyTask.textbook),
            selectinload(MathDailyTask.textbook_section),
            selectinload(MathDailyTask.homework_assignment),
        )
        .filter(
            MathDailyTask.student_id == student_id,
            MathDailyTask.source_type == "homework",
            MathDailyTask.task_date <= week_end,
        )
        .order_by(MathDailyTask.task_date, MathDailyTask.id)
        .all()
    )

    resolved = resolve_task_statuses(db, tasks)
    overdue_tasks = []
    today_tasks = []
    week_tasks = []

    for task in tasks:
        detail = build_admin_homework_task_detail(task, resolved)
        status = resolved[task.id]["status"]

        if task.task_date < target_date and status != "done":
            overdue_tasks.append(detail)
        elif task.task_date == target_date:
            today_tasks.append(detail)

        if target_date <= task.task_date <= week_end:
            week_tasks.append(detail)

    return {
        "student_id": student_id,
        "date": target_date,
        "overdue_tasks": overdue_tasks,
        "today_tasks": today_tasks,
        "week_tasks": week_tasks,
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

    if "status" in update_data and task.completion_mode == "item_progress":
        raise ValueError(
            "이 숙제는 문항 진도 체크로만 완료 처리됩니다. 상태를 직접 변경할 수 없습니다."
        )

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


def update_lecture_task_progress(
    db: Session,
    task: MathDailyTask,
    lecture_number: int,
    is_done: bool,
) -> MathDailyTask:
    if (
        task.source_type != "lecture"
        or task.lecture_start_number is None
        or task.lecture_end_number is None
    ):
        raise ValueError("This task does not support lecture-item progress.")
    if lecture_number < task.lecture_start_number or lecture_number > task.lecture_end_number:
        raise ValueError("lecture_number is out of range for this task.")

    progress = (
        db.query(MathStudentLectureProgress)
        .filter(
            MathStudentLectureProgress.student_id == task.student_id,
            MathStudentLectureProgress.daily_task_id == task.id,
            MathStudentLectureProgress.lecture_number == lecture_number,
        )
        .first()
    )

    now = now_kst()
    if progress is None:
        progress = MathStudentLectureProgress(
            student_id=task.student_id,
            daily_task_id=task.id,
            lecture_number=lecture_number,
            is_done=is_done,
            updated_at=now,
        )
        db.add(progress)
    else:
        progress.is_done = is_done
        progress.updated_at = now

    db.flush()

    rows = (
        db.query(MathStudentLectureProgress)
        .filter(MathStudentLectureProgress.daily_task_id == task.id)
        .all()
    )
    progress_map = {row.lecture_number: row for row in rows}
    lecture_numbers = list(range(task.lecture_start_number, task.lecture_end_number + 1))
    done_rows = [
        progress_map[number]
        for number in lecture_numbers
        if progress_map.get(number) is not None and progress_map[number].is_done
    ]
    done_count = len(done_rows)

    if done_count == len(lecture_numbers):
        task.status = "done"
        task.completed_at = max((row.updated_at for row in done_rows), default=now)
    elif done_count > 0:
        task.status = "in_progress"
        task.completed_at = None
    else:
        task.status = "todo"
        task.completed_at = None

    task.updated_at = now
    db.commit()
    db.refresh(task)
    return get_daily_task(db, task.id) or task


HOMEWORK_RANGE_TYPES = {"item", "page", "section", "custom"}
LECTURE_WEEKDAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
LECTURE_WEEKDAY_TO_INDEX = {value: index for index, value in enumerate(LECTURE_WEEKDAY_ORDER)}
HOMEWORK_CATEGORY = "숙제"


def _distribute_counts(total: int, days: int) -> list[int]:
    """Equitably split `total` units across `days` slots. Any remainder is handed to the
    earliest slots one at a time ("남는 문항/페이지는 앞 날짜부터 +1"). A slot can come out
    to 0 when there are fewer units than days — callers skip creating a task for those.
    """
    base, remainder = divmod(total, days)
    return [base + 1 if i < remainder else base for i in range(days)]


def normalize_lecture_weekdays(weekdays: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()

    for value in weekdays:
        weekday = value.strip().lower()
        if weekday not in LECTURE_WEEKDAY_TO_INDEX:
            raise ValueError(
                f"Invalid weekday: {value}. Use one of {', '.join(LECTURE_WEEKDAY_ORDER)}."
            )
        if weekday in seen:
            continue
        seen.add(weekday)
        normalized.append(weekday)

    return normalized


def preview_lecture_assignment(payload) -> dict:
    if payload.total_lectures <= 0:
        raise ValueError("total_lectures must be greater than 0.")
    if payload.start_lecture_no < 1:
        raise ValueError("start_lecture_no must be at least 1.")
    if payload.lectures_per_day <= 0:
        raise ValueError("lectures_per_day must be greater than 0.")
    if payload.start_date > payload.due_date:
        raise ValueError("start_date cannot be after due_date.")

    weekdays = normalize_lecture_weekdays(payload.weekdays)
    if not weekdays:
        raise ValueError("weekdays must not be empty.")

    total_lectures_to_assign = payload.total_lectures - payload.start_lecture_no + 1
    if total_lectures_to_assign <= 0:
        raise ValueError("total_lectures must be greater than or equal to start_lecture_no.")

    allowed_indexes = {LECTURE_WEEKDAY_TO_INDEX[value] for value in weekdays}
    available_dates: list[date] = []
    cursor = payload.start_date
    while cursor <= payload.due_date:
        if cursor.weekday() in allowed_indexes:
            available_dates.append(cursor)
        cursor += timedelta(days=1)

    available_days_count = len(available_dates)
    required_days_count = math.ceil(total_lectures_to_assign / payload.lectures_per_day)
    max_assignable_lectures = available_days_count * payload.lectures_per_day
    shortage_count = max(total_lectures_to_assign - max_assignable_lectures, 0)
    recommended_lectures_per_day = (
        math.ceil(total_lectures_to_assign / available_days_count) if available_days_count > 0 else 0
    )

    if shortage_count > 0:
        return {
            "possible": False,
            "total_lectures_to_assign": total_lectures_to_assign,
            "available_days_count": available_days_count,
            "required_days_count": required_days_count,
            "max_assignable_lectures": max_assignable_lectures,
            "shortage_count": shortage_count,
            "recommended_lectures_per_day": recommended_lectures_per_day,
            "preview_items": [],
        }

    preview_items = []
    remaining = total_lectures_to_assign
    next_lecture_no = payload.start_lecture_no

    for available_date in available_dates:
        if remaining <= 0:
            break
        count = min(payload.lectures_per_day, remaining)
        end_lecture_no = next_lecture_no + count - 1
        preview_items.append(
            {
                "date": available_date,
                "start_lecture_no": next_lecture_no,
                "end_lecture_no": end_lecture_no,
                "count": count,
            }
        )
        next_lecture_no = end_lecture_no + 1
        remaining -= count

    return {
        "possible": True,
        "total_lectures_to_assign": total_lectures_to_assign,
        "available_days_count": available_days_count,
        "required_days_count": required_days_count,
        "max_assignable_lectures": max_assignable_lectures,
        "shortage_count": 0,
        "recommended_lectures_per_day": recommended_lectures_per_day,
        "preview_items": preview_items,
    }


def serialize_lecture_assignment(assignment: LectureAssignment) -> dict:
    weekdays = [value for value in (assignment.weekdays or "").split(",") if value]
    return {
        "id": assignment.id,
        "student_id": assignment.student_id,
        "subject": assignment.subject,
        "course_title": assignment.course_title,
        "total_lectures": assignment.total_lectures,
        "start_lecture_no": assignment.start_lecture_no,
        "lectures_per_day": assignment.lectures_per_day,
        "weekdays": weekdays,
        "start_date": assignment.start_date,
        "due_date": assignment.due_date,
        "memo": assignment.memo,
        "status": assignment.status,
        "created_at": assignment.created_at,
    }


def build_lecture_daily_tasks(
    assignment: LectureAssignment,
    preview_items: list[dict],
) -> list[MathDailyTask]:
    tasks: list[MathDailyTask] = []

    for index, item in enumerate(preview_items):
        title = f"{assignment.course_title} {item['start_lecture_no']}~{item['end_lecture_no']}강"
        detail_parts = [assignment.subject]
        if assignment.memo:
            detail_parts.append(assignment.memo)

        tasks.append(
            MathDailyTask(
                student_id=assignment.student_id,
                task_date=item["date"],
                title=title,
                detail=" / ".join(part for part in detail_parts if part),
                status="todo",
                category=None,
                order_index=index,
                source_type="lecture",
                lecture_assignment_id=assignment.id,
                lecture_start_number=item["start_lecture_no"],
                lecture_end_number=item["end_lecture_no"],
                completion_mode="manual",
            )
        )

    return tasks


def create_lecture_assignment(db: Session, payload) -> dict:
    student = get_student_by_id(db, payload.student_id)
    if student is None:
        raise ValueError("Student not found.")

    if not payload.subject.strip():
        raise ValueError("subject must not be empty.")
    if not payload.course_title.strip():
        raise ValueError("course_title must not be empty.")

    preview = preview_lecture_assignment(payload)
    if not preview["possible"]:
        raise ValueError("현재 조건으로는 인강 배정을 완료할 수 없습니다.")

    weekdays = normalize_lecture_weekdays(payload.weekdays)
    assignment = LectureAssignment(
        student_id=payload.student_id,
        subject=payload.subject.strip(),
        course_title=payload.course_title.strip(),
        total_lectures=payload.total_lectures,
        start_lecture_no=payload.start_lecture_no,
        lectures_per_day=payload.lectures_per_day,
        weekdays=",".join(weekdays),
        start_date=payload.start_date,
        due_date=payload.due_date,
        memo=payload.memo.strip() if payload.memo else None,
        status="active",
    )
    db.add(assignment)
    db.flush()

    for task in build_lecture_daily_tasks(assignment, preview["preview_items"]):
        db.add(task)

    db.commit()
    db.refresh(assignment)

    created_tasks = (
        db.query(MathDailyTask)
        .options(selectinload(MathDailyTask.textbook))
        .filter(MathDailyTask.lecture_assignment_id == assignment.id)
        .order_by(MathDailyTask.task_date, MathDailyTask.id)
        .all()
    )

    return {
        "assignment": serialize_lecture_assignment(assignment),
        "daily_tasks": [serialize_daily_task(db, task) for task in created_tasks],
    }


def build_homework_daily_tasks(
    assignment: HomeworkAssignment,
    textbook: MathTextbook,
    section: Optional[MathTextbookSection],
) -> list[MathDailyTask]:
    day_count = (assignment.due_date - assignment.start_date).days + 1
    short_title = build_textbook_short_title(textbook.full_title)
    textbook_key = resolve_textbook_key(textbook)

    common_fields = dict(
        student_id=assignment.student_id,
        textbook_id=textbook.id,
        textbook_key=textbook_key,
        detail=assignment.memo,
        status="todo",
        category=HOMEWORK_CATEGORY,
        order_index=0,
        source_type="homework",
        homework_assignment_id=assignment.id,
        range_type=assignment.range_type,
    )

    if assignment.range_type in ("item", "page"):
        total = assignment.end_value - assignment.start_value + 1
        counts = _distribute_counts(total, day_count)
        cursor = assignment.start_value
        tasks: list[MathDailyTask] = []

        for offset, count in enumerate(counts):
            if count <= 0:
                continue

            range_start = cursor
            range_end = cursor + count - 1
            cursor = range_end + 1
            task_date = assignment.start_date + timedelta(days=offset)

            if assignment.range_type == "item":
                title = assignment.title or f"{short_title} {range_start}~{range_end}번"
                tasks.append(
                    MathDailyTask(
                        **common_fields,
                        task_date=task_date,
                        title=title,
                        start_value=range_start,
                        end_value=range_end,
                        completion_mode="item_progress",
                    )
                )
            else:
                title = assignment.title or f"{short_title} {range_start}~{range_end}페이지"
                tasks.append(
                    MathDailyTask(
                        **common_fields,
                        task_date=task_date,
                        title=title,
                        start_value=range_start,
                        end_value=range_end,
                        start_page=range_start,
                        end_page=range_end,
                        completion_mode="manual",
                    )
                )

        return tasks

    if assignment.range_type == "section":
        title = assignment.title or f"{short_title} - {section.section_title}"
        return [
            MathDailyTask(
                **common_fields,
                task_date=assignment.start_date,
                title=title,
                textbook_section_id=section.id,
                completion_mode="manual",
            )
        ]

    return []


def create_homework_assignment(db: Session, payload) -> dict:
    student = get_student_by_id(db, payload.student_id)
    if student is None:
        raise ValueError("학생을 찾을 수 없습니다.")

    textbook = db.query(MathTextbook).filter(MathTextbook.id == payload.textbook_id).first()
    if textbook is None:
        raise ValueError("교재를 찾을 수 없습니다.")

    if not is_textbook_visible_to_student(db, textbook, payload.student_id):
        raise ValueError("해당 학생에게 배정되지 않은 교재입니다.")

    if payload.range_type not in HOMEWORK_RANGE_TYPES:
        raise ValueError(f"알 수 없는 range_type입니다: {payload.range_type}")

    if payload.range_type == "custom":
        raise ValueError("custom 범위 타입은 아직 지원되지 않습니다 (MVP).")

    if payload.start_date > payload.due_date:
        raise ValueError("start_date는 due_date보다 늦을 수 없습니다.")

    section: Optional[MathTextbookSection] = None

    if payload.range_type in ("item", "page"):
        if payload.start_value is None or payload.end_value is None:
            raise ValueError("start_value와 end_value가 필요합니다.")
        if payload.start_value > payload.end_value:
            raise ValueError("start_value는 end_value보다 클 수 없습니다.")

        if payload.range_type == "item":
            expected_count = payload.end_value - payload.start_value + 1
            existing_count = (
                db.query(func.count(MathTextbookItem.id))
                .filter(
                    MathTextbookItem.textbook_id == textbook.id,
                    MathTextbookItem.is_active.is_(True),
                    MathTextbookItem.item_number >= payload.start_value,
                    MathTextbookItem.item_number <= payload.end_value,
                )
                .scalar()
                or 0
            )
            if existing_count < expected_count:
                raise ValueError("요청한 문항 범위 중 존재하지 않는 문항이 있습니다.")

    if payload.range_type == "section":
        if payload.start_value is None:
            raise ValueError("section 범위는 start_value(section_id)가 필요합니다.")
        section = (
            db.query(MathTextbookSection)
            .filter(
                MathTextbookSection.id == payload.start_value,
                MathTextbookSection.textbook_id == textbook.id,
            )
            .first()
        )
        if section is None:
            raise ValueError("해당 교재에 존재하지 않는 section입니다.")

    assignment = HomeworkAssignment(
        student_id=payload.student_id,
        textbook_id=payload.textbook_id,
        title=payload.title,
        range_type=payload.range_type,
        start_value=payload.start_value,
        end_value=payload.end_value,
        start_date=payload.start_date,
        due_date=payload.due_date,
        memo=payload.memo,
        status="active",
    )
    db.add(assignment)
    db.flush()

    for task in build_homework_daily_tasks(assignment, textbook, section):
        db.add(task)

    db.commit()
    db.refresh(assignment)

    created_tasks = (
        db.query(MathDailyTask)
        .options(selectinload(MathDailyTask.textbook))
        .filter(MathDailyTask.homework_assignment_id == assignment.id)
        .order_by(MathDailyTask.task_date, MathDailyTask.id)
        .all()
    )

    return {
        "assignment": serialize_homework_assignment(assignment),
        "daily_tasks": [serialize_daily_task(db, task) for task in created_tasks],
    }


def serialize_homework_assignment(assignment: HomeworkAssignment) -> dict:
    return {
        "id": assignment.id,
        "student_id": assignment.student_id,
        "textbook_id": assignment.textbook_id,
        "title": assignment.title,
        "range_type": assignment.range_type,
        "start_value": assignment.start_value,
        "end_value": assignment.end_value,
        "start_date": assignment.start_date,
        "due_date": assignment.due_date,
        "memo": assignment.memo,
        "status": assignment.status,
        "created_at": assignment.created_at,
        "created_by": assignment.created_by,
    }


def get_homework_assignment_by_id(db: Session, assignment_id: int) -> Optional[HomeworkAssignment]:
    return db.query(HomeworkAssignment).filter(HomeworkAssignment.id == assignment_id).first()


def get_lecture_assignment_by_id(db: Session, assignment_id: int) -> Optional[LectureAssignment]:
    return db.query(LectureAssignment).filter(LectureAssignment.id == assignment_id).first()


def serialize_homework_assignment_list_item(assignment: HomeworkAssignment) -> dict:
    base = serialize_homework_assignment(assignment)
    base["student_name"] = assignment.student.name if assignment.student else None
    base["textbook_title"] = assignment.textbook.full_title if assignment.textbook else None
    return base


def list_homework_assignments(db: Session, student_id: Optional[int] = None) -> list[dict]:
    query = db.query(HomeworkAssignment).options(
        selectinload(HomeworkAssignment.student),
        selectinload(HomeworkAssignment.textbook),
    )
    if student_id is not None:
        query = query.filter(HomeworkAssignment.student_id == student_id)
    assignments = query.order_by(HomeworkAssignment.created_at.desc()).all()
    return [serialize_homework_assignment_list_item(a) for a in assignments]


def _split_homework_tasks_by_completion(
    db: Session, assignment_id: int
) -> tuple[list[MathDailyTask], list[MathDailyTask]]:
    """Returns (protected, todo) daily tasks for a homework assignment, where "protected"
    means resolve_task_statuses() reports anything other than "todo" (done or in_progress) —
    those carry real student check records (MathStudentItemProgress for item-mode tasks, or
    task.status/completed_at itself for manual page/section tasks) and must never be
    deleted or regenerated.
    """
    tasks = (
        db.query(MathDailyTask)
        .filter(MathDailyTask.homework_assignment_id == assignment_id)
        .order_by(MathDailyTask.task_date, MathDailyTask.id)
        .all()
    )
    if not tasks:
        return [], []
    statuses = resolve_task_statuses(db, tasks)
    protected = [t for t in tasks if statuses[t.id]["status"] != "todo"]
    todo = [t for t in tasks if statuses[t.id]["status"] == "todo"]
    return protected, todo


def _homework_assignment_result(db: Session, assignment: HomeworkAssignment) -> dict:
    tasks = (
        db.query(MathDailyTask)
        .options(selectinload(MathDailyTask.textbook))
        .filter(MathDailyTask.homework_assignment_id == assignment.id)
        .order_by(MathDailyTask.task_date, MathDailyTask.id)
        .all()
    )
    return {
        "assignment": serialize_homework_assignment(assignment),
        "daily_tasks": [serialize_daily_task(db, task) for task in tasks],
    }


def update_homework_assignment(db: Session, assignment: HomeworkAssignment, payload) -> dict:
    update_data = payload.model_dump(exclude_unset=True)

    new_textbook_id = update_data.get("textbook_id", assignment.textbook_id)
    new_range_type = update_data.get("range_type", assignment.range_type)
    new_start_value = update_data.get("start_value", assignment.start_value)
    new_end_value = update_data.get("end_value", assignment.end_value)
    new_start_date = update_data.get("start_date", assignment.start_date)
    new_due_date = update_data.get("due_date", assignment.due_date)
    new_memo = update_data.get("memo", assignment.memo)

    if new_range_type not in HOMEWORK_RANGE_TYPES:
        raise ValueError(f"알 수 없는 range_type입니다: {new_range_type}")
    if new_range_type == "custom":
        raise ValueError("custom 범위 타입은 아직 지원되지 않습니다 (MVP).")
    if new_start_date > new_due_date:
        raise ValueError("start_date는 due_date보다 늦을 수 없습니다.")

    textbook = db.query(MathTextbook).filter(MathTextbook.id == new_textbook_id).first()
    if textbook is None:
        raise ValueError("교재를 찾을 수 없습니다.")
    if not is_textbook_visible_to_student(db, textbook, assignment.student_id):
        raise ValueError("해당 학생에게 배정되지 않은 교재입니다.")

    section: Optional[MathTextbookSection] = None

    if new_range_type in ("item", "page"):
        if new_start_value is None or new_end_value is None:
            raise ValueError("start_value와 end_value가 필요합니다.")
        if new_start_value > new_end_value:
            raise ValueError("start_value는 end_value보다 클 수 없습니다.")

        if new_range_type == "item":
            expected_count = new_end_value - new_start_value + 1
            existing_count = (
                db.query(func.count(MathTextbookItem.id))
                .filter(
                    MathTextbookItem.textbook_id == textbook.id,
                    MathTextbookItem.is_active.is_(True),
                    MathTextbookItem.item_number >= new_start_value,
                    MathTextbookItem.item_number <= new_end_value,
                )
                .scalar()
                or 0
            )
            if existing_count < expected_count:
                raise ValueError("요청한 문항 범위 중 존재하지 않는 문항이 있습니다.")

    if new_range_type == "section":
        if new_start_value is None:
            raise ValueError("section 범위는 start_value(section_id)가 필요합니다.")
        section = (
            db.query(MathTextbookSection)
            .filter(
                MathTextbookSection.id == new_start_value,
                MathTextbookSection.textbook_id == textbook.id,
            )
            .first()
        )
        if section is None:
            raise ValueError("해당 교재에 존재하지 않는 section입니다.")

    protected_tasks, todo_tasks = _split_homework_tasks_by_completion(db, assignment.id)

    if protected_tasks:
        if new_textbook_id != assignment.textbook_id:
            raise ValueError("이미 진행 중인 기록이 있어 교재를 변경할 수 없습니다.")
        if new_range_type != assignment.range_type:
            raise ValueError("이미 진행 중인 기록이 있어 범위 방식을 변경할 수 없습니다.")
        if new_start_date != assignment.start_date:
            raise ValueError("이미 시작된 배정의 시작일은 변경할 수 없습니다.")

        max_protected_date = max(t.task_date for t in protected_tasks)
        if new_due_date < max_protected_date:
            raise ValueError(
                f"완료/진행 중인 날짜({max_protected_date})보다 이전으로 마감일을 변경할 수 없습니다."
            )

        if new_range_type in ("item", "page"):
            if new_start_value != assignment.start_value:
                raise ValueError("이미 진행된 범위가 있어 시작 값을 변경할 수 없습니다.")
            max_protected_end = max(
                t.end_value for t in protected_tasks if t.end_value is not None
            )
            if new_end_value < max_protected_end:
                raise ValueError(
                    f"완료/진행 중인 범위(~{max_protected_end})보다 작은 값으로 줄일 수 없습니다."
                )
        elif new_range_type == "section":
            if new_start_value != assignment.start_value:
                raise ValueError("이미 진행 중인 기록이 있어 section을 변경할 수 없습니다.")

    for task in todo_tasks:
        db.delete(task)

    assignment.textbook_id = new_textbook_id
    assignment.range_type = new_range_type
    assignment.start_value = new_start_value
    assignment.end_value = new_end_value
    assignment.start_date = new_start_date
    assignment.due_date = new_due_date
    assignment.memo = new_memo
    db.flush()

    if new_range_type in ("item", "page"):
        if protected_tasks:
            max_protected_end = max(
                t.end_value for t in protected_tasks if t.end_value is not None
            )
            max_protected_date = max(t.task_date for t in protected_tasks)
            remaining_start_value = max_protected_end + 1
            remaining_start_date = max_protected_date + timedelta(days=1)
        else:
            remaining_start_value = new_start_value
            remaining_start_date = new_start_date

        if remaining_start_value <= new_end_value:
            if remaining_start_date > new_due_date:
                raise ValueError("남은 기간이 없어 나머지 범위를 재배정할 수 없습니다.")
            remaining_assignment = HomeworkAssignment(
                id=assignment.id,
                student_id=assignment.student_id,
                textbook_id=assignment.textbook_id,
                title=assignment.title,
                range_type=new_range_type,
                start_value=remaining_start_value,
                end_value=new_end_value,
                start_date=remaining_start_date,
                due_date=new_due_date,
                memo=assignment.memo,
            )
            for task in build_homework_daily_tasks(remaining_assignment, textbook, None):
                db.add(task)
    elif new_range_type == "section" and not protected_tasks:
        for task in build_homework_daily_tasks(assignment, textbook, section):
            db.add(task)

    db.commit()
    db.refresh(assignment)

    return _homework_assignment_result(db, assignment)


def delete_homework_assignment(db: Session, assignment: HomeworkAssignment) -> dict:
    protected_tasks, todo_tasks = _split_homework_tasks_by_completion(db, assignment.id)

    for task in todo_tasks:
        db.delete(task)

    assignment.status = "cancelled"
    db.commit()

    return {
        "ok": True,
        "deleted_task_count": len(todo_tasks),
        "preserved_completed_count": len(protected_tasks),
    }


def serialize_lecture_assignment_list_item(assignment: LectureAssignment) -> dict:
    base = serialize_lecture_assignment(assignment)
    base["student_name"] = assignment.student.name if assignment.student else None
    return base


def list_lecture_assignments(db: Session, student_id: Optional[int] = None) -> list[dict]:
    query = db.query(LectureAssignment).options(selectinload(LectureAssignment.student))
    if student_id is not None:
        query = query.filter(LectureAssignment.student_id == student_id)
    assignments = query.order_by(LectureAssignment.created_at.desc()).all()
    return [serialize_lecture_assignment_list_item(a) for a in assignments]


def _split_lecture_tasks_by_completion(
    db: Session, assignment_id: int
) -> tuple[list[MathDailyTask], list[MathDailyTask]]:
    """Same "protected" definition as _split_homework_tasks_by_completion, but for lecture
    tasks: MathStudentLectureProgress rows are keyed directly by daily_task_id (not by a
    student+lecture-number pair independent of the task row), so a protected lecture task
    must never be deleted — doing so would either FK-violate or cascade-delete the actual
    completion/partial-check records.
    """
    tasks = (
        db.query(MathDailyTask)
        .filter(MathDailyTask.lecture_assignment_id == assignment_id)
        .order_by(MathDailyTask.task_date, MathDailyTask.id)
        .all()
    )
    if not tasks:
        return [], []
    statuses = resolve_task_statuses(db, tasks)
    protected = [t for t in tasks if statuses[t.id]["status"] != "todo"]
    todo = [t for t in tasks if statuses[t.id]["status"] == "todo"]
    return protected, todo


def _lecture_assignment_result(db: Session, assignment: LectureAssignment) -> dict:
    tasks = (
        db.query(MathDailyTask)
        .options(selectinload(MathDailyTask.textbook))
        .filter(MathDailyTask.lecture_assignment_id == assignment.id)
        .order_by(MathDailyTask.task_date, MathDailyTask.id)
        .all()
    )
    return {
        "assignment": serialize_lecture_assignment(assignment),
        "daily_tasks": [serialize_daily_task(db, task) for task in tasks],
    }


def get_lecture_assignment_detail(db: Session, assignment: LectureAssignment) -> dict:
    tasks = (
        db.query(MathDailyTask)
        .options(selectinload(MathDailyTask.textbook))
        .filter(MathDailyTask.lecture_assignment_id == assignment.id)
        .order_by(MathDailyTask.task_date, MathDailyTask.id)
        .all()
    )

    total_to_assign = assignment.total_lectures - assignment.start_lecture_no + 1
    task_ids = [task.id for task in tasks]
    completed_rows = (
        db.query(MathStudentLectureProgress)
        .filter(
            MathStudentLectureProgress.daily_task_id.in_(task_ids),
            MathStudentLectureProgress.is_done.is_(True),
        )
        .all()
        if task_ids
        else []
    )
    completed_count = len({row.lecture_number for row in completed_rows})
    progress_rate = round((completed_count / total_to_assign) * 100) if total_to_assign > 0 else 0

    student = assignment.student
    assignment_dict = serialize_lecture_assignment(assignment)
    assignment_dict["student_name"] = student.name if student else None
    assignment_dict["student_grade"] = student.grade if student else None

    return {
        "assignment": assignment_dict,
        "daily_tasks": [serialize_daily_task(db, task) for task in tasks],
        "total_lectures_to_assign": total_to_assign,
        "completed_lecture_count": completed_count,
        "remaining_lecture_count": max(total_to_assign - completed_count, 0),
        "progress_rate": progress_rate,
    }


def update_lecture_assignment(db: Session, assignment: LectureAssignment, payload) -> dict:
    update_data = payload.model_dump(exclude_unset=True)

    new_subject = (update_data.get("subject", assignment.subject) or "").strip()
    new_course_title = (update_data.get("course_title", assignment.course_title) or "").strip()
    new_total_lectures = update_data.get("total_lectures", assignment.total_lectures)
    new_start_lecture_no = update_data.get("start_lecture_no", assignment.start_lecture_no)
    new_lectures_per_day = update_data.get("lectures_per_day", assignment.lectures_per_day)
    new_weekdays = update_data.get("weekdays") or [
        value for value in (assignment.weekdays or "").split(",") if value
    ]
    new_start_date = update_data.get("start_date", assignment.start_date)
    new_due_date = update_data.get("due_date", assignment.due_date)
    new_memo = update_data.get("memo", assignment.memo)

    if not new_subject:
        raise ValueError("subject must not be empty.")
    if not new_course_title:
        raise ValueError("course_title must not be empty.")

    protected_tasks, todo_tasks = _split_lecture_tasks_by_completion(db, assignment.id)

    remaining_start_date = new_start_date
    if protected_tasks:
        if new_start_date != assignment.start_date:
            raise ValueError("이미 시작된 배정의 시작일은 변경할 수 없습니다.")

        max_protected_end = max(
            t.lecture_end_number for t in protected_tasks if t.lecture_end_number is not None
        )
        max_protected_date = max(t.task_date for t in protected_tasks)

        if new_start_lecture_no <= max_protected_end:
            raise ValueError(
                f"완료된 마지막 강의({max_protected_end}강)보다 이전 번호로 시작할 수 없습니다."
            )
        if new_due_date < max_protected_date:
            raise ValueError(
                f"완료/진행 중인 날짜({max_protected_date})보다 이전으로 마감일을 변경할 수 없습니다."
            )
        remaining_start_date = max_protected_date + timedelta(days=1)

    preview_payload = SimpleNamespace(
        total_lectures=new_total_lectures,
        start_lecture_no=new_start_lecture_no,
        lectures_per_day=new_lectures_per_day,
        weekdays=new_weekdays,
        start_date=remaining_start_date,
        due_date=new_due_date,
    )
    preview = preview_lecture_assignment(preview_payload)
    if not preview["possible"]:
        raise ValueError("현재 조건으로는 인강 재배정을 완료할 수 없습니다.")

    weekdays_normalized = normalize_lecture_weekdays(new_weekdays)

    for task in todo_tasks:
        db.delete(task)

    assignment.subject = new_subject
    assignment.course_title = new_course_title
    assignment.total_lectures = new_total_lectures
    assignment.start_lecture_no = new_start_lecture_no
    assignment.lectures_per_day = new_lectures_per_day
    assignment.weekdays = ",".join(weekdays_normalized)
    assignment.start_date = new_start_date
    assignment.due_date = new_due_date
    assignment.memo = new_memo.strip() if new_memo else None
    db.flush()

    for task in build_lecture_daily_tasks(assignment, preview["preview_items"]):
        db.add(task)

    db.commit()
    db.refresh(assignment)

    return _lecture_assignment_result(db, assignment)


def delete_lecture_assignment(db: Session, assignment: LectureAssignment) -> dict:
    protected_tasks, todo_tasks = _split_lecture_tasks_by_completion(db, assignment.id)

    for task in todo_tasks:
        db.delete(task)

    assignment.status = "cancelled"
    db.commit()

    return {
        "ok": True,
        "deleted_task_count": len(todo_tasks),
        "preserved_completed_count": len(protected_tasks),
    }


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
    # Base universe = get_visible_textbook_ids(), the exact same policy used by the
    # student textbook list/detail/sections/progress endpoints — the progress-rate
    # denominator must never disagree with what the student can actually see and open.
    textbook_ids = get_visible_textbook_ids(db, student_id)

    # Multi-subject tags (MathTextbookSubject), not the legacy single `MathTextbook.subject`
    # column, so a textbook tagged with multiple subjects counts toward every one of them.
    subject_tag_rows = (
        db.query(MathTextbookSubject.textbook_id, MathTextbookSubject.subject)
        .filter(MathTextbookSubject.textbook_id.in_(textbook_ids))
        .all()
        if textbook_ids
        else []
    )
    textbook_subjects: dict[int, list[str]] = {}
    for row in subject_tag_rows:
        textbook_subjects.setdefault(row.textbook_id, []).append(row.subject)

    # Every active item of every visible textbook is included here, whether or not the
    # student ever checked it — this is the denominator side and must not inner-join progress.
    item_rows = (
        db.query(MathTextbookItem.id, MathTextbookItem.textbook_id)
        .filter(
            MathTextbookItem.textbook_id.in_(textbook_ids),
            MathTextbookItem.is_active.is_(True),
        )
        .all()
        if textbook_ids
        else []
    )
    item_ids = [row.id for row in item_rows]

    # Check records fetched separately (not joined) and matched by dict lookup, so an item
    # with no MathStudentItemProgress row simply defaults to not_started instead of vanishing.
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

    for row in item_rows:
        status = progress_map.get(row.id, "not_started")
        if status not in ITEM_PROGRESS_STATUSES:
            status = "not_started"

        overall["total"] += 1
        if status == "done":
            overall["done"] += 1
        elif status == "partial":
            overall["partial"] += 1

        for canonical_subject in textbook_subjects.get(row.textbook_id, []):
            legacy_subject = canonical_subject_to_legacy(canonical_subject)
            subject_bucket = subjects.get(legacy_subject)
            if subject_bucket is None:
                continue
            subject_bucket["total"] += 1
            if status == "done":
                subject_bucket["done"] += 1
            elif status == "partial":
                subject_bucket["partial"] += 1

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


def validate_textbook_sections(sections: list) -> None:
    """Sections are a label/classification, not the source of truth for item checklists.
    item_count is a count, not a max item number, so a section's end is never bounded by it —
    only internal start/end consistency is enforced here."""
    for s in sections:
        section_title = getattr(s, "section_title", "") or "구간"

        start_problem = getattr(s, "start_problem", None)
        end_problem = getattr(s, "end_problem", None)
        if start_problem is not None and start_problem < 1:
            raise ValueError(f"'{section_title}' 구간의 시작 번호는 1 이상이어야 합니다: {start_problem}")
        if start_problem is not None and end_problem is not None and start_problem > end_problem:
            raise ValueError(
                f"'{section_title}' 구간의 시작 번호({start_problem})가 끝 번호({end_problem})보다 클 수 없습니다."
            )

        start_page = getattr(s, "start_page", None)
        end_page = getattr(s, "end_page", None)
        if start_page is not None and start_page < 1:
            raise ValueError(f"'{section_title}' 구간의 시작 페이지는 1 이상이어야 합니다: {start_page}")
        if start_page is not None and end_page is not None and start_page > end_page:
            raise ValueError(
                f"'{section_title}' 구간의 시작 페이지({start_page})가 끝 페이지({end_page})보다 클 수 없습니다."
            )


def compute_item_numbers_from_sections(sections: list) -> list[int]:
    """Union of every section's [start_problem, end_problem] range, deduped and sorted.
    Overlapping sections collapse into the same item numbers rather than duplicating items."""
    numbers: set[int] = set()
    for s in sections:
        start = getattr(s, "start_problem", None)
        end = getattr(s, "end_problem", None)
        if start is None or end is None:
            continue
        numbers.update(range(start, end + 1))
    return sorted(numbers)


def replace_textbook_sections(db: Session, textbook_id: int, sections: list) -> list[MathTextbookSection]:
    validate_textbook_sections(sections)

    target_item_numbers = compute_item_numbers_from_sections(sections)
    existing_items = (
        db.query(MathTextbookItem)
        .filter(MathTextbookItem.textbook_id == textbook_id)
        .all()
    )
    existing_by_number = {item.item_number: item for item in existing_items}

    if target_item_numbers:
        target_set = set(target_item_numbers)

        for item_number in target_item_numbers:
            existing_item = existing_by_number.get(item_number)
            if existing_item is None:
                db.add(
                    MathTextbookItem(
                        textbook_id=textbook_id,
                        item_number=item_number,
                        title=f"{item_number}번",
                        item_type="problem",
                        order_index=item_number,
                        is_active=True,
                    )
                )
                continue

            existing_item.title = f"{item_number}번"
            existing_item.item_type = "problem"
            existing_item.order_index = item_number
            existing_item.is_active = True

        for item in existing_items:
            if item.item_number not in target_set:
                item.is_active = False

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

    textbook_key = getattr(payload, "textbook_key", None)
    if textbook_key:
        existing_key = (
            db.query(MathTextbook)
            .filter(MathTextbook.textbook_key == textbook_key)
            .first()
        )
        if existing_key:
            raise ValueError(f"이미 존재하는 교재 키입니다: {textbook_key}")

    sections_input = getattr(payload, "sections", None) or []
    validate_textbook_sections(sections_input)
    item_numbers = compute_item_numbers_from_sections(sections_input)
    if not item_numbers:
        item_numbers = list(range(1, payload.item_count + 1))

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
        textbook_key=textbook_key,
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

    for i in item_numbers:
        item = MathTextbookItem(
            textbook_id=textbook.id,
            item_number=i,
            title=f"{i}번",
            item_type="problem",
            order_index=i,
            is_active=True,
        )
        db.add(item)

    for i, s in enumerate(sections_input):
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
    if "textbook_key" in update_data:
        update_data["textbook_key"] = update_data["textbook_key"] or None

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
        .filter(MathTextbook.is_active.is_(True))
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
    visibility = (
        or_(
            MathTextbook.is_student_only.is_(False),
            MathTextbook.id.in_(assigned_ids),
        )
        if assigned_ids
        else MathTextbook.is_student_only.is_(False)
    )

    visible_textbooks = (
        db.query(MathTextbook)
        .filter(
            MathTextbook.is_active.is_(True),
            MathTextbook.is_published.is_(True),
            visibility,
        )
        .order_by(MathTextbook.order_index, MathTextbook.id)
        .all()
    )

    result = []
    for textbook in visible_textbooks:
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
