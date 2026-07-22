"""SPRINT 자동 판정 및 자동 스트라이크 공통 서비스 (4차).

기존 제출/검수 기능(sprint.py, vocabulary.py)은 다시 만들지 않고 그대로 재사용한다.
이 모듈은 마감 이후 위반 사항을 판정하고 SprintStrike를 idempotent하게 생성/취소하는
공통 로직만 담는다. 관리자 API(sprint.py)와 CLI(run_sprint_compliance.py)가 동일한
evaluate_sprint_compliance()/run_sprint_compliance() 함수를 재사용한다.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from database import get_db
from study_dates import get_study_date
from sprint import (
    proof_enabled,
    proof_strike_enabled,
    proof_timing_status,
    vocabulary_home_summary,
)


router = APIRouter(tags=["Sprint Compliance"])


# 우선순위: 상한(daily_auto_strike_limit)에 걸릴 때 이 순서대로 생성을 시도한다.
RULE_PRIORITY = [
    "planner_missing",
    "seat_check_missing",
    "study_time_missing",
    "vocabulary_missing",
    "planner_late",
    "seat_check_late",
    "study_time_shortage",
]

MISSING_REASON_CODES = {
    "planner_missing",
    "seat_check_missing",
    "study_time_missing",
    "vocabulary_missing",
}

# 학생 화면에 노출할 한글 라벨 (reason_code를 그대로 노출하지 않는다)
REASON_CODE_LABELS = {
    "planner_missing": "플래너 미제출",
    "planner_late": "플래너 지각",
    "seat_check_missing": "착석 인증 미제출",
    "seat_check_late": "착석 인증 지각",
    "study_time_missing": "공부시간 미제출",
    "study_time_shortage": "공부시간 목표 미달",
    "vocabulary_missing": "영단어 미응시",
}


def reason_code_label(reason_code: str) -> str:
    return REASON_CODE_LABELS.get(reason_code, reason_code)


def auto_strike_source_ref(program_id: int, student_id: int, learning_date: date, reason_code: str) -> str:
    return f"auto:{program_id}:{student_id}:{learning_date.isoformat()}:{reason_code}"


def find_active_auto_strike(
    db: Session, program_id: int, student_id: int, learning_date: date, strike_type: str
) -> models.SprintStrike | None:
    """strike_type 기준 광의 매칭. 기존 daily-proof 자동 승인 훅(source_type='auto_daily_proof')이
    이미 만든 스트라이크도 같은 strike_type이면 중복으로 보고 다시 만들지 않는다."""
    return (
        db.query(models.SprintStrike)
        .filter(
            models.SprintStrike.sprint_program_id == program_id,
            models.SprintStrike.student_id == student_id,
            models.SprintStrike.learning_date == learning_date,
            models.SprintStrike.strike_type == strike_type,
            models.SprintStrike.is_cancelled.is_(False),
            models.SprintStrike.source_type.like("auto%"),
        )
        .first()
    )


def count_active_auto_strikes(db: Session, program_id: int, student_id: int, learning_date: date) -> int:
    """수동 스트라이크(source_type='manual')는 상한 계산에서 제외한다."""
    return (
        db.query(models.SprintStrike)
        .filter(
            models.SprintStrike.sprint_program_id == program_id,
            models.SprintStrike.student_id == student_id,
            models.SprintStrike.learning_date == learning_date,
            models.SprintStrike.is_cancelled.is_(False),
            models.SprintStrike.source_type.like("auto%"),
        )
        .count()
    )


def create_auto_strike(
    db: Session,
    program: models.SprintProgram,
    learning_date: date,
    reason_code: str,
    related_entity_id: int | None,
) -> models.SprintStrike:
    strike = models.SprintStrike(
        sprint_program_id=program.id,
        student_id=program.student_id,
        strike_type=reason_code,
        reason=reason_code_label(reason_code),
        learning_date=learning_date,
        related_entity_type="sprint_compliance_rule",
        related_entity_id=related_entity_id,
        source_type="auto_rule",
        source_ref=auto_strike_source_ref(program.id, program.student_id, learning_date, reason_code),
        is_cancelled=False,
    )
    db.add(strike)
    return strike


# ---------------------------------------------------------------------------
# 규칙별 판정 (applicable=False면 비활성/대상아님으로 완전 제외, hold=True면 판정 보류)
# ---------------------------------------------------------------------------


def _get_proof_submission(
    db: Session, program: models.SprintProgram, proof_type: str, learning_date: date
) -> models.SprintDailyProofSubmission | None:
    return (
        db.query(models.SprintDailyProofSubmission)
        .filter_by(
            sprint_program_id=program.id,
            student_id=program.student_id,
            learning_date=learning_date,
            proof_type=proof_type,
        )
        .first()
    )


def _evaluate_proof_missing(db: Session, program: models.SprintProgram, learning_date: date, proof_type: str) -> dict:
    if not (proof_enabled(program, proof_type) and proof_strike_enabled(program, proof_type, "missing")):
        return {"applicable": False, "violation": False, "hold": False}
    submission = _get_proof_submission(db, program, proof_type, learning_date)
    if submission is not None and submission.workflow_status == "pending":
        return {"applicable": True, "violation": False, "hold": True}
    if submission is not None and submission.workflow_status == "approved":
        return {"applicable": True, "violation": False, "hold": False}
    timing = proof_timing_status(program, proof_type, learning_date, None)
    if timing == "missing":
        return {
            "applicable": True,
            "violation": True,
            "hold": False,
            "related_entity_id": submission.id if submission else None,
        }
    return {"applicable": True, "violation": False, "hold": False, "not_due": timing == "not_due"}


def _evaluate_proof_late(db: Session, program: models.SprintProgram, learning_date: date, proof_type: str) -> dict:
    if not (proof_enabled(program, proof_type) and proof_strike_enabled(program, proof_type, "late")):
        return {"applicable": False, "violation": False, "hold": False}
    submission = _get_proof_submission(db, program, proof_type, learning_date)
    if submission is None:
        return {"applicable": True, "violation": False, "hold": False}
    if submission.workflow_status == "pending":
        return {"applicable": True, "violation": False, "hold": True}
    if submission.workflow_status != "approved":
        return {"applicable": True, "violation": False, "hold": False}
    effective_timing = submission.timing_override or submission.timing_status
    return {
        "applicable": True,
        "violation": effective_timing == "late",
        "hold": False,
        "related_entity_id": submission.id,
    }


def _get_study_submission(
    db: Session, program: models.SprintProgram, learning_date: date
) -> models.SprintStudySubmission | None:
    return (
        db.query(models.SprintStudySubmission)
        .filter_by(sprint_program_id=program.id, student_id=program.student_id, learning_date=learning_date)
        .first()
    )


def _evaluate_study_time_missing(db: Session, program: models.SprintProgram, learning_date: date) -> dict:
    if not program.enable_study_time_submission:
        return {"applicable": False, "violation": False, "hold": False}
    submission = _get_study_submission(db, program, learning_date)
    if submission is not None and submission.status == "pending":
        return {"applicable": True, "violation": False, "hold": True}
    if submission is not None and submission.status == "approved":
        return {"applicable": True, "violation": False, "hold": False}
    return {
        "applicable": True,
        "violation": True,
        "hold": False,
        "related_entity_id": submission.id if submission else None,
    }


def _evaluate_study_time_shortage(db: Session, program: models.SprintProgram, learning_date: date) -> dict:
    if not program.enable_study_time_submission:
        return {"applicable": False, "violation": False, "hold": False}
    goal = program.daily_study_goal_minutes
    if not goal:
        return {"applicable": False, "violation": False, "hold": False}
    submission = _get_study_submission(db, program, learning_date)
    # approved 제출이 없으면 study_time_missing 규칙이 담당한다 (동시 생성 금지).
    if submission is None or submission.status != "approved":
        return {"applicable": False, "violation": False, "hold": False}
    approved = submission.approved_minutes or 0
    return {
        "applicable": True,
        "violation": approved < goal,
        "hold": False,
        "related_entity_id": submission.id,
    }


def _evaluate_vocabulary_missing(db: Session, program: models.SprintProgram, learning_date: date) -> dict:
    if not program.enable_vocabulary:
        return {"applicable": False, "violation": False, "hold": False}
    summary = vocabulary_home_summary(db, program.student_id, learning_date)
    if not summary.get("available"):
        return {"applicable": False, "violation": False, "hold": False}
    question_count = summary.get("question_count")
    if not question_count:
        return {"applicable": False, "violation": False, "hold": False}
    submitted = summary.get("status") == "submitted"
    return {
        "applicable": True,
        "violation": not submitted,
        "hold": False,
        "related_entity_id": summary.get("session_id"),
    }


def _build_evaluators(db: Session, program: models.SprintProgram, learning_date: date) -> dict[str, Callable[[], dict]]:
    return {
        "planner_missing": lambda: _evaluate_proof_missing(db, program, learning_date, "planner"),
        "seat_check_missing": lambda: _evaluate_proof_missing(db, program, learning_date, "seat_check"),
        "study_time_missing": lambda: _evaluate_study_time_missing(db, program, learning_date),
        "vocabulary_missing": lambda: _evaluate_vocabulary_missing(db, program, learning_date),
        "planner_late": lambda: _evaluate_proof_late(db, program, learning_date, "planner"),
        "seat_check_late": lambda: _evaluate_proof_late(db, program, learning_date, "seat_check"),
        "study_time_shortage": lambda: _evaluate_study_time_shortage(db, program, learning_date),
    }


def _empty_result(program_id: int, student_id: int, learning_date: date, dry_run: bool) -> dict:
    return {
        "program_id": program_id,
        "student_id": student_id,
        "learning_date": learning_date,
        "dry_run": dry_run,
        "evaluated_rules": [],
        "created_strikes": [],
        "already_existing": [],
        "cancelled_strikes": [],
        "pending_review": [],
        "disabled": [],
        "not_due": [],
        "skipped_due_to_daily_limit": [],
        "errors": [],
    }


def evaluate_sprint_compliance(
    db: Session,
    program_id: int,
    student_id: int,
    learning_date: date,
    dry_run: bool = False,
) -> dict:
    """한 학생·한 학습일의 SPRINT 준수 여부를 판정한다.

    dry_run=True면 DB에 어떤 변경도 남기지 않는다(db.add/commit을 호출하지 않음).
    dry_run=False면 위반 시 스트라이크를 생성/취소하고 즉시 commit한다.
    """
    result = _empty_result(program_id, student_id, learning_date, dry_run)

    program = db.get(models.SprintProgram, program_id)
    if program is None or program.student_id != student_id:
        result["errors"].append("program_not_found_or_student_mismatch")
        return result

    today = get_study_date()
    if learning_date > today:
        result["errors"].append("future_learning_date_not_allowed")
        return result
    if not (program.start_date <= learning_date <= program.end_date):
        result["errors"].append("learning_date_outside_sprint_period")
        return result

    evaluators = _build_evaluators(db, program, learning_date)
    existing_auto_count = count_active_auto_strikes(db, program.id, student_id, learning_date)
    limit = program.daily_auto_strike_limit
    newly_created_count = 0

    for reason_code in RULE_PRIORITY:
        try:
            verdict = evaluators[reason_code]()
        except Exception as exc:  # 한 규칙의 예외가 나머지 판정을 막지 않게 한다
            result["errors"].append(f"{reason_code}: {exc}")
            continue

        result["evaluated_rules"].append(reason_code)

        if not verdict["applicable"]:
            result["disabled"].append(reason_code)
            continue
        if verdict.get("not_due"):
            result["not_due"].append(reason_code)
            continue
        if verdict["hold"]:
            result["pending_review"].append(reason_code)
            continue

        existing_strike = find_active_auto_strike(db, program.id, student_id, learning_date, reason_code)

        if verdict["violation"]:
            if existing_strike is not None:
                result["already_existing"].append(reason_code)
                continue
            if limit is not None and (existing_auto_count + newly_created_count) >= limit:
                result["skipped_due_to_daily_limit"].append(reason_code)
                continue
            if dry_run:
                newly_created_count += 1
                result["created_strikes"].append(reason_code)
                continue
            create_auto_strike(db, program, learning_date, reason_code, verdict.get("related_entity_id"))
            try:
                db.flush()
            except IntegrityError:
                # 동시 실행 등으로 이미 생성된 경우 idempotent하게 already_existing으로 처리한다.
                db.rollback()
                result["already_existing"].append(reason_code)
                continue
            newly_created_count += 1
            result["created_strikes"].append(reason_code)
        else:
            # 정상으로 재판정된 경우: late/shortage만 자동 취소한다.
            # missing 계열은 "늦게 제출"만으로 자동 취소하지 않는다 (관리자 수동 취소만 허용).
            if existing_strike is not None and reason_code not in MISSING_REASON_CODES:
                if not dry_run:
                    existing_strike.is_cancelled = True
                    existing_strike.cancelled_reason = "재판정 결과 정상으로 확인되어 자동 취소되었습니다."
                    existing_strike.cancelled_at = datetime.now(timezone.utc)
                result["cancelled_strikes"].append(reason_code)

    if dry_run:
        db.rollback()
    else:
        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            result["errors"].append(str(exc))

    return result


def previous_completed_learning_date(reference: date | None = None) -> date:
    """직전 완료 학습일: 오늘의 학습일(오전 5시 기준) 바로 전날."""
    today = reference or get_study_date()
    return today - timedelta(days=1)


def resolve_programs_for_scope(
    db: Session, program_id: int | None, target_date: date
) -> list[models.SprintProgram]:
    """program_id가 있으면 해당 프로그램만, 없으면 target_date를 포함하는 모든 프로그램(is_active 무관,
    단 기간 내에 있어야 판정 대상)."""
    query = db.query(models.SprintProgram).filter(
        models.SprintProgram.start_date <= target_date,
        models.SprintProgram.end_date >= target_date,
    )
    if program_id is not None:
        query = query.filter(models.SprintProgram.id == program_id)
    return query.order_by(models.SprintProgram.id).all()


def run_sprint_compliance(
    db: Session,
    program_id: int | None,
    date_from: date,
    date_to: date,
    dry_run: bool = False,
    run_type: str = "manual",
) -> dict:
    """여러 날짜·여러 프로그램에 대해 evaluate_sprint_compliance를 반복 실행하고
    SprintComplianceRun 로그를 남긴다. 관리자 API와 CLI가 공유하는 오케스트레이션 함수."""
    if date_to < date_from:
        raise ValueError("date_to must not be before date_from")

    run_log = models.SprintComplianceRun(
        program_id=program_id,
        target_date_from=date_from,
        target_date_to=date_to,
        run_type=run_type,
        dry_run=dry_run,
        status="running",
    )
    db.add(run_log)
    db.commit()
    db.refresh(run_log)

    evaluated_students = 0
    created_strikes = 0
    cancelled_strikes = 0
    pending_count = 0
    skipped_count = 0
    error_messages: list[str] = []
    details: list[dict] = []

    cursor = date_from
    while cursor <= date_to:
        for program in resolve_programs_for_scope(db, program_id, cursor):
            evaluated_students += 1
            item = evaluate_sprint_compliance(db, program.id, program.student_id, cursor, dry_run=dry_run)
            created_strikes += len(item["created_strikes"])
            cancelled_strikes += len(item["cancelled_strikes"])
            pending_count += len(item["pending_review"])
            skipped_count += len(item["skipped_due_to_daily_limit"])
            if item["errors"]:
                error_messages.extend(f"{program.id}/{cursor.isoformat()}: {message}" for message in item["errors"])
            details.append(item)
        cursor += timedelta(days=1)

    run_log.finished_at = datetime.now(timezone.utc)
    run_log.status = "failed" if error_messages else "completed"
    run_log.evaluated_students = evaluated_students
    run_log.created_strikes = created_strikes
    run_log.cancelled_strikes = cancelled_strikes
    run_log.pending_count = pending_count
    run_log.skipped_count = skipped_count
    run_log.error_message = ("; ".join(error_messages))[:1000] if error_messages else None
    db.commit()
    db.refresh(run_log)

    return {
        "run_id": run_log.id,
        "run_type": run_type,
        "program_id": program_id,
        "date_from": date_from,
        "date_to": date_to,
        "dry_run": dry_run,
        "status": run_log.status,
        "evaluated_students": evaluated_students,
        "created_strikes": created_strikes,
        "cancelled_strikes": cancelled_strikes,
        "pending_count": pending_count,
        "skipped_count": skipped_count,
        "errors": error_messages,
        "details": details,
    }


# ---------------------------------------------------------------------------
# 관리자 API (기존 sprint.py 라우팅 스타일을 따르되 순환 import를 피하기 위해
# 이 모듈 자체의 router를 main.py에 별도 등록한다)
# ---------------------------------------------------------------------------


class ComplianceEvaluateIn(BaseModel):
    student_id: int | None = None
    learning_date: date | None = None
    date_from: date | None = None
    date_to: date | None = None
    dry_run: bool = True

    @model_validator(mode="after")
    def validate_range(self):
        if self.learning_date is not None and (self.date_from is not None or self.date_to is not None):
            raise ValueError("learning_date와 date_from/date_to는 함께 사용할 수 없습니다.")
        if bool(self.date_from) != bool(self.date_to):
            raise ValueError("date_from과 date_to는 함께 지정해야 합니다.")
        if self.date_from and self.date_to and self.date_to < self.date_from:
            raise ValueError("date_to는 date_from보다 빠를 수 없습니다.")
        return self


def run_dict(run: models.SprintComplianceRun) -> dict:
    return {
        "id": run.id,
        "program_id": run.program_id,
        "target_date_from": run.target_date_from,
        "target_date_to": run.target_date_to,
        "run_type": run.run_type,
        "dry_run": run.dry_run,
        "status": run.status,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "evaluated_students": run.evaluated_students,
        "created_strikes": run.created_strikes,
        "cancelled_strikes": run.cancelled_strikes,
        "pending_count": run.pending_count,
        "skipped_count": run.skipped_count,
        "error_message": run.error_message,
    }


@router.post("/admin/sprints/{program_id}/compliance/evaluate")
def admin_evaluate_compliance(
    program_id: int, payload: ComplianceEvaluateIn, db: Session = Depends(get_db)
):
    program = db.get(models.SprintProgram, program_id)
    if program is None:
        raise HTTPException(status_code=404, detail="SPRINT 프로그램을 찾을 수 없습니다.")
    if payload.student_id is not None and payload.student_id != program.student_id:
        raise HTTPException(status_code=400, detail="student_id가 해당 SPRINT 학생과 일치하지 않습니다.")

    if payload.learning_date is not None:
        date_from = date_to = payload.learning_date
        run_type = "program_single_date"
    elif payload.date_from is not None and payload.date_to is not None:
        date_from, date_to = payload.date_from, payload.date_to
        run_type = "program_date_range"
    else:
        date_from = date_to = previous_completed_learning_date()
        run_type = "program_previous_completed_day"

    today = get_study_date()
    if date_from > today:
        raise HTTPException(status_code=400, detail="미래 날짜는 판정할 수 없습니다.")
    if date_to > today:
        date_to = today

    return run_sprint_compliance(
        db, program_id, date_from, date_to, dry_run=payload.dry_run, run_type=run_type
    )


@router.get("/admin/sprints/{program_id}/compliance/runs")
def admin_list_compliance_runs(program_id: int, limit: int = 10, db: Session = Depends(get_db)):
    program = db.get(models.SprintProgram, program_id)
    if program is None:
        raise HTTPException(status_code=404, detail="SPRINT 프로그램을 찾을 수 없습니다.")
    runs = (
        db.query(models.SprintComplianceRun)
        .filter(models.SprintComplianceRun.program_id == program_id)
        .order_by(models.SprintComplianceRun.id.desc())
        .limit(min(limit, 50))
        .all()
    )
    return [run_dict(run) for run in runs]
