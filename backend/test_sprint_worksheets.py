import shutil
import tempfile
from datetime import date
from io import BytesIO
from pathlib import Path
from unittest import IsolatedAsyncioTestCase

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.datastructures import UploadFile

import models
import sprint_worksheets
from database import Base


def make_db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine, sessionmaker(bind=engine)()


def upload_file(data: bytes, filename: str) -> UploadFile:
    return UploadFile(file=BytesIO(data), filename=filename)


PDF_BYTES = b"%PDF-1.4\n%%fake worksheet pdf%%"
PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n" + b"\x00" * 8 + (100).to_bytes(4, "big") + (200).to_bytes(4, "big") + b"\x00" * 20
)


class SprintWorksheetTests(IsolatedAsyncioTestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.storage_dir = tempfile.mkdtemp()
        self._original_storage_root = sprint_worksheets.STORAGE_ROOT
        sprint_worksheets.STORAGE_ROOT = Path(self.storage_dir)

        self.student = models.Student(name="학생", phone="01000000000", grade="고3")
        self.other_student = models.Student(name="다른학생", phone="01099999999", grade="고3")
        self.db.add_all([self.student, self.other_student])
        self.db.flush()
        self.program = models.SprintProgram(
            student_id=self.student.id,
            title="여름 SPRINT",
            start_date=date(2026, 7, 1),
            end_date=date(2026, 9, 1),
            is_active=True,
        )
        self.db.add(self.program)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        sprint_worksheets.STORAGE_ROOT = self._original_storage_root
        shutil.rmtree(self.storage_dir, ignore_errors=True)

    async def _create_assignment(self, **overrides):
        defaults = dict(
            program_id=self.program.id,
            title="1주차 문제지",
            subject="수학",
            assigned_date=date(2026, 7, 5),
            due_date=None,
            created_by_admin_id=None,
            file=upload_file(PDF_BYTES, "worksheet.pdf"),
            db=self.db,
        )
        defaults.update(overrides)
        return await sprint_worksheets.admin_create_worksheet(**defaults)

    async def test_create_assignment_stores_pdf(self):
        result = await self._create_assignment()
        self.assertEqual(result["title"], "1주차 문제지")
        self.assertEqual(result["submission_status"], "not_submitted")
        assignment = self.db.get(models.SprintWorksheetAssignment, result["id"])
        self.assertTrue(Path(self.storage_dir, assignment.storage_key).exists())

    async def test_create_assignment_rejects_non_pdf(self):
        with self.assertRaises(HTTPException) as ctx:
            await self._create_assignment(file=upload_file(b"not a pdf", "worksheet.pdf"))
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_student_image_submission_flow(self):
        created = await self._create_assignment()
        assignment_id = created["id"]

        file1 = await sprint_worksheets.student_upload_worksheet_submission_file(
            assignment_id, self.student.id, upload_file(PNG_BYTES, "page1.png"), self.db
        )
        file2 = await sprint_worksheets.student_upload_worksheet_submission_file(
            assignment_id, self.student.id, upload_file(PNG_BYTES, "page2.png"), self.db
        )
        self.assertEqual(file1["order_index"], 1)
        self.assertEqual(file2["order_index"], 2)

        assignment = sprint_worksheets.get_assignment_or_404(self.db, assignment_id)
        self.assertEqual(assignment.submission.submission_method, "images")
        self.assertEqual(assignment.submission.status, "draft")

        # PDF는 이미지 제출과 섞을 수 없다.
        with self.assertRaises(HTTPException) as ctx:
            await sprint_worksheets.student_upload_worksheet_submission_file(
                assignment_id, self.student.id, upload_file(PDF_BYTES, "solution.pdf"), self.db
            )
        self.assertEqual(ctx.exception.status_code, 400)

        submitted = sprint_worksheets.student_submit_worksheet(
            assignment_id,
            sprint_worksheets.WorksheetSubmissionActionIn(student_id=self.student.id),
            self.db,
        )
        self.assertEqual(submitted["status"], "pending")

        # pending 상태에서는 파일을 더 이상 바꿀 수 없다.
        with self.assertRaises(HTTPException):
            await sprint_worksheets.student_upload_worksheet_submission_file(
                assignment_id, self.student.id, upload_file(PNG_BYTES, "page3.png"), self.db
            )

    async def test_submit_without_files_rejected(self):
        created = await self._create_assignment()
        with self.assertRaises(HTTPException) as ctx:
            sprint_worksheets.student_submit_worksheet(
                created["id"],
                sprint_worksheets.WorksheetSubmissionActionIn(student_id=self.student.id),
                self.db,
            )
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_cross_student_access_blocked(self):
        created = await self._create_assignment()
        with self.assertRaises(HTTPException) as ctx:
            sprint_worksheets.student_get_worksheet_file(created["id"], self.other_student.id, self.db)
        self.assertEqual(ctx.exception.status_code, 403)

        with self.assertRaises(HTTPException) as ctx2:
            await sprint_worksheets.student_upload_worksheet_submission_file(
                created["id"], self.other_student.id, upload_file(PNG_BYTES, "x.png"), self.db
            )
        self.assertEqual(ctx2.exception.status_code, 403)

    async def test_reject_then_resubmit_flow(self):
        created = await self._create_assignment()
        assignment_id = created["id"]
        await sprint_worksheets.student_upload_worksheet_submission_file(
            assignment_id, self.student.id, upload_file(PNG_BYTES, "page1.png"), self.db
        )
        submitted = sprint_worksheets.student_submit_worksheet(
            assignment_id,
            sprint_worksheets.WorksheetSubmissionActionIn(student_id=self.student.id),
            self.db,
        )
        rejected = sprint_worksheets.admin_reject_worksheet_submission(
            submitted["id"],
            sprint_worksheets.WorksheetSubmissionRejectIn(review_note="글씨가 흐릿해요"),
            self.db,
        )
        self.assertEqual(rejected["status"], "rejected")

        # 반려된 후에는 파일을 다시 올리고 재제출할 수 있다.
        await sprint_worksheets.student_upload_worksheet_submission_file(
            assignment_id, self.student.id, upload_file(PNG_BYTES, "page1-retry.png"), self.db
        )
        resubmitted = sprint_worksheets.student_submit_worksheet(
            assignment_id,
            sprint_worksheets.WorksheetSubmissionActionIn(student_id=self.student.id),
            self.db,
        )
        self.assertEqual(resubmitted["status"], "pending")

    async def test_approve_requires_files_and_updates_summary(self):
        created = await self._create_assignment()
        assignment_id = created["id"]
        await sprint_worksheets.student_upload_worksheet_submission_file(
            assignment_id, self.student.id, upload_file(PNG_BYTES, "page1.png"), self.db
        )
        submitted = sprint_worksheets.student_submit_worksheet(
            assignment_id,
            sprint_worksheets.WorksheetSubmissionActionIn(student_id=self.student.id),
            self.db,
        )

        summary_before = sprint_worksheets.worksheet_home_summary(self.db, self.program, self.student.id)
        self.assertEqual(summary_before["in_review_count"], 1)
        self.assertEqual(summary_before["approved_count"], 0)

        approved = sprint_worksheets.admin_approve_worksheet_submission(
            submitted["id"], sprint_worksheets.WorksheetSubmissionReviewIn(), self.db
        )
        self.assertEqual(approved["status"], "approved")

        summary_after = sprint_worksheets.worksheet_home_summary(self.db, self.program, self.student.id)
        self.assertEqual(summary_after["approved_count"], 1)
        self.assertEqual(summary_after["in_review_count"], 0)

    async def test_delete_blocked_once_files_exist(self):
        created = await self._create_assignment()
        assignment_id = created["id"]
        await sprint_worksheets.student_upload_worksheet_submission_file(
            assignment_id, self.student.id, upload_file(PNG_BYTES, "page1.png"), self.db
        )
        with self.assertRaises(HTTPException) as ctx:
            sprint_worksheets.admin_delete_worksheet(assignment_id, self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_delete_allowed_without_submission(self):
        created = await self._create_assignment()
        result = sprint_worksheets.admin_delete_worksheet(created["id"], self.db)
        self.assertTrue(result["deleted"])
