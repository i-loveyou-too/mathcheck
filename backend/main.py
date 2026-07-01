import os
from contextlib import asynccontextmanager

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
    allow_origin_regex=os.getenv("FRONTEND_ORIGIN_REGEX", r"https://.*\.vercel\.app"),
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
    "/student/textbook-progress/deep-su1-exp-log",
    response_model=schemas.TextbookProgressResponse,
    tags=["Student"],
)
def deep_su1_exp_log_progress(student_id: int, db: Session = Depends(get_db)):
    student = crud.get_student_by_id(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    progress = crud.get_deep_su1_exp_log_progress(db, student_id)
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
    "/admin/students/{student_id}/progress",
    response_model=schemas.StudentProgressDetailResponse,
    tags=["Admin"],
)
def admin_student_progress(student_id: int, db: Session = Depends(get_db)):
    summary = crud.build_progress_tree(db, student_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="Student not found")
    return summary
