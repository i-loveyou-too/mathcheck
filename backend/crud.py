from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session, selectinload

from models import Admin, Progress, Student, Subject, Task, Unit


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
