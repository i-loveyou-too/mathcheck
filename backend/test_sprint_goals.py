from datetime import date, timedelta
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
import sprint_goals
from database import Base


def make_db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine, sessionmaker(bind=engine)()


TODAY = date(2026, 7, 23)


def frozen_today():
    return TODAY


class SprintSubjectGoalTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = models.Student(name="학생", phone="01000000000", grade="고3")
        self.other = models.Student(name="다른학생", phone="01000000001", grade="고3")
        self.db.add_all([self.student, self.other])
        self.db.flush()
        self.program = models.SprintProgram(
            student_id=self.student.id, title="여름 SPRINT",
            start_date=date(2026, 7, 1), end_date=date(2026, 8, 31), is_active=True,
        )
        self.other_program = models.SprintProgram(
            student_id=self.other.id, title="다른 SPRINT",
            start_date=date(2026, 7, 1), end_date=date(2026, 8, 31), is_active=True,
        )
        self.db.add_all([self.program, self.other_program])
        self.db.commit()

        patcher = patch("sprint_goals.today_seoul", frozen_today)
        self.addCleanup(patcher.stop)
        patcher.start()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    # ---- 1~3 관리자 CRUD -------------------------------------------------

    def test_1_admin_create_goal(self):
        goal = sprint_goals.admin_create_subject_goal(
            self.program.id,
            sprint_goals.SubjectGoalCreateIn(subject="수학", title="수학Ⅰ 지수로그 기출 2회독", target_date=date(2026, 7, 30)),
            self.db,
        )
        self.assertEqual(goal["subject"], "수학")
        self.assertFalse(goal["is_completed"])
        self.assertIsNone(goal["completed_at"])

    def test_2_admin_update_goal(self):
        goal = sprint_goals.admin_create_subject_goal(
            self.program.id, sprint_goals.SubjectGoalCreateIn(subject="국어", title="EBS 수특 문학 완강"), self.db,
        )
        updated = sprint_goals.admin_update_subject_goal(
            self.program.id, goal["id"],
            sprint_goals.SubjectGoalUpdateIn(title="EBS 수특 문학 완강 (수정)", order_index=5),
            self.db,
        )
        self.assertEqual(updated["title"], "EBS 수특 문학 완강 (수정)")
        self.assertEqual(updated["order_index"], 5)

    def test_3_admin_delete_incomplete_hard_deletes(self):
        goal = sprint_goals.admin_create_subject_goal(
            self.program.id, sprint_goals.SubjectGoalCreateIn(subject="영어", title="EBS VOCA 1800 완주"), self.db,
        )
        result = sprint_goals.admin_delete_subject_goal(self.program.id, goal["id"], self.db)
        self.assertTrue(result["deleted"])
        self.assertIsNone(self.db.get(models.SprintSubjectGoal, goal["id"]))

    def test_3b_admin_delete_completed_soft_deletes(self):
        goal_row = models.SprintSubjectGoal(
            sprint_program_id=self.program.id, subject="영어", title="주간 모의고사 5회 완료",
            is_completed=True, completed_at=None,
        )
        self.db.add(goal_row)
        self.db.commit()
        result = sprint_goals.admin_delete_subject_goal(self.program.id, goal_row.id, self.db)
        self.assertTrue(result["soft_deleted"])
        self.db.refresh(goal_row)
        self.assertFalse(goal_row.is_active)
        # 완료 기록(제목/완료여부)은 그대로 보존된다.
        self.assertTrue(goal_row.is_completed)

    # ---- 4~5 조회 ----------------------------------------------------------

    def test_4_subject_grouped_listing(self):
        sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="국어", title="A"), self.db)
        sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title="B"), self.db)
        sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title="C"), self.db)
        result = sprint_goals.admin_list_subject_goals(self.program.id, self.db)
        subjects = {row["subject"]: row for row in result["subjects"]}
        self.assertEqual(subjects["수학"]["total"], 2)
        self.assertEqual(subjects["국어"]["total"], 1)

    def test_5_student_goal_listing(self):
        sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title="B"), self.db)
        result = sprint_goals.student_list_subject_goals(self.student.id, self.db)
        self.assertTrue(result["available"])
        self.assertEqual(result["total"], 1)

    # ---- 6~10 완료 체크 ------------------------------------------------------

    def test_6_and_7_student_complete_records_completed_at(self):
        goal = sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title="B"), self.db)
        result = sprint_goals.student_complete_subject_goal(goal["id"], sprint_goals.StudentActionIn(student_id=self.student.id), self.db)
        self.assertTrue(result["is_completed"])
        self.assertIsNotNone(result["completed_at"])

    def test_8_repeated_complete_keeps_same_completed_at(self):
        goal = sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title="B"), self.db)
        first = sprint_goals.student_complete_subject_goal(goal["id"], sprint_goals.StudentActionIn(student_id=self.student.id), self.db)
        second = sprint_goals.student_complete_subject_goal(goal["id"], sprint_goals.StudentActionIn(student_id=self.student.id), self.db)
        self.assertEqual(first["completed_at"], second["completed_at"])

    def test_9_student_uncomplete_clears_completed_at(self):
        goal = sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title="B"), self.db)
        sprint_goals.student_complete_subject_goal(goal["id"], sprint_goals.StudentActionIn(student_id=self.student.id), self.db)
        result = sprint_goals.student_uncomplete_subject_goal(goal["id"], sprint_goals.StudentActionIn(student_id=self.student.id), self.db)
        self.assertFalse(result["is_completed"])
        self.assertIsNone(result["completed_at"])

    def test_10_recomplete_gets_new_completed_at(self):
        goal = sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title="B"), self.db)
        first = sprint_goals.student_complete_subject_goal(goal["id"], sprint_goals.StudentActionIn(student_id=self.student.id), self.db)
        sprint_goals.student_uncomplete_subject_goal(goal["id"], sprint_goals.StudentActionIn(student_id=self.student.id), self.db)
        with patch("sprint_goals.datetime") as mock_dt:
            from datetime import datetime, timezone as tz
            mock_dt.now.return_value = datetime(2026, 7, 24, 12, 0, tzinfo=tz.utc)
            second = sprint_goals.student_complete_subject_goal(goal["id"], sprint_goals.StudentActionIn(student_id=self.student.id), self.db)
        self.assertNotEqual(first["completed_at"], second["completed_at"])

    # ---- 11 다른 학생 접근 차단 -----------------------------------------------

    def test_11_other_student_access_blocked(self):
        goal = sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title="B"), self.db)
        with self.assertRaises(HTTPException) as ctx:
            sprint_goals.student_complete_subject_goal(goal["id"], sprint_goals.StudentActionIn(student_id=self.other.id), self.db)
        self.assertEqual(ctx.exception.status_code, 403)
        with self.assertRaises(HTTPException) as ctx:
            sprint_goals.student_uncomplete_subject_goal(goal["id"], sprint_goals.StudentActionIn(student_id=self.other.id), self.db)
        self.assertEqual(ctx.exception.status_code, 403)

    # ---- 12~15 예정일 상태 ---------------------------------------------------

    def test_12_before_target_date_is_in_progress(self):
        goal_row = models.SprintSubjectGoal(sprint_program_id=self.program.id, subject="수학", title="B", target_date=TODAY + timedelta(days=5))
        self.assertEqual(sprint_goals.compute_target_status(goal_row, TODAY), "in_progress")

    def test_13_on_target_date_is_due_today(self):
        goal_row = models.SprintSubjectGoal(sprint_program_id=self.program.id, subject="수학", title="B", target_date=TODAY)
        self.assertEqual(sprint_goals.compute_target_status(goal_row, TODAY), "due_today")

    def test_14_past_target_date_incomplete_is_overdue(self):
        goal_row = models.SprintSubjectGoal(sprint_program_id=self.program.id, subject="수학", title="B", target_date=TODAY - timedelta(days=1))
        self.assertEqual(sprint_goals.compute_target_status(goal_row, TODAY), "overdue")

    def test_15_completed_goal_clears_overdue_display(self):
        goal_row = models.SprintSubjectGoal(
            sprint_program_id=self.program.id, subject="수학", title="B",
            target_date=TODAY - timedelta(days=10), is_completed=True,
        )
        self.assertEqual(sprint_goals.compute_target_status(goal_row, TODAY), "completed")

    # ---- 16~18 진행률 --------------------------------------------------------

    def test_16_subject_progress_rate(self):
        sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title="A"), self.db)
        goal2 = sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title="B"), self.db)
        sprint_goals.student_complete_subject_goal(goal2["id"], sprint_goals.StudentActionIn(student_id=self.student.id), self.db)
        result = sprint_goals.admin_list_subject_goals(self.program.id, self.db)
        math_subject = next(row for row in result["subjects"] if row["subject"] == "수학")
        self.assertEqual(math_subject["completion_rate"], 50)

    def test_17_overall_progress_rate(self):
        for i in range(4):
            sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title=f"G{i}"), self.db)
        goals = self.db.query(models.SprintSubjectGoal).all()
        sprint_goals.student_complete_subject_goal(goals[0].id, sprint_goals.StudentActionIn(student_id=self.student.id), self.db)
        result = sprint_goals.student_list_subject_goals(self.student.id, self.db)
        self.assertEqual(result["completion_rate"], 25)

    def test_18_no_goals_state(self):
        result = sprint_goals.student_list_subject_goals(self.other.id, self.db)
        self.assertTrue(result["available"])
        self.assertEqual(result["total"], 0)
        self.assertEqual(result["goals"], [])
        self.assertIsNone(result["completion_rate"])

    # ---- 19 SPRINT 메인 연결 ---------------------------------------------------

    def test_19_home_summary_reflects_real_progress(self):
        goal1 = sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title="A", target_date=TODAY + timedelta(days=7)), self.db)
        sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="국어", title="B"), self.db)
        sprint_goals.student_complete_subject_goal(goal1["id"], sprint_goals.StudentActionIn(student_id=self.student.id), self.db)
        summary = sprint_goals.subject_goal_home_summary(self.db, self.program)
        self.assertEqual(summary["total"], 2)
        self.assertEqual(summary["completed"], 1)
        self.assertEqual(summary["completion_rate"], 50)

    def test_19b_home_summary_empty_state(self):
        summary = sprint_goals.subject_goal_home_summary(self.db, self.other_program)
        self.assertEqual(summary["total"], 0)
        self.assertIsNone(summary["next_goal"])

    def test_19c_home_summary_next_goal_is_nearest_incomplete(self):
        sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title="Far", target_date=TODAY + timedelta(days=20)), self.db)
        sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="영어", title="Near", target_date=TODAY + timedelta(days=3)), self.db)
        summary = sprint_goals.subject_goal_home_summary(self.db, self.program)
        self.assertEqual(summary["next_goal"]["title"], "Near")

    # ---- 20 records 연결 -------------------------------------------------------

    def test_20_records_show_only_completed(self):
        goal1 = sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title="Done"), self.db)
        sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="국어", title="Not done"), self.db)
        sprint_goals.student_complete_subject_goal(goal1["id"], sprint_goals.StudentActionIn(student_id=self.student.id), self.db)
        records = sprint_goals.subject_goal_records(self.db, self.student.id)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["title"], "Done")
        self.assertIsNotNone(records[0]["completed_at"])

    def test_20b_records_isolated_per_student(self):
        goal = sprint_goals.admin_create_subject_goal(self.other_program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title="Other's"), self.db)
        sprint_goals.student_complete_subject_goal(goal["id"], sprint_goals.StudentActionIn(student_id=self.other.id), self.db)
        self.assertEqual(sprint_goals.subject_goal_records(self.db, self.student.id), [])
        self.assertEqual(len(sprint_goals.subject_goal_records(self.db, self.other.id)), 1)

    # ---- 클라이언트가 completed_at을 임의로 보낼 수 없음 -------------------------

    def test_student_created_goal_can_be_updated_and_deleted_by_owner(self):
        goal = sprint_goals.student_create_subject_goal(
            sprint_goals.SubjectGoalCreateIn(subject="수학", title="내 목표"),
            self.student.id,
            self.db,
        )
        self.assertEqual(goal["created_by_type"], "student")
        self.assertEqual(goal["created_by_id"], self.student.id)
        updated = sprint_goals.student_update_subject_goal(
            goal["id"],
            sprint_goals.SubjectGoalUpdateIn(title="내 목표 수정"),
            self.student.id,
            self.db,
        )
        self.assertEqual(updated["title"], "내 목표 수정")
        result = sprint_goals.student_delete_subject_goal(goal["id"], self.student.id, self.db)
        self.assertTrue(result["deleted"])
        self.assertIsNone(self.db.get(models.SprintSubjectGoal, goal["id"]))

    def test_student_cannot_update_or_delete_admin_goal(self):
        goal = sprint_goals.admin_create_subject_goal(
            self.program.id,
            sprint_goals.SubjectGoalCreateIn(subject="수학", title="관리자 목표"),
            self.db,
        )
        with self.assertRaises(HTTPException) as ctx:
            sprint_goals.student_update_subject_goal(
                goal["id"],
                sprint_goals.SubjectGoalUpdateIn(title="학생 수정"),
                self.student.id,
                self.db,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        with self.assertRaises(HTTPException) as ctx:
            sprint_goals.student_delete_subject_goal(goal["id"], self.student.id, self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_client_cannot_set_completed_at_directly(self):
        payload_fields = sprint_goals.StudentActionIn.model_fields
        self.assertNotIn("completed_at", payload_fields)
        create_fields = sprint_goals.SubjectGoalCreateIn.model_fields
        self.assertNotIn("completed_at", create_fields)

    def test_delete_wrong_program_rejected(self):
        goal = sprint_goals.admin_create_subject_goal(self.program.id, sprint_goals.SubjectGoalCreateIn(subject="수학", title="A"), self.db)
        with self.assertRaises(HTTPException) as ctx:
            sprint_goals.admin_delete_subject_goal(self.other_program.id, goal["id"], self.db)
        self.assertEqual(ctx.exception.status_code, 400)
