from datetime import date, datetime, timedelta, timezone
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
import sprint
import sprint_compliance
import run_sprint_compliance as cli
from database import Base


def make_db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine, sessionmaker(bind=engine)()


TODAY = date(2026, 7, 23)  # 평가 시점("오늘")으로 고정해서 사용하는 테스트용 기준일


def frozen_today():
    return TODAY


class ComplianceRuleTests(TestCase):
    """evaluate_sprint_compliance의 규칙별 판정을 검증한다.
    study_dates.get_study_date를 고정해 '미래/완료' 경계를 예측 가능하게 만든다."""

    def setUp(self):
        self.engine, self.db = make_db()
        self.student = models.Student(name="학생", phone="01000000000", grade="고3")
        self.other = models.Student(name="다른학생", phone="01000000001", grade="고3")
        self.db.add_all([self.student, self.other])
        self.db.flush()
        self.program = models.SprintProgram(
            student_id=self.student.id,
            title="컴플라이언스 SPRINT",
            start_date=date(2026, 7, 1),
            end_date=date(2026, 7, 31),
            is_active=True,
            strike_threshold=3,
            daily_study_goal_minutes=300,
            enable_planner_submission=True,
            enable_seat_check=True,
            enable_study_time_submission=True,
            enable_vocabulary=True,
            planner_deadline_time="23:00",
            seat_check_deadline_time="08:00",
            planner_strike_on_late=True,
            planner_strike_on_missing=True,
            seat_check_strike_on_late=True,
            seat_check_strike_on_missing=True,
        )
        self.db.add(self.program)
        self.db.flush()

        self.day = date(2026, 7, 20)  # 판정 대상 학습일 (완료된 과거 날짜)

        patcher_sprint = patch("sprint.get_study_date", frozen_today)
        patcher_compliance = patch("sprint_compliance.get_study_date", frozen_today)
        self.addCleanup(patcher_sprint.stop)
        self.addCleanup(patcher_compliance.stop)
        patcher_sprint.start()
        patcher_compliance.start()

        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    # ---- helpers -----------------------------------------------------

    def _add_proof(self, proof_type, workflow_status, timing_status, submitted_at=None, timing_override=None):
        submission = models.SprintDailyProofSubmission(
            sprint_program_id=self.program.id,
            student_id=self.student.id,
            learning_date=self.day,
            proof_type=proof_type,
            workflow_status=workflow_status,
            timing_status=timing_status,
            submitted_at=submitted_at,
            timing_override=timing_override,
        )
        self.db.add(submission)
        self.db.commit()
        return submission

    def _add_study_submission(self, status, approved_minutes=None, total_minutes=300):
        submission = models.SprintStudySubmission(
            sprint_program_id=self.program.id,
            student_id=self.student.id,
            learning_date=self.day,
            total_minutes=total_minutes,
            status=status,
            approved_minutes=approved_minutes,
        )
        self.db.add(submission)
        self.db.commit()
        return submission

    def _add_vocab_challenge(self):
        challenge = models.VocabularyChallenge(
            name="테스트 챌린지",
            student_id=self.student.id,
            start_date=date(2026, 7, 1),
            end_date=date(2026, 7, 31),
            is_active=True,
        )
        self.db.add(challenge)
        self.db.flush()
        self.db.add(models.VocabularyWord(
            challenge_id=challenge.id, english="apple", normalized_english="apple", accepted_answers=["사과"]
        ))
        self.db.flush()
        self.db.add(models.VocabularyDailyAssignment(
            challenge_id=challenge.id, assignment_date=self.day,
            word_id=self.db.query(models.VocabularyWord).filter_by(challenge_id=challenge.id).first().id,
        ))
        self.db.commit()
        return challenge

    def _evaluate(self, dry_run=False):
        return sprint_compliance.evaluate_sprint_compliance(
            self.db, self.program.id, self.student.id, self.day, dry_run=dry_run
        )

    def _active_strikes(self):
        return self.db.query(models.SprintStrike).filter_by(
            sprint_program_id=self.program.id, is_cancelled=False
        ).all()

    # ---- 1~4 플래너 ----------------------------------------------------

    def test_1_planner_on_time_approved_no_strike(self):
        self._add_proof("planner", "approved", "on_time", submitted_at=datetime(2026, 7, 20, 12, 0, tzinfo=timezone.utc))
        result = self._evaluate()
        self.assertNotIn("planner_late", result["created_strikes"])
        self.assertNotIn("planner_missing", result["created_strikes"])

    def test_2_planner_late_approved_creates_one_strike(self):
        self._add_proof("planner", "approved", "late", submitted_at=datetime(2026, 7, 20, 20, 0, tzinfo=timezone.utc))
        result = self._evaluate()
        self.assertEqual(result["created_strikes"].count("planner_late"), 1)
        self.assertEqual(
            self.db.query(models.SprintStrike).filter_by(strike_type="planner_late").count(), 1
        )

    def test_3_planner_missing_creates_strike(self):
        result = self._evaluate()
        self.assertIn("planner_missing", result["created_strikes"])
        strike = self.db.query(models.SprintStrike).filter_by(strike_type="planner_missing").one()
        self.assertEqual(strike.source_type, "auto_rule")
        self.assertEqual(strike.source_ref, f"auto:{self.program.id}:{self.student.id}:2026-07-20:planner_missing")

    def test_4_planner_pending_holds(self):
        self._add_proof("planner", "pending", "late", submitted_at=datetime(2026, 7, 20, 20, 0, tzinfo=timezone.utc))
        result = self._evaluate()
        self.assertIn("planner_missing", result["pending_review"])
        self.assertIn("planner_late", result["pending_review"])
        # pending인 동안에는 planner 관련 스트라이크가 전혀 생성되지 않아야 한다
        # (다른 규칙(seat_check/study_time/vocabulary)은 이 테스트의 관심사가 아니므로 제외하고 확인한다).
        planner_strikes = self.db.query(models.SprintStrike).filter(
            models.SprintStrike.strike_type.in_(["planner_missing", "planner_late"])
        ).count()
        self.assertEqual(planner_strikes, 0)

    # ---- 5~8 착석 ------------------------------------------------------

    def test_5_seat_check_on_time_approved_no_strike(self):
        self._add_proof("seat_check", "approved", "on_time", submitted_at=datetime(2026, 7, 20, 1, 0, tzinfo=timezone.utc))
        result = self._evaluate()
        self.assertNotIn("seat_check_late", result["created_strikes"])
        self.assertNotIn("seat_check_missing", result["created_strikes"])

    def test_6_seat_check_late_approved_creates_one_strike(self):
        self._add_proof("seat_check", "approved", "late", submitted_at=datetime(2026, 7, 21, 1, 0, tzinfo=timezone.utc))
        result = self._evaluate()
        self.assertEqual(result["created_strikes"].count("seat_check_late"), 1)

    def test_7_seat_check_missing_creates_strike(self):
        result = self._evaluate()
        self.assertIn("seat_check_missing", result["created_strikes"])

    def test_8_seat_check_pending_holds(self):
        self._add_proof("seat_check", "pending", "on_time", submitted_at=datetime(2026, 7, 20, 1, 0, tzinfo=timezone.utc))
        result = self._evaluate()
        self.assertIn("seat_check_missing", result["pending_review"])

    # ---- 9~14 공부시간 --------------------------------------------------

    def test_9_study_time_no_approved_is_missing(self):
        result = self._evaluate()
        self.assertIn("study_time_missing", result["created_strikes"])

    def test_10_study_time_pending_holds(self):
        self._add_study_submission("pending")
        result = self._evaluate()
        self.assertIn("study_time_missing", result["pending_review"])

    def test_11_study_time_shortage(self):
        self._add_study_submission("approved", approved_minutes=200)
        result = self._evaluate()
        self.assertIn("study_time_shortage", result["created_strikes"])
        self.assertNotIn("study_time_missing", result["created_strikes"])

    def test_12_study_time_goal_met_no_strike(self):
        self._add_study_submission("approved", approved_minutes=300)
        result = self._evaluate()
        self.assertNotIn("study_time_shortage", result["created_strikes"])
        self.assertNotIn("study_time_missing", result["created_strikes"])

    def test_13_study_time_no_goal_excludes_shortage(self):
        self.program.daily_study_goal_minutes = None
        self.db.commit()
        self._add_study_submission("approved", approved_minutes=10)
        result = self._evaluate()
        self.assertIn("study_time_shortage", result["disabled"])
        self.assertNotIn("study_time_shortage", result["created_strikes"])

    def test_14_missing_and_shortage_never_both(self):
        # 승인 제출이 없을 때: shortage 규칙 자체가 미적용(disabled)이어야 하고 missing만 생성된다.
        result = self._evaluate()
        self.assertIn("study_time_missing", result["created_strikes"])
        self.assertIn("study_time_shortage", result["disabled"])
        self._add_study_submission("approved", approved_minutes=50)
        strike = self.db.query(models.SprintStrike).filter_by(strike_type="study_time_missing").one()
        strike.is_cancelled = True  # 초기화 후 재평가 시나리오
        self.db.commit()
        result2 = self._evaluate()
        # 이제 approved 제출이 있으므로 missing은 재생성되지 않고 shortage만 판정된다.
        self.assertNotIn("study_time_missing", result2["created_strikes"])
        self.assertIn("study_time_shortage", result2["created_strikes"])

    # ---- 15~16 영단어 --------------------------------------------------

    def test_15_vocabulary_submitted_no_strike(self):
        challenge = self._add_vocab_challenge()
        self.db.add(models.VocabularyTestSession(
            challenge_id=challenge.id, student_id=self.student.id, study_date=self.day,
            session_type="main", status="submitted", total_count=1, correct_count=1, score=100,
        ))
        self.db.commit()
        result = self._evaluate()
        self.assertNotIn("vocabulary_missing", result["created_strikes"])

    def test_16_vocabulary_missing_creates_strike(self):
        self._add_vocab_challenge()
        result = self._evaluate()
        self.assertIn("vocabulary_missing", result["created_strikes"])

    def test_16b_vocabulary_review_session_is_excluded(self):
        challenge = self._add_vocab_challenge()
        # 오답 재시험(session_type=review)만 제출되어 있어도 본시험 미제출로 판정되어야 한다.
        self.db.add(models.VocabularyTestSession(
            challenge_id=challenge.id, student_id=self.student.id, study_date=self.day,
            session_type="review", status="submitted", total_count=1, correct_count=1, score=100,
        ))
        self.db.commit()
        result = self._evaluate()
        self.assertIn("vocabulary_missing", result["created_strikes"])

    # ---- 17~20 제외 조건 ------------------------------------------------

    def test_17_disabled_feature_excluded(self):
        self.program.enable_planner_submission = False
        self.db.commit()
        result = self._evaluate()
        self.assertIn("planner_missing", result["disabled"])
        self.assertIn("planner_late", result["disabled"])
        self.assertNotIn("planner_missing", result["created_strikes"])

    def test_18_outside_sprint_period_excluded(self):
        result = sprint_compliance.evaluate_sprint_compliance(
            self.db, self.program.id, self.student.id, date(2026, 6, 1), dry_run=False
        )
        self.assertIn("learning_date_outside_sprint_period", result["errors"])
        self.assertEqual(result["created_strikes"], [])

    def test_19_future_date_excluded(self):
        future = TODAY + timedelta(days=5)
        result = sprint_compliance.evaluate_sprint_compliance(
            self.db, self.program.id, self.student.id, future, dry_run=False
        )
        self.assertIn("future_learning_date_not_allowed", result["errors"])

    def test_20_uses_study_date_5am_cutoff(self):
        self.assertEqual(sprint_compliance.previous_completed_learning_date(TODAY), TODAY - timedelta(days=1))
        # study_dates 유틸을 그대로 재사용하는지 확인 (오전 5시 컷오프)
        from study_dates import get_study_date
        before_cutoff = datetime(2026, 7, 21, 3, 0, tzinfo=timezone(timedelta(hours=9)))
        after_cutoff = datetime(2026, 7, 21, 6, 0, tzinfo=timezone(timedelta(hours=9)))
        self.assertEqual(get_study_date(before_cutoff), date(2026, 7, 20))
        self.assertEqual(get_study_date(after_cutoff), date(2026, 7, 21))

    # ---- 21 중복 방지 ---------------------------------------------------

    def test_21_repeated_evaluation_no_duplicate_strikes(self):
        self._evaluate()
        self._evaluate()
        self._evaluate()
        count = self.db.query(models.SprintStrike).filter_by(strike_type="planner_missing").count()
        self.assertEqual(count, 1)

    # ---- 22 CLI 재실행 중복 없음 -----------------------------------------

    def test_22_cli_rerun_no_duplicate(self):
        with patch("run_sprint_compliance.SessionLocal", lambda: self.db):
            with patch.object(self.db, "close", lambda: None):
                exit_code_1 = cli.main(["--program-id", str(self.program.id), "--date", self.day.isoformat()])
                exit_code_2 = cli.main(["--program-id", str(self.program.id), "--date", self.day.isoformat()])
        self.assertEqual(exit_code_1, 0)
        self.assertEqual(exit_code_2, 0)
        count = self.db.query(models.SprintStrike).filter_by(strike_type="planner_missing").count()
        self.assertEqual(count, 1)

    # ---- 23~24 재판정 취소 ------------------------------------------------

    def test_23_on_time_override_cancels_late_strike(self):
        submission = self._add_proof("planner", "approved", "late", submitted_at=datetime(2026, 7, 20, 20, 0, tzinfo=timezone.utc))
        self._evaluate()
        strike = self.db.query(models.SprintStrike).filter_by(strike_type="planner_late").one()
        self.assertFalse(strike.is_cancelled)
        submission.timing_override = "on_time"
        self.db.commit()
        result = self._evaluate()
        self.assertIn("planner_late", result["cancelled_strikes"])
        self.db.refresh(strike)
        self.assertTrue(strike.is_cancelled)

    def test_24_goal_achieved_after_correction_cancels_shortage(self):
        submission = self._add_study_submission("approved", approved_minutes=100)
        self._evaluate()
        strike = self.db.query(models.SprintStrike).filter_by(strike_type="study_time_shortage").one()
        self.assertFalse(strike.is_cancelled)
        submission.approved_minutes = 300
        self.db.commit()
        result = self._evaluate()
        self.assertIn("study_time_shortage", result["cancelled_strikes"])
        self.db.refresh(strike)
        self.assertTrue(strike.is_cancelled)

    def test_missing_strike_never_auto_cancelled_by_late_submission(self):
        # missing 판정 이후 학생이 늦게라도 제출/승인되어도 missing 스트라이크는 자동 취소되지 않는다.
        self._evaluate()
        missing_strike = self.db.query(models.SprintStrike).filter_by(strike_type="planner_missing").one()
        self._add_proof("planner", "approved", "late", submitted_at=datetime(2026, 7, 21, 3, 0, tzinfo=timezone.utc))
        result = self._evaluate()
        self.assertNotIn("planner_missing", result["cancelled_strikes"])
        self.db.refresh(missing_strike)
        self.assertFalse(missing_strike.is_cancelled)
        # late는 별도로 새로 생성된다 (missing과 late는 서로 다른 reason_code)
        self.assertIn("planner_late", result["created_strikes"])

    # ---- 25~27 상한/우선순위/수동 제외 --------------------------------------

    def test_25_daily_auto_strike_limit_applies(self):
        self.program.daily_auto_strike_limit = 1
        self.db.commit()
        result = self._evaluate()
        self.assertEqual(len(result["created_strikes"]), 1)
        self.assertGreaterEqual(len(result["skipped_due_to_daily_limit"]), 1)

    def test_26_priority_order_is_respected_under_limit(self):
        self.program.daily_auto_strike_limit = 2
        self.db.commit()
        result = self._evaluate()
        # planner_missing, seat_check_missing이 study_time_missing/vocabulary_missing보다 우선한다.
        self.assertEqual(result["created_strikes"], ["planner_missing", "seat_check_missing"])
        self.assertIn("study_time_missing", result["skipped_due_to_daily_limit"])

    def test_27_manual_strikes_excluded_from_daily_limit(self):
        self.db.add(models.SprintStrike(
            sprint_program_id=self.program.id, student_id=self.student.id,
            strike_type="manual", reason="수동 부여", learning_date=self.day,
            source_type="manual",
        ))
        self.db.commit()
        self.program.daily_auto_strike_limit = 1
        self.db.commit()
        result = self._evaluate()
        # 수동 스트라이크가 이미 1개 있어도 자동 판정 한도(1개)는 그대로 적용된다.
        self.assertEqual(len(result["created_strikes"]), 1)

    # ---- 28 취소 집계 제외 ------------------------------------------------

    def test_28_cancelled_strikes_excluded_from_active_count(self):
        # 이 테스트는 evaluate()의 다른 규칙(seat_check/study_time/vocabulary)이 섞이지 않도록
        # create_auto_strike로 planner_missing 하나만 직접 만들어 취소 집계만 검증한다.
        sprint_compliance.create_auto_strike(self.db, self.program, self.day, "planner_missing", None)
        self.db.commit()
        before = sprint_compliance.count_active_auto_strikes(self.db, self.program.id, self.student.id, self.day)
        self.assertEqual(before, 1)

        strike = self.db.query(models.SprintStrike).filter_by(strike_type="planner_missing").one()
        strike.is_cancelled = True
        self.db.commit()

        after = sprint_compliance.count_active_auto_strikes(self.db, self.program.id, self.student.id, self.day)
        self.assertEqual(after, 0)
        summary = sprint.strike_summary(self.db, self.program)
        self.assertEqual(summary["total_active"], 0)
        self.assertIsNone(
            sprint_compliance.find_active_auto_strike(
                self.db, self.program.id, self.student.id, self.day, "planner_missing"
            )
        )

    # ---- 29~30 dry-run / 실제 적용 -----------------------------------------

    def test_29_dry_run_does_not_change_db(self):
        result = self._evaluate(dry_run=True)
        self.assertIn("planner_missing", result["created_strikes"])
        self.assertEqual(self.db.query(models.SprintStrike).count(), 0)

    def test_30_real_run_persists_strikes(self):
        result = self._evaluate(dry_run=False)
        self.assertIn("planner_missing", result["created_strikes"])
        self.assertEqual(self.db.query(models.SprintStrike).count() >= 1, True)
        # 새 세션으로 다시 읽어도 남아있는지 확인 (commit 여부 검증)
        self.db.expire_all()
        self.assertGreaterEqual(
            self.db.query(models.SprintStrike).filter_by(strike_type="planner_missing").count(), 1
        )

    # ---- 31 관리자 API -----------------------------------------------------

    def test_31_admin_api_evaluate_endpoint(self):
        payload = sprint_compliance.ComplianceEvaluateIn(learning_date=self.day, dry_run=False)
        response = sprint_compliance.admin_evaluate_compliance(self.program.id, payload, self.db)
        self.assertEqual(response["status"], "completed")
        self.assertGreaterEqual(response["created_strikes"], 1)
        runs = sprint_compliance.admin_list_compliance_runs(self.program.id, 10, self.db)
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]["program_id"], self.program.id)

    def test_31b_admin_api_rejects_mismatched_student(self):
        payload = sprint_compliance.ComplianceEvaluateIn(student_id=self.other.id, learning_date=self.day)
        with self.assertRaises(HTTPException) as ctx:
            sprint_compliance.admin_evaluate_compliance(self.program.id, payload, self.db)
        self.assertEqual(ctx.exception.status_code, 400)


class ComplianceCliTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = models.Student(name="학생", phone="01000000010", grade="고3")
        self.db.add(self.student)
        self.db.flush()
        self.program = models.SprintProgram(
            student_id=self.student.id,
            title="CLI SPRINT",
            start_date=date(2026, 7, 1),
            end_date=date(2026, 7, 31),
            is_active=True,
            enable_planner_submission=True,
            planner_deadline_time="23:00",
            planner_strike_on_missing=True,
        )
        self.db.add(self.program)
        self.db.commit()

        patcher_sprint = patch("sprint.get_study_date", frozen_today)
        patcher_compliance = patch("sprint_compliance.get_study_date", frozen_today)
        patcher_cli = patch("run_sprint_compliance.get_study_date", frozen_today)
        self.addCleanup(patcher_sprint.stop)
        self.addCleanup(patcher_compliance.stop)
        self.addCleanup(patcher_cli.stop)
        patcher_sprint.start()
        patcher_compliance.start()
        patcher_cli.start()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    # ---- 32~34 CLI ------------------------------------------------------

    def test_32_cli_specific_date(self):
        with patch("run_sprint_compliance.SessionLocal", lambda: self.db), patch.object(self.db, "close", lambda: None):
            exit_code = cli.main(["--date", "2026-07-20"])
        self.assertEqual(exit_code, 0)
        strike = self.db.query(models.SprintStrike).filter_by(strike_type="planner_missing").first()
        self.assertIsNotNone(strike)
        self.assertEqual(strike.learning_date, date(2026, 7, 20))

    def test_33_cli_default_previous_completed_day(self):
        with patch("run_sprint_compliance.SessionLocal", lambda: self.db), patch.object(self.db, "close", lambda: None):
            exit_code = cli.main([])
        self.assertEqual(exit_code, 0)
        expected_date = TODAY - timedelta(days=1)
        strike = self.db.query(models.SprintStrike).filter_by(strike_type="planner_missing").first()
        self.assertIsNotNone(strike)
        self.assertEqual(strike.learning_date, expected_date)

    def test_34_cli_failure_exit_code_for_unknown_program(self):
        with patch("run_sprint_compliance.SessionLocal", lambda: self.db), patch.object(self.db, "close", lambda: None):
            exit_code = cli.main(["--program-id", "999999", "--date", "2026-07-20"])
        self.assertEqual(exit_code, 1)

    def test_cli_rejects_future_date(self):
        with patch("run_sprint_compliance.SessionLocal", lambda: self.db), patch.object(self.db, "close", lambda: None):
            exit_code = cli.main(["--date", (TODAY + timedelta(days=3)).isoformat()])
        self.assertEqual(exit_code, 1)

    def test_cli_dry_run_leaves_no_strikes(self):
        with patch("run_sprint_compliance.SessionLocal", lambda: self.db), patch.object(self.db, "close", lambda: None):
            exit_code = cli.main(["--date", "2026-07-20", "--dry-run"])
        self.assertEqual(exit_code, 0)
        self.assertEqual(self.db.query(models.SprintStrike).count(), 0)
