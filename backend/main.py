import os
from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import crud
import models  # noqa: F401 - importing models registers them with SQLAlchemy
import schemas
from database import Base, engine, get_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables automatically on startup so the app is easy to run locally.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Math Progress API", lifespan=lifespan)

allowed_origins = [
    "https://aimon.teamzsoft.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
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
        r"https://.*\.vercel\.app|http://(localhost|127\.0\.0\.1):\d+",
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
    "/student/textbook-progress/{textbook_key}",
    response_model=schemas.TextbookProgressResponse,
    tags=["Student"],
)
def textbook_progress(textbook_key: str, student_id: int, db: Session = Depends(get_db)):
    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

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
