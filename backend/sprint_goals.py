"""SPRINT 과목별 목표 등록 및 완료 체크 (6차).

기존 SprintGoal(정량 target_value/current_value, "기간 목표" 섹션)과는 별개 기능이다.
과목별로 묶인 단순 완료체크 목표이므로 모델/테이블/라우트를 전부 분리해 기존 기능과
절대 충돌하지 않게 한다. (SprintProgram은 학생별 1:1이라 student_id 컬럼을 별도로
중복해서 두지 않고 sprint_program_id로만 학생을 식별한다.)
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models
from database import get_db


router = APIRouter(tags=["Sprint Subject Goals"])

SEOUL_TZ = timezone(timedelta(hours=9))
SUBJECT_OPTIONS = ["국어", "수학", "영어", "탐구", "기타"]
SubjectLiteral = Literal["국어", "수학", "영어", "탐구", "기타"]


def today_seoul() -> date:
    return datetime.now(timezone.utc).astimezone(SEOUL_TZ).date()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class SubjectGoalCreateIn(BaseModel):
    subject: SubjectLiteral
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    target_date: date | None = None
    order_index: int = 0
    created_by_id: int | None = None


class SubjectGoalUpdateIn(BaseModel):
    subject: SubjectLiteral | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    target_date: date | None = None
    order_index: int | None = None
    is_completed: bool | None = None
    is_active: bool | None = None


class StudentActionIn(BaseModel):
    student_id: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def get_program_or_404(db: Session, program_id: int) -> models.SprintProgram:
    program = db.get(models.SprintProgram, program_id)
    if program is None:
        raise HTTPException(status_code=404, detail="SPRINT 프로그램을 찾을 수 없습니다.")
    return program


def get_goal_or_404(db: Session, goal_id: int) -> models.SprintSubjectGoal:
    goal = db.get(models.SprintSubjectGoal, goal_id)
    if goal is None:
        raise HTTPException(status_code=404, detail="목표를 찾을 수 없습니다.")
    return goal


def get_student_or_404(db: Session, student_id: int) -> models.Student:
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    return student


def ensure_own_goal(db: Session, goal: models.SprintSubjectGoal, student_id: int) -> None:
    program = db.get(models.SprintProgram, goal.sprint_program_id)
    if program is None or program.student_id != student_id:
        raise HTTPException(status_code=403, detail="다른 학생의 목표에는 접근할 수 없습니다.")


def compute_target_status(goal: models.SprintSubjectGoal, today: date) -> str:
    """지연 여부는 표시용일 뿐이며 스트라이크와 연결하지 않는다."""
    if goal.is_completed:
        return "completed"
    if goal.target_date is None:
        return "in_progress"
    if goal.target_date > today:
        return "in_progress"
    if goal.target_date == today:
        return "due_today"
    return "overdue"


def goal_dict(goal: models.SprintSubjectGoal, today: date | None = None) -> dict:
    return {
        "id": goal.id,
        "sprint_program_id": goal.sprint_program_id,
        "subject": goal.subject,
        "title": goal.title,
        "description": goal.description,
        "target_date": goal.target_date,
        "completed_at": goal.completed_at,
        "is_completed": goal.is_completed,
        "created_by_type": goal.created_by_type,
        "created_by_id": goal.created_by_id,
        "order_index": goal.order_index,
        "is_active": goal.is_active,
        "target_status": compute_target_status(goal, today or today_seoul()),
    }


def set_completed(goal: models.SprintSubjectGoal, value: bool) -> None:
    """미완료->완료는 새 완료일을 기록하고, 완료->완료 재호출은 기존 완료일을 유지한다.
    완료 취소는 완료일을 null로 되돌린다. (idempotent)"""
    if value and not goal.is_completed:
        goal.is_completed = True
        goal.completed_at = datetime.now(timezone.utc)
    elif not value:
        goal.is_completed = False
        goal.completed_at = None
    # value=True인데 이미 is_completed=True인 경우: 아무것도 바꾸지 않는다 (완료일 유지).


def subject_summary(goals: list[models.SprintSubjectGoal]) -> list[dict]:
    grouped: dict[str, list[models.SprintSubjectGoal]] = {}
    for goal in goals:
        grouped.setdefault(goal.subject, []).append(goal)
    result = []
    for subject in SUBJECT_OPTIONS:
        items = grouped.get(subject)
        if not items:
            continue
        completed = sum(1 for g in items if g.is_completed)
        result.append({
            "subject": subject,
            "total": len(items),
            "completed": completed,
            "completion_rate": round(completed * 100 / len(items)) if items else 0,
        })
    return result


# ---------------------------------------------------------------------------
# 관리자 API
# ---------------------------------------------------------------------------


@router.get("/admin/sprints/{program_id}/subject-goals")
def admin_list_subject_goals(program_id: int, db: Session = Depends(get_db)):
    get_program_or_404(db, program_id)
    goals = (
        db.query(models.SprintSubjectGoal)
        .filter_by(sprint_program_id=program_id, is_active=True)
        .order_by(models.SprintSubjectGoal.subject, models.SprintSubjectGoal.order_index, models.SprintSubjectGoal.id)
        .all()
    )
    return {"goals": [goal_dict(goal) for goal in goals], "subjects": subject_summary(goals)}


@router.post("/admin/sprints/{program_id}/subject-goals", status_code=201)
def admin_create_subject_goal(program_id: int, payload: SubjectGoalCreateIn, db: Session = Depends(get_db)):
    get_program_or_404(db, program_id)
    values = payload.model_dump()
    goal = models.SprintSubjectGoal(sprint_program_id=program_id, created_by_type="admin", **values)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal_dict(goal)


@router.patch("/admin/sprints/{program_id}/subject-goals/{goal_id}")
def admin_update_subject_goal(program_id: int, goal_id: int, payload: SubjectGoalUpdateIn, db: Session = Depends(get_db)):
    get_program_or_404(db, program_id)
    goal = get_goal_or_404(db, goal_id)
    if goal.sprint_program_id != program_id:
        raise HTTPException(status_code=400, detail="해당 목표는 이 SPRINT에 속하지 않습니다.")
    values = payload.model_dump(exclude_unset=True)
    if "is_completed" in values:
        set_completed(goal, values.pop("is_completed"))
    for key, value in values.items():
        setattr(goal, key, value)
    db.commit()
    db.refresh(goal)
    return goal_dict(goal)


@router.delete("/admin/sprints/{program_id}/subject-goals/{goal_id}")
def admin_delete_subject_goal(program_id: int, goal_id: int, db: Session = Depends(get_db)):
    get_program_or_404(db, program_id)
    goal = get_goal_or_404(db, goal_id)
    if goal.sprint_program_id != program_id:
        raise HTTPException(status_code=400, detail="해당 목표는 이 SPRINT에 속하지 않습니다.")
    if goal.is_completed:
        # 완료 기록은 보존한다: 하드 삭제 대신 비활성화한다.
        goal.is_active = False
        db.commit()
        return {"soft_deleted": True, "deleted": False}
    db.delete(goal)
    db.commit()
    return {"soft_deleted": False, "deleted": True}


# ---------------------------------------------------------------------------
# 학생 API (본인 SPRINT 목표만 접근)
# ---------------------------------------------------------------------------


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


@router.get("/student/sprint/subject-goals")
def student_list_subject_goals(student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    program = student_active_program(db, student_id, today_seoul())
    if program is None:
        return {"available": False, "goals": [], "subjects": [], "total": 0, "completed": 0, "completion_rate": None}
    goals = (
        db.query(models.SprintSubjectGoal)
        .filter_by(sprint_program_id=program.id, is_active=True)
        .order_by(models.SprintSubjectGoal.subject, models.SprintSubjectGoal.order_index, models.SprintSubjectGoal.id)
        .all()
    )
    today = today_seoul()
    total = len(goals)
    completed = sum(1 for goal in goals if goal.is_completed)
    return {
        "available": True,
        "goals": [goal_dict(goal, today) for goal in goals],
        "subjects": subject_summary(goals),
        "total": total,
        "completed": completed,
        "completion_rate": round(completed * 100 / total) if total else None,
    }


@router.post("/student/sprint/subject-goals/{goal_id}/complete")
def student_complete_subject_goal(goal_id: int, payload: StudentActionIn, db: Session = Depends(get_db)):
    get_student_or_404(db, payload.student_id)
    goal = get_goal_or_404(db, goal_id)
    ensure_own_goal(db, goal, payload.student_id)
    set_completed(goal, True)
    db.commit()
    db.refresh(goal)
    return goal_dict(goal)


@router.post("/student/sprint/subject-goals", status_code=201)
def student_create_subject_goal(payload: SubjectGoalCreateIn, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    program = student_active_program(db, student_id, today_seoul())
    if program is None:
        raise HTTPException(status_code=404, detail="진행 중인 SPRINT가 없습니다.")
    values = payload.model_dump()
    values["created_by_id"] = student_id
    goal = models.SprintSubjectGoal(
        sprint_program_id=program.id,
        created_by_type="student",
        **values,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal_dict(goal)


@router.patch("/student/sprint/subject-goals/{goal_id}")
def student_update_subject_goal(goal_id: int, payload: SubjectGoalUpdateIn, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    goal = get_goal_or_404(db, goal_id)
    ensure_own_goal(db, goal, student_id)
    if goal.created_by_type != "student":
        raise HTTPException(status_code=400, detail="관리자가 등록한 목표는 내용 수정할 수 없습니다.")
    values = payload.model_dump(exclude_unset=True)
    if "is_completed" in values:
        set_completed(goal, values.pop("is_completed"))
    for key, value in values.items():
        setattr(goal, key, value)
    db.commit()
    db.refresh(goal)
    return goal_dict(goal)


@router.delete("/student/sprint/subject-goals/{goal_id}")
def student_delete_subject_goal(goal_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    goal = get_goal_or_404(db, goal_id)
    ensure_own_goal(db, goal, student_id)
    if goal.created_by_type != "student":
        raise HTTPException(status_code=400, detail="관리자가 등록한 목표는 삭제할 수 없습니다.")
    db.delete(goal)
    db.commit()
    return {"deleted": True}


@router.post("/student/sprint/subject-goals/{goal_id}/uncomplete")
def student_uncomplete_subject_goal(goal_id: int, payload: StudentActionIn, db: Session = Depends(get_db)):
    get_student_or_404(db, payload.student_id)
    goal = get_goal_or_404(db, goal_id)
    ensure_own_goal(db, goal, payload.student_id)
    set_completed(goal, False)
    db.commit()
    db.refresh(goal)
    return goal_dict(goal)


@router.get("/student/sprint/records/subject-goals")
def student_subject_goal_records(student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    return {"records": subject_goal_records(db, student_id)}


# ---------------------------------------------------------------------------
# SPRINT 대시보드/기록 연결 (sprint.py가 지연 import로 사용)
# ---------------------------------------------------------------------------


def subject_goal_home_summary(db: Session, program: models.SprintProgram) -> dict:
    goals = (
        db.query(models.SprintSubjectGoal)
        .filter_by(sprint_program_id=program.id, is_active=True)
        .order_by(models.SprintSubjectGoal.order_index, models.SprintSubjectGoal.id)
        .all()
    )
    if not goals:
        return {
            "available": True, "total": 0, "completed": 0, "completion_rate": None,
            "next_goal": None, "path": "/student/sprint/progress",
        }
    total = len(goals)
    completed = sum(1 for goal in goals if goal.is_completed)
    upcoming = sorted(
        (goal for goal in goals if not goal.is_completed and goal.target_date is not None),
        key=lambda goal: goal.target_date,
    )
    next_goal = upcoming[0] if upcoming else None
    return {
        "available": True,
        "total": total,
        "completed": completed,
        "completion_rate": round(completed * 100 / total),
        "next_goal": {
            "title": next_goal.title,
            "subject": next_goal.subject,
            "target_date": next_goal.target_date,
        } if next_goal else None,
        "path": "/student/sprint/progress",
    }


def subject_goal_records(db: Session, student_id: int) -> list[dict]:
    rows = (
        db.query(models.SprintSubjectGoal)
        .join(models.SprintProgram, models.SprintSubjectGoal.sprint_program_id == models.SprintProgram.id)
        .filter(
            models.SprintProgram.student_id == student_id,
            models.SprintSubjectGoal.is_completed.is_(True),
        )
        .order_by(models.SprintSubjectGoal.completed_at.desc())
        .all()
    )
    return [
        {"title": goal.title, "subject": goal.subject, "completed_at": goal.completed_at}
        for goal in rows
    ]
