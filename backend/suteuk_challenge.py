from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from database import get_db
from study_dates import get_study_date
from suteuk_concepts import SUTEUK_CONCEPT_ITEMS
from suteuk_formula_quiz import FORMULA_QUIZ_BY_CODE, FORMULA_QUIZ_BY_DAY, FORMULA_QUIZ_EXPECTED_COUNT


router = APIRouter(tags=["Suteuk Challenge"])

DEFAULT_CHALLENGE_TYPE = "suteuk_10day"
ASSIGNMENT_STATUSES = {"active", "paused"}
PROGRESS_TASK_TYPES = {"workbook", "concept_recall", "formula_quiz", "concept_review"}
MANUAL_TASK_TYPES = {"workbook", "concept_review"}
CONCEPT_RESPONSES = {"know", "unsure", "dont_know"}
CONCEPT_FINAL_STATUSES = {"understood_after_card", "still_dont_know"}
CONCEPTS_BY_DAY = {
    day: [item for item in SUTEUK_CONCEPT_ITEMS if item["day"] == day]
    for day in range(1, 10 + 1)
}
CONCEPT_BY_CODE = {item["code"]: item for item in SUTEUK_CONCEPT_ITEMS}

SUTEUK_CHALLENGE_DAYS = [
    {
        "day": 1,
        "level": 1,
        "title": "DAY 1",
        "tasks": [
            {"code": "day1_concept_recall", "type": "concept_recall", "title": "개념 떠올리기", "order": 1},
            {"code": "day1_formula_quiz", "type": "formula_quiz", "title": "공식 CHECK", "order": 2},
            {"code": "day1_math1_exp_log_l1", "type": "workbook", "subject": "math1", "chapter": "지수와 로그", "level": 1, "problem_count": 10, "order": 3},
            {"code": "day1_math1_exp_log_function_l1", "type": "workbook", "subject": "math1", "chapter": "지수함수와 로그함수", "level": 1, "problem_count": 8, "order": 4},
            {"code": "day1_math1_trig_l1", "type": "workbook", "subject": "math1", "chapter": "삼각함수", "level": 1, "problem_count": 8, "order": 5},
            {"code": "day1_math2_limit_l1", "type": "workbook", "subject": "math2", "chapter": "함수의 극한", "level": 1, "problem_count": 8, "order": 6},
            {"code": "day1_math2_continuity_l1", "type": "workbook", "subject": "math2", "chapter": "함수의 연속", "level": 1, "problem_count": 8, "order": 7},
            {"code": "day1_probability_permutation_l1", "type": "workbook", "subject": "probability", "chapter": "여러 가지 순열", "level": 1, "problem_count": 8, "order": 8},
            {"code": "day1_probability_combination_binomial_l1", "type": "workbook", "subject": "probability", "chapter": "중복조합과 이항정리", "level": 1, "problem_count": 8, "order": 9},
        ],
    },
    {
        "day": 2,
        "level": 1,
        "title": "DAY 2",
        "tasks": [
            {"code": "day2_concept_recall", "type": "concept_recall", "title": "개념 떠올리기", "order": 1},
            {"code": "day2_formula_quiz", "type": "formula_quiz", "title": "공식 CHECK", "order": 2},
            {"code": "day2_math1_sine_cosine_l1", "type": "workbook", "subject": "math1", "chapter": "사인법칙과 코사인법칙", "level": 1, "problem_count": 12, "order": 3},
            {"code": "day2_math2_derivative_basic_l1", "type": "workbook", "subject": "math2", "chapter": "미분계수와 도함수", "level": 1, "problem_count": 7, "order": 4},
            {"code": "day2_math2_derivative_use1_l1", "type": "workbook", "subject": "math2", "chapter": "도함수의 활용⑴", "level": 1, "problem_count": 8, "order": 5},
            {"code": "day2_math2_derivative_use2_l1", "type": "workbook", "subject": "math2", "chapter": "도함수의 활용⑵", "level": 1, "problem_count": 8, "order": 6},
            {"code": "day2_probability_meaning_l1", "type": "workbook", "subject": "probability", "chapter": "확률의 뜻과 활용", "level": 1, "problem_count": 8, "order": 7},
            {"code": "day2_probability_conditional_l1", "type": "workbook", "subject": "probability", "chapter": "조건부확률", "level": 1, "problem_count": 8, "order": 8},
        ],
    },
    {
        "day": 3,
        "level": 1,
        "title": "DAY 3",
        "tasks": [
            {"code": "day3_concept_recall", "type": "concept_recall", "title": "개념 떠올리기", "order": 1},
            {"code": "day3_formula_quiz", "type": "formula_quiz", "title": "공식 CHECK", "order": 2},
            {"code": "day3_math1_sequence_l1", "type": "workbook", "subject": "math1", "chapter": "등차수열과 등비수열", "level": 1, "problem_count": 8, "order": 3},
            {"code": "day3_math1_sequence_sum_l1", "type": "workbook", "subject": "math1", "chapter": "수열의 합과 수학적 귀납법", "level": 1, "problem_count": 8, "order": 4},
            {"code": "day3_math2_integral_l1", "type": "workbook", "subject": "math2", "chapter": "부정적분과 정적분", "level": 1, "problem_count": 8, "order": 5},
            {"code": "day3_math2_integral_application_l1", "type": "workbook", "subject": "math2", "chapter": "정적분의 활용", "level": 1, "problem_count": 8, "order": 6},
            {"code": "day3_probability_discrete_l1", "type": "workbook", "subject": "probability", "chapter": "이산확률변수의 확률분포", "level": 1, "problem_count": 9, "order": 7},
            {"code": "day3_probability_continuous_l1", "type": "workbook", "subject": "probability", "chapter": "연속확률변수의 확률분포", "level": 1, "problem_count": 8, "order": 8},
            {"code": "day3_probability_estimation_l1", "type": "workbook", "subject": "probability", "chapter": "통계적 추정", "level": 1, "problem_count": 8, "order": 9},
        ],
    },
    {
        "day": 4,
        "level": 2,
        "title": "DAY 4",
        "tasks": [
            {"code": "day4_practical_concept_review", "type": "concept_review", "title": "실전개념 복습하기", "order": 1},
            {"code": "day4_math1_exp_log_l2", "type": "workbook", "subject": "math1", "chapter": "지수와 로그", "level": 2, "problem_count": 8, "order": 2},
            {"code": "day4_math1_exp_log_function_l2", "type": "workbook", "subject": "math1", "chapter": "지수함수와 로그함수", "level": 2, "problem_count": 8, "order": 3},
            {"code": "day4_math2_limit_l2", "type": "workbook", "subject": "math2", "chapter": "함수의 극한", "level": 2, "problem_count": 7, "order": 4},
        ],
    },
    {
        "day": 5,
        "level": 2,
        "title": "DAY 5",
        "tasks": [
            {"code": "day5_practical_concept_review", "type": "concept_review", "title": "실전개념 복습하기", "order": 1},
            {"code": "day5_math1_trig_l2", "type": "workbook", "subject": "math1", "chapter": "삼각함수", "level": 2, "problem_count": 8, "order": 2},
            {"code": "day5_math1_sine_cosine_l2", "type": "workbook", "subject": "math1", "chapter": "사인법칙과 코사인법칙", "level": 2, "problem_count": 11, "order": 3},
            {"code": "day5_math2_continuity_l2", "type": "workbook", "subject": "math2", "chapter": "함수의 연속", "level": 2, "problem_count": 7, "order": 4},
        ],
    },
    {
        "day": 6,
        "level": 2,
        "title": "DAY 6",
        "tasks": [
            {"code": "day6_practical_concept_review", "type": "concept_review", "title": "실전개념 복습하기", "order": 1},
            {"code": "day6_math2_derivative_basic_l2", "type": "workbook", "subject": "math2", "chapter": "미분계수와 도함수", "level": 2, "problem_count": 8, "order": 2},
            {"code": "day6_math2_derivative_use1_l2", "type": "workbook", "subject": "math2", "chapter": "도함수의 활용 ⑴", "level": 2, "problem_count": 7, "order": 3},
            {"code": "day6_math2_derivative_use2_l2", "type": "workbook", "subject": "math2", "chapter": "도함수의 활용 ⑵", "level": 2, "problem_count": 7, "order": 4},
        ],
    },
    {
        "day": 7,
        "level": 2,
        "title": "DAY 7",
        "tasks": [
            {"code": "day7_practical_concept_review", "type": "concept_review", "title": "실전개념 복습하기", "order": 1},
            {"code": "day7_math1_sequence_l2", "type": "workbook", "subject": "math1", "chapter": "등차수열과 등비수열", "level": 2, "problem_count": 8, "order": 2},
            {"code": "day7_math1_sequence_sum_l2", "type": "workbook", "subject": "math1", "chapter": "수열의 합과 수학적 귀납법", "level": 2, "problem_count": 7, "order": 3},
            {"code": "day7_math2_integral_l2", "type": "workbook", "subject": "math2", "chapter": "부정적분과 정적분", "level": 2, "problem_count": 8, "order": 4},
        ],
    },
    {
        "day": 8,
        "level": 2,
        "title": "DAY 8",
        "tasks": [
            {"code": "day8_practical_concept_review", "type": "concept_review", "title": "실전개념 복습하기", "order": 1},
            {"code": "day8_math2_integral_application_l2", "type": "workbook", "subject": "math2", "chapter": "정적분의 활용", "level": 2, "problem_count": 7, "order": 2},
            {"code": "day8_probability_permutation_l2", "type": "workbook", "subject": "probability", "chapter": "여러 가지 순열", "level": 2, "problem_count": 8, "order": 3},
            {"code": "day8_probability_combination_binomial_l2", "type": "workbook", "subject": "probability", "chapter": "중복조합과 이항정리", "level": 2, "problem_count": 8, "order": 4},
        ],
    },
    {
        "day": 9,
        "level": 2,
        "title": "DAY 9",
        "tasks": [
            {"code": "day9_practical_concept_review", "type": "concept_review", "title": "실전개념 복습하기", "order": 1},
            {"code": "day9_probability_meaning_l2", "type": "workbook", "subject": "probability", "chapter": "확률의 뜻과 활용", "level": 2, "problem_count": 8, "order": 2},
            {"code": "day9_probability_conditional_l2", "type": "workbook", "subject": "probability", "chapter": "조건부확률", "level": 2, "problem_count": 7, "order": 3},
            {"code": "day9_probability_discrete_l2", "type": "workbook", "subject": "probability", "chapter": "이산확률변수의 확률분포", "level": 2, "problem_count": 8, "order": 4},
        ],
    },
    {
        "day": 10,
        "level": 2,
        "title": "DAY 10",
        "tasks": [
            {"code": "day10_practical_concept_review", "type": "concept_review", "title": "실전개념 복습하기", "order": 1},
            {"code": "day10_probability_continuous_l2", "type": "workbook", "subject": "probability", "chapter": "연속확률변수의 확률분포", "level": 2, "problem_count": 8, "order": 2},
            {"code": "day10_probability_estimation_l2", "type": "workbook", "subject": "probability", "chapter": "통계적 추정", "level": 2, "problem_count": 8, "order": 3},
        ],
    },
]
SUTEUK_LEVEL2_5DAY_DAYS = [
    {
        "day": 1,
        "level": 2,
        "title": "DAY 1",
        "tasks": [
            {"code": "l2_5d_d1_concept_review", "type": "concept_review", "title": "개념 복습하기", "order": 1},
            {"code": "l2_5d_d1_math1_explog", "type": "workbook", "subject": "math1", "chapter": "지수와 로그", "level": 2, "problem_count": 8, "order": 2},
            {"code": "l2_5d_d1_math1_explog_function", "type": "workbook", "subject": "math1", "chapter": "지수함수와 로그함수", "level": 2, "problem_count": 8, "order": 3},
            {"code": "l2_5d_d1_math1_trig", "type": "workbook", "subject": "math1", "chapter": "삼각함수", "level": 2, "problem_count": 8, "order": 4},
            {"code": "l2_5d_d1_math2_limit", "type": "workbook", "subject": "math2", "chapter": "함수의 극한", "level": 2, "problem_count": 7, "order": 5},
        ],
    },
    {
        "day": 2,
        "level": 2,
        "title": "DAY 2",
        "tasks": [
            {"code": "l2_5d_d2_concept_review", "type": "concept_review", "title": "개념 복습하기", "order": 1},
            {"code": "l2_5d_d2_math1_sine_cosine", "type": "workbook", "subject": "math1", "chapter": "사인법칙과 코사인법칙", "level": 2, "problem_count": 11, "order": 2},
            {"code": "l2_5d_d2_math2_continuity", "type": "workbook", "subject": "math2", "chapter": "함수의 연속", "level": 2, "problem_count": 7, "order": 3},
            {"code": "l2_5d_d2_math2_derivative_basic", "type": "workbook", "subject": "math2", "chapter": "미분계수와 도함수", "level": 2, "problem_count": 8, "order": 4},
            {"code": "l2_5d_d2_math2_derivative_use1", "type": "workbook", "subject": "math2", "chapter": "도함수의 활용 ⑴", "level": 2, "problem_count": 7, "order": 5},
        ],
    },
    {
        "day": 3,
        "level": 2,
        "title": "DAY 3",
        "tasks": [
            {"code": "l2_5d_d3_concept_review", "type": "concept_review", "title": "개념 복습하기", "order": 1},
            {"code": "l2_5d_d3_math2_derivative_use2", "type": "workbook", "subject": "math2", "chapter": "도함수의 활용 ⑵", "level": 2, "problem_count": 7, "order": 2},
            {"code": "l2_5d_d3_math2_integral", "type": "workbook", "subject": "math2", "chapter": "부정적분과 정적분", "level": 2, "problem_count": 8, "order": 3},
            {"code": "l2_5d_d3_math2_integral_application", "type": "workbook", "subject": "math2", "chapter": "정적분의 활용", "level": 2, "problem_count": 7, "order": 4},
            {"code": "l2_5d_d3_math1_sequence", "type": "workbook", "subject": "math1", "chapter": "등차수열과 등비수열", "level": 2, "problem_count": 8, "order": 5},
        ],
    },
    {
        "day": 4,
        "level": 2,
        "title": "DAY 4",
        "tasks": [
{"code": "l2_5d_d4_concept_review", "type": "concept_review", "title": "개념 복습하기", "order": 1},
            {"code": "l2_5d_d4_math1_sequence_sum", "type": "workbook", "subject": "math1", "chapter": "수열의 합과 수학적 귀납법", "level": 2, "problem_count": 7, "order": 2},
            {"code": "l2_5d_d4_probability_permutation", "type": "workbook", "subject": "probability", "chapter": "여러 가지 순열", "level": 2, "problem_count": 8, "order": 3},
            {"code": "l2_5d_d4_probability_combination_binomial", "type": "workbook", "subject": "probability", "chapter": "중복조합과 이항정리", "level": 2, "problem_count": 8, "order": 4},
            {"code": "l2_5d_d4_probability_meaning", "type": "workbook", "subject": "probability", "chapter": "확률의 뜻과 활용", "level": 2, "problem_count": 8, "order": 5},
        ],
    },
    {
        "day": 5,
        "level": 2,
        "title": "DAY 5",
        "tasks": [
{"code": "l2_5d_d5_concept_review", "type": "concept_review", "title": "개념 복습하기", "order": 1},
            {"code": "l2_5d_d5_probability_conditional", "type": "workbook", "subject": "probability", "chapter": "조건부확률", "level": 2, "problem_count": 7, "order": 2},
            {"code": "l2_5d_d5_probability_discrete", "type": "workbook", "subject": "probability", "chapter": "이산확률변수의 확률분포", "level": 2, "problem_count": 8, "order": 3},
            {"code": "l2_5d_d5_probability_continuous", "type": "workbook", "subject": "probability", "chapter": "연속확률변수의 확률분포", "level": 2, "problem_count": 8, "order": 4},
            {"code": "l2_5d_d5_probability_estimation", "type": "workbook", "subject": "probability", "chapter": "통계적 추정", "level": 2, "problem_count": 8, "order": 5},
        ],
    },
]

