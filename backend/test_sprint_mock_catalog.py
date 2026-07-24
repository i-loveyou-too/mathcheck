import shutil
import tempfile
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from unittest import IsolatedAsyncioTestCase, TestCase

from fastapi import HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.datastructures import UploadFile

import models
import sprint_mock_catalog as smc
import sprint_mock_rounds as smr
from database import Base


def make_db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return engine, sessionmaker(bind=engine)()


def upload_file(data: bytes, filename: str) -> UploadFile:
    return UploadFile(file=BytesIO(data), filename=filename)


PDF_BYTES = b"%PDF-1.4\n%%fake%%"
MP3_BYTES = b"\xff\xfb\x90\x00" + b"\x00" * 2000

SEOUL = smc.SEOUL_TZ
PAST = datetime.now(timezone.utc) - timedelta(days=1)
FUTURE = datetime.now(timezone.utc) + timedelta(days=1)
FAR_FUTURE = datetime.now(timezone.utc) + timedelta(days=2)


def make_student(db, name, phone):
    student = models.Student(name=name, phone=phone, grade="고3")
    db.add(student)
    db.flush()
    return student


class CatalogSharedStorageTests(TestCase):
    """공통 시험 원본(문제/정답/등급컷)이 학생 수만큼 복제되지 않는지 검증한다."""

    def setUp(self):
        self.engine, self.db = make_db()
        self.a = make_student(self.db, "A", "01000000001")
        self.b = make_student(self.db, "B", "01000000002")
        self.c = make_student(self.db, "C", "01000000003")
        self.db.commit()
        self.catalog = smc.admin_create_catalog(smc.CatalogCreateIn(
            title="SPRINT 1.5회", subject="수학", question_count=2, total_score=100,
        ), self.db)
        smc.admin_set_questions(self.catalog["id"], smc.QuestionSetIn(questions=[
            smc.QuestionItemIn(question_no=1, correct_answer=1, score_points=50),
            smc.QuestionItemIn(question_no=2, correct_answer=2, score_points=50),
        ]), self.db)
        smc.admin_set_grade_cuts(self.catalog["id"], smc.GradeCutSetIn(grade_cuts=[
            smc.GradeCutItemIn(grade=1, minimum_score=90),
        ]), self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_catalog_title_allows_free_form_names(self):
        self.assertEqual(self.catalog["title"], "SPRINT 1.5회")

    def test_bulk_assign_to_three_students_with_different_dates(self):
        result = smc.admin_bulk_assign(self.catalog["id"], smc.BulkAssignIn(assignments=[
            smc.AssignmentScheduleIn(student_id=self.a.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FUTURE),
            smc.AssignmentScheduleIn(student_id=self.b.id, exam_date=date(2026, 7, 27), available_from=PAST, submission_deadline_at=FUTURE),
            smc.AssignmentScheduleIn(student_id=self.c.id, exam_date=date(2026, 7, 28), available_from=PAST, submission_deadline_at=FUTURE),
        ]), self.db)
        statuses = {r["student_id"]: r["status"] for r in result["results"]}
        self.assertEqual(statuses[self.a.id], "created")
        self.assertEqual(statuses[self.b.id], "created")
        self.assertEqual(statuses[self.c.id], "created")

        # 공통 시험지/정답/등급컷 row는 학생 수와 무관하게 하나만 존재해야 한다.
        self.assertEqual(self.db.query(models.SprintMockExamCatalogQuestion).filter_by(catalog_id=self.catalog["id"]).count(), 2)
        self.assertEqual(self.db.query(models.SprintMockExamCatalogGradeCut).filter_by(catalog_id=self.catalog["id"]).count(), 1)
        self.assertEqual(self.db.query(models.SprintMockExamCatalog).count(), 1)

        exam_dates = {
            a.student_id: a.exam_date
            for a in self.db.query(models.SprintMockExamAssignment).filter_by(catalog_id=self.catalog["id"]).all()
        }
        self.assertEqual(exam_dates[self.a.id], date(2026, 7, 26))
        self.assertEqual(exam_dates[self.b.id], date(2026, 7, 27))
        self.assertEqual(exam_dates[self.c.id], date(2026, 7, 28))

    def test_each_student_sees_only_own_assignment(self):
        smc.admin_bulk_assign(self.catalog["id"], smc.BulkAssignIn(assignments=[
            smc.AssignmentScheduleIn(student_id=self.a.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FUTURE),
            smc.AssignmentScheduleIn(student_id=self.b.id, exam_date=date(2026, 7, 27), available_from=PAST, submission_deadline_at=FUTURE),
        ]), self.db)
        a_list = smc.student_list_assignments(self.a.id, self.db)
        b_list = smc.student_list_assignments(self.b.id, self.db)
        c_list = smc.student_list_assignments(self.c.id, self.db)
        self.assertEqual(len(a_list), 1)
        self.assertEqual(len(b_list), 1)
        self.assertEqual(len(c_list), 0)
        self.assertEqual(a_list[0]["student_id"], self.a.id)

    def test_duplicate_assignment_skipped(self):
        first = smc.admin_bulk_assign(self.catalog["id"], smc.BulkAssignIn(assignments=[
            smc.AssignmentScheduleIn(student_id=self.a.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FUTURE),
        ]), self.db)
        self.assertEqual(first["results"][0]["status"], "created")
        second = smc.admin_bulk_assign(self.catalog["id"], smc.BulkAssignIn(assignments=[
            smc.AssignmentScheduleIn(student_id=self.a.id, exam_date=date(2026, 7, 30), available_from=PAST, submission_deadline_at=FUTURE),
        ]), self.db)
        self.assertEqual(second["results"][0]["status"], "duplicate")
        count = self.db.query(models.SprintMockExamAssignment).filter_by(catalog_id=self.catalog["id"], student_id=self.a.id).count()
        self.assertEqual(count, 1)

    def test_nonexistent_student_fails_without_stopping_batch(self):
        result = smc.admin_bulk_assign(self.catalog["id"], smc.BulkAssignIn(assignments=[
            smc.AssignmentScheduleIn(student_id=999999, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FUTURE),
            smc.AssignmentScheduleIn(student_id=self.a.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FUTURE),
        ]), self.db)
        statuses = {r["student_id"]: r["status"] for r in result["results"]}
        self.assertEqual(statuses[999999], "failed")
        self.assertEqual(statuses[self.a.id], "created")

    def test_deadline_before_available_from_rejected(self):
        with self.assertRaises(Exception):
            smc.AssignmentScheduleIn(student_id=self.a.id, exam_date=date(2026, 7, 26), available_from=FUTURE, submission_deadline_at=PAST)

    def test_catalog_delete_blocked_when_submission_exists(self):
        smc.admin_bulk_assign(self.catalog["id"], smc.BulkAssignIn(assignments=[
            smc.AssignmentScheduleIn(student_id=self.a.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FUTURE),
        ]), self.db)
        assignment = self.db.query(models.SprintMockExamAssignment).filter_by(catalog_id=self.catalog["id"], student_id=self.a.id).one()
        smc.student_save_omr(assignment.id, smc.OmrSaveIn(student_id=self.a.id, answers=[
            smc.OmrAnswerItemIn(question_no=1, selected_answer=1), smc.OmrAnswerItemIn(question_no=2, selected_answer=2),
        ]), self.db)
        smc.student_submit_assignment(assignment.id, smc.SubmitIn(student_id=self.a.id), self.db)
        with self.assertRaises(HTTPException) as ctx:
            smc.admin_delete_catalog(self.catalog["id"], self.db)
        self.assertEqual(ctx.exception.status_code, 400)


class TimeGatingTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = make_student(self.db, "학생", "01011112222")
        self.other = make_student(self.db, "다른학생", "01033334444")
        self.db.commit()
        self.catalog = smc.admin_create_catalog(smc.CatalogCreateIn(title="SPRINT 1회", subject="수학", question_count=2), self.db)
        smc.admin_set_questions(self.catalog["id"], smc.QuestionSetIn(questions=[
            smc.QuestionItemIn(question_no=1, correct_answer=1, score_points=50),
            smc.QuestionItemIn(question_no=2, correct_answer=2, score_points=50),
        ]), self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _assign(self, student_id, available_from, deadline=None, solution_open_at=None):
        smc.admin_bulk_assign(self.catalog["id"], smc.BulkAssignIn(assignments=[
            smc.AssignmentScheduleIn(
                student_id=student_id, exam_date=date(2026, 7, 26), available_from=available_from,
                submission_deadline_at=deadline or FAR_FUTURE, solution_open_at=solution_open_at,
            ),
        ]), self.db)
        return self.db.query(models.SprintMockExamAssignment).filter_by(catalog_id=self.catalog["id"], student_id=student_id).one()

    def test_omr_blocked_before_available_from(self):
        assignment = self._assign(self.student.id, FUTURE)
        with self.assertRaises(HTTPException) as ctx:
            smc.student_get_omr(assignment.id, self.student.id, self.db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_omr_allowed_after_available_from(self):
        assignment = self._assign(self.student.id, PAST)
        result = smc.student_get_omr(assignment.id, self.student.id, self.db)
        self.assertEqual(result["assignment"]["id"], assignment.id)

    def test_unassigned_student_cannot_access_worksheet_file(self):
        self._assign(self.student.id, PAST)
        with self.assertRaises(HTTPException) as ctx:
            smc.student_get_worksheet_file(self.catalog["id"], self.other.id, self.db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_solution_blocked_before_submission(self):
        assignment = self._assign(self.student.id, PAST)
        with self.assertRaises(HTTPException) as ctx:
            smc.student_get_solution_file(self.catalog["id"], self.student.id, self.db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_solution_blocked_before_solution_open_at_even_after_submission(self):
        assignment = self._assign(self.student.id, PAST, solution_open_at=FUTURE)
        smc.student_save_omr(assignment.id, smc.OmrSaveIn(student_id=self.student.id, answers=[
            smc.OmrAnswerItemIn(question_no=1, selected_answer=1), smc.OmrAnswerItemIn(question_no=2, selected_answer=2),
        ]), self.db)
        smc.student_submit_assignment(assignment.id, smc.SubmitIn(student_id=self.student.id), self.db)
        with self.assertRaises(HTTPException) as ctx:
            smc.student_get_solution_file(self.catalog["id"], self.student.id, self.db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_result_hidden_before_result_open_at(self):
        assignment = self._assign(self.student.id, PAST)
        assignment.result_open_at = FUTURE
        self.db.commit()
        smc.student_save_omr(assignment.id, smc.OmrSaveIn(student_id=self.student.id, answers=[
            smc.OmrAnswerItemIn(question_no=1, selected_answer=1), smc.OmrAnswerItemIn(question_no=2, selected_answer=2),
        ]), self.db)
        result = smc.student_submit_assignment(assignment.id, smc.SubmitIn(student_id=self.student.id), self.db)
        self.assertIsNone(result["raw_score"])
        self.assertFalse(result["is_result_open"])


class IndependentSubmissionTests(TestCase):
    """한 학생의 제출이 다른 학생 상태에 영향을 주지 않는지 검증한다."""

    def setUp(self):
        self.engine, self.db = make_db()
        self.a = make_student(self.db, "A", "01000000001")
        self.b = make_student(self.db, "B", "01000000002")
        self.db.commit()
        self.catalog = smc.admin_create_catalog(smc.CatalogCreateIn(title="SPRINT 1회", subject="수학", question_count=2), self.db)
        smc.admin_set_questions(self.catalog["id"], smc.QuestionSetIn(questions=[
            smc.QuestionItemIn(question_no=1, correct_answer=1, score_points=50),
            smc.QuestionItemIn(question_no=2, correct_answer=2, score_points=50),
        ]), self.db)
        smc.admin_bulk_assign(self.catalog["id"], smc.BulkAssignIn(assignments=[
            smc.AssignmentScheduleIn(student_id=self.a.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FAR_FUTURE),
            smc.AssignmentScheduleIn(student_id=self.b.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FAR_FUTURE),
        ]), self.db)
        self.assignment_a = self.db.query(models.SprintMockExamAssignment).filter_by(catalog_id=self.catalog["id"], student_id=self.a.id).one()
        self.assignment_b = self.db.query(models.SprintMockExamAssignment).filter_by(catalog_id=self.catalog["id"], student_id=self.b.id).one()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_a_submission_does_not_affect_b(self):
        smc.student_save_omr(self.assignment_a.id, smc.OmrSaveIn(student_id=self.a.id, answers=[
            smc.OmrAnswerItemIn(question_no=1, selected_answer=1), smc.OmrAnswerItemIn(question_no=2, selected_answer=1),
        ]), self.db)
        smc.student_submit_assignment(self.assignment_a.id, smc.SubmitIn(student_id=self.a.id, force=True), self.db)

        self.db.refresh(self.assignment_a)
        self.db.refresh(self.assignment_b)
        self.assertEqual(self.assignment_a.status, "graded")
        self.assertEqual(self.assignment_a.raw_score, 50)
        self.assertEqual(self.assignment_b.status, "not_started")
        self.assertIsNone(self.assignment_b.raw_score)

    def test_cross_student_omr_access_blocked(self):
        with self.assertRaises(HTTPException) as ctx:
            smc.student_get_omr(self.assignment_a.id, self.b.id, self.db)
        self.assertEqual(ctx.exception.status_code, 403)


class RegradeTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = make_student(self.db, "학생", "01099990000")
        self.db.commit()
        self.catalog = smc.admin_create_catalog(smc.CatalogCreateIn(title="SPRINT 1회", subject="수학", question_count=2), self.db)
        smc.admin_set_questions(self.catalog["id"], smc.QuestionSetIn(questions=[
            smc.QuestionItemIn(question_no=1, correct_answer=1, score_points=50),
            smc.QuestionItemIn(question_no=2, correct_answer=2, score_points=50),
        ]), self.db)
        smc.admin_bulk_assign(self.catalog["id"], smc.BulkAssignIn(assignments=[
            smc.AssignmentScheduleIn(student_id=self.student.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FAR_FUTURE),
        ]), self.db)
        self.assignment = self.db.query(models.SprintMockExamAssignment).filter_by(catalog_id=self.catalog["id"], student_id=self.student.id).one()
        smc.student_save_omr(self.assignment.id, smc.OmrSaveIn(student_id=self.student.id, answers=[
            smc.OmrAnswerItemIn(question_no=1, selected_answer=1), smc.OmrAnswerItemIn(question_no=2, selected_answer=1),
        ]), self.db)
        smc.student_submit_assignment(self.assignment.id, smc.SubmitIn(student_id=self.student.id), self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_regrade_after_answer_key_correction(self):
        self.db.refresh(self.assignment)
        self.assertEqual(self.assignment.raw_score, 50)
        smc.admin_set_questions(self.catalog["id"], smc.QuestionSetIn(questions=[
            smc.QuestionItemIn(question_no=1, correct_answer=1, score_points=50),
            smc.QuestionItemIn(question_no=2, correct_answer=1, score_points=50),
        ]), self.db)
        self.db.refresh(self.assignment)
        self.assertEqual(self.assignment.raw_score, 100)
        logs = self.db.query(models.SprintMockExamAssignmentScoreLog).filter_by(assignment_id=self.assignment.id).all()
        self.assertEqual(len(logs), 1)


class GradeCutValidationTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.db.commit()
        self.catalog = smc.admin_create_catalog(smc.CatalogCreateIn(title="SPRINT 1회", subject="수학", question_count=2, total_score=100), self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_grade_cut_exceeding_total_score_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            smc.admin_set_grade_cuts(self.catalog["id"], smc.GradeCutSetIn(grade_cuts=[smc.GradeCutItemIn(grade=1, minimum_score=150)]), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_non_decreasing_grade_cuts_rejected(self):
        with self.assertRaises(ValueError):
            smc.GradeCutSetIn(grade_cuts=[smc.GradeCutItemIn(grade=1, minimum_score=80), smc.GradeCutItemIn(grade=2, minimum_score=84)])


class MediaValidationTests(IsolatedAsyncioTestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.storage_dir = tempfile.mkdtemp()
        self._original_root = smr.STORAGE_ROOT
        smr.STORAGE_ROOT = Path(self.storage_dir)
        self.catalog = smc.admin_create_catalog(smc.CatalogCreateIn(title="SPRINT 1회", subject="영어", question_count=5), self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        smr.STORAGE_ROOT = self._original_root
        shutil.rmtree(self.storage_dir, ignore_errors=True)

    async def test_worksheet_pdf_upload_and_download(self):
        media = await smc.admin_upload_worksheet_file(self.catalog["id"], upload_file(PDF_BYTES, "worksheet.pdf"), self.db)
        self.assertEqual(media["media_type"], "worksheet_pdf")
        response = smc.admin_get_worksheet_file(self.catalog["id"], self.db)
        self.assertIsInstance(response, FileResponse)

    async def test_solution_pdf_served_inline_not_attachment(self):
        await smc.admin_upload_solution_file(self.catalog["id"], upload_file(PDF_BYTES, "solution.pdf"), self.db)
        response = smc.admin_get_solution_file(self.catalog["id"], self.db)
        self.assertEqual(response.headers.get("content-disposition", "").split(";")[0], "inline")

    async def test_non_pdf_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await smc.admin_upload_worksheet_file(self.catalog["id"], upload_file(b"not a pdf", "x.pdf"), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_listening_audio_upload_and_duration_estimate(self):
        media = await smc.admin_upload_listening_audio(self.catalog["id"], upload_file(MP3_BYTES, "listening.mp3"), self.db)
        self.assertEqual(media["media_type"], "listening_audio")

    async def test_non_mp3_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await smc.admin_upload_listening_audio(self.catalog["id"], upload_file(b"not audio", "x.mp3"), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_replacing_worksheet_file_removes_old_copy(self):
        first = await smc.admin_upload_worksheet_file(self.catalog["id"], upload_file(PDF_BYTES, "v1.pdf"), self.db)
        second = await smc.admin_upload_worksheet_file(self.catalog["id"], upload_file(PDF_BYTES + b"more", "v2.pdf"), self.db)
        catalog = smc.get_catalog_or_404(self.db, self.catalog["id"])
        worksheet_media = [m for m in catalog.media if m.media_type == "worksheet_pdf"]
        self.assertEqual(len(worksheet_media), 1)
        self.assertEqual(worksheet_media[0].id, second["id"])
