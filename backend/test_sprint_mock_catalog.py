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

    def test_unassigned_student_cannot_access_listening_audio(self):
        self._assign(self.student.id, PAST)
        with self.assertRaises(HTTPException) as ctx:
            smc.student_get_listening_audio(self.catalog["id"], self.other.id, self.db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_listening_audio_blocked_before_available_from(self):
        self._assign(self.student.id, FUTURE)
        with self.assertRaises(HTTPException) as ctx:
            smc.student_get_listening_audio(self.catalog["id"], self.student.id, self.db)
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

    def test_worksheet_pdf_endpoints_are_removed(self):
        """문제지는 관리자가 종이로 직접 전달하므로 시험지 PDF 관련 endpoint가 없어야 한다."""
        for name in ("admin_upload_worksheet_file", "admin_get_worksheet_file", "admin_delete_worksheet_file", "student_get_worksheet_file"):
            self.assertFalse(hasattr(smc, name), f"{name}가 아직 남아 있습니다.")
        self.assertNotIn("worksheet_pdf", smc.MEDIA_TYPES)

    async def test_solution_pdf_upload_and_download(self):
        media = await smc.admin_upload_solution_file(self.catalog["id"], upload_file(PDF_BYTES, "solution.pdf"), self.db)
        self.assertEqual(media["media_type"], "solution_pdf")
        response = smc.admin_get_solution_file(self.catalog["id"], self.db)
        self.assertIsInstance(response, FileResponse)

    async def test_solution_pdf_served_inline_not_attachment(self):
        await smc.admin_upload_solution_file(self.catalog["id"], upload_file(PDF_BYTES, "solution.pdf"), self.db)
        response = smc.admin_get_solution_file(self.catalog["id"], self.db)
        self.assertEqual(response.headers.get("content-disposition", "").split(";")[0], "inline")

    async def test_non_pdf_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await smc.admin_upload_solution_file(self.catalog["id"], upload_file(b"not a pdf", "x.pdf"), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_listening_audio_upload_and_duration_estimate(self):
        media = await smc.admin_upload_listening_audio(self.catalog["id"], upload_file(MP3_BYTES, "listening.mp3"), self.db)
        self.assertEqual(media["media_type"], "listening_audio")

    async def test_non_mp3_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await smc.admin_upload_listening_audio(self.catalog["id"], upload_file(b"not audio", "x.mp3"), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_replacing_solution_file_removes_old_copy(self):
        await smc.admin_upload_solution_file(self.catalog["id"], upload_file(PDF_BYTES, "v1.pdf"), self.db)
        second = await smc.admin_upload_solution_file(self.catalog["id"], upload_file(PDF_BYTES + b"more", "v2.pdf"), self.db)
        catalog = smc.get_catalog_or_404(self.db, self.catalog["id"])
        solution_media = [m for m in catalog.media if m.media_type == "solution_pdf"]
        self.assertEqual(len(solution_media), 1)
        self.assertEqual(solution_media[0].id, second["id"])

    async def test_listening_audio_rejected_for_non_english_subject(self):
        math_exam = smc.admin_create_catalog(smc.CatalogCreateIn(title="SPRINT 1회", subject="수학", question_count=5), self.db)
        with self.assertRaises(HTTPException) as ctx:
            await smc.admin_upload_listening_audio(math_exam["id"], upload_file(MP3_BYTES, "listening.mp3"), self.db)
        self.assertEqual(ctx.exception.status_code, 400)


def make_template(db, name="수학 수능형 30문항", subject="수학", count=30, scores=None):
    """기본: 2점 x 10 + 3점 x 15 + 4점 x 5 = 20+45+20 = 85... 명시 지정이 없으면 균등 배점."""
    if scores is None:
        scores = [100 // count] * count
        scores[-1] += 100 - sum(scores)
    items = [smc.TemplateItemIn(question_no=i + 1, score=s) for i, s in enumerate(scores)]
    return smc.admin_create_template(
        smc.TemplateCreateIn(name=name, subject_category=subject, total_score=sum(scores), items=items), db,
    )


class ScoreTemplateTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_create_template_with_uneven_scores(self):
        template = make_template(self.db, count=3, scores=[2, 3, 5])
        self.assertEqual(template["question_count"], 3)
        self.assertEqual(template["total_score"], 10)
        self.assertEqual([i["score"] for i in template["items"]], [2, 3, 5])

    def test_total_mismatch_rejected_on_create(self):
        with self.assertRaises(ValueError):
            smc.TemplateCreateIn(name="x", total_score=100, items=[
                smc.TemplateItemIn(question_no=1, score=2), smc.TemplateItemIn(question_no=2, score=3),
            ])

    def test_non_contiguous_question_numbers_rejected(self):
        with self.assertRaises(ValueError):
            smc.TemplateCreateIn(name="x", total_score=5, items=[
                smc.TemplateItemIn(question_no=1, score=2), smc.TemplateItemIn(question_no=5, score=3),
            ])

    def test_duplicate_template(self):
        template = make_template(self.db, count=3, scores=[2, 3, 5])
        copy = smc.admin_duplicate_template(template["id"], self.db)
        self.assertNotEqual(copy["id"], template["id"])
        self.assertEqual([i["score"] for i in copy["items"]], [2, 3, 5])

    def test_unused_template_can_be_deleted(self):
        template = make_template(self.db, count=2, scores=[50, 50])
        self.assertTrue(smc.admin_delete_template(template["id"], self.db)["deleted"])

    def test_used_template_cannot_be_deleted_only_deactivated(self):
        template = make_template(self.db, count=2, scores=[50, 50])
        exam_set = smc.admin_create_set(smc.SetCreateIn(title="SPRINT 1회"), self.db)
        smc.admin_add_set_exam(exam_set["id"], smc.SetExamCreateIn(subject="수학", score_template_id=template["id"]), self.db)
        with self.assertRaises(HTTPException) as ctx:
            smc.admin_delete_template(template["id"], self.db)
        self.assertEqual(ctx.exception.status_code, 400)
        deactivated = smc.admin_update_template(template["id"], smc.TemplateUpdateIn(is_active=False), self.db)
        self.assertFalse(deactivated["is_active"])

    def test_inactive_template_hidden_from_default_list(self):
        template = make_template(self.db, count=2, scores=[50, 50])
        smc.admin_update_template(template["id"], smc.TemplateUpdateIn(is_active=False), self.db)
        self.assertEqual(len(smc.admin_list_templates(False, self.db)), 0)
        self.assertEqual(len(smc.admin_list_templates(True, self.db)), 1)


class TemplateSnapshotTests(TestCase):
    """템플릿을 고쳐도 이미 만들어진 시험지의 배점과 학생 점수가 바뀌지 않아야 한다."""

    def setUp(self):
        self.engine, self.db = make_db()
        self.student = make_student(self.db, "A", "01000000001")
        self.db.commit()
        self.template = make_template(self.db, count=2, scores=[40, 60])
        self.exam_set = smc.admin_create_set(smc.SetCreateIn(title="SPRINT 1회"), self.db)
        self.exam = smc.admin_add_set_exam(
            self.exam_set["id"], smc.SetExamCreateIn(subject="수학", score_template_id=self.template["id"]), self.db,
        )

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_template_scores_copied_into_exam_on_create(self):
        self.assertEqual(self.exam["question_count"], 2)
        self.assertEqual(self.exam["total_score"], 100)
        scores = {q["question_no"]: q["score_points"] for q in self.exam["questions"]}
        self.assertEqual(scores, {1: 40, 2: 60})
        # 정답은 아직 비어 있다 (배점만 먼저 스냅샷)
        self.assertTrue(all(q["correct_answer"] is None for q in self.exam["questions"]))

    def test_submit_blocked_until_answer_key_entered(self):
        smc.admin_bulk_assign(self.exam["id"], smc.BulkAssignIn(assignments=[
            smc.AssignmentScheduleIn(student_id=self.student.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FAR_FUTURE),
        ]), self.db)
        assignment = self.db.query(models.SprintMockExamAssignment).filter_by(catalog_id=self.exam["id"]).one()
        with self.assertRaises(HTTPException) as ctx:
            smc.student_submit_assignment(assignment.id, smc.SubmitIn(student_id=self.student.id, force=True), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_score_uses_snapshot_not_template_after_template_change(self):
        smc.admin_set_questions(self.exam["id"], smc.QuestionSetIn(questions=[
            smc.QuestionItemIn(question_no=1, correct_answer=1, score_points=40),
            smc.QuestionItemIn(question_no=2, correct_answer=2, score_points=60),
        ]), self.db)
        smc.admin_bulk_assign(self.exam["id"], smc.BulkAssignIn(assignments=[
            smc.AssignmentScheduleIn(student_id=self.student.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FAR_FUTURE),
        ]), self.db)
        assignment = self.db.query(models.SprintMockExamAssignment).filter_by(catalog_id=self.exam["id"]).one()
        smc.student_save_omr(assignment.id, smc.OmrSaveIn(student_id=self.student.id, answers=[
            smc.OmrAnswerItemIn(question_no=1, selected_answer=1), smc.OmrAnswerItemIn(question_no=2, selected_answer=5),
        ]), self.db)
        result = smc.student_submit_assignment(assignment.id, smc.SubmitIn(student_id=self.student.id), self.db)
        self.assertEqual(result["raw_score"], 40)  # 1번만 정답 → 스냅샷 배점 40점

        # 템플릿 배점을 뒤집어도 기존 시험 점수는 그대로여야 한다.
        smc.admin_update_template(self.template["id"], smc.TemplateUpdateIn(
            total_score=100, items=[smc.TemplateItemIn(question_no=1, score=90), smc.TemplateItemIn(question_no=2, score=10)],
        ), self.db)
        self.db.refresh(assignment)
        self.assertEqual(assignment.raw_score, 40)

    def test_score_change_blocked_once_assigned(self):
        smc.admin_set_questions(self.exam["id"], smc.QuestionSetIn(questions=[
            smc.QuestionItemIn(question_no=1, correct_answer=1, score_points=40),
            smc.QuestionItemIn(question_no=2, correct_answer=2, score_points=60),
        ]), self.db)
        smc.admin_bulk_assign(self.exam["id"], smc.BulkAssignIn(assignments=[
            smc.AssignmentScheduleIn(student_id=self.student.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FAR_FUTURE),
        ]), self.db)
        with self.assertRaises(HTTPException) as ctx:
            smc.admin_set_questions(self.exam["id"], smc.QuestionSetIn(questions=[
                smc.QuestionItemIn(question_no=1, correct_answer=1, score_points=70),
                smc.QuestionItemIn(question_no=2, correct_answer=2, score_points=30),
            ]), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_answer_correction_still_allowed_after_assignment(self):
        smc.admin_set_questions(self.exam["id"], smc.QuestionSetIn(questions=[
            smc.QuestionItemIn(question_no=1, correct_answer=1, score_points=40),
            smc.QuestionItemIn(question_no=2, correct_answer=2, score_points=60),
        ]), self.db)
        smc.admin_bulk_assign(self.exam["id"], smc.BulkAssignIn(assignments=[
            smc.AssignmentScheduleIn(student_id=self.student.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FAR_FUTURE),
        ]), self.db)
        updated = smc.admin_set_questions(self.exam["id"], smc.QuestionSetIn(questions=[
            smc.QuestionItemIn(question_no=1, correct_answer=3, score_points=40),
            smc.QuestionItemIn(question_no=2, correct_answer=2, score_points=60),
        ]), self.db)
        answers = {q["question_no"]: q["correct_answer"] for q in updated["questions"]}
        self.assertEqual(answers[1], 3)

    def test_total_mismatch_blocked_on_exam_questions(self):
        with self.assertRaises(HTTPException) as ctx:
            smc.admin_set_questions(self.exam["id"], smc.QuestionSetIn(questions=[
                smc.QuestionItemIn(question_no=1, correct_answer=1, score_points=10),
                smc.QuestionItemIn(question_no=2, correct_answer=2, score_points=10),
            ]), self.db)
        self.assertEqual(ctx.exception.status_code, 400)


class ExamSetAndProfileAssignmentTests(TestCase):
    """세트 1개에 국어(공통+선택2)/수학(공통+선택3)/영어/탐구4 시험지를 등록하고,
    학생 2명에게 프로필 기반으로 각자 다른 과목 조합이 배정되는지 검증한다."""

    def setUp(self):
        self.engine, self.db = make_db()
        self.a = make_student(self.db, "학생A", "01000000001")
        self.b = make_student(self.db, "학생B", "01000000002")
        self.c = make_student(self.db, "학생C", "01000000003")
        self.a.korean_elective, self.a.math_elective = "화법과 작문", "미적분"
        self.a.inquiry_subject_1, self.a.inquiry_subject_2 = "생활과 윤리", "사회문화"
        self.b.korean_elective, self.b.math_elective = "언어와 매체", "확률과 통계"
        self.b.inquiry_subject_1, self.b.inquiry_subject_2 = "윤리와 사상", "동아시아사"
        self.db.commit()

        self.exam_set = smc.admin_create_set(smc.SetCreateIn(title="SPRINT 1회", round_no=1), self.db)
        specs = [
            ("국어", None), ("국어", "화법과 작문"), ("국어", "언어와 매체"),
            ("수학", None), ("수학", "미적분"), ("수학", "확률과 통계"), ("수학", "기하"),
            ("영어", None),
            ("탐구", "생활과 윤리"), ("탐구", "윤리와 사상"), ("탐구", "사회문화"), ("탐구", "동아시아사"),
        ]
        for subject, elective in specs:
            smc.admin_add_set_exam(self.exam_set["id"], smc.SetExamCreateIn(
                subject=subject, elective_name=elective, question_count=2, total_score=100,
            ), self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _labels(self, exams):
        return sorted(e["label"] for e in exams)

    def test_preview_selects_seven_exams_per_student_profile(self):
        preview = smc.admin_preview_set_assignment(
            self.exam_set["id"], smc.SetAssignPreviewIn(student_ids=[self.a.id, self.b.id]), self.db,
        )
        by_student = {r["student_id"]: r for r in preview["students"]}
        self.assertEqual(self._labels(by_student[self.a.id]["exams"]),
                         sorted(["국어", "화법과 작문", "수학", "미적분", "영어", "생활과 윤리", "사회문화"]))
        self.assertEqual(self._labels(by_student[self.b.id]["exams"]),
                         sorted(["국어", "언어와 매체", "수학", "확률과 통계", "영어", "윤리와 사상", "동아시아사"]))

    def test_missing_profile_produces_warnings_not_crash(self):
        preview = smc.admin_preview_set_assignment(
            self.exam_set["id"], smc.SetAssignPreviewIn(student_ids=[self.c.id]), self.db,
        )
        row = preview["students"][0]
        self.assertEqual(self._labels(row["exams"]), sorted(["국어", "수학", "영어"]))
        self.assertTrue(any("국어 선택과목" in w for w in row["warnings"]))
        self.assertTrue(any("탐구" in w for w in row["warnings"]))

    def test_bulk_assign_two_students_creates_own_subject_sets(self):
        result = smc.admin_bulk_assign_set(self.exam_set["id"], smc.SetBulkAssignIn(assignments=[
            smc.SetAssignScheduleIn(student_id=self.a.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FAR_FUTURE),
            smc.SetAssignScheduleIn(student_id=self.b.id, exam_date=date(2026, 7, 27), available_from=PAST, submission_deadline_at=FAR_FUTURE),
        ]), self.db)
        by_student = {r["student_id"]: r for r in result["results"]}
        self.assertEqual(by_student[self.a.id]["status"], "created")
        self.assertEqual(len(by_student[self.a.id]["created_subjects"]), 7)
        self.assertEqual(len(by_student[self.b.id]["created_subjects"]), 7)

        a_assignments = self.db.query(models.SprintMockExamAssignment).filter_by(student_id=self.a.id).all()
        self.assertEqual(len(a_assignments), 7)
        self.assertTrue(all(x.exam_date == date(2026, 7, 26) for x in a_assignments))
        b_assignments = self.db.query(models.SprintMockExamAssignment).filter_by(student_id=self.b.id).all()
        self.assertTrue(all(x.exam_date == date(2026, 7, 27) for x in b_assignments))

        # 공통 시험지/문항은 학생 수만큼 복제되지 않는다.
        self.assertEqual(self.db.query(models.SprintMockExamCatalog).count(), 12)

    def test_admin_can_override_subject_selection(self):
        available = {e["label"]: e["catalog_id"] for e in smc.admin_preview_set_assignment(
            self.exam_set["id"], smc.SetAssignPreviewIn(student_ids=[self.a.id]), self.db,
        )["available_exams"]}
        chosen = [available["영어"], available["기하"]]
        result = smc.admin_bulk_assign_set(self.exam_set["id"], smc.SetBulkAssignIn(assignments=[
            smc.SetAssignScheduleIn(student_id=self.a.id, exam_date=date(2026, 7, 26), available_from=PAST,
                                    submission_deadline_at=FAR_FUTURE, catalog_ids=chosen),
        ]), self.db)
        self.assertEqual(sorted(result["results"][0]["created_subjects"]), sorted(["영어", "기하"]))
        self.assertEqual(self.db.query(models.SprintMockExamAssignment).filter_by(student_id=self.a.id).count(), 2)

    def test_reassign_skips_already_assigned_subjects(self):
        schedule = smc.SetAssignScheduleIn(student_id=self.a.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FAR_FUTURE)
        smc.admin_bulk_assign_set(self.exam_set["id"], smc.SetBulkAssignIn(assignments=[schedule]), self.db)
        again = smc.admin_bulk_assign_set(self.exam_set["id"], smc.SetBulkAssignIn(assignments=[schedule]), self.db)
        row = again["results"][0]
        self.assertEqual(row["status"], "duplicate")
        self.assertEqual(len(row["duplicate_subjects"]), 7)
        self.assertEqual(self.db.query(models.SprintMockExamAssignment).filter_by(student_id=self.a.id).count(), 7)

    def test_profile_change_does_not_alter_existing_assignments(self):
        smc.admin_bulk_assign_set(self.exam_set["id"], smc.SetBulkAssignIn(assignments=[
            smc.SetAssignScheduleIn(student_id=self.a.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FAR_FUTURE),
        ]), self.db)
        before = sorted(x.catalog_id for x in self.db.query(models.SprintMockExamAssignment).filter_by(student_id=self.a.id).all())

        smc.admin_update_student_electives(self.a.id, smc.StudentElectiveIn(
            korean_elective="언어와 매체", math_elective="기하", inquiry_subject_1="동아시아사", inquiry_subject_2="윤리와 사상",
        ), self.db)

        after = sorted(x.catalog_id for x in self.db.query(models.SprintMockExamAssignment).filter_by(student_id=self.a.id).all())
        self.assertEqual(before, after)

    def test_set_list_shows_set_level_not_per_subject(self):
        rows = smc.admin_list_sets(self.db)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["title"], "SPRINT 1회")
        self.assertEqual(rows[0]["exam_count"], 12)

    def test_set_stats_count_students_not_assignments(self):
        smc.admin_bulk_assign_set(self.exam_set["id"], smc.SetBulkAssignIn(assignments=[
            smc.SetAssignScheduleIn(student_id=self.a.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FAR_FUTURE),
            smc.SetAssignScheduleIn(student_id=self.b.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FAR_FUTURE),
        ]), self.db)
        row = smc.admin_list_sets(self.db)[0]
        self.assertEqual(row["assigned_student_count"], 2)
        self.assertEqual(row["completed_student_count"], 0)

    def test_duplicate_subject_in_same_set_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            smc.admin_add_set_exam(self.exam_set["id"], smc.SetExamCreateIn(
                subject="탐구", elective_name="생활과 윤리", question_count=2, total_score=100,
            ), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_invalid_elective_for_subject_rejected(self):
        with self.assertRaises(ValueError):
            smc.SetExamCreateIn(subject="수학", elective_name="화법과 작문", question_count=2, total_score=100)

    def test_inquiry_requires_elective_name(self):
        with self.assertRaises(ValueError):
            smc.SetExamCreateIn(subject="탐구", question_count=2, total_score=100)

    def test_set_delete_blocked_after_submission(self):
        exam_id = next(e["id"] for e in smc.admin_get_set(self.exam_set["id"], self.db)["exams"] if e["subject"] == "영어")
        smc.admin_set_questions(exam_id, smc.QuestionSetIn(questions=[
            smc.QuestionItemIn(question_no=1, correct_answer=1, score_points=50),
            smc.QuestionItemIn(question_no=2, correct_answer=2, score_points=50),
        ]), self.db)
        smc.admin_bulk_assign(exam_id, smc.BulkAssignIn(assignments=[
            smc.AssignmentScheduleIn(student_id=self.a.id, exam_date=date(2026, 7, 26), available_from=PAST, submission_deadline_at=FAR_FUTURE),
        ]), self.db)
        assignment = self.db.query(models.SprintMockExamAssignment).filter_by(catalog_id=exam_id).one()
        smc.student_submit_assignment(assignment.id, smc.SubmitIn(student_id=self.a.id, force=True), self.db)
        with self.assertRaises(HTTPException) as ctx:
            smc.admin_delete_set(self.exam_set["id"], self.db)
        self.assertEqual(ctx.exception.status_code, 400)
        archived = smc.admin_archive_set(self.exam_set["id"], self.db)
        self.assertFalse(archived["is_active"])
        self.assertIsNotNone(archived["archived_at"])


class StudentElectiveProfileTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = make_student(self.db, "학생", "01000000009")
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_get_and_update_electives(self):
        smc.admin_update_student_electives(self.student.id, smc.StudentElectiveIn(
            korean_elective="언어와 매체", math_elective="미적분",
            inquiry_subject_1="사회문화", inquiry_subject_2="동아시아사",
        ), self.db)
        profile = smc.admin_get_student_electives(self.student.id, self.db)
        self.assertEqual(profile["korean_elective"], "언어와 매체")
        self.assertEqual(profile["math_elective"], "미적분")
        self.assertEqual(profile["inquiry_subject_1"], "사회문화")

    def test_invalid_elective_rejected(self):
        with self.assertRaises(ValueError):
            smc.StudentElectiveIn(math_elective="화법과 작문")

    def test_duplicate_inquiry_rejected(self):
        with self.assertRaises(ValueError):
            smc.StudentElectiveIn(inquiry_subject_1="사회문화", inquiry_subject_2="사회문화")

    def test_legacy_code_normalized_to_korean_name(self):
        smc.admin_update_student_electives(self.student.id, smc.StudentElectiveIn(inquiry_subject_1="life_ethics"), self.db)
        profile = smc.admin_get_student_electives(self.student.id, self.db)
        self.assertEqual(profile["inquiry_subject_1"], "생활과 윤리")