CHALLENGE_CONFIGS = {
    "suteuk_10day": {
        "code": "suteuk_10day",
        "title": "수특 10일 챌린지",
        "short_title": "수특 10일",
        "total_days": 10,
        "days": SUTEUK_CHALLENGE_DAYS,
    },
    "suteuk_level2_5day": {
        "code": "suteuk_level2_5day",
        "title": "수특 LEVEL 2 · 5일 챌린지",
        "short_title": "수특 LEVEL 2",
        "total_days": 5,
        "days": SUTEUK_LEVEL2_5DAY_DAYS,
    },
}


class AssignmentCreateIn(BaseModel):
    student_id: int
    challenge_type: str = DEFAULT_CHALLENGE_TYPE
    start_date: date


class AssignmentUpdateIn(BaseModel):
    start_date: date | None = None
    status: Literal["active", "paused"] | None = None


class RestDateIn(BaseModel):
    rest_date: date


class StudentProgressIn(BaseModel):
    student_id: int
    assignment_id: int
    day_number: int = Field(ge=1, le=10)
    task_code: str
    completed: bool


class ConceptProgressIn(BaseModel):
    student_id: int
    assignment_id: int
    concept_code: str
    response: Literal["know", "unsure", "dont_know"] | None = None
    final_status: Literal["understood_after_card", "still_dont_know"] | None = None


