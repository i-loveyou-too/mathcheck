from datetime import date, timedelta
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
import mock_exam
from database import Base


def make_db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine, sessionmaker(bind=engine)()


# 2026-07-26은 실제로 일요일이다.
FIRST_SUNDAY = date(2026, 7, 26)


class SeriesGenerationTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = models.Student(name="학생", phone="01000000000", grade="고3")
        self.db.add(self.student)
        self.db.flush()
        self.program = models.SprintProgram(
            student_id=self.student.id,
            title="여름 SPRINT",
            start_date=date(2026, 7, 20),
            end_date=date(2026, 9, 13),  # 일요일 기준 정확히 8주
            is_active=True,
            enable_mock_exam=True,
        )
        self.db.add(self.program)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _create_series(self, **overrides):
        defaults = dict(
            title="SPRINT 모의고사",
            recurrence_weekday=6,  # 일요일
            first_exam_date=FIRST_SUNDAY,
            submission_deadline_time="23:00",
            generation_mode="until_sprint_end",
            subject="수학",
            default_question_count=20,
        )
        defaults.update(overrides)
        payload = mock_exam.SeriesCreateIn(**defaults)
        return mock_exam.admin_create_series(self.program.id, payload, self.db)

    def test_1_weekly_seven_rounds(self):
        result = self._create_series(generation_mode="fixed_rounds", total_rounds=7)
        self.assertEqual(len(result["rounds"]), 7)
        dates = [r["exam_date"] for r in result["rounds"]]
        self.assertEqual(dates, [FIRST_SUNDAY + timedelta(days=7 * i) for i in range(7)])
        self.assertTrue(all(r["round_no"] == i + 1 for i, r in enumerate(result["rounds"])))

    def test_2_generate_until_sprint_end(self):
        result = self._create_series()
        last_date = result["rounds"][-1]["exam_date"]
        self.assertLessEqual(last_date, self.program.end_date)
        self.assertGreater(last_date + timedelta(days=7), self.program.end_date)

    def test_3_generate_fixed_round_count(self):
        result = self._create_series(generation_mode="fixed_rounds", total_rounds=3)
        self.assertEqual(len(result["rounds"]), 3)

    def test_4_regenerate_is_idempotent(self):
        result = self._create_series(generation_mode="fixed_rounds", total_rounds=5)
        series = mock_exam.get_series_or_404(self.db, result["id"])
        created_again = mock_exam.generate_rounds(self.db, series)
        self.db.commit()
        self.assertEqual(created_again, [])
        total = self.db.query(models.SprintMockExam).filter_by(series_id=series.id).count()
        self.assertEqual(total, 5)

    def test_weekday_mismatch_rejected(self):
        with self.assertRaises(ValueError):
            mock_exam.SeriesCreateIn(
                title="X", recurrence_weekday=0, first_exam_date=FIRST_SUNDAY,
                submission_deadline_time="23:00",
            )


class RescheduleTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = models.Student(name="학생", phone="01000000001", grade="고3")
        self.db.add(self.student)
        self.db.flush()
        self.program = models.SprintProgram(
            student_id=self.student.id, title="SPRINT", start_date=date(2026, 7, 20),
            end_date=date(2026, 9, 13), is_active=True, enable_mock_exam=True,
        )
        self.db.add(self.program)
        self.db.commit()
        payload = mock_exam.SeriesCreateIn(
            title="모의고사", recurrence_weekday=6, first_exam_date=FIRST_SUNDAY,
            submission_deadline_time="23:00", generation_mode="fixed_rounds", total_rounds=5,
        )
        result = mock_exam.admin_create_series(self.program.id, payload, self.db)
        self.series = mock_exam.get_series_or_404(self.db, result["id"])

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _exam(self, round_no):
        return self.db.query(models.SprintMockExam).filter_by(series_id=self.series.id, round_no=round_no).one()

    def test_5_and_6_single_round_change_keeps_others(self):
        target = self._exam(2)
        new_date = target.exam_date - timedelta(days=1)  # 토요일로 변경
        mock_exam.reschedule_single(self.db, target, mock_exam.RescheduleSingleIn(exam_date=new_date))
        self.db.refresh(target)
        self.assertEqual(target.exam_date, new_date)
        self.assertTrue(target.is_date_overridden)
        self.assertEqual(target.original_exam_date, FIRST_SUNDAY + timedelta(days=7))
        # 다음 회차는 변경되지 않는다.
        round3 = self._exam(3)
        self.assertEqual(round3.exam_date, FIRST_SUNDAY + timedelta(days=14))
        self.assertFalse(round3.is_date_overridden)

    def test_7_reschedule_from_round_onward(self):
        target = self._exam(3)
        new_date = target.exam_date + timedelta(days=1)
        result = mock_exam.reschedule_from_round(
            self.db, self.series, target, mock_exam.RescheduleFromIn(exam_date=new_date)
        )
        self.assertIn(3, result["updated"])
        self.assertIn(4, result["updated"])
        self.assertIn(5, result["updated"])
        round4 = self._exam(4)
        round5 = self._exam(5)
        self.assertEqual(round4.exam_date, new_date + timedelta(days=7))
        self.assertEqual(round5.exam_date, new_date + timedelta(days=14))
        # 이전 회차(1,2)는 영향받지 않는다.
        round1 = self._exam(1)
        self.assertEqual(round1.exam_date, FIRST_SUNDAY)

    def test_8_reschedule_whole_series(self):
        new_first = FIRST_SUNDAY + timedelta(days=7 * 10)  # 먼 미래 일요일
        result = mock_exam.reschedule_whole_series(
            self.db, self.series,
            mock_exam.RescheduleAllIn(
                recurrence_weekday=6, first_exam_date=new_first,
                submission_deadline_time="22:00", generation_mode="fixed_rounds", total_rounds=4,
            ),
        )
        self.assertEqual(result["kept_locked_rounds"], [])
        remaining = self.db.query(models.SprintMockExam).filter_by(series_id=self.series.id).all()
        self.assertEqual(len(remaining), 4)
        self.assertEqual(min(e.exam_date for e in remaining), new_first)

    def test_9_and_10_submitted_round_is_protected(self):
        target = self._exam(1)
        submission = models.SprintMockExamSubmission(exam_id=target.id, student_id=self.student.id, status="submitted")
        self.db.add(submission)
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            mock_exam.reschedule_single(self.db, target, mock_exam.RescheduleSingleIn(exam_date=target.exam_date + timedelta(days=1)))
        self.assertEqual(ctx.exception.status_code, 400)

        # this_and_after: 제출된 1회차부터 시작하면 즉시 차단
        with self.assertRaises(HTTPException):
            mock_exam.reschedule_from_round(self.db, self.series, target, mock_exam.RescheduleFromIn(exam_date=target.exam_date + timedelta(days=1)))

        # 2회차부터 재조정하면 1회차(제출됨)는 그대로, 나머지는 skip 없이 이동
        round2 = self._exam(2)
        result = mock_exam.reschedule_from_round(self.db, self.series, round2, mock_exam.RescheduleFromIn(exam_date=round2.exam_date + timedelta(days=1)))
        self.assertEqual(result["skipped_locked"], [])
        self.db.refresh(target)
        self.assertEqual(target.exam_date, FIRST_SUNDAY)  # 원본 그대로 (original_exam_date 보존 확인용 아래에서 재검증)
        self.assertIsNone(target.original_exam_date)

    def test_11_override_badge_fields(self):
        target = self._exam(4)
        original = target.exam_date
        mock_exam.reschedule_single(self.db, target, mock_exam.RescheduleSingleIn(exam_date=original + timedelta(days=1)))
        self.db.refresh(target)
        payload = mock_exam.exam_dict(target)
        self.assertTrue(payload["is_date_overridden"])
        self.assertEqual(payload["original_exam_date"], original)


class OmrSubmissionTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = models.Student(name="학생", phone="01000000002", grade="고3")
        self.other = models.Student(name="다른학생", phone="01000000003", grade="고3")
        self.db.add_all([self.student, self.other])
        self.db.flush()
        self.program = models.SprintProgram(
            student_id=self.student.id, title="SPRINT", start_date=date(2026, 7, 1),
            end_date=date(2026, 9, 30), is_active=True, enable_mock_exam=True,
        )
        self.db.add(self.program)
        self.db.flush()
        self.exam = models.SprintMockExam(
            series_id=self._make_series().id,
            sprint_program_id=self.program.id,
            round_no=1, title="1회차", exam_date=date(2026, 7, 26),
            submission_deadline_at=mock_exam.compute_deadline_at(date(2026, 7, 26), "23:00"),
            subject="수학", question_count=5, status="open",
        )
        self.db.add(self.exam)
        self.db.flush()
        for i in range(1, 6):
            self.db.add(models.SprintMockExamAnswerKey(exam_id=self.exam.id, question_no=i, correct_answer=(i % 5) + 1, score_points=20))
        self.db.commit()

    def _make_series(self):
        series = models.SprintMockExamSeries(
            sprint_program_id=self.program.id, title="모의고사", recurrence_weekday=6,
            first_exam_date=date(2026, 7, 26), submission_deadline_time="23:00",
        )
        self.db.add(series)
        self.db.flush()
        return series

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_12_and_13_draft_save_and_recovery(self):
        mock_exam.student_save_omr(self.exam.id, mock_exam.OmrSaveIn(student_id=self.student.id, answers=[
            mock_exam.OmrAnswerIn(question_no=1, selected_answer=2),
        ]), self.db)
        recovered = mock_exam.student_get_omr(self.exam.id, self.student.id, self.db)
        self.assertEqual(recovered["answers"][0]["selected_answer"], 2)
        self.assertIsNone(recovered["answers"][1]["selected_answer"])

    def test_14_unanswered_warning_before_submit(self):
        mock_exam.student_save_omr(self.exam.id, mock_exam.OmrSaveIn(student_id=self.student.id, answers=[
            mock_exam.OmrAnswerIn(question_no=1, selected_answer=1),
        ]), self.db)
        with self.assertRaises(HTTPException) as ctx:
            mock_exam.student_submit_exam(self.exam.id, mock_exam.SubmitIn(student_id=self.student.id, force=False), self.db)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_15_and_17_final_submit_and_server_grading(self):
        answers = [mock_exam.OmrAnswerIn(question_no=i, selected_answer=(i % 5) + 1) for i in range(1, 6)]
        mock_exam.student_save_omr(self.exam.id, mock_exam.OmrSaveIn(student_id=self.student.id, answers=answers), self.db)
        result = mock_exam.student_submit_exam(self.exam.id, mock_exam.SubmitIn(student_id=self.student.id, force=True), self.db)
        self.assertEqual(result["status"], "graded")
        self.assertEqual(result["correct_count"], 5)
        self.assertEqual(result["raw_score"], 100)

    def test_16_duplicate_submit_blocked(self):
        answers = [mock_exam.OmrAnswerIn(question_no=i, selected_answer=1) for i in range(1, 6)]
        mock_exam.student_save_omr(self.exam.id, mock_exam.OmrSaveIn(student_id=self.student.id, answers=answers), self.db)
        mock_exam.student_submit_exam(self.exam.id, mock_exam.SubmitIn(student_id=self.student.id, force=True), self.db)
        with self.assertRaises(HTTPException) as ctx:
            mock_exam.student_submit_exam(self.exam.id, mock_exam.SubmitIn(student_id=self.student.id, force=True), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_18_per_question_scoring(self):
        answers = [mock_exam.OmrAnswerIn(question_no=i, selected_answer=(i % 5) + 1) for i in range(1, 6)]
        mock_exam.student_save_omr(self.exam.id, mock_exam.OmrSaveIn(student_id=self.student.id, answers=answers), self.db)
        submission = mock_exam.get_submission_or_404(self.db, self.exam.id, self.student.id)
        mock_exam.grade_submission(self.db, submission, self.exam)
        self.db.commit()
        self.assertEqual(submission.max_score, 100)
        for response in submission.responses:
            self.assertEqual(response.awarded_points, 20)

    def test_19_answer_count_validation(self):
        with self.assertRaises(HTTPException) as ctx:
            mock_exam.admin_set_answer_key(self.exam.id, mock_exam.AnswerKeySetIn(questions=[
                mock_exam.AnswerKeyItemIn(question_no=1, correct_answer=1),
            ]), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_20_other_student_access_blocked(self):
        mock_exam.student_save_omr(self.exam.id, mock_exam.OmrSaveIn(student_id=self.student.id, answers=[
            mock_exam.OmrAnswerIn(question_no=1, selected_answer=1),
        ]), self.db)
        # (exam_id, student_id) 조합으로만 조회하므로 다른 학생 조회는 절대 self.student의 제출을 반환하지 않는다.
        other_view = mock_exam.student_get_omr(self.exam.id, self.other.id, self.db)
        self.assertIsNone(other_view["submission_id"])
        self.assertIsNone(other_view["answers"][0]["selected_answer"])
        # 실제 제출 레코드를 다른 학생 id로 접근 시도하면 명시적으로 403이 발생해야 한다.
        submission = mock_exam.get_submission_or_404(self.db, self.exam.id, self.student.id)
        with self.assertRaises(HTTPException) as ctx:
            mock_exam.ensure_own_submission(submission, self.other.id)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_21_question_count_locked_after_submission(self):
        answers = [mock_exam.OmrAnswerIn(question_no=i, selected_answer=1) for i in range(1, 6)]
        mock_exam.student_save_omr(self.exam.id, mock_exam.OmrSaveIn(student_id=self.student.id, answers=answers), self.db)
        mock_exam.student_submit_exam(self.exam.id, mock_exam.SubmitIn(student_id=self.student.id, force=True), self.db)
        with self.assertRaises(HTTPException) as ctx:
            mock_exam.admin_update_exam(self.exam.id, mock_exam.ExamUpdateIn(question_count=10), self.db)
        self.assertEqual(ctx.exception.status_code, 400)


class RegradeTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = models.Student(name="학생", phone="01000000004", grade="고3")
        self.other = models.Student(name="다른학생", phone="01000000005", grade="고3")
        self.db.add_all([self.student, self.other])
        self.db.flush()
        self.program = models.SprintProgram(
            student_id=self.student.id, title="SPRINT", start_date=date(2026, 7, 1),
            end_date=date(2026, 9, 30), is_active=True, enable_mock_exam=True,
        )
        self.db.add(self.program)
        self.db.flush()
        series = models.SprintMockExamSeries(
            sprint_program_id=self.program.id, title="모의고사", recurrence_weekday=6,
            first_exam_date=date(2026, 7, 26), submission_deadline_time="23:00",
        )
        self.db.add(series)
        self.db.flush()
        self.exam = models.SprintMockExam(
            series_id=series.id, sprint_program_id=self.program.id, round_no=1, title="1회차",
            exam_date=date(2026, 7, 26),
            submission_deadline_at=mock_exam.compute_deadline_at(date(2026, 7, 26), "23:00"),
            subject="수학", question_count=2, status="open",
        )
        self.db.add(self.exam)
        self.db.flush()
        self.db.add(models.SprintMockExamAnswerKey(exam_id=self.exam.id, question_no=1, correct_answer=1, score_points=50))
        self.db.add(models.SprintMockExamAnswerKey(exam_id=self.exam.id, question_no=2, correct_answer=2, score_points=50))
        self.db.commit()

        answers = [mock_exam.OmrAnswerIn(question_no=1, selected_answer=1), mock_exam.OmrAnswerIn(question_no=2, selected_answer=3)]
        mock_exam.student_save_omr(self.exam.id, mock_exam.OmrSaveIn(student_id=self.student.id, answers=answers), self.db)
        self.submission_result = mock_exam.student_submit_exam(self.exam.id, mock_exam.SubmitIn(student_id=self.student.id, force=True), self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_22_regrade_dry_run_no_db_change(self):
        submission = mock_exam.get_submission_or_404(self.db, self.exam.id, self.student.id)
        before_score = submission.raw_score
        before_version = submission.grading_version
        result = mock_exam.preview_or_apply_regrade(
            self.db, self.exam,
            [mock_exam.AnswerKeyItemIn(question_no=1, correct_answer=1, score_points=50),
             mock_exam.AnswerKeyItemIn(question_no=2, correct_answer=3, score_points=50)],
            None, dry_run=True,
        )
        self.assertTrue(result["dry_run"])
        self.assertEqual(result["affected_count"], 1)
        self.assertEqual(result["details"][0]["new_raw_score"], 100)
        self.db.refresh(submission)
        self.assertEqual(submission.raw_score, before_score)
        self.assertEqual(submission.grading_version, before_version)

    def test_23_and_24_regrade_applies_and_bumps_version(self):
        submission = mock_exam.get_submission_or_404(self.db, self.exam.id, self.student.id)
        self.assertEqual(submission.raw_score, 50)
        self.assertEqual(submission.grading_version, 0)
        mock_exam.preview_or_apply_regrade(
            self.db, self.exam,
            [mock_exam.AnswerKeyItemIn(question_no=1, correct_answer=1, score_points=50),
             mock_exam.AnswerKeyItemIn(question_no=2, correct_answer=3, score_points=50)],
            None, dry_run=False,
        )
        self.db.refresh(submission)
        self.assertEqual(submission.raw_score, 100)
        self.assertEqual(submission.correct_count, 2)
        self.assertEqual(submission.grading_version, 1)

    def test_25_score_change_log_recorded(self):
        mock_exam.preview_or_apply_regrade(
            self.db, self.exam,
            [mock_exam.AnswerKeyItemIn(question_no=1, correct_answer=1, score_points=50),
             mock_exam.AnswerKeyItemIn(question_no=2, correct_answer=3, score_points=50)],
            None, dry_run=False,
        )
        submission = mock_exam.get_submission_or_404(self.db, self.exam.id, self.student.id)
        logs = self.db.query(models.SprintMockExamScoreLog).filter_by(submission_id=submission.id).all()
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].previous_raw_score, 50)
        self.assertEqual(logs[0].new_raw_score, 100)
        self.assertEqual(logs[0].grading_version, 1)

    def test_26_student_result_shows_latest_score(self):
        mock_exam.preview_or_apply_regrade(
            self.db, self.exam,
            [mock_exam.AnswerKeyItemIn(question_no=1, correct_answer=1, score_points=50),
             mock_exam.AnswerKeyItemIn(question_no=2, correct_answer=3, score_points=50)],
            None, dry_run=False,
        )
        result = mock_exam.student_get_result(self.exam.id, self.student.id, self.db)
        self.assertEqual(result["submission"]["raw_score"], 100)
        self.assertEqual(result["submission"]["grading_version"], 1)


class DashboardAndRecordsTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = models.Student(name="학생", phone="01000000006", grade="고3")
        self.db.add(self.student)
        self.db.flush()
        self.program = models.SprintProgram(
            student_id=self.student.id, title="SPRINT", start_date=date(2026, 7, 1),
            end_date=date(2026, 9, 30), is_active=True, enable_mock_exam=True,
        )
        self.db.add(self.program)
        self.db.flush()
        series = models.SprintMockExamSeries(
            sprint_program_id=self.program.id, title="모의고사", recurrence_weekday=6,
            first_exam_date=date(2026, 7, 26), submission_deadline_time="23:00",
        )
        self.db.add(series)
        self.db.flush()
        self.series = series
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _make_exam(self, round_no, exam_date, status="scheduled"):
        exam = models.SprintMockExam(
            series_id=self.series.id, sprint_program_id=self.program.id, round_no=round_no,
            title=f"{round_no}회차", exam_date=exam_date,
            submission_deadline_at=mock_exam.compute_deadline_at(exam_date, "23:00"),
            subject="수학", question_count=2, status=status,
        )
        self.db.add(exam)
        self.db.flush()
        self.db.add(models.SprintMockExamAnswerKey(exam_id=exam.id, question_no=1, correct_answer=1, score_points=50))
        self.db.add(models.SprintMockExamAnswerKey(exam_id=exam.id, question_no=2, correct_answer=2, score_points=50))
        self.db.commit()
        return exam

    def test_27_dashboard_shows_next_exam(self):
        with patch("mock_exam.today_seoul", lambda: date(2026, 7, 20)):
            exam = self._make_exam(1, date(2026, 7, 26))
            summary = mock_exam.mock_exam_home_summary(self.db, self.program, self.student.id)
        self.assertTrue(summary["available"])
        self.assertEqual(summary["exam"]["id"], exam.id)
        self.assertEqual(summary["exam"]["round_no"], 1)
        self.assertEqual(summary["days_remaining"], 6)
        self.assertEqual(summary["submission_status"], "not_started")

    def test_27b_dashboard_none_when_no_exam(self):
        summary = mock_exam.mock_exam_home_summary(self.db, self.program, self.student.id)
        self.assertEqual(summary["status"], "none")

    def test_28_records_reflect_scores_and_change(self):
        exam1 = self._make_exam(1, date(2026, 7, 26))
        exam2 = self._make_exam(2, date(2026, 8, 2))
        mock_exam.student_save_omr(exam1.id, mock_exam.OmrSaveIn(student_id=self.student.id, answers=[
            mock_exam.OmrAnswerIn(question_no=1, selected_answer=1), mock_exam.OmrAnswerIn(question_no=2, selected_answer=1),
        ]), self.db)
        mock_exam.student_submit_exam(exam1.id, mock_exam.SubmitIn(student_id=self.student.id, force=True), self.db)
        mock_exam.student_save_omr(exam2.id, mock_exam.OmrSaveIn(student_id=self.student.id, answers=[
            mock_exam.OmrAnswerIn(question_no=1, selected_answer=1), mock_exam.OmrAnswerIn(question_no=2, selected_answer=2),
        ]), self.db)
        mock_exam.student_submit_exam(exam2.id, mock_exam.SubmitIn(student_id=self.student.id, force=True), self.db)

        records = mock_exam.student_mock_exam_records(self.student.id, self.db)
        self.assertEqual(len(records["records"]), 2)
        self.assertEqual(records["records"][0]["raw_score"], 50)
        self.assertEqual(records["records"][1]["raw_score"], 100)
        self.assertEqual(records["records"][1]["score_change"], 50)
        self.assertEqual(records["average_score"], 75.0)


class ExamStatusTests(TestCase):
    def test_scheduled_open_closed(self):
        deadline = mock_exam.compute_deadline_at(date(2026, 7, 26), "23:00")
        exam = models.SprintMockExam(
            id=1, series_id=1, sprint_program_id=1, round_no=1, title="t",
            exam_date=date(2026, 7, 26), submission_deadline_at=deadline, subject="수학", question_count=1,
        )
        before = mock_exam.SEOUL_TZ.utcoffset(None)
        self.assertEqual(mock_exam.compute_exam_status(exam, now=deadline - timedelta(hours=1)), "open")
        self.assertEqual(mock_exam.compute_exam_status(exam, now=deadline + timedelta(hours=1)), "closed")
        self.assertEqual(
            mock_exam.compute_exam_status(exam, now=deadline.replace(year=2026, month=7, day=25, hour=0, minute=0)),
            "scheduled",
        )

    def test_overnight_deadline_rolls_to_next_day(self):
        deadline = mock_exam.compute_deadline_at(date(2026, 7, 26), "02:00")
        self.assertEqual(deadline.date(), date(2026, 7, 27))


class LegacySeriesDeletionTests(TestCase):
    """구 모의고사 관리 삭제 정책 3분기:
    기록 없음 → 즉시 삭제 / 배정만 있음 → force 필요 / 제출·채점 있음 → 삭제 금지(archive)"""

    def setUp(self):
        self.engine, self.db = make_db()
        self.student = models.Student(name="학생", phone="01000000000", grade="고3")
        self.db.add(self.student)
        self.db.flush()
        self.program = models.SprintProgram(
            student_id=self.student.id, title="여름 SPRINT",
            start_date=date(2026, 7, 20), end_date=date(2026, 9, 13),
            is_active=True, enable_mock_exam=True,
        )
        self.db.add(self.program)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _series(self, rounds=2):
        return mock_exam.admin_create_series(self.program.id, mock_exam.SeriesCreateIn(
            title="SPRINT 모의고사", recurrence_weekday=6, first_exam_date=FIRST_SUNDAY,
            submission_deadline_time="23:00", generation_mode="fixed_rounds", total_rounds=rounds,
            subject="수학", default_question_count=2,
        ), self.db)

    def _add_submission(self, exam_id, status):
        submission = models.SprintMockExamSubmission(exam_id=exam_id, student_id=self.student.id, status=status)
        self.db.add(submission)
        self.db.commit()
        return submission

    def test_state_clean_series_can_hard_delete(self):
        series = self._series()
        state = mock_exam.admin_series_deletion_state(series["id"], self.db)
        self.assertTrue(state["can_hard_delete"])
        self.assertFalse(state["requires_force"])

    def test_delete_series_with_no_records(self):
        series = self._series()
        result = mock_exam.admin_delete_series(series["id"], False, self.db)
        self.assertTrue(result["deleted"])
        self.assertIsNone(self.db.get(models.SprintMockExamSeries, series["id"]))
        self.assertEqual(self.db.query(models.SprintMockExam).count(), 0)

    def test_delete_with_assignment_only_requires_force(self):
        series = self._series()
        exam_id = series["rounds"][0]["id"]
        self._add_submission(exam_id, "draft")

        state = mock_exam.admin_series_deletion_state(series["id"], self.db)
        self.assertTrue(state["can_hard_delete"])
        self.assertTrue(state["requires_force"])

        with self.assertRaises(HTTPException) as ctx:
            mock_exam.admin_delete_series(series["id"], False, self.db)
        self.assertEqual(ctx.exception.status_code, 409)

        result = mock_exam.admin_delete_series(series["id"], True, self.db)
        self.assertTrue(result["deleted"])

    def test_delete_blocked_when_submitted(self):
        series = self._series()
        self._add_submission(series["rounds"][0]["id"], "submitted")
        state = mock_exam.admin_series_deletion_state(series["id"], self.db)
        self.assertFalse(state["can_hard_delete"])
        with self.assertRaises(HTTPException) as ctx:
            mock_exam.admin_delete_series(series["id"], True, self.db)
        self.assertEqual(ctx.exception.status_code, 400)
        # 데이터는 그대로 보존되어야 한다.
        self.assertIsNotNone(self.db.get(models.SprintMockExamSeries, series["id"]))
        self.assertEqual(self.db.query(models.SprintMockExamSubmission).count(), 1)

    def test_delete_blocked_when_graded(self):
        series = self._series()
        self._add_submission(series["rounds"][0]["id"], "graded")
        with self.assertRaises(HTTPException) as ctx:
            mock_exam.admin_delete_series(series["id"], True, self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_archive_series_keeps_records(self):
        series = self._series()
        self._add_submission(series["rounds"][0]["id"], "graded")
        archived = mock_exam.admin_archive_series(series["id"], self.db)
        self.assertFalse(archived["is_active"])
        self.assertEqual(self.db.query(models.SprintMockExamSubmission).count(), 1)
        self.assertEqual(self.db.query(models.SprintMockExam).count(), 2)

    def test_delete_single_exam_round_policies(self):
        series = self._series()
        first, second = series["rounds"][0]["id"], series["rounds"][1]["id"]

        # 기록 없는 회차는 바로 삭제
        self.assertTrue(mock_exam.admin_delete_exam(first, False, self.db)["deleted"])
        self.assertEqual(self.db.query(models.SprintMockExam).count(), 1)

        # 제출 기록 있는 회차는 삭제 금지
        self._add_submission(second, "graded")
        with self.assertRaises(HTTPException) as ctx:
            mock_exam.admin_delete_exam(second, True, self.db)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(self.db.query(models.SprintMockExam).count(), 1)
