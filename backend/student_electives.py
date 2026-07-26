from __future__ import annotations

from pydantic import BaseModel, model_validator
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
from database import get_db


router = APIRouter(tags=["Student Electives"])

INQUIRY_CODE_TO_NAME = {
    "life_ethics": "생활과 윤리",
    "ethics_thought": "윤리와 사상",
    "social_culture": "사회문화",
    "east_asian_history": "동아시아사",
}
INQUIRY_SUBJECT_CODES = set(INQUIRY_CODE_TO_NAME.keys())
INQUIRY_NAMES = list(INQUIRY_CODE_TO_NAME.values())
KOREAN_ELECTIVES = ["화법과 작문", "언어와 매체"]
MATH_ELECTIVES = ["확률과 통계", "미적분", "기하"]


def normalize_inquiry(value: str | None) -> str | None:
    if not value:
        return None
    return INQUIRY_CODE_TO_NAME.get(value, value)


def get_student_or_404(db: Session, student_id: int) -> models.Student:
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    return student


class StudentElectiveIn(BaseModel):
    korean_elective: str | None = None
    math_elective: str | None = None
    inquiry_subject_1: str | None = None
    inquiry_subject_2: str | None = None

    @model_validator(mode="after")
    def validate_choices(self):
        if self.korean_elective and self.korean_elective not in KOREAN_ELECTIVES:
            raise ValueError(f"국어 선택과목은 {', '.join(KOREAN_ELECTIVES)} 중 하나여야 합니다.")
        if self.math_elective and self.math_elective not in MATH_ELECTIVES:
            raise ValueError(f"수학 선택과목은 {', '.join(MATH_ELECTIVES)} 중 하나여야 합니다.")
        for value in (self.inquiry_subject_1, self.inquiry_subject_2):
            if value and normalize_inquiry(value) not in INQUIRY_NAMES:
                raise ValueError(f"탐구 과목은 {', '.join(INQUIRY_NAMES)} 중 하나여야 합니다.")
        if (
            self.inquiry_subject_1
            and self.inquiry_subject_2
            and normalize_inquiry(self.inquiry_subject_1) == normalize_inquiry(self.inquiry_subject_2)
        ):
            raise ValueError("탐구 두 과목은 서로 달라야 합니다.")
        return self


class InquirySubjectsIn(BaseModel):
    student_id: int
    inquiry_subject_1: str | None = None
    inquiry_subject_2: str | None = None

    @model_validator(mode="after")
    def validate_subjects(self):
        for value in (self.inquiry_subject_1, self.inquiry_subject_2):
            if value is not None and value not in INQUIRY_SUBJECT_CODES:
                raise ValueError("허용되지 않은 탐구 선택과목입니다.")
        if (
            self.inquiry_subject_1 is not None
            and self.inquiry_subject_2 is not None
            and self.inquiry_subject_1 == self.inquiry_subject_2
        ):
            raise ValueError("탐구 선택과목 두 개는 서로 달라야 합니다.")
        return self


def student_elective_profile(db: Session, student: models.Student) -> dict:
    inquiry_1 = normalize_inquiry(student.inquiry_subject_1)
    inquiry_2 = normalize_inquiry(student.inquiry_subject_2)
    if inquiry_1 is None and inquiry_2 is None:
        program = (
            db.query(models.SprintProgram)
            .filter(models.SprintProgram.student_id == student.id, models.SprintProgram.is_active.is_(True))
            .order_by(models.SprintProgram.start_date.desc())
            .first()
        )
        if program is not None:
            inquiry_1 = normalize_inquiry(program.inquiry_subject_1)
            inquiry_2 = normalize_inquiry(program.inquiry_subject_2)
    return {
        "korean_elective": student.korean_elective,
        "math_elective": student.math_elective,
        "inquiry_subject_1": inquiry_1,
        "inquiry_subject_2": inquiry_2,
    }


@router.get("/admin/students/{student_id}/electives")
def admin_get_student_electives(student_id: int, db: Session = Depends(get_db)):
    student = get_student_or_404(db, student_id)
    return {
        "student_id": student.id,
        "student_name": student.name,
        **student_elective_profile(db, student),
        "options": {"korean": KOREAN_ELECTIVES, "math": MATH_ELECTIVES, "inquiry": INQUIRY_NAMES},
    }


@router.patch("/admin/students/{student_id}/electives")
def admin_update_student_electives(student_id: int, payload: StudentElectiveIn, db: Session = Depends(get_db)):
    student = get_student_or_404(db, student_id)
    values = payload.model_dump(exclude_unset=True)
    if "inquiry_subject_1" in values:
        values["inquiry_subject_1"] = normalize_inquiry(values["inquiry_subject_1"])
    if "inquiry_subject_2" in values:
        values["inquiry_subject_2"] = normalize_inquiry(values["inquiry_subject_2"])
    for key, value in values.items():
        setattr(student, key, value)
    db.commit()
    db.refresh(student)
    return {
        "student_id": student.id,
        "student_name": student.name,
        **student_elective_profile(db, student),
    }


@router.patch("/student/sprint/inquiry-subjects")
def student_update_inquiry_subjects(payload: InquirySubjectsIn, db: Session = Depends(get_db)):
    student = get_student_or_404(db, payload.student_id)
    programs = db.query(models.SprintProgram).filter_by(student_id=student.id, is_active=True).all()
    if not programs:
        raise HTTPException(status_code=404, detail="활성화된 SPRINT가 없습니다.")

    for program in programs:
        program.inquiry_subject_1 = payload.inquiry_subject_1
        program.inquiry_subject_2 = payload.inquiry_subject_2
    db.commit()
    return {
        "inquiry_subject_1": payload.inquiry_subject_1,
        "inquiry_subject_2": payload.inquiry_subject_2,
    }