class FormulaAnswerIn(BaseModel):
    student_id: int
    assignment_id: int
    question_code: str
    selected_answer: int = Field(ge=0, le=10)


def challenge_config(challenge_type: str | None) -> dict:
    return CHALLENGE_CONFIGS.get(challenge_type or DEFAULT_CHALLENGE_TYPE) or CHALLENGE_CONFIGS[DEFAULT_CHALLENGE_TYPE]


def current_day_number(start_date: date, target_date: date, total_days: int) -> int:
    return max(1, min(total_days, (target_date - start_date).days + 1))


def rest_date_set(db: Session, assignment_id: int) -> set[date]:
    return {
        row[0]
        for row in db.query(models.SuteukChallengeRestDate.rest_date)
        .filter(models.SuteukChallengeRestDate.assignment_id == assignment_id)
        .all()
    }


def effective_day_number(start_date: date, target_date: date, total_days: int, rest_dates: set[date]) -> int:
    if target_date < start_date:
        return 1
    active_days = 0
    cursor = start_date
    while cursor <= target_date:
        if cursor not in rest_dates:
            active_days += 1
        cursor += timedelta(days=1)
    if target_date in rest_dates:
        active_days += 1
    return max(1, min(total_days, active_days))


def day_number_for_date(start_date: date, target_date: date, total_days: int, rest_dates: set[date]) -> int | None:
    if target_date < start_date or target_date in rest_dates:
        return None
    return effective_day_number(start_date, target_date, total_days, rest_dates)


def calendar_date_for_day(start_date: date, day_number: int, rest_dates: set[date]) -> date:
    cursor = start_date
    active_days = 0
    while True:
        if cursor not in rest_dates:
            active_days += 1
            if active_days == day_number:
                return cursor
        cursor += timedelta(days=1)


def schedule_end_date(start_date: date, total_days: int, rest_dates: set[date] | None = None) -> date:
    return calendar_date_for_day(start_date, total_days, rest_dates or set())


def schedule_finished(start_date: date, target_date: date, total_days: int, rest_dates: set[date] | None = None) -> bool:
    return target_date > schedule_end_date(start_date, total_days, rest_dates or set())


