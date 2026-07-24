import shutil
import tempfile
from datetime import date
from io import BytesIO
from pathlib import Path
from unittest import IsolatedAsyncioTestCase, TestCase

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.datastructures import UploadFile

import models
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


class SyncAndAssignmentTests(TestCase):
    """3명(A/B/C)이 각자 SPRINT를 갖는 현재 1:1 구조에서, 회차 하나 등록 시
    해당 프로그램의 학생에게만 국어/수학/영어/탐구2가 정확히 자동 배정되는지 검증한다."""

    def setUp(self):
        self.engine, self.db = make_db()
        self.students = {}
        self.programs = {}
        for name, phone, inquiry in [
            ("A", "01000000001", ("life_ethics", "social_culture")),
            ("B", "01000000002", ("ethics_thought", "east_asian_history")),
            ("C", "01000000003", (None, None)),
        ]:
            student = models.Student(name=name, phone=phone, grade="고3")
            self.db.add(student)
            self.db.flush()
            program = models.SprintProgram(
                student_id=student.id, title=f"{name} SPRINT",
                start_date=date(2026, 7, 1), end_date=date(2026, 9, 1), is_active=True,
                inquiry_subject_1=inquiry[0], inquiry_subject_2=inquiry[1],
            )
            self.db.add(program)
            self.db.flush()
            self.students[name] = student
            self.programs[name] = program
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _create_round_with_all_papers(self, program):
        round_ = smr.admin_create_round(
            program.id,
            smr.RoundCreateIn(title="SPRINT 1회", exam_date=date(2026, 7, 26), submission_deadline_time="23:00"),
            self.db,
        )
        round_id = round_["id"]
        for code, count in [
            ("korean", 10), ("math", 10), ("english", 10),
            ("life_ethics", 5), ("ethics_thought", 5), ("social_culture", 5), ("east_asian_history", 5),
        ]:
            smr.admin_create_paper(round_id, smr.PaperCreateIn(subject_code=code, question_count=count), self.db)
        return round_id

    def test_student_a_gets_own_two_inquiry_papers(self):
        round_id = self._create_round_with_all_papers(self.programs["A"])
        participant = self.db.query(models.SprintMockExamParticipant).filter_by(
            mock_exam_round_id=round_id, student_id=self.students["A"].id
        ).one()
        slots = {pp.subject_slot: pp for pp in participant.papers}
        self.assertEqual(slots["korean"].paper.subject_code, "korean")
        self.assertEqual(slots["math"].paper.subject_code, "math")
        self.assertEqual(slots["english"].paper.subject_code, "english")
        self.assertEqual(slots["inquiry_1"].paper.subject_code, "life_ethics")
        self.assertEqual(slots["inquiry_2"].paper.subject_code, "social_culture")
        for slot in smr.REQUIRED_SLOTS:
            self.assertEqual(slots[slot].status, "not_started")

    def test_student_b_gets_different_inquiry_papers(self):
        round_id = self._create_round_with_all_papers(self.programs["B"])
        participant = self.db.query(models.SprintMockExamParticipant).filter_by(
            mock_exam_round_id=round_id, student_id=self.students["B"].id
        ).one()
        slots = {pp.subject_slot: pp for pp in participant.papers}
        self.assertEqual(slots["inquiry_1"].paper.subject_code, "ethics_thought")
        self.assertEqual(slots["inquiry_2"].paper.subject_code, "east_asian_history")

    def test_student_c_needs_selection_for_inquiry_only(self):
        round_id = self._create_round_with_all_papers(self.programs["C"])
        participant = self.db.query(models.SprintMockExamParticipant).filter_by(
            mock_exam_round_id=round_id, student_id=self.students["C"].id
        ).one()
        slots = {pp.subject_slot: pp for pp in participant.papers}
        self.assertEqual(slots["korean"].status, "not_started")
        self.assertEqual(slots["math"].status, "not_started")
        self.assertEqual(slots["english"].status, "not_started")
        self.assertEqual(slots["inquiry_1"].status, "needs_selection")
        self.assertEqual(slots["inquiry_2"].status, "needs_selection")
        self.assertIsNone(slots["inquiry_1"].paper_id)
        self.assertEqual(participant.status, "not_started")

    def test_paper_added_after_round_creation_links_automatically(self):
        program = self.programs["A"]
        round_ = smr.admin_create_round(
            program.id,
            smr.RoundCreateIn(title="SPRINT 1회", exam_date=date(2026, 7, 26), submission_deadline_time="23:00"),
            self.db,
        )
        # 국어만 먼저 등록
        smr.admin_create_paper(round_["id"], smr.PaperCreateIn(subject_code="korean", question_count=10), self.db)
        participant = self.db.query(models.SprintMockExamParticipant).filter_by(
            mock_exam_round_id=round_["id"], student_id=self.students["A"].id
        ).one()
        slots = {pp.subject_slot: pp for pp in participant.papers}
        self.assertIsNone(slots["math"].paper_id)
        # 나중에 수학 추가 -> 기존(미제출) participant에 자동 연결
        smr.admin_create_paper(round_["id"], smr.PaperCreateIn(subject_code="math", question_count=10), self.db)
        self.db.refresh(participant)
        slots = {pp.subject_slot: pp for pp in participant.papers}
        self.assertEqual(slots["math"].paper.subject_code, "math")

    def test_round_no_auto_increments_and_rejects_duplicate(self):
        program = self.programs["A"]
        r1 = smr.admin_create_round(program.id, smr.RoundCreateIn(title="1회", exam_date=date(2026, 7, 26), submission_deadline_time="23:00"), self.db)
        r2 = smr.admin_create_round(program.id, smr.RoundCreateIn(title="2회", exam_date=date(2026, 8, 2), submission_deadline_time="23:00"), self.db)
        self.assertEqual(r1["round_no"], 1)
        self.assertEqual(r2["round_no"], 2)
        with self.assertRaises(HTTPException) as ctx:
            smr.admin_create_round(program.id, smr.RoundCreateIn(round_no=1, title="dup", exam_date=date(2026, 8, 9), submission_deadline_time="23:00"), self.db)
        self.assertEqual(ctx.exception.status_code, 400)


class CompletionAndSecurityTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = models.Student(name="학생A", phone="01011112222", grade="고3")
        self.other_student = models.Student(name="학생B", phone="01033334444", grade="고3")
        self.db.add_all([self.student, self.other_student])
        self.db.flush()
        self.program = models.SprintProgram(
            student_id=self.student.id, title="SPRINT", start_date=date(2026, 7, 1), end_date=date(2026, 9, 1),
            is_active=True, inquiry_subject_1="life_ethics", inquiry_subject_2="social_culture",
        )
        self.other_program = models.SprintProgram(
            student_id=self.other_student.id, title="SPRINT-B", start_date=date(2026, 7, 1), end_date=date(2026, 9, 1),
            is_active=True,
        )
        self.db.add_all([self.program, self.other_program])
        self.db.commit()
        round_ = smr.admin_create_round(self.program.id, smr.RoundCreateIn(title="1회", exam_date=date(2026, 7, 26), submission_deadline_time="23:00"), self.db)
        self.round_id = round_["id"]
        for code, count in [("korean", 4), ("math", 4), ("english", 4), ("life_ethics", 4), ("social_culture", 4)]:
            smr.admin_create_paper(self.round_id, smr.PaperCreateIn(subject_code=code, question_count=count), self.db)
        for code in ["korean", "math", "english", "life_ethics", "social_culture"]:
            paper = self.db.query(models.SprintMockExamPaper).filter_by(mock_exam_round_id=self.round_id, subject_code=code).one()
            smr.admin_set_questions(paper.id, smr.QuestionSetIn(questions=[
                smr.QuestionItemIn(question_no=i, correct_answer=1, score_points=25) for i in range(1, 5)
            ]), self.db)
        self.participant = self.db.query(models.SprintMockExamParticipant).filter_by(mock_exam_round_id=self.round_id, student_id=self.student.id).one()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _submit_slot(self, slot: str, answers=None):
        pp = next(p for p in self.participant.papers if p.subject_slot == slot)
        answers = answers or [smr.OmrAnswerItemIn(question_no=i, selected_answer=1) for i in range(1, 5)]
        smr.student_save_omr(pp.id, smr.OmrSaveIn(student_id=self.student.id, answers=answers), self.db)
        return smr.student_submit_paper(pp.id, smr.SubmitIn(student_id=self.student.id), self.db)

    def test_single_subject_submission_does_not_complete_round(self):
        self._submit_slot("korean")
        self.db.refresh(self.participant)
        self.assertEqual(self.participant.status, "in_progress")

    def test_all_five_required_subjects_completes_round(self):
        for slot in smr.REQUIRED_SLOTS:
            self._submit_slot(slot)
        self.db.refresh(self.participant)
        self.assertEqual(self.participant.status, "completed")
        self.assertIsNotNone(self.participant.completed_at)

    def test_cross_student_participant_paper_access_blocked(self):
        pp = next(p for p in self.participant.papers if p.subject_slot == "korean")
        with self.assertRaises(HTTPException) as ctx:
            smr.student_get_omr(pp.id, self.other_student.id, self.db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_cross_student_paper_file_access_blocked(self):
        paper = next(p for p in self.participant.papers if p.subject_slot == "east_asian_history" or p.subject_slot == "korean").paper
        with self.assertRaises(HTTPException) as ctx:
            smr.student_get_paper_file(paper.id, self.other_student.id, self.db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_submit_without_answer_key_rejected(self):
        empty_paper = models.SprintMockExamPaper(mock_exam_round_id=self.round_id, subject_group="korean", subject_code="korean2", title="x", question_count=1, total_score=1)
        # 정답 없이 제출 시도하는 상황을 별도 participant_paper로 시뮬레이션
        self.db.add(empty_paper)
        self.db.flush()
        pp = models.SprintMockExamParticipantPaper(participant_id=self.participant.id, paper_id=empty_paper.id, subject_slot="korean_extra", status="not_started")
        self.db.add(pp)
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            smr.student_submit_paper(pp.id, smr.SubmitIn(student_id=self.student.id), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_admin_can_cancel_unsubmitted_subject_assignment(self):
        pp = next(p for p in self.participant.papers if p.subject_slot == "korean")
        paper_id = pp.paper_id
        response = models.SprintMockExamParticipantResponse(participant_paper_id=pp.id, question_no=1, selected_answer=2)
        self.db.add(response)
        self.db.commit()

        result = smr.admin_delete_round_subject_assignment(pp.id, self.db)

        self.assertEqual(result["deleted_assignment_ids"], [pp.id])
        self.assertIsNone(self.db.get(models.SprintMockExamParticipantPaper, pp.id))
        self.assertIsNotNone(self.db.get(models.SprintMockExamPaper, paper_id))
        self.assertEqual(
            self.db.query(models.SprintMockExamParticipantResponse).filter_by(participant_paper_id=pp.id).count(),
            0,
        )

    def test_admin_cannot_cancel_submitted_subject_assignment(self):
        pp = next(p for p in self.participant.papers if p.subject_slot == "korean")
        self._submit_slot("korean")
        self.db.refresh(pp)

        with self.assertRaises(HTTPException) as ctx:
            smr.admin_delete_round_subject_assignment(pp.id, self.db)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIsNotNone(self.db.get(models.SprintMockExamParticipantPaper, pp.id))
        self.assertGreater(self.db.query(models.SprintMockExamParticipantResponse).filter_by(participant_paper_id=pp.id).count(), 0)

    def test_admin_round_student_cancel_keeps_submitted_and_deletes_unsubmitted(self):
        submitted_pp = next(p for p in self.participant.papers if p.subject_slot == "korean")
        draft_pp = next(p for p in self.participant.papers if p.subject_slot == "math")
        self._submit_slot("korean")
        self.db.add(models.SprintMockExamParticipantResponse(participant_paper_id=draft_pp.id, question_no=1, selected_answer=3))
        self.db.commit()

        result = smr.admin_delete_round_student_assignment(self.round_id, self.student.id, self.db)

        self.assertIn(submitted_pp.id, result["blocked_assignment_ids"])
        self.assertIn(draft_pp.id, result["deleted_assignment_ids"])
        self.assertIsNotNone(self.db.get(models.SprintMockExamParticipantPaper, submitted_pp.id))
        self.assertIsNone(self.db.get(models.SprintMockExamParticipantPaper, draft_pp.id))
        self.assertIsNotNone(self.db.get(models.SprintMockExamRound, self.round_id))


class InquirySubjectChangeTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = models.Student(name="학생", phone="01055556666", grade="고3")
        self.db.add(self.student)
        self.db.flush()
        self.program = models.SprintProgram(
            student_id=self.student.id, title="SPRINT", start_date=date(2026, 7, 1), end_date=date(2026, 9, 1),
            is_active=True, inquiry_subject_1="life_ethics", inquiry_subject_2="social_culture",
        )
        self.db.add(self.program)
        self.db.commit()
        round_ = smr.admin_create_round(self.program.id, smr.RoundCreateIn(title="1회", exam_date=date(2026, 7, 26), submission_deadline_time="23:00"), self.db)
        self.round_id = round_["id"]
        for code in ["life_ethics", "social_culture", "ethics_thought"]:
            smr.admin_create_paper(self.round_id, smr.PaperCreateIn(subject_code=code, question_count=2), self.db)
            paper = self.db.query(models.SprintMockExamPaper).filter_by(mock_exam_round_id=self.round_id, subject_code=code).one()
            smr.admin_set_questions(paper.id, smr.QuestionSetIn(questions=[
                smr.QuestionItemIn(question_no=1, correct_answer=1, score_points=50),
                smr.QuestionItemIn(question_no=2, correct_answer=1, score_points=50),
            ]), self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_change_before_submission_relinks_paper(self):
        smr.student_update_inquiry_subjects(
            smr.InquirySubjectsIn(student_id=self.student.id, inquiry_subject_1="ethics_thought", inquiry_subject_2="social_culture"),
            self.db,
        )
        self.db.refresh(self.program)
        participant = self.db.query(models.SprintMockExamParticipant).filter_by(mock_exam_round_id=self.round_id, student_id=self.student.id).one()
        slots = {pp.subject_slot: pp for pp in participant.papers}
        self.assertEqual(slots["inquiry_1"].paper.subject_code, "ethics_thought")

    def test_change_after_submission_blocked(self):
        participant = self.db.query(models.SprintMockExamParticipant).filter_by(mock_exam_round_id=self.round_id, student_id=self.student.id).one()
        pp = next(p for p in participant.papers if p.subject_slot == "inquiry_1")
        smr.student_save_omr(pp.id, smr.OmrSaveIn(student_id=self.student.id, answers=[
            smr.OmrAnswerItemIn(question_no=1, selected_answer=1), smr.OmrAnswerItemIn(question_no=2, selected_answer=1),
        ]), self.db)
        smr.student_submit_paper(pp.id, smr.SubmitIn(student_id=self.student.id), self.db)
        with self.assertRaises(HTTPException) as ctx:
            smr.student_update_inquiry_subjects(
                smr.InquirySubjectsIn(student_id=self.student.id, inquiry_subject_1="ethics_thought", inquiry_subject_2="social_culture"),
                self.db,
            )
        self.assertEqual(ctx.exception.status_code, 400)


class GradeCutTests(TestCase):
    def test_order_validation_rejects_non_decreasing(self):
        with self.assertRaises(ValueError):
            smr.GradeCutSetIn(grade_cuts=[
                smr.GradeCutItemIn(grade=1, minimum_score=80),
                smr.GradeCutItemIn(grade=2, minimum_score=84),
            ])

    def test_order_validation_accepts_strictly_decreasing(self):
        payload = smr.GradeCutSetIn(grade_cuts=[
            smr.GradeCutItemIn(grade=1, minimum_score=92),
            smr.GradeCutItemIn(grade=2, minimum_score=84),
            smr.GradeCutItemIn(grade=3, minimum_score=76),
        ])
        self.assertEqual(len(payload.grade_cuts), 3)

    def test_duplicate_grade_rejected(self):
        with self.assertRaises(ValueError):
            smr.GradeCutSetIn(grade_cuts=[
                smr.GradeCutItemIn(grade=1, minimum_score=92),
                smr.GradeCutItemIn(grade=1, minimum_score=84),
            ])


class GradeAnalysisTests(TestCase):
    def _grade_cuts(self, *pairs):
        return [type("GC", (), {"grade": g, "minimum_score": m})() for g, m in pairs]

    def test_section19_example_grade3_needs_3_points(self):
        cuts = self._grade_cuts((1, 92), (2, 84), (3, 76))
        pp = type("PP", (), {"raw_score": 81, "responses": [], "grade_cuts": None})()
        paper = type("Paper", (), {"grade_cuts": cuts, "questions": []})()
        result = smr.compute_grade_analysis(pp, paper)
        self.assertEqual(result["grade"], 3)
        self.assertEqual(result["target_grade"], 2)
        self.assertEqual(result["needed_score"], 3)

    def test_already_top_grade_has_no_target(self):
        cuts = self._grade_cuts((1, 92), (2, 84))
        pp = type("PP", (), {"raw_score": 95, "responses": [], "grade_cuts": None})()
        paper = type("Paper", (), {"grade_cuts": cuts, "questions": []})()
        result = smr.compute_grade_analysis(pp, paper)
        self.assertEqual(result["grade"], 1)
        self.assertIsNone(result["target_grade"])
        self.assertEqual(result["coaching_message"], "1등급을 달성했어요!")

    def test_no_grade_cuts_returns_none(self):
        pp = type("PP", (), {"raw_score": 81, "responses": [], "grade_cuts": None})()
        paper = type("Paper", (), {"grade_cuts": [], "questions": []})()
        self.assertIsNone(smr.compute_grade_analysis(pp, paper))

    def test_score_below_lowest_registered_cutoff_is_grade9(self):
        cuts = self._grade_cuts((1, 92), (2, 84), (3, 76))
        pp = type("PP", (), {"raw_score": 10, "responses": [], "grade_cuts": None})()
        paper = type("Paper", (), {"grade_cuts": cuts, "questions": []})()
        result = smr.compute_grade_analysis(pp, paper)
        self.assertEqual(result["grade"], 9)


class SuggestComboTests(TestCase):
    def test_example1_single_four_point_item(self):
        result = smr.suggest_next_grade_combo(4, [
            {"question_no": 1, "score_points": 4}, {"question_no": 2, "score_points": 3}, {"question_no": 3, "score_points": 2},
        ])
        self.assertEqual(result["suggested_point_values"], [4])
        self.assertEqual(result["minimum_question_count"], 1)
        message = smr.build_coaching_message(2, result["suggested_point_values"])
        self.assertEqual(message, "4점 문항 한 문제만 더 맞히면 2등급이에요!")

    def test_example2_two_two_point_items(self):
        result = smr.suggest_next_grade_combo(4, [
            {"question_no": 1, "score_points": 3}, {"question_no": 2, "score_points": 2}, {"question_no": 3, "score_points": 2},
        ])
        self.assertEqual(sorted(result["suggested_point_values"]), [2, 2])
        message = smr.build_coaching_message(2, result["suggested_point_values"])
        self.assertEqual(message, "2점 문항 두 문제만 더 맞히면 2등급이에요!")

    def test_example3_mixed_three_and_two(self):
        result = smr.suggest_next_grade_combo(5, [
            {"question_no": 1, "score_points": 3}, {"question_no": 2, "score_points": 2}, {"question_no": 3, "score_points": 2},
        ])
        self.assertEqual(sorted(result["suggested_point_values"]), [2, 3])
        message = smr.build_coaching_message(2, result["suggested_point_values"])
        self.assertEqual(message, "3점 문항과 2점 문항을 한 문제씩 더 맞히면 2등급이에요!")

    def test_example4_two_three_point_items(self):
        result = smr.suggest_next_grade_combo(6, [
            {"question_no": 1, "score_points": 3}, {"question_no": 2, "score_points": 3}, {"question_no": 3, "score_points": 2},
        ])
        self.assertEqual(sorted(result["suggested_point_values"]), [3, 3])
        message = smr.build_coaching_message(2, result["suggested_point_values"])
        self.assertEqual(message, "3점 문항 두 문제만 더 맞히면 2등급이에요!")

    def test_unreachable_even_with_all_wrong_items(self):
        result = smr.suggest_next_grade_combo(20, [{"question_no": 1, "score_points": 4}, {"question_no": 2, "score_points": 3}])
        self.assertFalse(result["reachable"])

    def test_needed_score_zero_or_negative_is_trivially_reachable(self):
        result = smr.suggest_next_grade_combo(0, [{"question_no": 1, "score_points": 4}])
        self.assertTrue(result["reachable"])
        self.assertEqual(result["minimum_question_count"], 0)


class MediaValidationTests(IsolatedAsyncioTestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.storage_dir = tempfile.mkdtemp()
        self._original_root = smr.STORAGE_ROOT
        smr.STORAGE_ROOT = Path(self.storage_dir)
        self.student = models.Student(name="학생", phone="01077778888", grade="고3")
        self.db.add(self.student)
        self.db.flush()
        self.program = models.SprintProgram(student_id=self.student.id, title="SPRINT", start_date=date(2026, 7, 1), end_date=date(2026, 9, 1), is_active=True)
        self.db.add(self.program)
        self.db.commit()
        round_ = smr.admin_create_round(self.program.id, smr.RoundCreateIn(title="1회", exam_date=date(2026, 7, 26), submission_deadline_time="23:00"), self.db)
        smr.admin_create_paper(round_["id"], smr.PaperCreateIn(subject_code="english", question_count=5), self.db)
        self.paper = self.db.query(models.SprintMockExamPaper).filter_by(mock_exam_round_id=round_["id"], subject_code="english").one()
        smr.admin_create_paper(round_["id"], smr.PaperCreateIn(subject_code="math", question_count=5), self.db)
        self.math_paper = self.db.query(models.SprintMockExamPaper).filter_by(mock_exam_round_id=round_["id"], subject_code="math").one()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        smr.STORAGE_ROOT = self._original_root
        shutil.rmtree(self.storage_dir, ignore_errors=True)

    async def test_pdf_upload_rejects_non_pdf(self):
        with self.assertRaises(HTTPException) as ctx:
            await smr.admin_upload_paper_file(self.paper.id, upload_file(b"not a pdf", "x.pdf"), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_pdf_upload_accepts_valid_pdf(self):
        result = await smr.admin_upload_paper_file(self.paper.id, upload_file(PDF_BYTES, "worksheet.pdf"), self.db)
        self.assertEqual(result["media_type"], "paper_pdf")

    async def test_mp3_upload_rejects_non_mp3(self):
        with self.assertRaises(HTTPException) as ctx:
            await smr.admin_upload_listening_audio(self.paper.id, upload_file(b"not mp3 data", "x.mp3"), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_mp3_upload_accepts_valid_mp3(self):
        result = await smr.admin_upload_listening_audio(self.paper.id, upload_file(MP3_BYTES, "listening.mp3"), self.db)
        self.assertEqual(result["media_type"], "listening_audio")

    async def test_mp3_upload_rejected_for_non_english_paper(self):
        with self.assertRaises(HTTPException) as ctx:
            await smr.admin_upload_listening_audio(self.math_paper.id, upload_file(MP3_BYTES, "listening.mp3"), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_empty_upload_rejected(self):
        with self.assertRaises(HTTPException):
            await smr.admin_upload_paper_file(self.paper.id, upload_file(b"", "empty.pdf"), self.db)


class RegradeTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = models.Student(name="학생", phone="01099990000", grade="고3")
        self.db.add(self.student)
        self.db.flush()
        self.program = models.SprintProgram(student_id=self.student.id, title="SPRINT", start_date=date(2026, 7, 1), end_date=date(2026, 9, 1), is_active=True)
        self.db.add(self.program)
        self.db.commit()
        round_ = smr.admin_create_round(self.program.id, smr.RoundCreateIn(title="1회", exam_date=date(2026, 7, 26), submission_deadline_time="23:00"), self.db)
        smr.admin_create_paper(round_["id"], smr.PaperCreateIn(subject_code="math", question_count=2), self.db)
        self.paper = self.db.query(models.SprintMockExamPaper).filter_by(mock_exam_round_id=round_["id"], subject_code="math").one()
        smr.admin_set_questions(self.paper.id, smr.QuestionSetIn(questions=[
            smr.QuestionItemIn(question_no=1, correct_answer=1, score_points=50),
            smr.QuestionItemIn(question_no=2, correct_answer=2, score_points=50),
        ]), self.db)
        self.participant = self.db.query(models.SprintMockExamParticipant).filter_by(student_id=self.student.id).one()
        self.pp = next(p for p in self.participant.papers if p.subject_slot == "math")
        smr.student_save_omr(self.pp.id, smr.OmrSaveIn(student_id=self.student.id, answers=[
            smr.OmrAnswerItemIn(question_no=1, selected_answer=1), smr.OmrAnswerItemIn(question_no=2, selected_answer=1),
        ]), self.db)
        smr.student_submit_paper(self.pp.id, smr.SubmitIn(student_id=self.student.id), self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_regrade_after_answer_key_correction(self):
        self.db.refresh(self.pp)
        self.assertEqual(self.pp.raw_score, 50)
        smr.admin_set_questions(self.paper.id, smr.QuestionSetIn(questions=[
            smr.QuestionItemIn(question_no=1, correct_answer=1, score_points=50),
            smr.QuestionItemIn(question_no=2, correct_answer=1, score_points=50),
        ]), self.db)
        self.db.refresh(self.pp)
        self.assertEqual(self.pp.raw_score, 100)
        logs = self.db.query(models.SprintMockExamParticipantScoreLog).filter_by(participant_paper_id=self.pp.id).all()
        self.assertEqual(len(logs), 1)
