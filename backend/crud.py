from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session, selectinload

from models import (
    Admin,
    MathStudentItemProgress,
    MathTextbook,
    MathTextbookItem,
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
}
ITEM_PROGRESS_STATUSES = {"not_started", "partial", "done"}


def percentage(completed_tasks: int, total_tasks: int) -> float:
    if total_tasks == 0:
        return 0.0
    return round((completed_tasks / total_tasks) * 100, 1)


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


def get_textbook_item(db: Session, item_id: int) -> Optional[MathTextbookItem]:
    return db.query(MathTextbookItem).filter(MathTextbookItem.id == item_id).first()


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


def get_textbook_progress(db: Session, student_id: int, textbook_key: str) -> Optional[dict]:
    full_title = TEXTBOOK_PROGRESS_CONFIG.get(textbook_key)
    if full_title is None:
        return None

    textbook = get_textbook_by_full_title(db, full_title)
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