def ensure_student_day_access(
    assignment: models.SuteukChallengeAssignment,
    day_number: int,
    target_date: date | None = None,
    rest_dates: set[date] | None = None,
) -> None:
    config = challenge_config(assignment.challenge_type)
    if not 1 <= day_number <= int(config["total_days"]):
        raise HTTPException(status_code=400, detail="Invalid day_number.")
    if target_date is not None and rest_dates is not None and target_date in rest_dates:
        raise HTTPException(status_code=400, detail="Today is marked as a rest day.")


def day_config(challenge_type: str | None, day_number: int) -> dict:
    for item in challenge_config(challenge_type)["days"]:
        if item["day"] == day_number:
            return item
    raise HTTPException(status_code=404, detail="Challenge day not found.")


def checkable_tasks(day: dict) -> list[dict]:
    return [task for task in day["tasks"] if task["type"] in PROGRESS_TASK_TYPES]


def all_checkable_tasks(challenge_type: str | None) -> list[tuple[int, dict]]:
    rows: list[tuple[int, dict]] = []
    for day in challenge_config(challenge_type)["days"]:
        rows.extend((day["day"], task) for task in checkable_tasks(day))
    return rows


def get_student_or_404(db: Session, student_id: int) -> models.Student:
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found.")
    return student


def assignment_or_404(db: Session, assignment_id: int) -> models.SuteukChallengeAssignment:
    assignment = db.get(models.SuteukChallengeAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Challenge assignment not found.")
    return assignment


def active_assignments(db: Session, student_id: int) -> list[models.SuteukChallengeAssignment]:
    return (
        db.query(models.SuteukChallengeAssignment)
        .filter(
            models.SuteukChallengeAssignment.student_id == student_id,
            models.SuteukChallengeAssignment.status == "active",
        )
        .order_by(models.SuteukChallengeAssignment.start_date.desc(), models.SuteukChallengeAssignment.id.desc())
        .all()
    )


def day_has_activity(db: Session, assignment_id: int, day_number: int) -> bool:
    if db.query(models.SuteukChallengeTaskProgress.id).filter_by(assignment_id=assignment_id, day_number=day_number).first():
        return True
    if db.query(models.SuteukChallengeConceptProgress.id).filter_by(assignment_id=assignment_id, day_number=day_number).first():
        return True
    if db.query(models.SuteukChallengeFormulaResponse.id).filter_by(assignment_id=assignment_id, day_number=day_number).first():
        return True
    return False


def ensure_can_add_rest_date(db: Session, assignment: models.SuteukChallengeAssignment, target: date) -> None:
    config = challenge_config(assignment.challenge_type)
    rests = rest_date_set(db, assignment.id)
    if target in rests:
        return
    day_number = day_number_for_date(assignment.start_date, target, int(config["total_days"]), rests)
    if day_number is not None and day_has_activity(db, assignment.id, day_number):
        raise HTTPException(status_code=400, detail="This date already has challenge progress and cannot be marked as a rest day.")


def ensure_can_remove_rest_date(db: Session, assignment: models.SuteukChallengeAssignment, target: date) -> None:
    config = challenge_config(assignment.challenge_type)
    rests = rest_date_set(db, assignment.id)
    if target not in rests:
        return
    active_days_before = 0
    cursor = assignment.start_date
    while cursor < target:
        if cursor not in rests:
            active_days_before += 1
        cursor += timedelta(days=1)
    for day_number in range(active_days_before + 1, int(config["total_days"]) + 1):
        if day_has_activity(db, assignment.id, day_number):
            raise HTTPException(status_code=400, detail="Later challenge days already have progress, so this rest day cannot be removed safely.")


def active_assignment(
    db: Session,
    student_id: int,
    challenge_type: str | None = None,
) -> models.SuteukChallengeAssignment | None:
    query = db.query(models.SuteukChallengeAssignment).filter(
        models.SuteukChallengeAssignment.student_id == student_id,
        models.SuteukChallengeAssignment.status == "active",
    )
    if challenge_type is not None:
        query = query.filter(models.SuteukChallengeAssignment.challenge_type == challenge_type)
    return (
        query
        .order_by(models.SuteukChallengeAssignment.start_date.desc(), models.SuteukChallengeAssignment.id.desc())
        .first()
    )


def progress_map(db: Session, assignment_id: int) -> dict[tuple[int, str], models.SuteukChallengeTaskProgress]:
    rows = (
        db.query(models.SuteukChallengeTaskProgress)
        .filter(models.SuteukChallengeTaskProgress.assignment_id == assignment_id)
        .all()
    )
    return {(row.day_number, row.task_code): row for row in rows}


def concept_progress_map(db: Session, assignment_id: int) -> dict[str, models.SuteukChallengeConceptProgress]:
    rows = (
        db.query(models.SuteukChallengeConceptProgress)
        .filter(models.SuteukChallengeConceptProgress.assignment_id == assignment_id)
        .all()
    )
    return {row.concept_code: row for row in rows}


def formula_response_map(db: Session, assignment_id: int) -> dict[str, models.SuteukChallengeFormulaResponse]:
    rows = (
        db.query(models.SuteukChallengeFormulaResponse)
        .filter(models.SuteukChallengeFormulaResponse.assignment_id == assignment_id)
        .all()
    )
    return {row.question_code: row for row in rows}


def concept_status_lookup(db: Session, assignment_id: int) -> dict[str, dict]:
    progress = concept_progress_map(db, assignment_id)
    return {
        code: {
            "response": row.response,
            "final_status": row.final_status,
            "completed": row.completed,
        }
        for code, row in progress.items()
    }


def concept_counts(concepts: list[dict], progress: dict[str, models.SuteukChallengeConceptProgress]) -> dict:
    completed = 0
    counts = {
        "know": 0,
        "unsure": 0,
        "dont_know": 0,
        "understood_after_card": 0,
        "still_dont_know": 0,
    }
    for concept in concepts:
        row = progress.get(concept["code"])
        if row is None:
            continue
        if row.response in counts:
            counts[row.response] += 1
        if row.final_status in counts:
            counts[row.final_status] += 1
        if row.completed:
            completed += 1
    total = len(concepts)
    return {
        "total": total,
        "completed": completed,
        "remaining": max(0, total - completed),
        "progress_rate": round(completed * 100 / total) if total else 0,
        "counts": counts,
    }


def concept_summary_for_day(day_number: int, progress: dict[str, models.SuteukChallengeConceptProgress]) -> dict:
    concepts = CONCEPTS_BY_DAY.get(day_number, [])
    chapters: dict[str, dict] = {}
    for concept in concepts:
        key = f"{concept['subject']}::{concept['chapter']}"
        if key not in chapters:
            chapters[key] = {
                "subject": concept["subject"],
                "subject_label": concept["subject_label"],
                "chapter": concept["chapter"],
                "chapter_order": concept["chapter_order"],
                "total": 0,
                "completed": 0,
            }
        chapters[key]["total"] += 1
        row = progress.get(concept["code"])
        if row is not None and row.completed:
            chapters[key]["completed"] += 1
    chapter_rows = []
    for row in sorted(chapters.values(), key=lambda item: item["chapter_order"]):
        total = row["total"]
        chapter_rows.append({
            **row,
            "progress_rate": round(row["completed"] * 100 / total) if total else 0,
        })
    return {
        **concept_counts(concepts, progress),
        "chapters": chapter_rows,
    }


def ensure_concept_recall_task_progress(
    db: Session,
    assignment_id: int,
    day_number: int,
    progress: dict[str, models.SuteukChallengeConceptProgress] | None = None,
) -> None:
    concepts = CONCEPTS_BY_DAY.get(day_number, [])
    if not concepts:
        return
    progress = progress or concept_progress_map(db, assignment_id)
    completed = all(progress.get(concept["code"]) and progress[concept["code"]].completed for concept in concepts)
    if not completed:
        return
    task_code = f"day{day_number}_concept_recall"
    row = (
        db.query(models.SuteukChallengeTaskProgress)
        .filter_by(assignment_id=assignment_id, day_number=day_number, task_code=task_code)
        .first()
    )
    if row is None:
        row = models.SuteukChallengeTaskProgress(
            assignment_id=assignment_id,
            day_number=day_number,
            task_code=task_code,
        )
        db.add(row)
    row.completed = True
    row.completed_at = datetime.now(timezone.utc)


def formula_summary_for_day(day_number: int, responses: dict[str, models.SuteukChallengeFormulaResponse]) -> dict:
    questions = FORMULA_QUIZ_BY_DAY.get(day_number, [])
    answered = 0
    correct = 0
    wrong_concepts: dict[str, dict] = {}
    for question in questions:
        row = responses.get(question["code"])
        if row is None:
            continue
        answered += 1
        if row.is_correct:
            correct += 1
        else:
            concept_code = question.get("concept_code") or ""
            wrong_concepts[question["code"]] = {
                "question_code": question["code"],
                "concept_code": concept_code,
                "subject": question["subject"],
                "chapter": question["chapter"],
                "prompt": question["prompt"],
                "explanation": question["explanation"],
            }
    total = len(questions)
    return {
        "expected_total": FORMULA_QUIZ_EXPECTED_COUNT if day_number in {1, 2, 3} else 0,
        "total": total,
        "answered": answered,
        "correct": correct,
        "incorrect": max(0, answered - correct),
        "score_rate": round(correct * 100 / total) if total else 0,
        "completed": bool(total and answered == total),
        "wrong_concepts": list(wrong_concepts.values()),
    }


def ensure_formula_check_task_progress(
    db: Session,
    assignment_id: int,
    day_number: int,
    responses: dict[str, models.SuteukChallengeFormulaResponse] | None = None,
) -> None:
    questions = FORMULA_QUIZ_BY_DAY.get(day_number, [])
    if not questions:
        return
    responses = responses or formula_response_map(db, assignment_id)
    if not all(question["code"] in responses for question in questions):
        return
    task_code = f"day{day_number}_formula_quiz"
    row = (
        db.query(models.SuteukChallengeTaskProgress)
        .filter_by(assignment_id=assignment_id, day_number=day_number, task_code=task_code)
        .first()
    )
    if row is None:
        row = models.SuteukChallengeTaskProgress(
            assignment_id=assignment_id,
            day_number=day_number,
            task_code=task_code,
        )
        db.add(row)
    row.completed = True
    row.completed_at = datetime.now(timezone.utc)


def serialize_task(day_number: int, task: dict, progress: dict[tuple[int, str], models.SuteukChallengeTaskProgress]) -> dict:
    row = progress.get((day_number, task["code"]))
    problem_count = int(task.get("problem_count") or 0)
    return {
        **task,
        "problem_count": problem_count,
        "completed": bool(row.completed) if row else False,
        "completed_at": row.completed_at if row else None,
        "checkable": task["type"] in PROGRESS_TASK_TYPES,
        "manual_checkable": task["type"] in MANUAL_TASK_TYPES,
        "disabled": task["type"] not in PROGRESS_TASK_TYPES,
    }


def day_summary(
    day: dict,
    progress: dict[tuple[int, str], models.SuteukChallengeTaskProgress],
    challenge_type: str = DEFAULT_CHALLENGE_TYPE,
    concepts: dict[str, models.SuteukChallengeConceptProgress] | None = None,
    formula_responses: dict[str, models.SuteukChallengeFormulaResponse] | None = None,
    scheduled_date: date | None = None,
) -> dict:
    tasks = [serialize_task(day["day"], task, progress) for task in sorted(day["tasks"], key=lambda item: item["order"])]
    checkable = [task for task in tasks if task["checkable"]]
    completed = sum(1 for task in checkable if task["completed"])
    total = len(checkable)
    total_problems = sum(int(task.get("problem_count") or 0) for task in tasks if task["type"] == "workbook")
    return {
        **day,
        "tasks": tasks,
        "total_tasks": total,
        "completed_tasks": completed,
        "progress_rate": round(completed * 100 / total) if total else 0,
        "total_problems": total_problems,
        "scheduled_date": scheduled_date,
        "concept_summary": concept_summary_for_day(day["day"], concepts or {}) if challenge_type == DEFAULT_CHALLENGE_TYPE and CONCEPTS_BY_DAY.get(day["day"]) else None,
        "formula_summary": formula_summary_for_day(day["day"], formula_responses or {}) if challenge_type == DEFAULT_CHALLENGE_TYPE and day["day"] in {1, 2, 3} else None,
    }


def serialize_assignment(
    db: Session,
    assignment: models.SuteukChallengeAssignment,
    *,
    target_date: date | None = None,
    include_days: bool = False,
    selected_day: int | None = None,
) -> dict:
    target = target_date or get_study_date()
    config = challenge_config(assignment.challenge_type)
    total_days = int(config["total_days"])
    rests = rest_date_set(db, assignment.id)
    is_rest_day = target in rests
    progress = progress_map(db, assignment.id)
    concepts = concept_progress_map(db, assignment.id)
    formula_responses = formula_response_map(db, assignment.id)
    current_day = effective_day_number(assignment.start_date, target, total_days, rests)
    all_tasks = all_checkable_tasks(assignment.challenge_type)
    overall_total = len(all_tasks)
    overall_completed = sum(
        1
        for day_number, task in all_tasks
        if progress.get((day_number, task["code"])) and progress[(day_number, task["code"])].completed
    )
    selected_day_number = selected_day or current_day
    selected = day_config(assignment.challenge_type, selected_day_number)
    selected_scheduled_date = calendar_date_for_day(assignment.start_date, selected_day_number, rests)
    payload = {
        "id": assignment.id,
        "student_id": assignment.student_id,
        "student_name": assignment.student.name if assignment.student else None,
        "student_grade": assignment.student.grade if assignment.student else None,
        "challenge_type": assignment.challenge_type,
        "challenge_title": config["title"],
        "challenge_short_title": config["short_title"],
        "start_date": assignment.start_date,
        "status": assignment.status,
        "current_day": current_day,
        "selected_day": selected_day_number,
        "total_days": total_days,
        "schedule_ends_on": schedule_end_date(assignment.start_date, total_days, rests),
        "schedule_finished": schedule_finished(assignment.start_date, target, total_days, rests),
        "is_rest_day": is_rest_day,
        "rest_dates": sorted(rests),
        "overall_total_tasks": overall_total,
        "overall_completed_tasks": overall_completed,
        "overall_progress_rate": round(overall_completed * 100 / overall_total) if overall_total else 0,
        "today": day_summary(selected, progress, assignment.challenge_type, concepts, formula_responses, scheduled_date=selected_scheduled_date),
        "created_at": assignment.created_at,
        "updated_at": assignment.updated_at,
    }
    if include_days:
        payload["days"] = [
            day_summary(
                day,
                progress,
                assignment.challenge_type,
                concepts,
                formula_responses,
                scheduled_date=calendar_date_for_day(assignment.start_date, day["day"], rests),
            )
            for day in config["days"]
        ]
    return payload


def serialize_concept(concept: dict, row: models.SuteukChallengeConceptProgress | None) -> dict:
    return {
        **concept,
        "response": row.response if row else None,
        "final_status": row.final_status if row else None,
        "completed": bool(row.completed) if row else False,
        "completed_at": row.completed_at if row else None,
    }


def serialize_concept_recall(db: Session, assignment: models.SuteukChallengeAssignment, day_number: int) -> dict:
    concepts = CONCEPTS_BY_DAY.get(day_number, [])
    progress = concept_progress_map(db, assignment.id)
    items = [serialize_concept(concept, progress.get(concept["code"])) for concept in concepts]
    first_incomplete_index = next((index for index, item in enumerate(items) if not item["completed"]), None)
    if first_incomplete_index is None:
        first_incomplete_index = max(0, len(items) - 1) if items else 0
    return {
        "assignment_id": assignment.id,
        "student_id": assignment.student_id,
        "day_number": day_number,
        "title": f"DAY {day_number} · 개념 떠올리기",
        "summary": concept_summary_for_day(day_number, progress),
        "current_index": first_incomplete_index,
        "items": items,
    }


def serialize_formula_question(
    question: dict,
    row: models.SuteukChallengeFormulaResponse | None,
    concept_statuses: dict[str, dict],
    *,
    include_answer: bool = False,
) -> dict:
    selected = int(row.selected_answer) if row is not None else None
    answer_index = int(question["answer_index"])
    return {
        **question,
        "answer_index": answer_index if include_answer or row is not None else None,
        "selected_answer": selected,
        "is_correct": row.is_correct if row is not None else None,
        "answered_at": row.answered_at if row is not None else None,
        "concept_status": concept_statuses.get(question.get("concept_code") or ""),
    }


def serialize_formula_quiz(
    db: Session,
    assignment: models.SuteukChallengeAssignment,
    day_number: int,
    *,
    include_answers: bool = False,
) -> dict:
    questions = FORMULA_QUIZ_BY_DAY.get(day_number, [])
    responses = formula_response_map(db, assignment.id)
    concept_statuses = concept_status_lookup(db, assignment.id)
    items = [
        serialize_formula_question(question, responses.get(question["code"]), concept_statuses, include_answer=include_answers)
        for question in questions
    ]
    first_incomplete_index = next((index for index, item in enumerate(items) if item["selected_answer"] is None), None)
    if first_incomplete_index is None:
        first_incomplete_index = max(0, len(items) - 1) if items else 0
    return {
        "assignment_id": assignment.id,
        "student_id": assignment.student_id,
        "day_number": day_number,
        "title": f"DAY {day_number} · 공식 CHECK",
        "expected_total": FORMULA_QUIZ_EXPECTED_COUNT,
        "summary": formula_summary_for_day(day_number, responses),
        "current_index": first_incomplete_index,
        "items": items,
    }


@router.get("/student/suteuk-challenge/summary")
def student_suteuk_summary(student_id: int, study_date: date | None = None, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    assignments = [serialize_assignment(db, row, target_date=study_date) for row in active_assignments(db, student_id)]
    return {"assignment": assignments[0] if assignments else None, "assignments": assignments}


@router.get("/student/suteuk-challenge/assignments/{assignment_id}")
def student_suteuk_detail(
    assignment_id: int,
    student_id: int,
    day_number: int | None = None,
    study_date: date | None = None,
    db: Session = Depends(get_db),
):
    assignment = assignment_or_404(db, assignment_id)
    if assignment.student_id != student_id:
        raise HTTPException(status_code=403, detail="Cannot access another student's challenge.")
    if assignment.status != "active":
        raise HTTPException(status_code=404, detail="No active challenge.")
    if day_number is not None:
        ensure_student_day_access(assignment, day_number, study_date or get_study_date(), rest_date_set(db, assignment.id))
    return serialize_assignment(db, assignment, target_date=study_date, include_days=True, selected_day=day_number)


@router.get("/student/suteuk-challenge/assignments/{assignment_id}/concept-recall")
def student_suteuk_concept_recall(
    assignment_id: int,
    student_id: int,
    day_number: int,
    db: Session = Depends(get_db),
):
    assignment = assignment_or_404(db, assignment_id)
    if assignment.student_id != student_id:
        raise HTTPException(status_code=403, detail="Cannot access another student's challenge.")
    if assignment.status != "active":
        raise HTTPException(status_code=404, detail="No active challenge.")
    if assignment.challenge_type != DEFAULT_CHALLENGE_TYPE:
        raise HTTPException(status_code=404, detail="Concept recall is available for the 10-day challenge only.")
    if day_number not in {1, 2, 3}:
        raise HTTPException(status_code=404, detail="Concept recall is available for DAY 1-3 only.")
    ensure_student_day_access(assignment, day_number, get_study_date(), rest_date_set(db, assignment.id))
    return serialize_concept_recall(db, assignment, day_number)


@router.get("/student/suteuk-challenge/assignments/{assignment_id}/formula-check")
def student_suteuk_formula_check(
    assignment_id: int,
    student_id: int,
    day_number: int,
    db: Session = Depends(get_db),
):
    assignment = assignment_or_404(db, assignment_id)
    if assignment.student_id != student_id:
        raise HTTPException(status_code=403, detail="Cannot access another student's challenge.")
    if assignment.status != "active":
        raise HTTPException(status_code=404, detail="No active challenge.")
    if assignment.challenge_type != DEFAULT_CHALLENGE_TYPE:
        raise HTTPException(status_code=404, detail="Formula check is available for the 10-day challenge only.")
    if day_number not in {1, 2, 3}:
        raise HTTPException(status_code=404, detail="Formula check is available for DAY 1-3 only.")
    ensure_student_day_access(assignment, day_number, get_study_date(), rest_date_set(db, assignment.id))
    return serialize_formula_quiz(db, assignment, day_number)


@router.patch("/student/suteuk-challenge/concept-progress")
def student_update_suteuk_concept_progress(payload: ConceptProgressIn, db: Session = Depends(get_db)):
    assignment = assignment_or_404(db, payload.assignment_id)
    if assignment.student_id != payload.student_id:
        raise HTTPException(status_code=403, detail="Cannot access another student's challenge.")
    if assignment.status != "active":
        raise HTTPException(status_code=400, detail="Challenge is not active.")
    if assignment.challenge_type != DEFAULT_CHALLENGE_TYPE:
        raise HTTPException(status_code=400, detail="Concept recall is available for the 10-day challenge only.")
    concept = CONCEPT_BY_CODE.get(payload.concept_code)
    if concept is None:
        raise HTTPException(status_code=404, detail="Concept item not found.")
    if concept["day"] not in {1, 2, 3}:
        raise HTTPException(status_code=400, detail="Concept recall is available for DAY 1-3 only.")
    ensure_student_day_access(assignment, concept["day"], get_study_date(), rest_date_set(db, assignment.id))

    row = (
        db.query(models.SuteukChallengeConceptProgress)
        .filter_by(assignment_id=assignment.id, concept_code=payload.concept_code)
        .first()
    )
    if row is None:
        row = models.SuteukChallengeConceptProgress(
            assignment_id=assignment.id,
            day_number=concept["day"],
            concept_code=payload.concept_code,
        )
        db.add(row)

    now = datetime.now(timezone.utc)
    if payload.response is not None:
        if payload.response not in CONCEPT_RESPONSES:
            raise HTTPException(status_code=400, detail="Invalid response.")
        row.response = payload.response
        row.final_status = None
        if payload.response == "know":
            row.completed = True
            row.completed_at = now
        else:
            row.completed = False
            row.completed_at = None

    if payload.final_status is not None:
        if payload.final_status not in CONCEPT_FINAL_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid final_status.")
        if row.response not in {"unsure", "dont_know"}:
            raise HTTPException(status_code=400, detail="A card final status requires unsure or dont_know response.")
        row.final_status = payload.final_status
        row.completed = True
        row.completed_at = now

    if payload.response is None and payload.final_status is None:
        raise HTTPException(status_code=400, detail="response or final_status is required.")

    db.flush()
    ensure_concept_recall_task_progress(db, assignment.id, concept["day"])
    db.commit()
    return serialize_concept_recall(db, assignment, concept["day"])


@router.patch("/student/suteuk-challenge/formula-check/answers")
def student_answer_suteuk_formula_check(payload: FormulaAnswerIn, db: Session = Depends(get_db)):
    assignment = assignment_or_404(db, payload.assignment_id)
    if assignment.student_id != payload.student_id:
        raise HTTPException(status_code=403, detail="Cannot access another student's challenge.")
    if assignment.status != "active":
        raise HTTPException(status_code=400, detail="Challenge is not active.")
    if assignment.challenge_type != DEFAULT_CHALLENGE_TYPE:
        raise HTTPException(status_code=400, detail="Formula check is available for the 10-day challenge only.")
    question = FORMULA_QUIZ_BY_CODE.get(payload.question_code)
    if question is None:
        raise HTTPException(status_code=404, detail="Formula question not found.")
    if question["day"] not in {1, 2, 3}:
        raise HTTPException(status_code=400, detail="Formula check is available for DAY 1-3 only.")
    ensure_student_day_access(assignment, question["day"], get_study_date(), rest_date_set(db, assignment.id))
    if payload.selected_answer >= len(question["choices"]):
        raise HTTPException(status_code=400, detail="Invalid selected_answer.")

    row = (
        db.query(models.SuteukChallengeFormulaResponse)
        .filter_by(assignment_id=assignment.id, question_code=payload.question_code)
        .first()
    )
    if row is None:
        row = models.SuteukChallengeFormulaResponse(
            assignment_id=assignment.id,
            day_number=question["day"],
            question_code=payload.question_code,
            concept_code=question.get("concept_code"),
            selected_answer=str(payload.selected_answer),
            is_correct=payload.selected_answer == int(question["answer_index"]),
        )
        db.add(row)
    else:
        row.selected_answer = str(payload.selected_answer)
        row.is_correct = payload.selected_answer == int(question["answer_index"])
        row.answered_at = datetime.now(timezone.utc)
        row.concept_code = question.get("concept_code")
    db.flush()
    ensure_formula_check_task_progress(db, assignment.id, question["day"])
    db.commit()
    return serialize_formula_quiz(db, assignment, question["day"])


@router.patch("/student/suteuk-challenge/progress")
def student_update_suteuk_progress(payload: StudentProgressIn, db: Session = Depends(get_db)):
    assignment = assignment_or_404(db, payload.assignment_id)
    if assignment.student_id != payload.student_id:
        raise HTTPException(status_code=403, detail="Cannot access another student's challenge.")
    if assignment.status != "active":
        raise HTTPException(status_code=400, detail="Challenge is not active.")
    day = day_config(assignment.challenge_type, payload.day_number)
    ensure_student_day_access(assignment, payload.day_number, get_study_date(), rest_date_set(db, assignment.id))
    task = next((item for item in day["tasks"] if item["code"] == payload.task_code), None)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    if task["type"] not in MANUAL_TASK_TYPES:
        raise HTTPException(status_code=400, detail="This task is not checkable yet.")

    row = (
        db.query(models.SuteukChallengeTaskProgress)
        .filter_by(assignment_id=assignment.id, day_number=payload.day_number, task_code=payload.task_code)
        .first()
    )
    if row is None:
        row = models.SuteukChallengeTaskProgress(
            assignment_id=assignment.id,
            day_number=payload.day_number,
            task_code=payload.task_code,
        )
        db.add(row)
    row.completed = payload.completed
    row.completed_at = datetime.now(timezone.utc) if payload.completed else None
    db.commit()
    return serialize_assignment(db, assignment, include_days=True, selected_day=payload.day_number)


@router.get("/admin/suteuk-challenges")
def admin_list_suteuk_challenges(db: Session = Depends(get_db)):
    rows = (
        db.query(models.SuteukChallengeAssignment)
        .order_by(models.SuteukChallengeAssignment.created_at.desc(), models.SuteukChallengeAssignment.id.desc())
        .all()
    )
    return [serialize_assignment(db, row) for row in rows]


@router.get("/admin/suteuk-challenge-types")
def admin_list_suteuk_challenge_types():
    return [
        {
            "code": config["code"],
            "title": config["title"],
            "short_title": config["short_title"],
            "total_days": config["total_days"],
        }
        for config in CHALLENGE_CONFIGS.values()
    ]


@router.post("/admin/suteuk-challenges", status_code=201)
def admin_create_suteuk_challenge(payload: AssignmentCreateIn, db: Session = Depends(get_db)):
    get_student_or_404(db, payload.student_id)
    if payload.challenge_type not in CHALLENGE_CONFIGS:
        raise HTTPException(status_code=400, detail="Invalid challenge_type.")
    if active_assignment(db, payload.student_id, payload.challenge_type) is not None:
        raise HTTPException(status_code=409, detail="이미 같은 종류의 active 수특 챌린지가 있습니다.")
    assignment = models.SuteukChallengeAssignment(
        student_id=payload.student_id,
        challenge_type=payload.challenge_type,
        start_date=payload.start_date,
        status="active",
    )
    db.add(assignment)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="이미 같은 종류의 active 수특 챌린지가 있습니다.")
    db.refresh(assignment)
    return serialize_assignment(db, assignment, include_days=True)


@router.get("/admin/suteuk-challenges/{assignment_id}")
def admin_suteuk_challenge_detail(assignment_id: int, db: Session = Depends(get_db)):
    return serialize_assignment(db, assignment_or_404(db, assignment_id), include_days=True)


@router.get("/admin/suteuk-challenges/{assignment_id}/concept-recall")
def admin_suteuk_concept_recall(assignment_id: int, day_number: int | None = None, db: Session = Depends(get_db)):
    assignment = assignment_or_404(db, assignment_id)
    if assignment.challenge_type != DEFAULT_CHALLENGE_TYPE:
        raise HTTPException(status_code=404, detail="Concept recall is available for the 10-day challenge only.")
    days = [day_number] if day_number is not None else [1, 2, 3]
    if any(day not in {1, 2, 3} for day in days):
        raise HTTPException(status_code=404, detail="Concept recall is available for DAY 1-3 only.")
    return {
        "assignment_id": assignment.id,
        "student_id": assignment.student_id,
        "student_name": assignment.student.name if assignment.student else None,
        "days": [serialize_concept_recall(db, assignment, day) for day in days],
    }


@router.get("/admin/suteuk-challenges/{assignment_id}/formula-check")
def admin_suteuk_formula_check(assignment_id: int, day_number: int | None = None, db: Session = Depends(get_db)):
    assignment = assignment_or_404(db, assignment_id)
    if assignment.challenge_type != DEFAULT_CHALLENGE_TYPE:
        raise HTTPException(status_code=404, detail="Formula check is available for the 10-day challenge only.")
    days = [day_number] if day_number is not None else [1, 2, 3]
    if any(day not in {1, 2, 3} for day in days):
        raise HTTPException(status_code=404, detail="Formula check is available for DAY 1-3 only.")
    return {
        "assignment_id": assignment.id,
        "student_id": assignment.student_id,
        "student_name": assignment.student.name if assignment.student else None,
        "days": [serialize_formula_quiz(db, assignment, day, include_answers=True) for day in days],
    }


@router.patch("/admin/suteuk-challenges/{assignment_id}")
def admin_update_suteuk_challenge(assignment_id: int, payload: AssignmentUpdateIn, db: Session = Depends(get_db)):
    assignment = assignment_or_404(db, assignment_id)
    if payload.start_date is not None:
        assignment.start_date = payload.start_date
    if payload.status is not None:
        if payload.status not in ASSIGNMENT_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status.")
        if payload.status == "active":
            existing = active_assignment(db, assignment.student_id, assignment.challenge_type)
            if existing is not None and existing.id != assignment.id:
                raise HTTPException(status_code=409, detail="이미 같은 종류의 active 수특 챌린지가 있습니다.")
        assignment.status = payload.status
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="이미 같은 종류의 active 수특 챌린지가 있습니다.")
    db.refresh(assignment)
    return serialize_assignment(db, assignment, include_days=True)


