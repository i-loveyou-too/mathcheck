import logging
from datetime import date
from unittest import TestCase

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import crud
import schemas
from database import Base
from models import LectureAssignment, MathDailyTask, MathStudentLectureProgress, Student


class LectureAssignmentUpdateTests(TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.db = self.SessionLocal()

        self.student = Student(name="테스트 학생", phone="01012345678", grade="고1")
        self.db.add(self.student)
        self.db.flush()

        self.assignment = LectureAssignment(
            student_id=self.student.id,
            subject="수학",
            course_title="개념완성",
            total_lectures=10,
            start_lecture_no=1,
            lectures_per_day=2,
            weekdays="mon,tue,wed,thu,fri",
            start_date=date(2026, 7, 10),
            due_date=date(2026, 7, 20),
            memo="기존 메모",
            status="active",
        )
        self.db.add(self.assignment)
        self.db.flush()

        protected_task = MathDailyTask(
            student_id=self.student.id,
            task_date=date(2026, 7, 10),
            title="개념완성 1~2강",
            detail="수학 / 기존 메모",
            status="todo",
            order_index=0,
            source_type="lecture",
            lecture_assignment_id=self.assignment.id,
            lecture_start_number=1,
            lecture_end_number=2,
            completion_mode="manual",
        )
        todo_task = MathDailyTask(
            student_id=self.student.id,
            task_date=date(2026, 7, 11),
            title="개념완성 3~4강",
            detail="수학 / 기존 메모",
            status="todo",
            order_index=1,
            source_type="lecture",
            lecture_assignment_id=self.assignment.id,
            lecture_start_number=3,
            lecture_end_number=4,
            completion_mode="manual",
        )
        self.db.add_all([protected_task, todo_task])
        self.db.flush()

        self.db.add(
            MathStudentLectureProgress(
                student_id=self.student.id,
                daily_task_id=protected_task.id,
                lecture_number=1,
                is_done=True,
            )
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_started_assignment_allows_due_date_change_when_start_date_is_unchanged(self):
        payload = schemas.LectureAssignmentUpdateRequest(
            subject="수학",
            course_title="개념완성",
            total_lectures=10,
            start_lecture_no=1,
            lectures_per_day=2,
            weekdays=["mon", "wed", "fri"],
            start_date=date(2026, 7, 10),
            due_date=date(2026, 7, 22),
            memo="수정 메모",
        )

        preview = crud.preview_lecture_assignment(
            schemas.LectureAssignmentPreviewRequest(
                total_lectures=10,
                start_lecture_no=1,
                lectures_per_day=2,
                weekdays=["mon", "wed", "fri"],
                start_date=date(2026, 7, 10),
                due_date=date(2026, 7, 22),
            )
        )
        result = crud.update_lecture_assignment(self.db, self.assignment, payload)

        self.assertTrue(preview["possible"])
        self.assertEqual(result["assignment"]["start_date"], date(2026, 7, 10))
        self.assertEqual(result["assignment"]["due_date"], date(2026, 7, 22))
        self.assertEqual(result["assignment"]["weekdays"], ["mon", "wed", "fri"])

        tasks = result["daily_tasks"]
        self.assertEqual(tasks[0]["task_date"], date(2026, 7, 10))
        self.assertEqual(tasks[0]["lecture_start_number"], 1)
        self.assertEqual(tasks[0]["lecture_end_number"], 2)
        self.assertEqual(tasks[1]["lecture_start_number"], 3)

    def test_started_assignment_allows_update_when_patch_omits_start_date(self):
        payload = schemas.LectureAssignmentUpdateRequest(
            subject="수학",
            course_title="개념완성",
            total_lectures=10,
            start_lecture_no=1,
            lectures_per_day=3,
            weekdays=["mon", "wed", "fri"],
            due_date=date(2026, 7, 24),
            memo="시작일 생략 저장",
        )

        result = crud.update_lecture_assignment(self.db, self.assignment, payload)

        self.assertEqual(result["assignment"]["start_date"], date(2026, 7, 10))
        self.assertEqual(result["assignment"]["due_date"], date(2026, 7, 24))
        self.assertEqual(result["assignment"]["lectures_per_day"], 3)
        self.assertEqual(result["assignment"]["weekdays"], ["mon", "wed", "fri"])

    def test_started_assignment_rejects_actual_start_date_change(self):
        payload = schemas.LectureAssignmentUpdateRequest(
            start_date=date(2026, 7, 11),
            due_date=date(2026, 7, 22),
        )

        with self.assertRaisesRegex(ValueError, "이미 시작된 배정의 시작일은 변경할 수 없습니다."):
            crud.update_lecture_assignment(self.db, self.assignment, payload)

    def test_preview_payload_can_be_saved_without_start_date_shift(self):
        payload = schemas.LectureAssignmentUpdateRequest(
            subject="수학",
            course_title="개념완성",
            total_lectures=10,
            start_lecture_no=1,
            lectures_per_day=3,
            weekdays=["mon", "tue", "thu"],
            start_date=date(2026, 7, 10),
            due_date=date(2026, 7, 24),
            memo="동일 시작일",
        )
        preview_payload = schemas.LectureAssignmentPreviewRequest(
            total_lectures=10,
            start_lecture_no=1,
            lectures_per_day=3,
            weekdays=["mon", "tue", "thu"],
            start_date=date(2026, 7, 10),
            due_date=date(2026, 7, 24),
        )

        preview = crud.preview_lecture_assignment(preview_payload)
        result = crud.update_lecture_assignment(self.db, self.assignment, payload)

        self.assertTrue(preview["possible"])
        self.assertEqual(payload.start_date, date(2026, 7, 10))
        self.assertEqual(result["assignment"]["start_date"], date(2026, 7, 10))
        self.assertEqual(result["assignment"]["lectures_per_day"], 3)

    def test_logs_show_matching_start_dates_for_preview_and_save(self):
        form_start_date = "2026-07-10"
        preview_payload = schemas.LectureAssignmentPreviewRequest(
            total_lectures=10,
            start_lecture_no=1,
            lectures_per_day=2,
            weekdays=["mon", "wed", "fri"],
            start_date=date.fromisoformat(form_start_date),
            due_date=date(2026, 7, 22),
        )
        patch_payload = schemas.LectureAssignmentUpdateRequest(
            subject="수학",
            course_title="개념완성",
            total_lectures=10,
            start_lecture_no=1,
            lectures_per_day=2,
            weekdays=["mon", "wed", "fri"],
            start_date=date.fromisoformat(form_start_date),
            due_date=date(2026, 7, 22),
            memo="로그 확인",
        )

        with self.assertLogs("crud", level=logging.INFO) as captured:
            crud.preview_lecture_assignment(preview_payload)
            crud.update_lecture_assignment(self.db, self.assignment, patch_payload)

        combined = "\n".join(captured.output)
        self.assertIn("lecture assignment preview compare: start_date=2026-07-10", combined)
        self.assertIn("existing_start_date=2026-07-10", combined)
        self.assertIn("requested_start_date=2026-07-10", combined)
        self.assertIn("payload_start_date=2026-07-10", combined)
