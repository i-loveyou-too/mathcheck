import os
from contextlib import asynccontextmanager
from datetime import date
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import crud
import models  # noqa: F401 - importing models registers them with SQLAlchemy
import schemas
from database import Base, SessionLocal, engine, get_db
from study_dates import get_study_date


def ensure_textbook_key_column():
    inspector = inspect(engine)
    if not inspector.has_table("math_textbooks"):
        return

    column_names = {column["name"] for column in inspector.get_columns("math_textbooks")}

    with engine.begin() as connection:
        if "textbook_key" not in column_names:
            connection.execute(
                text("ALTER TABLE math_textbooks ADD COLUMN textbook_key VARCHAR(100)")
            )

        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_math_textbooks_textbook_key "
                "ON math_textbooks (textbook_key) WHERE textbook_key IS NOT NULL"
            )
        )


def ensure_student_curriculum_is_active_column():
    inspector = inspect(engine)
    if not inspector.has_table("student_curriculums"):
        return

    column_names = {column["name"] for column in inspector.get_columns("student_curriculums")}

    with engine.begin() as connection:
        if "is_active" not in column_names:
            connection.execute(
                text(
                    "ALTER TABLE student_curriculums "
                    "ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE"
                )
            )


def ensure_daily_task_completed_at_column():
    inspector = inspect(engine)
    if not inspector.has_table("math_daily_tasks"):
        return

    column_names = {column["name"] for column in inspector.get_columns("math_daily_tasks")}

    with engine.begin() as connection:
        if "completed_at" not in column_names:
            connection.execute(
                text("ALTER TABLE math_daily_tasks ADD COLUMN completed_at TIMESTAMP NULL")
            )


def ensure_textbook_is_student_only_column():
    inspector = inspect(engine)
    if not inspector.has_table("math_textbooks"):
        return

    column_names = {column["name"] for column in inspector.get_columns("math_textbooks")}

    with engine.begin() as connection:
        if "is_student_only" not in column_names:
            connection.execute(
                text(
                    "ALTER TABLE math_textbooks "
                    "ADD COLUMN is_student_only BOOLEAN NOT NULL DEFAULT FALSE"
                )
            )


def ensure_textbook_structure_type_column():
    inspector = inspect(engine)
    if not inspector.has_table("math_textbooks"):
        return

    column_names = {column["name"] for column in inspector.get_columns("math_textbooks")}

    with engine.begin() as connection:
        if "structure_type" not in column_names:
            connection.execute(
                text(
                    "ALTER TABLE math_textbooks "
                    "ADD COLUMN structure_type VARCHAR(50) NOT NULL DEFAULT 'none'"
                )
            )


def ensure_daily_task_homework_columns():
    inspector = inspect(engine)
    if not inspector.has_table("math_daily_tasks"):
        return

    column_names = {column["name"] for column in inspector.get_columns("math_daily_tasks")}

    statements = {
        "source_type": "ALTER TABLE math_daily_tasks ADD COLUMN source_type VARCHAR(20) NOT NULL DEFAULT 'manual'",
        "homework_assignment_id": "ALTER TABLE math_daily_tasks ADD COLUMN homework_assignment_id INTEGER NULL",
        "range_type": "ALTER TABLE math_daily_tasks ADD COLUMN range_type VARCHAR(20) NULL",
        "start_value": "ALTER TABLE math_daily_tasks ADD COLUMN start_value INTEGER NULL",
        "end_value": "ALTER TABLE math_daily_tasks ADD COLUMN end_value INTEGER NULL",
        "start_page": "ALTER TABLE math_daily_tasks ADD COLUMN start_page INTEGER NULL",
        "end_page": "ALTER TABLE math_daily_tasks ADD COLUMN end_page INTEGER NULL",
        "textbook_section_id": "ALTER TABLE math_daily_tasks ADD COLUMN textbook_section_id INTEGER NULL",
        "completion_mode": "ALTER TABLE math_daily_tasks ADD COLUMN completion_mode VARCHAR(20) NOT NULL DEFAULT 'manual'",
    }

    with engine.begin() as connection:
        for column_name, statement in statements.items():
            if column_name not in column_names:
                connection.execute(text(statement))

        # FKs added separately so a rerun never fails if the referenced table/column pre-exists.
        if "homework_assignment_id" not in column_names:
            connection.execute(
                text(
                    "ALTER TABLE math_daily_tasks "
                    "ADD CONSTRAINT fk_math_daily_tasks_homework_assignment "
                    "FOREIGN KEY (homework_assignment_id) REFERENCES math_homework_assignments (id)"
                )
            )
        if "textbook_section_id" not in column_names:
            connection.execute(
                text(
                    "ALTER TABLE math_daily_tasks "
                    "ADD CONSTRAINT fk_math_daily_tasks_textbook_section "
                    "FOREIGN KEY (textbook_section_id) REFERENCES math_textbook_sections (id)"
                )
            )


def ensure_daily_task_lecture_columns():
    inspector = inspect(engine)
    if not inspector.has_table("math_daily_tasks"):
        return

    column_names = {column["name"] for column in inspector.get_columns("math_daily_tasks")}

    statements = {
        "lecture_assignment_id": "ALTER TABLE math_daily_tasks ADD COLUMN lecture_assignment_id INTEGER NULL",
        "lecture_start_number": "ALTER TABLE math_daily_tasks ADD COLUMN lecture_start_number INTEGER NULL",
        "lecture_end_number": "ALTER TABLE math_daily_tasks ADD COLUMN lecture_end_number INTEGER NULL",
    }

    with engine.begin() as connection:
        for column_name, statement in statements.items():
            if column_name not in column_names:
                connection.execute(text(statement))

        if "lecture_assignment_id" not in column_names:
            connection.execute(
                text(
                    "ALTER TABLE math_daily_tasks "
                    "ADD CONSTRAINT fk_math_daily_tasks_lecture_assignment "
                    "FOREIGN KEY (lecture_assignment_id) REFERENCES math_lecture_assignments (id)"
                )
            )


