from datetime import date, datetime, timedelta
from unittest import TestCase

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
from database import Base
import sprint
import lessons


def make_db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine, sessionmaker(bind=engine)()


class SprintTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = models.Student(name="학생", phone="01000000000", grade="고3")
        self.other = models.Student(name="다른", phone="01000000001", grade="고3")
        self.db.add_all([self.student, self.other])
        self.db.flush()
        self.program = models.SprintProgram(
            student_id=self.student.id,
            title="여름 SPRINT",
            start_date=date(2026, 7, 20),
            end_date=date(2026, 7, 29),  # 총 10일
            is_active=True,
            strike_threshold=3,
            daily_study_goal_minutes=480,
            enable_study_time_submission=True,
            enable_planner_submission=True,
            enable_seat_check=True,
            planner_deadline_time="23:00",
            seat_check_deadline_time="02:00",
        )
        self.db.add(self.program)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def add_study_submission_with_image(self, learning_date, total_minutes=120):
        result = sprint.student_save_study_time_draft(
            sprint.StudySubmissionDraftIn(
                student_id=self.student.id,
                learning_date=learning_date,
                total_minutes=total_minutes,
            ),
            self.db,
        )
        submission = self.db.get(models.SprintStudySubmission, result["submission"]["id"])
        self.db.add(models.SprintStudySubmissionImage(
            submission_id=submission.id,
            storage_key=f"sprint-study/1/{learning_date}/test.png",
            original_filename="test.png",
            mime_type="image/png",
            size_bytes=100,
            width=10,
            height=10,
            order_index=1,
        ))
        self.db.commit()
        return submission

    def test_active_overlap_is_blocked(self):
        with self.assertRaises(HTTPException) as ctx:
            sprint.ensure_no_active_overlap(
                self.db, self.student.id, date(2026, 7, 25), date(2026, 8, 5), True
            )
        self.assertEqual(ctx.exception.status_code, 400)
        # 비활성이면 겹쳐도 허용
        sprint.ensure_no_active_overlap(
            self.db, self.student.id, date(2026, 7, 25), date(2026, 8, 5), False
        )
        # 다른 학생은 겹치지 않음
        sprint.ensure_no_active_overlap(
            self.db, self.other.id, date(2026, 7, 25), date(2026, 8, 5), True
        )

    def test_status_and_day_computation(self):
        self.assertEqual(sprint.compute_status(self.program, date(2026, 7, 19)), "scheduled")
        self.assertEqual(sprint.compute_status(self.program, date(2026, 7, 20)), "active")
        self.assertEqual(sprint.compute_status(self.program, date(2026, 7, 29)), "active")
        self.assertEqual(sprint.compute_status(self.program, date(2026, 7, 30)), "completed")
        info = sprint.compute_day_info(self.program, date(2026, 7, 22))
        self.assertEqual(info["day_number"], 3)  # 시작일이 DAY 1
        self.assertEqual(info["total_days"], 10)
        self.assertEqual(info["days_remaining"], 7)

    def test_goal_progress(self):
        quantitative = models.SprintGoal(
            sprint_program_id=self.program.id, title="문제", target_value=100, current_value=150
        )
        qualitative_done = models.SprintGoal(
            sprint_program_id=self.program.id, title="정성", target_value=None, is_completed=True
        )
        qualitative_todo = models.SprintGoal(
            sprint_program_id=self.program.id, title="정성2", target_value=None, is_completed=False
        )
        # 화면 진행률은 100% 상한이지만 current_value 초과는 허용
        self.assertEqual(sprint.goal_progress(quantitative), 100.0)
        self.assertEqual(sprint.goal_progress(qualitative_done), 100.0)
        self.assertEqual(sprint.goal_progress(qualitative_todo), 0.0)
        self.assertEqual(
            sprint.overall_goal_progress([quantitative, qualitative_done, qualitative_todo]),
            round((100 + 100 + 0) / 3, 1),
        )
        # 목표 없으면 None (0%가 아니라 '목표 미등록')
        self.assertIsNone(sprint.overall_goal_progress([]))

    def test_integrated_program_creates_word_bank_challenge(self):
        bank = models.VocabularyBank(
            title="EBS VOCA",
            total_words=1800,
            total_days=60,
            words_per_day=30,
            default_daily_test_question_count=100,
            source_format="ebs_day_sheets",
        )
        self.db.add(bank)
        self.db.commit()
        result = sprint.admin_create_sprint(
            sprint.SprintProgramIn(
                student_id=self.other.id,
                title="EBS SPRINT",
                start_date=date(2026, 8, 1),
                end_date=date(2026, 8, 20),
                enable_vocabulary_challenge=True,
                vocabulary_bank_id=bank.id,
                vocabulary_start_bank_day=60,
                vocabulary_bank_day_direction="descending",
                vocabulary_bank_days_per_learning_day=3,
                vocabulary_max_question_count=100,
            ),
            self.db,
        )
        challenge = self.db.query(models.VocabularyChallenge).filter_by(student_id=self.other.id).one()
        self.assertTrue(result["features"]["enable_vocabulary"])
        self.assertEqual(challenge.word_bank_id, bank.id)
        self.assertEqual(challenge.start_bank_day, 60)
        self.assertEqual(challenge.bank_day_direction, "descending")
        self.assertEqual(challenge.bank_days_per_learning_day, 3)
        self.assertEqual(challenge.max_question_count, 100)

    def test_planner_today_system_disables_sprint_photo_submission(self):
        values = sprint.normalize_program_values(
            {
                "planner_mode": "today_system",
                "enable_planner_submission": True,
                "planner_deadline_time": "23:00",
                "planner_strike_on_late": True,
                "planner_strike_on_missing": True,
            }
        )
        self.assertFalse(values["enable_planner_submission"])
        self.assertIsNone(values["planner_deadline_time"])
        self.assertFalse(values["planner_strike_on_late"])
        self.assertFalse(values["planner_strike_on_missing"])

    def test_seat_check_open_time_blocks_before_open(self):
        self.program.seat_check_open_time = "08:00"
        with self.assertRaises(HTTPException) as ctx:
            sprint.ensure_proof_is_open(
                self.program,
                "seat_check",
                date(2026, 7, 22),
                datetime(2026, 7, 22, 7, 59, tzinfo=sprint.SEOUL_TZ),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        sprint.ensure_proof_is_open(
            self.program,
            "seat_check",
            date(2026, 7, 22),
            datetime(2026, 7, 22, 8, 0, tzinfo=sprint.SEOUL_TZ),
        )

    def test_strike_effective_count_and_cancel(self):
        for i in range(4):
            self.db.add(models.SprintStrike(
                sprint_program_id=self.program.id,
                student_id=self.student.id,
                strike_type="manual",
                reason=f"사유{i}",
                learning_date=date(2026, 7, 21),
            ))
        self.db.commit()
        summary = sprint.strike_summary(self.db, self.program)
        self.assertEqual(summary["total_active"], 4)
        self.assertEqual(summary["effective"], 4)
        # 깜지 1개 승인 -> 스트라이크 3개 소진, 유효 1개
        self.db.add(models.SprintPenaltyAssignment(
            sprint_program_id=self.program.id, student_id=self.student.id, status="approved"
        ))
        self.db.commit()
        summary = sprint.strike_summary(self.db, self.program)
        self.assertEqual(summary["consumed_by_penalties"], 3)
        self.assertEqual(summary["effective"], 1)
        # 취소된 스트라이크는 집계 제외
        strike = self.db.query(models.SprintStrike).first()
        strike.is_cancelled = True
        self.db.commit()
        summary = sprint.strike_summary(self.db, self.program)
        self.assertEqual(summary["total_active"], 3)

    def test_dashboard_isolates_students(self):
        self.db.add(models.SprintStudySubmission(
            sprint_program_id=self.program.id,
            student_id=self.student.id,
            learning_date=date(2026, 7, 22),
            total_minutes=500,
            status="pending",
        ))
        self.db.add(models.SprintStudySubmission(
            sprint_program_id=self.program.id,
            student_id=self.student.id,
            learning_date=date(2026, 7, 21),
            total_minutes=500,
            approved_minutes=500,
            status="approved",
        ))
        self.db.add(models.SprintDailyProofSubmission(
            sprint_program_id=self.program.id,
            student_id=self.student.id,
            learning_date=date(2026, 7, 22),
            proof_type="planner",
            workflow_status="pending",
            timing_status="on_time",
        ))
        self.db.commit()
        data = sprint.student_sprint_dashboard(self.student.id, date(2026, 7, 22), self.db)
        self.assertIsNotNone(data["program"])
        self.assertEqual(data["program"]["day_info"]["day_number"], 3)
        self.assertEqual(data["study_time_submission"]["status"], "pending")
        self.assertEqual(data["study_time_stats"]["today_approved_minutes"], 0)
        self.assertEqual(data["weekly_summary"]["study_minutes"], 500)
        self.assertEqual(data["proof_summaries"]["planner"]["workflow_status"], "pending")
        self.assertEqual(data["proof_summaries"]["seat_check"]["deadline_time"], "02:00")
        self.assertEqual(data["vocabulary_summary"]["status"], "none")
        # 다른 학생은 활성 SPRINT 없음 -> 빈 상태
        other = sprint.student_sprint_dashboard(self.other.id, date(2026, 7, 22), self.db)
        self.assertIsNone(other["program"])
        self.assertEqual(other["empty_state"], "none")


    def test_study_submission_requires_enabled_feature_and_period(self):
        self.program.enable_study_time_submission = False
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            sprint.student_save_study_time_draft(
                sprint.StudySubmissionDraftIn(
                    student_id=self.student.id,
                    learning_date=date(2026, 7, 21),
                    total_minutes=300,
                ),
                self.db,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.program.enable_study_time_submission = True
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            sprint.student_save_study_time_draft(
                sprint.StudySubmissionDraftIn(
                    student_id=self.student.id,
                    learning_date=date(2026, 8, 1),
                    total_minutes=300,
                ),
                self.db,
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_study_submission_submit_approve_and_stats(self):
        result = sprint.student_save_study_time_draft(
            sprint.StudySubmissionDraftIn(
                student_id=self.student.id,
                learning_date=date(2026, 7, 21),
                total_minutes=480,
                subject_breakdown={"math": 300, "english": 180},
                memo="library",
            ),
            self.db,
        )
        submission = self.db.get(models.SprintStudySubmission, result["submission"]["id"])
        with self.assertRaises(HTTPException) as ctx:
            sprint.student_submit_study_time(
                submission.id,
                sprint.StudySubmissionActionIn(student_id=self.student.id),
                self.db,
            )
        self.assertEqual(ctx.exception.status_code, 400)

        self.db.add(models.SprintStudySubmissionImage(
            submission_id=submission.id,
            storage_key="sprint-study/1/2026-07-21/test.png",
            original_filename="test.png",
            mime_type="image/png",
            size_bytes=100,
            width=10,
            height=10,
            order_index=1,
        ))
        self.db.commit()
        submitted = sprint.student_submit_study_time(
            submission.id,
            sprint.StudySubmissionActionIn(student_id=self.student.id),
            self.db,
        )
        self.assertEqual(submitted["status"], "pending")

        approved = sprint.admin_approve_study_submission(
            submission.id,
            sprint.StudySubmissionReviewIn(approved_minutes=450, review_note="adjusted"),
            self.db,
        )
        self.assertEqual(approved["status"], "approved")
        self.assertEqual(approved["approved_minutes"], 450)
        self.assertEqual(approved["review_note"], "adjusted")
        stats = sprint.sprint_study_stats(self.db, self.program, date(2026, 7, 22))
        self.assertEqual(stats["sprint_approved_minutes"], 450)
        self.assertEqual(stats["goal_achieved_days"], 0)

        with self.assertRaises(HTTPException) as ctx:
            sprint.student_save_study_time_draft(
                sprint.StudySubmissionDraftIn(
                    student_id=self.student.id,
                    learning_date=date(2026, 7, 21),
                    total_minutes=500,
                ),
                self.db,
            )
        self.assertEqual(ctx.exception.status_code, 400)

    def test_study_submission_review_comment_policy(self):
        no_comment_submission = self.add_study_submission_with_image(date(2026, 7, 22))
        sprint.student_submit_study_time(
            no_comment_submission.id,
            sprint.StudySubmissionActionIn(student_id=self.student.id),
            self.db,
        )
        approved = sprint.admin_approve_study_submission(
            no_comment_submission.id,
            sprint.StudySubmissionReviewIn(approved_minutes=120),
            self.db,
        )
        self.assertEqual(approved["status"], "approved")
        self.assertIsNone(approved["review_note"])

        rejected_submission = self.add_study_submission_with_image(date(2026, 7, 21))
        sprint.student_submit_study_time(
            rejected_submission.id,
            sprint.StudySubmissionActionIn(student_id=self.student.id),
            self.db,
        )
        with self.assertRaises(HTTPException) as ctx:
            sprint.admin_reject_study_submission(
                rejected_submission.id,
                sprint.StudySubmissionRejectIn(comment="   "),
                self.db,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        rejected = sprint.admin_reject_study_submission(
            rejected_submission.id,
            sprint.StudySubmissionRejectIn(comment="<b>time is unclear</b>"),
            self.db,
        )
        self.assertEqual(rejected["status"], "rejected")
        self.assertEqual(rejected["review_note"], "time is unclear")
        resaved = sprint.student_save_study_time_draft(
            sprint.StudySubmissionDraftIn(
                student_id=self.student.id,
                learning_date=date(2026, 7, 21),
                total_minutes=130,
            ),
            self.db,
        )
        self.assertEqual(resaved["submission"]["review_note"], "time is unclear")

    def test_subject_breakdown_must_match_total(self):
        with self.assertRaises(ValueError):
            sprint.StudySubmissionDraftIn(
                student_id=self.student.id,
                learning_date=date(2026, 7, 21),
                total_minutes=100,
                subject_breakdown={"math": 90},
            )

    def test_image_signature_validation(self):
        png = (
            b"\x89PNG\r\n\x1a\n"
            b"\x00\x00\x00\rIHDR"
            b"\x00\x00\x00\x02"
            b"\x00\x00\x00\x03"
            b"\x08\x02\x00\x00\x00"
        )
        extension, mime_type, width, height = sprint.detect_image(png)
        self.assertEqual(extension, "png")
        self.assertEqual(mime_type, "image/png")
        self.assertEqual((width, height), (2, 3))
        with self.assertRaises(HTTPException):
            sprint.detect_image(b"not an image")

    def test_heic_signature_accepted(self):
        # iOS 카메라 기본 포맷: ftyp 박스 + heic 계열 브랜드 코드.
        heic = b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00" + b"\x00" * 16
        extension, mime_type, width, height = sprint.detect_image(heic)
        self.assertEqual(extension, "heic")
        self.assertEqual(mime_type, "image/heic")
        heif_generic = b"\x00\x00\x00\x18ftypmif1\x00\x00\x00\x00" + b"\x00" * 16
        extension, mime_type, _, _ = sprint.detect_image(heif_generic)
        self.assertEqual(extension, "heic")

    def test_daily_proof_deadlines_and_timing(self):
        deadline = sprint.proof_deadline_at(self.program, "planner", date(2026, 7, 22))
        self.assertEqual(deadline.isoformat(), "2026-07-22T23:00:00+09:00")
        overnight = sprint.proof_deadline_at(self.program, "seat_check", date(2026, 7, 22))
        self.assertEqual(overnight.isoformat(), "2026-07-23T02:00:00+09:00")
        self.assertEqual(
            sprint.proof_timing_status(self.program, "planner", date(2026, 7, 22), deadline),
            "on_time",
        )
        self.assertEqual(
            sprint.proof_timing_status(self.program, "planner", date(2026, 7, 22), deadline + timedelta(minutes=1)),
            "late",
        )
        self.assertEqual(
            sprint.proof_timing_status(self.program, "planner", date(2026, 7, 22), None, deadline + timedelta(minutes=1)),
            "missing",
        )

    def test_daily_proof_access_submit_reject_resubmit_and_strike(self):
        draft = sprint.student_save_daily_proof_draft(
            sprint.DailyProofDraftIn(
                student_id=self.student.id,
                learning_date=date(2026, 7, 22),
                proof_type="planner",
                memo="first",
            ),
            self.db,
        )
        submission = self.db.get(models.SprintDailyProofSubmission, draft["id"])
        with self.assertRaises(HTTPException):
            sprint.student_submit_daily_proof(
                submission.id,
                sprint.DailyProofActionIn(student_id=self.student.id),
                self.db,
            )
        with self.assertRaises(HTTPException):
            sprint.student_get_daily_proof_image(9999, self.other.id, self.db)

        self.db.add(models.SprintDailyProofImage(
            submission_id=submission.id,
            storage_key="sprint-proofs/1/2026-07-22/planner/test.png",
            original_filename="test.png",
            mime_type="image/png",
            size_bytes=100,
            width=10,
            height=10,
            order_index=1,
        ))
        self.db.commit()
        pending = sprint.student_submit_daily_proof(
            submission.id,
            sprint.DailyProofActionIn(student_id=self.student.id),
            self.db,
        )
        self.assertEqual(pending["workflow_status"], "pending")
        with self.assertRaises(HTTPException):
            sprint.student_save_daily_proof_draft(
                sprint.DailyProofDraftIn(
                    student_id=self.student.id,
                    learning_date=date(2026, 7, 22),
                    proof_type="planner",
                ),
                self.db,
            )
        with self.assertRaises(HTTPException) as ctx:
            sprint.admin_reject_daily_proof(
                submission.id,
                sprint.DailyProofRejectIn(comment=" "),
                self.db,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        rejected = sprint.admin_reject_daily_proof(
            submission.id,
            sprint.DailyProofRejectIn(comment="unclear"),
            self.db,
        )
        self.assertEqual(rejected["workflow_status"], "rejected")
        self.assertEqual(rejected["review_note"], "unclear")
        resaved = sprint.student_save_daily_proof_draft(
            sprint.DailyProofDraftIn(
                student_id=self.student.id,
                learning_date=date(2026, 7, 22),
                proof_type="planner",
                memo="second",
            ),
            self.db,
        )
        self.assertEqual(resaved["workflow_status"], "draft")
        self.assertEqual(resaved["review_note"], "unclear")
        submission.timing_status = "late"
        self.db.commit()
        approved = sprint.admin_approve_daily_proof(
            submission.id,
            sprint.DailyProofReviewIn(comment="ok"),
            self.db,
        )
        self.assertEqual(approved["workflow_status"], "approved")
        self.assertEqual(approved["review_note"], "ok")
        self.assertEqual(
            self.db.query(models.SprintStrike).filter_by(strike_type="planner_late").count(),
            1,
        )
        sprint.admin_approve_daily_proof(submission.id, sprint.DailyProofReviewIn(review_note="again"), self.db)
        self.assertEqual(
            self.db.query(models.SprintStrike).filter_by(strike_type="planner_late").count(),
            1,
        )
        sprint.admin_approve_daily_proof(
            submission.id,
            sprint.DailyProofReviewIn(
                timing_override="on_time",
                timing_override_reason="system issue",
            ),
            self.db,
        )
        strike = self.db.query(models.SprintStrike).filter_by(strike_type="planner_late").one()
        self.assertTrue(strike.is_cancelled)

    def test_daily_proof_image_access_is_isolated_per_student(self):
        draft = sprint.student_save_daily_proof_draft(
            sprint.DailyProofDraftIn(
                student_id=self.student.id,
                learning_date=date(2026, 7, 22),
                proof_type="seat_check",
            ),
            self.db,
        )
        image = models.SprintDailyProofImage(
            submission_id=draft["id"],
            storage_key="sprint-proofs/1/2026-07-22/seat_check/test.png",
            original_filename="test.png",
            mime_type="image/png",
            size_bytes=100,
            width=10,
            height=10,
            order_index=1,
        )
        self.db.add(image)
        self.db.commit()
        # owner can look up the image's submission without a 403
        submission = sprint.get_daily_proof_or_404(self.db, draft["id"])
        sprint.ensure_student_proof_access(submission, self.student.id)
        # a different student is rejected even though the image id is real
        with self.assertRaises(HTTPException) as ctx:
            sprint.student_get_daily_proof_image(image.id, self.other.id, self.db)
        self.assertEqual(ctx.exception.status_code, 403)
        with self.assertRaises(HTTPException) as ctx:
            sprint.student_delete_daily_proof_image(image.id, self.other.id, self.db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_daily_proof_missing_judge_idempotent_and_separate_types(self):
        self.program.planner_deadline_time = "05:00"
        self.program.seat_check_deadline_time = "05:00"
        self.db.commit()
        result = sprint.admin_judge_missing_daily_proofs(
            self.program.id,
            sprint.MissingProofJudgeIn(learning_date=date(2026, 7, 20), proof_type="all"),
            self.db,
        )
        self.assertEqual(set(result["created_or_existing"]), {"planner", "seat_check"})
        sprint.admin_judge_missing_daily_proofs(
            self.program.id,
            sprint.MissingProofJudgeIn(learning_date=date(2026, 7, 20), proof_type="all"),
            self.db,
        )
        self.assertEqual(
            self.db.query(models.SprintStrike).filter(models.SprintStrike.strike_type.in_(["planner_missing", "seat_check_missing"])).count(),
            2,
        )


class LessonTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = models.Student(name="학생", phone="01000000000", grade="고3")
        self.db.add(self.student)
        self.db.flush()
        # 월요일(0) 정규 수업. 2026-07-20이 월요일.
        self.schedule = models.StudentLessonSchedule(
            student_id=self.student.id,
            title="수학 과외",
            weekday=0,
            start_time="17:00",
            end_time="19:00",
            effective_start_date=date(2026, 7, 1),
        )
        self.db.add(self.schedule)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_regular_occurrences_are_synthesized(self):
        events = lessons.synthesize_events(self.db, self.student.id, date(2026, 7, 20), date(2026, 8, 2))
        mondays = [e for e in events if e["source"] == "schedule"]
        self.assertEqual([e["event_date"] for e in mondays], [date(2026, 7, 20), date(2026, 7, 27)])

    def test_cancel_occurrence_overrides_synthetic(self):
        lessons.admin_cancel_occurrence(
            self.schedule.id,
            lessons.CancelOccurrenceIn(event_date=date(2026, 7, 20), reason="휴강"),
            self.db,
        )
        events = lessons.synthesize_events(self.db, self.student.id, date(2026, 7, 20), date(2026, 7, 20))
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["status"], "cancelled")
        self.assertEqual(events[0]["source"], "event")

    def test_time_conflict_is_blocked(self):
        with self.assertRaises(HTTPException) as ctx:
            lessons.admin_create_event(
                lessons.EventIn(
                    student_id=self.student.id,
                    event_date=date(2026, 7, 20),
                    start_time="18:00",
                    end_time="20:00",
                    event_type="extra",
                ),
                self.db,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        # 겹치지 않는 시간은 허용
        created = lessons.admin_create_event(
            lessons.EventIn(
                student_id=self.student.id,
                event_date=date(2026, 7, 20),
                start_time="20:00",
                end_time="21:00",
                event_type="extra",
            ),
            self.db,
        )
        self.assertEqual(created["status"], "scheduled")

    def test_reschedule_creates_override_and_moved(self):
        result = lessons.admin_reschedule_occurrence(
            self.schedule.id,
            lessons.RescheduleOccurrenceIn(
                event_date=date(2026, 7, 20),
                new_date=date(2026, 7, 22),
                new_start_time="17:00",
                new_end_time="19:00",
            ),
            self.db,
        )
        self.assertEqual(result["original"]["status"], "rescheduled")
        self.assertEqual(result["moved"]["event_type"], "makeup")
        events = lessons.synthesize_events(self.db, self.student.id, date(2026, 7, 20), date(2026, 7, 22))
        # 원래 월요일은 rescheduled, 새 수요일에 보강 1건
        by_date = {e["event_date"]: e for e in events}
        self.assertEqual(by_date[date(2026, 7, 20)]["status"], "rescheduled")
        self.assertEqual(by_date[date(2026, 7, 22)]["status"], "scheduled")
