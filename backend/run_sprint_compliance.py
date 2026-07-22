"""SPRINT 자동 판정 CLI (4차).

cron 또는 systemd timer에서 호출한다. 웹 API를 호출하지 않고 sprint_compliance의
공통 서비스 함수(run_sprint_compliance/evaluate_sprint_compliance)를 직접 사용한다.

사용 예:
    python -m backend.run_sprint_compliance
    python -m backend.run_sprint_compliance --date 2026-07-22
    python -m backend.run_sprint_compliance --program-id 1 --date 2026-07-22
    python -m backend.run_sprint_compliance --date 2026-07-22 --dry-run

기본값(옵션 없이 실행): 모든 SPRINT 프로그램에 대해 직전 완료 학습일(오전 5시 기준)을 판정한다.

DB 접속 정보(비밀번호 포함)는 출력하지 않는다.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

# backend/ 디렉터리를 sys.path에 직접 추가한다. 이 스크립트가
# `python -m backend.run_sprint_compliance`(레포 루트에서 실행)로 호출되든,
# `python run_sprint_compliance.py`(backend/ 안에서 실행)로 호출되든
# 기존 모듈들의 "import models" 같은 flat import가 그대로 동작하게 하기 위함이다.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import models  # noqa: E402
from database import SessionLocal  # noqa: E402
from sprint_compliance import previous_completed_learning_date, run_sprint_compliance  # noqa: E402
from study_dates import get_study_date  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="run_sprint_compliance",
        description="SPRINT 마감 이후 위반 사항을 자동 판정하고 스트라이크를 부여한다.",
    )
    parser.add_argument(
        "--date",
        dest="learning_date",
        type=str,
        default=None,
        help="판정할 학습일(YYYY-MM-DD). 지정하지 않으면 직전 완료 학습일을 사용한다.",
    )
    parser.add_argument(
        "--program-id",
        dest="program_id",
        type=int,
        default=None,
        help="특정 SPRINT 프로그램만 판정한다. 지정하지 않으면 대상 날짜에 속한 모든 프로그램을 판정한다.",
    )
    parser.add_argument(
        "--dry-run",
        dest="dry_run",
        action="store_true",
        help="DB를 변경하지 않고 판정 결과만 출력한다.",
    )
    return parser.parse_args(argv)


def resolve_learning_date(raw: str | None) -> date:
    if raw is None:
        return previous_completed_learning_date()
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise SystemExit(f"오류: --date 형식이 올바르지 않습니다 (YYYY-MM-DD): {raw}") from exc


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    learning_date = resolve_learning_date(args.learning_date)

    today = get_study_date()
    if learning_date > today:
        print(f"오류: 미래 학습일은 판정할 수 없습니다 ({learning_date.isoformat()} > {today.isoformat()}).", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        if args.program_id is not None:
            program = db.get(models.SprintProgram, args.program_id)
            if program is None:
                print(f"오류: SPRINT 프로그램을 찾을 수 없습니다 (program_id={args.program_id}).", file=sys.stderr)
                return 1

        run_type = "cli_previous_completed_day" if args.learning_date is None else "cli_single_date"
        if args.program_id is not None:
            run_type = f"{run_type}_program_scoped"

        result = run_sprint_compliance(
            db,
            args.program_id,
            learning_date,
            learning_date,
            dry_run=args.dry_run,
            run_type=run_type,
        )
    except Exception as exc:  # DB 연결 실패 등 예상치 못한 오류
        print(f"오류: 자동 판정 실행에 실패했습니다: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()

    mode = "DRY-RUN" if args.dry_run else "APPLIED"
    scope = f"program_id={args.program_id}" if args.program_id is not None else "all programs"
    print(f"[{mode}] learning_date={learning_date.isoformat()} scope={scope} run_id={result['run_id']} status={result['status']}")
    print(
        f"evaluated_students={result['evaluated_students']} "
        f"created_strikes={result['created_strikes']} "
        f"cancelled_strikes={result['cancelled_strikes']} "
        f"pending={result['pending_count']} "
        f"skipped_due_to_daily_limit={result['skipped_count']}"
    )
    if result["errors"]:
        print(f"errors={len(result['errors'])}:", file=sys.stderr)
        for message in result["errors"]:
            print(f"  - {message}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