def ensure_student_lecture_progress_table():
    inspector = inspect(engine)
    if inspector.has_table("math_student_lecture_progress"):
        return

    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE math_student_lecture_progress ("
                "id INTEGER PRIMARY KEY, "
                "student_id INTEGER NOT NULL, "
                "daily_task_id INTEGER NOT NULL, "
                "lecture_number INTEGER NOT NULL, "
                "is_done BOOLEAN NOT NULL DEFAULT FALSE, "
                "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL, "
                "CONSTRAINT uq_math_student_lecture_progress_student_task_lecture "
                "UNIQUE (student_id, daily_task_id, lecture_number), "
                "FOREIGN KEY (student_id) REFERENCES math_students (id), "
                "FOREIGN KEY (daily_task_id) REFERENCES math_daily_tasks (id)"
                ")"
            )
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables automatically on startup so the app is easy to run locally.
    Base.metadata.create_all(bind=engine)
    ensure_textbook_key_column()
    ensure_student_curriculum_is_active_column()
    ensure_daily_task_completed_at_column()
    ensure_textbook_is_student_only_column()
    ensure_textbook_structure_type_column()
    ensure_daily_task_homework_columns()
    ensure_daily_task_lecture_columns()
    ensure_student_lecture_progress_table()
    db = SessionLocal()
    try:
        crud.sync_textbook_keys(db)
        crud.backfill_textbook_subjects(db)
        crud.repair_textbook_subject_tags(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Math Progress API", lifespan=lifespan)

allowed_origins = [
    "https://aimon.teamzsoft.com",
    "http://192.168.99.99:3000",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]

frontend_origins = ",".join(
    value
    for value in [
        os.getenv("FRONTEND_ORIGINS", ""),
        os.getenv("FRONTEND_ORIGIN", ""),
    ]
    if value
)
for origin in frontend_origins.split(","):
    cleaned_origin = origin.strip().rstrip("/")
    if cleaned_origin and cleaned_origin not in allowed_origins:
        allowed_origins.append(cleaned_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=os.getenv(
        "FRONTEND_ORIGIN_REGEX",
        r"https://.*\.vercel\.app|http://(localhost|127\.0\.0\.1|192\.168\.99\.99):\d+",
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Math progress backend is running"}


@app.post("/auth/student-login", response_model=schemas.StudentLoginResponse, tags=["Student"])
def student_login(payload: schemas.StudentLoginRequest, db: Session = Depends(get_db)):
    student = crud.get_student_by_phone(db, payload.phone)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@app.get("/subjects", response_model=list[schemas.SubjectWithUnits], tags=["Student"])
def read_subjects(db: Session = Depends(get_db)):
    return crud.get_subjects_with_units(db)


@app.get("/units/{unit_id}/tasks", response_model=list[schemas.TaskWithProgress], tags=["Student"])
def read_unit_tasks(unit_id: int, student_id: int, db: Session = Depends(get_db)):
    unit = crud.get_unit(db, unit_id)
    if unit is None:
        raise HTTPException(status_code=404, detail="Unit not found")

    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    return crud.get_unit_tasks_with_progress(db, student_id, unit_id)


@app.post("/progress/check", response_model=schemas.ProgressCheckResponse, tags=["Student"])
def check_progress(payload: schemas.ProgressCheckRequest, db: Session = Depends(get_db)):
    student = crud.get_student_by_id(db, payload.student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    task = crud.get_task(db, payload.task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    return crud.upsert_progress(db, payload.student_id, payload.task_id, payload.is_done)


@app.get("/students/{student_id}/summary", response_model=schemas.StudentSummaryResponse, tags=["Student"])
def student_summary(student_id: int, db: Session = Depends(get_db)):
    summary = crud.build_progress_tree(db, student_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="Student not found")
    return summary


@app.get(
    "/student/progress-summary",
    response_model=schemas.StudentDashboardProgressSummaryResponse,
    tags=["Student"],
)
def student_item_progress_summary(student_id: int, db: Session = Depends(get_db)):
    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    return crud.build_student_item_progress_summary(db, student_id)


@app.get(
    "/student/daily-tasks",
    response_model=schemas.StudentDailyTasksResponse,
    tags=["Student"],
)
def student_daily_tasks(student_id: int, date: date, db: Session = Depends(get_db)):
    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    return crud.get_student_daily_tasks(db, student_id, date)


@app.get(
    "/student/weekly-tasks",
    response_model=schemas.StudentWeeklyTasksResponse,
    tags=["Student"],
)
def student_weekly_tasks(student_id: int, week_start: date, db: Session = Depends(get_db)):
    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    return crud.get_student_weekly_tasks(db, student_id, week_start)


@app.get(
    "/student/today-tasks",
    response_model=schemas.StudentTodayTasksResponse,
    tags=["Student"],
)
def student_today_tasks(student_id: int, today: date, db: Session = Depends(get_db)):
    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    return crud.get_student_today_tasks(db, student_id, today)


@app.get(
    "/student/lecture-assignments/{assignment_id}",
    response_model=schemas.LectureAssignmentDetailResponse,
    tags=["Student"],
)
def student_lecture_assignment_detail(assignment_id: int, student_id: int, db: Session = Depends(get_db)):
    assignment = crud.get_lecture_assignment_by_id(db, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Lecture assignment not found")
    if assignment.student_id != student_id:
        raise HTTPException(status_code=403, detail="Not allowed")

    return crud.get_lecture_assignment_detail(db, assignment)


@app.get(
    "/student/achievement-tracker",
    response_model=schemas.AchievementTrackerResponse,
    tags=["Student"],
)
def student_achievement_tracker(
    student_id: int,
    year: int,
    month: int,
    db: Session = Depends(get_db),
):
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Invalid month")

    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    return crud.get_student_achievement_tracker(db, student_id, year, month)


@app.get(
    "/student/textbooks/by-subject/{subject}",
    response_model=schemas.StudentTextbookListResponse,
    tags=["Student"],
)
def student_textbooks_by_subject(
    subject: str,
    student_id: int,
    db: Session = Depends(get_db),
):
    return {"textbooks": crud.get_active_textbooks_by_subject(db, subject, student_id)}


@app.get(
    "/student/textbooks/{textbook_key}",
    response_model=schemas.StudentTextbookResponse,
    tags=["Student"],
)
def student_textbook_by_key(textbook_key: str, student_id: int, db: Session = Depends(get_db)):
    textbook = crud.get_student_textbook_by_key(db, textbook_key, student_id)
    if textbook is None:
        raise HTTPException(status_code=404, detail="Textbook not found")
    return textbook


@app.get(
    "/student/textbooks/{textbook_key}/sections",
    response_model=schemas.TextbookSectionsResponse,
    tags=["Student"],
)
def student_textbook_sections(textbook_key: str, student_id: int, db: Session = Depends(get_db)):
    textbook = crud.get_textbook_by_key(db, textbook_key)
    if textbook is None:
        raise HTTPException(status_code=404, detail="Textbook not found")
    if not crud.is_textbook_visible_to_student(db, textbook, student_id):
        raise HTTPException(status_code=404, detail="Textbook not found")
    sections = crud.get_textbook_sections(db, textbook.id)
    visible = [s for s in sections if s.show_to_student]
    return {
        "textbook_id": textbook.id,
        "textbook_key": textbook_key,
        "structure_type": getattr(textbook, "structure_type", "none") or "none",
        "sections": visible,
    }


@app.get(
    "/student/textbook-progress/{textbook_key}",
    response_model=schemas.TextbookProgressResponse,
    tags=["Student"],
)
def textbook_progress(textbook_key: str, student_id: int, db: Session = Depends(get_db)):
    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    textbook = crud.get_textbook_by_key(db, textbook_key)
    if textbook is None:
        raise HTTPException(status_code=404, detail="Textbook not found")

    if not crud.is_textbook_visible_to_student(db, textbook, student_id):
        raise HTTPException(status_code=404, detail="Textbook not found")

    progress = crud.get_textbook_progress(db, student_id, textbook_key)
    if progress is None:
        raise HTTPException(status_code=404, detail="Textbook not found")
    return progress


@app.post(
    "/student/item-progress",
    response_model=schemas.StudentItemProgressResponse,
    tags=["Student"],
)
def save_student_item_progress(
    payload: schemas.StudentItemProgressRequest,
    db: Session = Depends(get_db),
):
    if payload.status not in crud.ITEM_PROGRESS_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    student = crud.get_student_by_id(db, payload.student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    item = crud.get_textbook_item(db, payload.item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    return crud.upsert_student_item_progress(
        db,
        payload.student_id,
        payload.item_id,
        payload.status,
    )


@app.patch(
    "/student/daily-tasks/{task_id}/status",
    response_model=schemas.DailyTaskResponse,
    tags=["Student"],
)
def update_student_daily_task_status(
    task_id: int,
    payload: schemas.StudentDailyTaskStatusRequest,
    db: Session = Depends(get_db),
):
    if payload.status not in crud.DAILY_TASK_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    task = crud.get_daily_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Daily task not found")
    if task.student_id != payload.student_id:
        raise HTTPException(status_code=403, detail="Not allowed")

    try:
        updated_task = crud.update_daily_task(
            db,
            task,
            schemas.AdminDailyTaskUpdateRequest(status=payload.status),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return crud.serialize_daily_task(db, updated_task)


@app.patch(
    "/student/daily-tasks/{task_id}/lecture-items/{lecture_number}",
    response_model=schemas.DailyTaskResponse,
    tags=["Student"],
)
def update_student_lecture_task_item_status(
    task_id: int,
    lecture_number: int,
    payload: schemas.StudentLectureTaskItemProgressRequest,
    db: Session = Depends(get_db),
):
    task = crud.get_daily_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Daily task not found")
    if task.student_id != payload.student_id:
        raise HTTPException(status_code=403, detail="Not allowed")

    try:
        updated_task = crud.update_lecture_task_progress(
            db,
            task,
            lecture_number,
            payload.is_done,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return crud.serialize_daily_task(db, updated_task)


@app.patch(
    "/admin/students/{student_id}/daily-tasks/{task_id}",
    response_model=schemas.DailyTaskResponse,
    tags=["Admin"],
)
def admin_update_student_daily_task_status(
    student_id: int,
    task_id: int,
    payload: schemas.AdminStudentDailyTaskStatusRequest,
    db: Session = Depends(get_db),
):
    if payload.status not in crud.DAILY_TASK_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    task = crud.get_daily_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Daily task not found")
    if task.student_id != student_id:
        raise HTTPException(status_code=404, detail="Daily task not found")

    old_status = task.status
    try:
        updated_task = crud.update_daily_task(
            db,
            task,
            schemas.AdminDailyTaskUpdateRequest(status=payload.status),
        )
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    crud.create_admin_progress_change_log(
        db,
        student_id=student_id,
        target_type="daily_task",
        target_id=task_id,
        old_status=old_status,
        new_status=updated_task.status,
        memo=payload.memo,
    )
    db.commit()
    return crud.serialize_daily_task(db, updated_task)


@app.patch(
    "/admin/students/{student_id}/textbook-items/{item_id}",
    response_model=schemas.StudentItemProgressResponse,
    tags=["Admin"],
)
def admin_update_student_textbook_item_progress(
    student_id: int,
    item_id: int,
    payload: schemas.AdminStudentItemProgressRequest,
    db: Session = Depends(get_db),
):
    if payload.status not in crud.ITEM_PROGRESS_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    item = crud.get_textbook_item(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    existing = (
        db.query(models.MathStudentItemProgress)
        .filter(
            models.MathStudentItemProgress.student_id == student_id,
            models.MathStudentItemProgress.item_id == item_id,
        )
        .first()
    )
    old_status = existing.status if existing is not None else "not_started"
    progress = crud.upsert_student_item_progress(db, student_id, item_id, payload.status)
    crud.create_admin_progress_change_log(
        db,
        student_id=student_id,
        target_type="textbook_item",
        target_id=item_id,
        old_status=old_status,
        new_status=progress.status,
        memo=payload.memo,
    )
    db.commit()
    db.refresh(progress)
    return progress


@app.patch(
    "/admin/students/{student_id}/textbook-items",
    response_model=list[schemas.StudentItemProgressResponse],
    tags=["Admin"],
)
def admin_update_student_textbook_items_progress(
    student_id: int,
    payload: schemas.AdminStudentItemProgressBatchRequest,
    db: Session = Depends(get_db),
):
    if payload.status not in crud.ITEM_PROGRESS_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    try:
        return crud.set_student_item_progress_batch(
            db,
            student_id,
            payload.item_ids,
            payload.status,
            payload.memo,
        )
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@app.patch(
    "/admin/students/{student_id}/daily-tasks/{task_id}/lecture-items/{lecture_number}",
    response_model=schemas.DailyTaskResponse,
    tags=["Admin"],
)
def admin_update_student_lecture_task_item_status(
    student_id: int,
    task_id: int,
    lecture_number: int,
    payload: schemas.AdminStudentLectureTaskItemProgressRequest,
    db: Session = Depends(get_db),
):
    task = crud.get_daily_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Daily task not found")
    if task.student_id != student_id:
        raise HTTPException(status_code=404, detail="Daily task not found")

    existing = crud.get_student_lecture_progress_entry(db, student_id, task_id, lecture_number)
    old_status = "done" if existing and existing.is_done else "todo"

    try:
        updated_task = crud.update_lecture_task_progress(
            db,
            task,
            lecture_number,
            payload.is_done,
        )
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    updated_entry = crud.get_student_lecture_progress_entry(db, student_id, task_id, lecture_number)
    new_status = "done" if updated_entry and updated_entry.is_done else "todo"
    crud.create_admin_progress_change_log(
        db,
        student_id=student_id,
        target_type="lecture_item",
        target_id=task_id,
        old_status=old_status,
        new_status=new_status,
        memo=payload.memo,
        target_detail=str(lecture_number),
    )
    db.commit()
    return crud.serialize_daily_task(db, updated_task)


@app.get(
    "/student/curriculums",
    response_model=list[schemas.CurriculumListItem],
    tags=["Student"],
)
def student_curriculums(student_id: int, db: Session = Depends(get_db)):
    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    return crud.list_student_curriculums(db, student_id)


@app.get(
    "/student/curriculums/{student_curriculum_id}",
    response_model=schemas.CurriculumListItem,
    tags=["Student"],
)
def student_curriculum_detail(student_curriculum_id: int, student_id: int, db: Session = Depends(get_db)):
    student_curriculum = crud.get_student_curriculum(db, student_curriculum_id)
    if (
        student_curriculum is None
        or student_curriculum.student_id != student_id
        or not student_curriculum.is_active
    ):
        raise HTTPException(status_code=404, detail="Curriculum not found")

    return crud.get_student_curriculum_summary(db, student_curriculum)


@app.get(
    "/student/curriculums/{student_curriculum_id}/nodes",
    response_model=schemas.CurriculumNodesResponse,
    tags=["Student"],
)
def student_curriculum_nodes(student_curriculum_id: int, student_id: int, db: Session = Depends(get_db)):
    student_curriculum = crud.get_student_curriculum(db, student_curriculum_id)
    if (
        student_curriculum is None
        or student_curriculum.student_id != student_id
        or not student_curriculum.is_active
    ):
        raise HTTPException(status_code=404, detail="Curriculum not found")

    return crud.get_student_curriculum_nodes(db, student_curriculum)


@app.get(
    "/admin/students/{student_id}/curriculums",
    response_model=list[schemas.CurriculumListItem],
    tags=["Admin"],
)
def admin_student_curriculums(student_id: int, db: Session = Depends(get_db)):
    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    return crud.list_student_curriculums(db, student_id)


@app.get(
    "/admin/students/{student_id}/curriculums/{student_curriculum_id}",
    response_model=schemas.CurriculumListItem,
    tags=["Admin"],
)
def admin_student_curriculum_detail(
    student_id: int,
    student_curriculum_id: int,
    db: Session = Depends(get_db),
):
    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    student_curriculum = crud.get_student_curriculum(db, student_curriculum_id)
    if student_curriculum is None or student_curriculum.student_id != student_id:
        raise HTTPException(status_code=404, detail="Curriculum not found")

    return crud.get_student_curriculum_summary(db, student_curriculum)


@app.get(
    "/admin/students/{student_id}/curriculums/{student_curriculum_id}/nodes",
    response_model=schemas.CurriculumNodesResponse,
    tags=["Admin"],
)
def admin_student_curriculum_nodes(
    student_id: int,
    student_curriculum_id: int,
    db: Session = Depends(get_db),
):
    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    student_curriculum = crud.get_student_curriculum(db, student_curriculum_id)
    if student_curriculum is None or student_curriculum.student_id != student_id:
        raise HTTPException(status_code=404, detail="Curriculum not found")

    return crud.get_student_curriculum_nodes(db, student_curriculum)


# ---- Admin curriculum management (templates / nodes / edges / assignment / manual status) ----


@app.get(
    "/admin/curriculums",
    response_model=list[schemas.CurriculumAdminItem],
    tags=["Admin"],
)
def admin_list_curriculums(db: Session = Depends(get_db)):
    return crud.list_curriculum_templates(db)


@app.post(
    "/admin/curriculums",
    response_model=schemas.CurriculumAdminItem,
    tags=["Admin"],
)
def admin_create_curriculum(payload: schemas.CurriculumCreateRequest, db: Session = Depends(get_db)):
    try:
        curriculum = crud.create_curriculum_template(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "id": curriculum.id,
        "subject": curriculum.subject,
        "title": curriculum.title,
        "description": curriculum.description,
        "order_index": curriculum.order_index,
        "is_active": curriculum.is_active,
    }


@app.get(
    "/admin/curriculums/{curriculum_id}",
    response_model=schemas.CurriculumAdminDetailResponse,
    tags=["Admin"],
)
def admin_curriculum_detail(curriculum_id: int, db: Session = Depends(get_db)):
    result = crud.get_curriculum_template_detail(db, curriculum_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Curriculum not found")
    return result


@app.patch(
    "/admin/curriculums/{curriculum_id}",
    response_model=schemas.CurriculumAdminItem,
    tags=["Admin"],
)
def admin_update_curriculum(
    curriculum_id: int,
    payload: schemas.CurriculumUpdateRequest,
    db: Session = Depends(get_db),
):
    try:
        curriculum = crud.update_curriculum_template(db, curriculum_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if curriculum is None:
        raise HTTPException(status_code=404, detail="Curriculum not found")
    return {
        "id": curriculum.id,
        "subject": curriculum.subject,
        "title": curriculum.title,
        "description": curriculum.description,
        "order_index": curriculum.order_index,
        "is_active": curriculum.is_active,
    }


@app.delete(
    "/admin/curriculums/{curriculum_id}",
    response_model=schemas.DeleteResponse,
    tags=["Admin"],
)
def admin_delete_curriculum(curriculum_id: int, db: Session = Depends(get_db)):
    deleted = crud.delete_curriculum_template(db, curriculum_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Curriculum not found")
    return {"ok": True}


@app.post(
    "/admin/curriculums/{curriculum_id}/nodes",
    response_model=schemas.CurriculumNodeAdminResponse,
    tags=["Admin"],
)
def admin_create_curriculum_node(
    curriculum_id: int,
    payload: schemas.CurriculumNodeCreateRequest,
    db: Session = Depends(get_db),
):
    try:
        node = crud.create_curriculum_node(db, curriculum_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    detail = crud.get_curriculum_template_detail(db, curriculum_id)
    node_out = next(n for n in detail["nodes"] if n["id"] == node.id)
    return node_out


@app.patch(
    "/admin/curriculums/{curriculum_id}/nodes/{node_id}",
    response_model=schemas.CurriculumNodeAdminResponse,
    tags=["Admin"],
)
def admin_update_curriculum_node(
    curriculum_id: int,
    node_id: int,
    payload: schemas.CurriculumNodeUpdateRequest,
    db: Session = Depends(get_db),
):
    node = crud.get_curriculum_template_detail(db, curriculum_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Curriculum not found")
    try:
        updated = crud.update_curriculum_node(db, node_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if updated is None or updated.curriculum_id != curriculum_id:
        raise HTTPException(status_code=404, detail="Node not found")
    detail = crud.get_curriculum_template_detail(db, curriculum_id)
    node_out = next((n for n in detail["nodes"] if n["id"] == node_id), None)
    if node_out is None:
        # Node was soft-deleted by this same update (is_active=False) — return its last known
        # shape directly instead of pretending it's still in the active list.
        return {
            "id": updated.id,
            "title": updated.title,
            "node_type": updated.node_type,
            "group_name": updated.group_name,
            "group_order": updated.group_order,
            "order_index": updated.order_index,
            "textbook_id": updated.textbook_id,
            "lecture_assignment_id": updated.lecture_assignment_id,
            "description": updated.description,
            "is_active": updated.is_active,
            "prerequisite_node_ids": [],
        }
    return node_out


@app.delete(
    "/admin/curriculums/{curriculum_id}/nodes/{node_id}",
    response_model=schemas.DeleteResponse,
    tags=["Admin"],
)
def admin_delete_curriculum_node(curriculum_id: int, node_id: int, db: Session = Depends(get_db)):
    node = db.query(models.CurriculumNode).filter(
        models.CurriculumNode.id == node_id, models.CurriculumNode.curriculum_id == curriculum_id
    ).first()
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    crud.delete_curriculum_node(db, node_id)
    return {"ok": True}


@app.post(
    "/admin/curriculums/{curriculum_id}/edges",
    response_model=schemas.CurriculumEdgeAdminResponse,
    tags=["Admin"],
)
def admin_create_curriculum_edge(
    curriculum_id: int,
    payload: schemas.CurriculumEdgeCreateRequest,
    db: Session = Depends(get_db),
):
    try:
        edge = crud.create_curriculum_edge(db, curriculum_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"id": edge.id, "from_node_id": edge.from_node_id, "to_node_id": edge.to_node_id, "edge_type": edge.edge_type}


@app.delete(
    "/admin/curriculums/{curriculum_id}/edges/{edge_id}",
    response_model=schemas.DeleteResponse,
    tags=["Admin"],
)
def admin_delete_curriculum_edge(curriculum_id: int, edge_id: int, db: Session = Depends(get_db)):
    edge = db.query(models.CurriculumEdge).filter(
        models.CurriculumEdge.id == edge_id, models.CurriculumEdge.curriculum_id == curriculum_id
    ).first()
    if edge is None:
        raise HTTPException(status_code=404, detail="Edge not found")
    crud.delete_curriculum_edge(db, edge_id)
    return {"ok": True}


@app.post(
    "/admin/students/{student_id}/curriculums",
    response_model=schemas.CurriculumListItem,
    tags=["Admin"],
)
def admin_assign_curriculum(
    student_id: int,
    payload: schemas.StudentCurriculumAssignRequest,
    db: Session = Depends(get_db),
):
    try:
        student_curriculum = crud.assign_curriculum_to_student(db, student_id, payload.curriculum_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return crud.get_student_curriculum_summary(db, student_curriculum)


@app.delete(
    "/admin/students/{student_id}/curriculums/{student_curriculum_id}",
    response_model=schemas.DeleteResponse,
    tags=["Admin"],
)
def admin_unassign_curriculum(
    student_id: int,
    student_curriculum_id: int,
    db: Session = Depends(get_db),
):
    ok = crud.unassign_curriculum_from_student(db, student_id, student_curriculum_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Curriculum assignment not found")
    return {"ok": True}


@app.patch(
    "/admin/students/{student_id}/curriculums/{student_curriculum_id}/nodes/{node_id}/status",
    response_model=schemas.CurriculumNodesResponse,
    tags=["Admin"],
)
def admin_update_curriculum_node_status(
    student_id: int,
    student_curriculum_id: int,
    node_id: int,
    payload: schemas.StudentCurriculumNodeStatusUpdateRequest,
    db: Session = Depends(get_db),
):
    student_curriculum = crud.get_student_curriculum(db, student_curriculum_id)
    if student_curriculum is None or student_curriculum.student_id != student_id:
        raise HTTPException(status_code=404, detail="Curriculum not found")

    node = db.query(models.CurriculumNode).filter(
        models.CurriculumNode.id == node_id,
        models.CurriculumNode.curriculum_id == student_curriculum.curriculum_id,
    ).first()
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    try:
        return crud.update_student_curriculum_node_status(db, student_curriculum, node, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/auth/admin-login", response_model=schemas.AdminLoginResponse, tags=["Admin"])
def admin_login(payload: schemas.AdminLoginRequest, db: Session = Depends(get_db)):
    admin = crud.get_admin_by_username(db, payload.username)
    if admin is None or admin.password != payload.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return admin


@app.get("/admin/students", response_model=list[schemas.AdminStudentSummary], tags=["Admin"])
def admin_students(db: Session = Depends(get_db)):
    return crud.get_admin_student_list(db)


@app.get(
    "/admin/homework-dashboard",
    response_model=schemas.AdminHomeworkDashboardResponse,
    tags=["Admin"],
)
def admin_homework_dashboard(date: date, db: Session = Depends(get_db)):
    return crud.get_admin_homework_dashboard(db, date)


@app.get(
    "/admin/textbooks",
    response_model=schemas.AdminTextbookCatalogResponse,
    tags=["Admin"],
)
def admin_textbooks(db: Session = Depends(get_db)):
    return crud.get_admin_textbook_catalog(db)


@app.post(
    "/admin/daily-tasks",
    response_model=schemas.DailyTaskResponse,
    tags=["Admin"],
)
def create_admin_daily_task(
    payload: schemas.AdminDailyTaskCreateRequest,
    db: Session = Depends(get_db),
):
    if payload.status not in crud.DAILY_TASK_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    student = crud.get_student_by_id(db, payload.student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    task = crud.create_daily_task(db, payload)
    return crud.serialize_daily_task(db, task)


@app.patch(
    "/admin/daily-tasks/{task_id}",
    response_model=schemas.DailyTaskResponse,
    tags=["Admin"],
)
def update_admin_daily_task(
    task_id: int,
    payload: schemas.AdminDailyTaskUpdateRequest,
    db: Session = Depends(get_db),
):
    if payload.status is not None and payload.status not in crud.DAILY_TASK_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    task = crud.get_daily_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Daily task not found")

    try:
        updated_task = crud.update_daily_task(db, task, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return crud.serialize_daily_task(db, updated_task)


@app.delete(
    "/admin/daily-tasks/{task_id}",
    response_model=schemas.DeleteResponse,
    tags=["Admin"],
)
def delete_admin_daily_task(task_id: int, db: Session = Depends(get_db)):
    task = crud.get_daily_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Daily task not found")

    crud.delete_daily_task(db, task)
    return {"ok": True}


@app.post(
    "/admin/lecture-assignments/preview",
    response_model=schemas.LectureAssignmentPreviewResponse,
    tags=["Admin"],
)
def preview_lecture_assignment(
    payload: schemas.LectureAssignmentPreviewRequest,
    db: Session = Depends(get_db),
):
    del db
    try:
        return crud.preview_lecture_assignment(payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post(
    "/admin/lecture-assignments",
    response_model=schemas.LectureAssignmentCreateResponse,
    tags=["Admin"],
)
def create_lecture_assignment(
    payload: schemas.LectureAssignmentCreateRequest,
    db: Session = Depends(get_db),
):
    try:
        return crud.create_lecture_assignment(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="인강 배정을 저장하지 못했습니다.")


@app.get(
    "/admin/lecture-assignments",
    response_model=list[schemas.LectureAssignmentListItem],
    tags=["Admin"],
)
def list_lecture_assignments(student_id: Optional[int] = None, db: Session = Depends(get_db)):
    return crud.list_lecture_assignments(db, student_id)


@app.get(
    "/admin/lecture-assignments/{assignment_id}",
    response_model=schemas.LectureAssignmentDetailResponse,
    tags=["Admin"],
)
def admin_lecture_assignment_detail(assignment_id: int, db: Session = Depends(get_db)):
    assignment = crud.get_lecture_assignment_by_id(db, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Lecture assignment not found")

    return crud.get_lecture_assignment_detail(db, assignment)


@app.post(
    "/admin/lecture-assignments/{assignment_id}/reschedule-preview",
    response_model=schemas.LectureAssignmentPreviewResponse,
    tags=["Admin"],
)
def preview_lecture_assignment_reschedule(
    assignment_id: int,
    payload: schemas.LectureAssignmentUpdateRequest,
    db: Session = Depends(get_db),
):
    assignment = crud.get_lecture_assignment_by_id(db, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Lecture assignment not found")

    try:
        return crud.preview_lecture_assignment_update(db, assignment, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.patch(
    "/admin/lecture-assignments/{assignment_id}",
    response_model=schemas.LectureAssignmentUpdateResponse,
    tags=["Admin"],
)
def update_lecture_assignment(
    assignment_id: int,
    payload: schemas.LectureAssignmentUpdateRequest,
    db: Session = Depends(get_db),
):
    assignment = crud.get_lecture_assignment_by_id(db, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Lecture assignment not found")

    try:
        return crud.update_lecture_assignment(db, assignment, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="인강 배정을 저장하지 못했습니다.")


@app.delete(
    "/admin/lecture-assignments/{assignment_id}",
    response_model=schemas.LectureAssignmentDeleteResponse,
    tags=["Admin"],
)
def delete_lecture_assignment(assignment_id: int, db: Session = Depends(get_db)):
    assignment = crud.get_lecture_assignment_by_id(db, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Lecture assignment not found")

    return crud.delete_lecture_assignment(db, assignment)


@app.post(
    "/admin/homework-assignments",
    response_model=schemas.HomeworkAssignmentCreateResponse,
    tags=["Admin"],
)
def create_homework_assignment(
    payload: schemas.HomeworkAssignmentCreateRequest,
    db: Session = Depends(get_db),
):
    try:
        result = crud.create_homework_assignment(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@app.get(
    "/admin/homework-assignments",
    response_model=list[schemas.HomeworkAssignmentListItem],
    tags=["Admin"],
)
def list_homework_assignments(student_id: Optional[int] = None, db: Session = Depends(get_db)):
    return crud.list_homework_assignments(db, student_id)


@app.post(
    "/admin/homework-assignments/{assignment_id}/reschedule-preview",
    response_model=schemas.HomeworkRangePreviewResponse,
    tags=["Admin"],
)
def preview_homework_assignment_reschedule(
    assignment_id: int,
    payload: schemas.HomeworkAssignmentUpdateRequest,
    db: Session = Depends(get_db),
):
    assignment = crud.get_homework_assignment_by_id(db, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Homework assignment not found")

    try:
        return crud.preview_homework_assignment_update(db, assignment, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.patch(
    "/admin/homework-assignments/{assignment_id}",
    response_model=schemas.HomeworkAssignmentUpdateResponse,
    tags=["Admin"],
)
def update_homework_assignment(
    assignment_id: int,
    payload: schemas.HomeworkAssignmentUpdateRequest,
    db: Session = Depends(get_db),
):
    assignment = crud.get_homework_assignment_by_id(db, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Homework assignment not found")

    try:
        return crud.update_homework_assignment(db, assignment, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete(
    "/admin/homework-assignments/{assignment_id}",
    response_model=schemas.HomeworkAssignmentDeleteResponse,
    tags=["Admin"],
)
def delete_homework_assignment(assignment_id: int, db: Session = Depends(get_db)):
    assignment = crud.get_homework_assignment_by_id(db, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Homework assignment not found")

    return crud.delete_homework_assignment(db, assignment)


@app.get(
    "/admin/students/{student_id}/progress",
    response_model=schemas.StudentProgressDetailResponse,
    tags=["Admin"],
)
def admin_student_progress(student_id: int, db: Session = Depends(get_db)):
    summary = crud.build_progress_tree(db, student_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="Student not found")
    return summary


@app.get(
    "/admin/students/{student_id}/homework",
    response_model=schemas.AdminStudentHomeworkResponse,
    tags=["Admin"],
)
def admin_student_homework(
    student_id: int,
    date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    target_date = date or get_study_date()
    return crud.get_admin_student_homework(db, student_id, target_date)


@app.get(
    "/admin/textbook-series",
    response_model=list[schemas.TextbookSeriesResponse],
    tags=["Admin"],
)
def list_textbook_series(db: Session = Depends(get_db)):
    return crud.get_textbook_series_list(db)


@app.post(
    "/admin/textbook-series",
    response_model=schemas.TextbookSeriesResponse,
    tags=["Admin"],
)
def create_textbook_series(
    payload: schemas.TextbookSeriesCreateRequest,
    db: Session = Depends(get_db),
):
    series, _ = crud.create_or_get_textbook_series(db, payload.model_dump())
    return series


@app.post(
    "/admin/textbooks",
    response_model=schemas.TextbookDetailResponse,
    tags=["Admin"],
)
def create_textbook(
    payload: schemas.TextbookCreateRequest,
    db: Session = Depends(get_db),
):
    try:
        textbook = crud.create_textbook_with_items(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="중복된 교재 정보가 있어 저장할 수 없습니다. 교재명/교재 키를 확인해주세요.",
        )
    result = crud.get_textbook_detail_admin(db, textbook.id)
    return result


@app.get(
    "/admin/textbook-list",
    response_model=schemas.TextbookListResponse,
    tags=["Admin"],
)
def admin_textbook_list(db: Session = Depends(get_db)):
    return {"textbooks": crud.get_admin_textbook_list(db)}


@app.get(
    "/admin/textbooks/{textbook_id}",
    response_model=schemas.TextbookDetailResponse,
    tags=["Admin"],
)
def admin_textbook_detail(textbook_id: int, db: Session = Depends(get_db)):
    result = crud.get_textbook_detail_admin(db, textbook_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Textbook not found")
    return result


@app.patch(
    "/admin/textbooks/{textbook_id}",
    response_model=schemas.TextbookDetailResponse,
    tags=["Admin"],
)
def admin_update_textbook(
    textbook_id: int,
    payload: schemas.TextbookUpdateRequest,
    db: Session = Depends(get_db),
):
    try:
        textbook = crud.update_textbook(db, textbook_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="중복된 교재 정보가 있어 수정할 수 없습니다. 교재명/교재 키를 확인해주세요.",
        )

    if textbook is None:
        raise HTTPException(status_code=404, detail="Textbook not found")

    result = crud.get_textbook_detail_admin(db, textbook_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Textbook not found")
    return result


@app.delete(
    "/admin/textbooks/{textbook_id}",
    response_model=schemas.DeleteResponse,
    tags=["Admin"],
)
def admin_delete_textbook(textbook_id: int, db: Session = Depends(get_db)):
    deleted = crud.delete_textbook_soft(db, textbook_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Textbook not found")
    return {"ok": True}


@app.get(
    "/admin/textbooks/{textbook_id}/assignments",
    response_model=schemas.TextbookAssignmentsResponse,
    tags=["Admin"],
)
def get_textbook_assignments(textbook_id: int, db: Session = Depends(get_db)):
    result = crud.get_textbook_detail_admin(db, textbook_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Textbook not found")
    assignments = crud.get_textbook_assignments(db, textbook_id)
    return {
        "textbook_id": textbook_id,
        "is_student_only": result["is_student_only"],
        "assignments": assignments,
    }


@app.get(
    "/admin/textbooks/{textbook_id}/sections",
    response_model=schemas.TextbookSectionsResponse,
    tags=["Admin"],
)
def admin_get_textbook_sections(textbook_id: int, db: Session = Depends(get_db)):
    textbook = db.query(models.MathTextbook).filter(models.MathTextbook.id == textbook_id).first()
    if textbook is None:
        raise HTTPException(status_code=404, detail="Textbook not found")
    sections = crud.get_textbook_sections(db, textbook_id)
    return {
        "textbook_id": textbook_id,
        "textbook_key": textbook.textbook_key or "",
        "structure_type": getattr(textbook, "structure_type", "none") or "none",
        "sections": sections,
    }


@app.put(
    "/admin/textbooks/{textbook_id}/sections",
    response_model=schemas.TextbookSectionsResponse,
    tags=["Admin"],
)
def admin_replace_textbook_sections(
    textbook_id: int,
    payload: schemas.TextbookSectionsReplaceRequest,
    db: Session = Depends(get_db),
):
    textbook = db.query(models.MathTextbook).filter(models.MathTextbook.id == textbook_id).first()
    if textbook is None:
        raise HTTPException(status_code=404, detail="Textbook not found")
    if payload.structure_type is not None:
        textbook.structure_type = payload.structure_type
        db.commit()
    try:
        sections = crud.replace_textbook_sections(db, textbook_id, payload.sections)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {
        "textbook_id": textbook_id,
        "textbook_key": textbook.textbook_key or "",
        "structure_type": getattr(textbook, "structure_type", "none") or "none",
        "sections": sections,
    }


@app.post(
    "/admin/textbooks/{textbook_id}/assign/{student_id}",
    response_model=schemas.DeleteResponse,
    tags=["Admin"],
)
def assign_student_textbook(textbook_id: int, student_id: int, db: Session = Depends(get_db)):
    if crud.get_textbook_detail_admin(db, textbook_id) is None:
        raise HTTPException(status_code=404, detail="Textbook not found")
    if crud.get_student_by_id(db, student_id) is None:
        raise HTTPException(status_code=404, detail="Student not found")
    crud.assign_student_textbook(db, textbook_id, student_id)
    return {"ok": True}


@app.delete(
    "/admin/textbooks/{textbook_id}/assign/{student_id}",
    response_model=schemas.DeleteResponse,
    tags=["Admin"],
)
def unassign_student_textbook(textbook_id: int, student_id: int, db: Session = Depends(get_db)):
    crud.unassign_student_textbook(db, textbook_id, student_id)
    return {"ok": True}


@app.patch(
    "/admin/textbooks/{textbook_id}/student-only",
    response_model=schemas.DeleteResponse,
    tags=["Admin"],
)
def set_textbook_student_only(
    textbook_id: int,
    payload: schemas.TextbookStudentOnlyRequest,
    db: Session = Depends(get_db),
):
    ok = crud.set_textbook_student_only(db, textbook_id, payload.is_student_only)
    if not ok:
        raise HTTPException(status_code=404, detail="Textbook not found")
    return {"ok": True}


@app.get(
    "/admin/students/{student_id}/textbook-ids",
    response_model=schemas.StudentTextbookIdsResponse,
    tags=["Admin"],
)
def get_student_textbook_ids(student_id: int, db: Session = Depends(get_db)):
    if crud.get_student_by_id(db, student_id) is None:
        raise HTTPException(status_code=404, detail="Student not found")
    return {"textbook_ids": crud.get_student_textbook_ids(db, student_id)}


@app.get(
    "/admin/textbooks-for-student/{student_id}",
    response_model=schemas.AdminTextbookCatalogResponse,
    tags=["Admin"],
)
def admin_textbooks_for_student(student_id: int, db: Session = Depends(get_db)):
    if crud.get_student_by_id(db, student_id) is None:
        raise HTTPException(status_code=404, detail="Student not found")
    return crud.get_textbooks_for_student_catalog(db, student_id)