@router.post("/admin/suteuk-challenges/{assignment_id}/rest-dates")
def admin_add_suteuk_rest_date(assignment_id: int, payload: RestDateIn, db: Session = Depends(get_db)):
    assignment = assignment_or_404(db, assignment_id)
    ensure_can_add_rest_date(db, assignment, payload.rest_date)
    existing = db.query(models.SuteukChallengeRestDate).filter_by(
        assignment_id=assignment.id,
        rest_date=payload.rest_date,
    ).first()
    if existing is None:
        db.add(models.SuteukChallengeRestDate(assignment_id=assignment.id, rest_date=payload.rest_date))
        db.commit()
    return serialize_assignment(db, assignment, include_days=True)


@router.delete("/admin/suteuk-challenges/{assignment_id}/rest-dates/{rest_date}")
def admin_remove_suteuk_rest_date(assignment_id: int, rest_date: date, db: Session = Depends(get_db)):
    assignment = assignment_or_404(db, assignment_id)
    ensure_can_remove_rest_date(db, assignment, rest_date)
    db.query(models.SuteukChallengeRestDate).filter_by(
        assignment_id=assignment.id,
        rest_date=rest_date,
    ).delete(synchronize_session=False)
    db.commit()
    return serialize_assignment(db, assignment, include_days=True)


@router.delete("/admin/suteuk-challenges/{assignment_id}")
def admin_delete_suteuk_challenge(assignment_id: int, db: Session = Depends(get_db)):
    assignment = assignment_or_404(db, assignment_id)
    db.delete(assignment)
    db.commit()
    return {"ok": True}
