import os
from contextlib import asynccontextmanager
from datetime import date
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

import crud
import models  # noqa: F401 - importing models registers them with SQLAlchemy
import schemas
from database import Base, SessionLocal, engine, get_db


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables automatically on startup so the app is easy to run locally.
    Base.metadata.create_all(bind=engine)
    ensure_textbook_key_column()
    ensure_daily_task_completed_at_column()
    ensure_textbook_is_student_only_column()
    ensure_textbook_structure_type_column()
    db = SessionLocal()
    try:
        crud.sync_textbook_keys(db)
        crud.backfill_textbook_subjects(db)
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
    student_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    return {"textbooks": crud.get_active_textbooks_by_subject(db, subject, student_id)}


@app.get(
    "/student/textbooks/{textbook_key}",
    response_model=schemas.StudentTextbookResponse,
    tags=["Student"],
)
def student_textbook_by_key(textbook_key: str, db: Session = Depends(get_db)):
    textbook = crud.get_student_textbook_by_key(db, textbook_key)
    if textbook is None:
        raise HTTPException(status_code=404, detail="Textbook not found")
    return textbook


@app.get(
    "/student/textbooks/{textbook_key}/sections",
    response_model=schemas.TextbookSectionsResponse,
    tags=["Student"],
)
def student_textbook_sections(textbook_key: str, db: Session = Depends(get_db)):
    textbook = crud.get_textbook_by_key(db, textbook_key)
    if textbook is None:
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

    if textbook.is_student_only and not crud.is_textbook_assigned_to_student(
        db, textbook.id, student_id
    ):
        raise HTTPException(status_code=403, detail="Textbook not assigned to student")

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

    updated_task = crud.update_daily_task(
        db,
        task,
        schemas.AdminDailyTaskUpdateRequest(status=payload.status),
    )
    return crud.serialize_daily_task(updated_task)


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
    return crud.serialize_daily_task(task)


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

    updated_task = crud.update_daily_task(db, task, payload)
    return crud.serialize_daily_task(updated_task)


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
    sections = crud.replace_textbook_sections(db, textbook_id, payload.sections)
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
