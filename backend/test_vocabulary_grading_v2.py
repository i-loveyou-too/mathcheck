from datetime import date, datetime, timezone
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
from database import Base
from vocabulary import (
    GeminiBatchReviewIn,
    GradingActionIn,
    admin_gemini_batch_review,
    admin_update_manual_grading,
    create_session,
    grade_answer_for_question,
    is_answer_correct,
    save_grading_rule,
    student_result,
    student_wrong_notes,
    submit_session,
)
from vocabulary_gemini import GeminiReviewResult, _parse_gemini_payload, should_auto_apply_gemini


VOCAB_TABLES = [
    models.Student.__table__,
    models.Admin.__table__,
    models.VocabularyBank.__table__,
    models.VocabularyBankWord.__table__,
    models.VocabularyChallenge.__table__,
    models.VocabularyWord.__table__,
    models.VocabularyDailyAssignment.__table__,
    models.VocabularyTestSession.__table__,
    models.VocabularyTestQuestion.__table__,
    models.VocabularyTestAnswer.__table__,
    models.VocabularyWrongNote.__table__,
    models.VocabularyManualGradingLog.__table__,
    models.VocabularyGradingRule.__table__,
]


class VocabularyGradingV2Tests(TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine, tables=VOCAB_TABLES)
        self.db = sessionmaker(bind=self.engine)()
        self.admin = models.Admin(username="admin", password="x")
        self.student = models.Student(name="Student", phone="01010000000", grade="G1")
        self.db.add_all([self.admin, self.student])
        self.db.flush()
        self.challenge = models.VocabularyChallenge(
            name="Vocab",
            student_id=self.student.id,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 5),
            accumulation_type="all_previous",
            is_active=True,
        )
        self.db.add(self.challenge)
        self.db.flush()
        self.words = [
            models.VocabularyWord(
                challenge_id=self.challenge.id,
                english=english,
                normalized_english=english,
                accepted_answers=answers,
                order_index=index,
            )
            for index, (english, answers) in enumerate(
                [
                    ("organic", ["유기농의"]),
                    ("competitor", ["경쟁자"]),
                    ("cancel", ["취소하다"]),
                ],
                start=1,
            )
        ]
        self.db.add_all(self.words)
        self.db.flush()
        self.db.add_all(
            models.VocabularyDailyAssignment(
                challenge_id=self.challenge.id,
                assignment_date=date(2026, 8, 1),
                word_id=word.id,
            )
            for word in self.words
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _submitted_session(self, answers_by_word):
        session = create_session(self.db, self.challenge, date(2026, 8, 1), "main")
        questions = self.db.query(models.VocabularyTestQuestion).filter_by(session_id=session.id).all()
        for question in questions:
            self.db.add(
                models.VocabularyTestAnswer(
                    session_id=session.id,
                    question_id=question.id,
                    input_answer=answers_by_word.get(question.english_snapshot, ""),
                )
            )
        self.db.commit()
        submit_session(self.db, session)
        return session

    def _answer_for(self, session, english):
        question = self.db.query(models.VocabularyTestQuestion).filter_by(
            session_id=session.id,
            english_snapshot=english,
        ).one()
        return self.db.query(models.VocabularyTestAnswer).filter_by(question_id=question.id).one()

    def test_rule_based_grading_v2_cases(self):
        self.assertTrue(is_answer_correct(" 유기농의 ", ["유기농의"]))
        self.assertTrue(is_answer_correct("유기 농의", ["유기농의"]))
        self.assertTrue(is_answer_correct("경쟁쟈", ["경쟁자"]))
        self.assertFalse(is_answer_correct("불가능", ["가능"]))
        self.assertFalse(is_answer_correct("물", ["불"]))

    def test_teacher_accept_and_reject_memory_are_reused(self):
        session = create_session(self.db, self.challenge, date(2026, 8, 1), "main")
        question = self.db.query(models.VocabularyTestQuestion).filter_by(
            session_id=session.id,
            english_snapshot="competitor",
        ).one()
        save_grading_rule(self.db, question, "경쟁 상대", "ACCEPT")
        save_grading_rule(self.db, question, "싸움", "REJECT")
        self.db.commit()

        self.assertTrue(grade_answer_for_question(self.db, question, "경쟁 상대"))
        self.assertFalse(grade_answer_for_question(self.db, question, "싸움"))
        rule = self.db.query(models.VocabularyGradingRule).filter_by(normalized_student_answer="경쟁 상대").one()
        self.assertEqual(rule.use_count, 1)

    def test_manual_grading_saves_teacher_rule_and_updates_score(self):
        session = self._submitted_session({"organic": "자연적인", "competitor": "경쟁자", "cancel": "취소하다"})
        answer = self._answer_for(session, "organic")
        self.assertFalse(answer.is_correct)

        admin_update_manual_grading(
            session_id=session.id,
            answer_id=answer.id,
            payload=GradingActionIn(action="mark_correct"),
            db=self.db,
            admin=self.admin,
        )
        self.db.refresh(session)
        self.assertEqual(session.correct_count, 3)
        rule = self.db.query(models.VocabularyGradingRule).filter_by(normalized_student_answer="자연적인").one()
        self.assertEqual(rule.decision, "ACCEPT")
        self.assertEqual(rule.source, "TEACHER")

    def test_gemini_threshold_policy(self):
        self.assertEqual(should_auto_apply_gemini(GeminiReviewResult(1, "CORRECT", 0.91, "", "", [])), "correct")
        self.assertEqual(should_auto_apply_gemini(GeminiReviewResult(1, "ACCEPTABLE", 0.90, "", "", [])), "acceptable")
        self.assertEqual(should_auto_apply_gemini(GeminiReviewResult(1, "WRONG", 0.96, "", "", [])), "wrong")
        self.assertEqual(should_auto_apply_gemini(GeminiReviewResult(1, "REVIEW", 0.99, "", "", [])), "review")
        self.assertEqual(should_auto_apply_gemini(GeminiReviewResult(1, "CORRECT", 0.99, "", "", ["TOO_BROAD"])), "review")
        self.assertEqual(should_auto_apply_gemini(GeminiReviewResult(1, "CORRECT", 0.80, "", "", [])), "review")
        self.assertEqual(should_auto_apply_gemini(GeminiReviewResult(1, "ACCEPTABLE", 0.92, "", "", ["PART_OF_SPEECH_MISMATCH"])), "acceptable")
        self.assertEqual(should_auto_apply_gemini(GeminiReviewResult(1, "WRONG", 0.97, "", "", ["PART_OF_SPEECH_MISMATCH"])), "wrong")
        self.assertEqual(should_auto_apply_gemini(GeminiReviewResult(1, "WRONG", 0.99, "", "", ["PARTIAL_OVERLAP"])), "review")

    def test_gemini_parser_preserves_non_blocking_part_of_speech_flag(self):
        parsed = _parse_gemini_payload(
            '{"results":[{"review_id":1,"verdict":"ACCEPTABLE","confidence":0.91,'
            '"normalized_answer":"rejection-as-verb","reason":"same core meaning",'
            '"risk_flags":["PART_OF_SPEECH_MISMATCH"]}]}'
        )

        self.assertEqual(parsed[0].risk_flags, ["PART_OF_SPEECH_MISMATCH"])
        self.assertEqual(should_auto_apply_gemini(parsed[0]), "acceptable")

    def test_gemini_batch_auto_applies_without_saving_memory(self):
        session = self._submitted_session({"organic": "자연적인", "competitor": "경쟁 상대", "cancel": "무효화"})
        organic = self._answer_for(session, "organic")
        competitor = self._answer_for(session, "competitor")
        cancel = self._answer_for(session, "cancel")

        def fake_review(items):
            ids = {item["word"]: item["review_id"] for item in items}
            return [
                GeminiReviewResult(ids["organic"], "REVIEW", 0.75, "자연적인", "사람 검토 필요", []),
                GeminiReviewResult(ids["competitor"], "ACCEPTABLE", 0.95, "경쟁 상대", "경쟁 상대는 경쟁자와 의미상 동등", []),
                GeminiReviewResult(ids["cancel"], "WRONG", 0.96, "무효화", "취소하다와 의미가 다름", []),
            ]

        with patch("vocabulary.review_vocabulary_answers_with_gemini", side_effect=fake_review):
            result = admin_gemini_batch_review(GeminiBatchReviewIn(), db=self.db, admin=self.admin)

        self.assertEqual(result["requested_count"], 3)
        self.assertEqual(result["processed_count"], 3)
        self.assertEqual(result["auto_acceptable_count"], 1)
        self.assertEqual(result["wrong_count"], 1)
        self.assertEqual(result["human_review_count"], 1)
        self.db.refresh(session)
        self.db.refresh(organic)
        self.db.refresh(competitor)
        self.db.refresh(cancel)
        self.assertEqual(session.correct_count, 1)
        self.assertIsNone(organic.manual_is_correct)
        self.assertTrue(competitor.manual_is_correct)
        self.assertFalse(cancel.manual_is_correct)
        self.assertEqual(self.db.query(models.VocabularyGradingRule).count(), 0)

    def test_gemini_does_not_overwrite_teacher_decision(self):
        session = self._submitted_session({"organic": "자연적인", "competitor": "경쟁 상대", "cancel": "무효화"})
        competitor = self._answer_for(session, "competitor")
        competitor.manual_is_correct = True
        self.db.commit()

        with patch("vocabulary.review_vocabulary_answers_with_gemini") as fake_review:
            result = admin_gemini_batch_review(GeminiBatchReviewIn(review_ids=[competitor.id]), db=self.db, admin=self.admin)

        fake_review.assert_not_called()
        self.assertEqual(result["requested_count"], 0)
        self.db.refresh(competitor)
        self.assertTrue(competitor.manual_is_correct)
        self.assertIsNone(competitor.gemini_verdict)

    def test_gemini_chunk_failure_keeps_existing_data(self):
        session = self._submitted_session({"organic": "자연적인", "competitor": "경쟁 상대", "cancel": "무효화"})

        with patch("vocabulary.review_vocabulary_answers_with_gemini", side_effect=HTTPException(status_code=429, detail="quota")):
            result = admin_gemini_batch_review(GeminiBatchReviewIn(), db=self.db, admin=self.admin)

        self.assertEqual(result["failed_count"], 3)
        self.db.refresh(session)
        self.assertEqual(session.correct_count, 0)
        self.assertEqual(self.db.query(models.VocabularyTestAnswer).filter(models.VocabularyTestAnswer.gemini_reviewed_at.isnot(None)).count(), 0)

    def test_blank_answers_are_excluded_from_gemini(self):
        session = self._submitted_session({"organic": "", "competitor": "경쟁 상대", "cancel": "무효화"})

        def fake_review(items):
            self.assertEqual({item["word"] for item in items}, {"competitor", "cancel"})
            return [GeminiReviewResult(item["review_id"], "REVIEW", 0.5, "", "검토 필요", []) for item in items]

        with patch("vocabulary.review_vocabulary_answers_with_gemini", side_effect=fake_review):
            result = admin_gemini_batch_review(GeminiBatchReviewIn(), db=self.db, admin=self.admin)

        self.assertEqual(result["requested_count"], 2)
        blank = self._answer_for(session, "organic")
        self.assertIsNone(blank.gemini_reviewed_at)

    def test_student_result_without_gemini_keeps_existing_shape(self):
        session = self._submitted_session({"organic": "different"})

        payload = student_result(session.id, self.student.id, db=self.db)
        organic = next(item for item in payload["questions"] if item["english"] == "organic")

        self.assertFalse(organic["is_correct"])
        self.assertNotIn("gemini_explanation", organic)

    def test_student_result_shows_only_safe_gemini_explanation(self):
        session = self._submitted_session({"organic": "different"})
        answer = self._answer_for(session, "organic")
        answer.gemini_reviewed_at = datetime.now(timezone.utc)
        answer.gemini_verdict = "WRONG"
        answer.gemini_confidence = 96
        answer.gemini_reason = "학생 답안은 정답 의미와 다릅니다."
        answer.gemini_risk_flags = ["PARTIAL_OVERLAP"]
        answer.gemini_model = "gemini-test"
        answer.gemini_auto_applied = True
        answer.manual_is_correct = False
        self.db.commit()

        payload = student_result(session.id, self.student.id, db=self.db)
        organic = next(item for item in payload["questions"] if item["english"] == "organic")

        self.assertEqual(organic["gemini_explanation"], "학생 답안은 정답 의미와 다릅니다.")
        self.assertNotIn("gemini_confidence", organic)
        self.assertNotIn("gemini_risk_flags", organic)
        self.assertNotIn("gemini_model", organic)
        self.assertNotIn("gemini_verdict", organic)

    def test_student_result_hides_gemini_explanation_when_human_review_is_needed(self):
        session = self._submitted_session({"organic": "different"})
        answer = self._answer_for(session, "organic")
        answer.gemini_reviewed_at = datetime.now(timezone.utc)
        answer.gemini_verdict = "REVIEW"
        answer.gemini_reason = "사람 검토가 필요합니다."
        answer.manual_is_correct = None
        self.db.commit()

        payload = student_result(session.id, self.student.id, db=self.db)
        organic = next(item for item in payload["questions"] if item["english"] == "organic")

        self.assertNotIn("gemini_explanation", organic)

    def test_student_result_hides_gemini_explanation_on_teacher_conflict(self):
        session = self._submitted_session({"organic": "different"})
        answer = self._answer_for(session, "organic")
        answer.gemini_reviewed_at = datetime.now(timezone.utc)
        answer.gemini_verdict = "ACCEPTABLE"
        answer.gemini_reason = "정답으로 인정 가능한 표현입니다."
        answer.gemini_auto_applied = False
        answer.manual_is_correct = False
        self.db.commit()

        payload = student_result(session.id, self.student.id, db=self.db)
        organic = next(item for item in payload["questions"] if item["english"] == "organic")

        self.assertNotIn("gemini_explanation", organic)

    def test_wrong_notes_show_safe_gemini_explanation_for_final_wrong(self):
        answers = {word.english: word.accepted_answers[0] for word in self.words}
        answers["organic"] = "different"
        session = self._submitted_session(answers)
        answer = self._answer_for(session, "organic")
        answer.gemini_reviewed_at = datetime.now(timezone.utc)
        answer.gemini_verdict = "WRONG"
        answer.gemini_reason = "정답과 다른 뜻입니다."
        answer.gemini_auto_applied = True
        answer.manual_is_correct = False
        self.db.commit()

        notes = student_wrong_notes(student_id=self.student.id, status="unresolved", db=self.db)

        self.assertEqual(len(notes), 1)
        self.assertEqual(notes[0]["gemini_explanation"], "정답과 다른 뜻입니다.")
        self.assertNotIn("gemini_confidence", notes[0])
        self.assertNotIn("gemini_risk_flags", notes[0])
        self.assertNotIn("gemini_model", notes[0])

    def test_gemini_final_correct_is_removed_from_wrong_notes_and_matches_score(self):
        answers = {word.english: word.accepted_answers[0] for word in self.words}
        answers["organic"] = "different"
        session = self._submitted_session(answers)
        answer = self._answer_for(session, "organic")

        def fake_review(items):
            return [
                GeminiReviewResult(
                    items[0]["review_id"],
                    "ACCEPTABLE",
                    0.95,
                    "different",
                    "정답으로 인정 가능한 표현입니다.",
                    [],
                )
            ]

        with patch("vocabulary.review_vocabulary_answers_with_gemini", side_effect=fake_review):
            admin_gemini_batch_review(GeminiBatchReviewIn(review_ids=[answer.id]), db=self.db, admin=self.admin)

        self.db.refresh(session)
        self.assertEqual(session.correct_count, 3)
        notes = student_wrong_notes(student_id=self.student.id, status="unresolved", db=self.db)
        payload = student_result(session.id, self.student.id, db=self.db)
        organic = next(item for item in payload["questions"] if item["english"] == "organic")

        self.assertEqual(notes, [])
        self.assertTrue(organic["is_correct"])
        self.assertEqual(payload["correct_count"], 3)


class GeminiAutoApplyPolicyRegressionTests(TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine, tables=VOCAB_TABLES)
        self.db = sessionmaker(bind=self.engine)()
        self.admin = models.Admin(username="policy-admin", password="x")
        self.student = models.Student(name="Policy Student", phone="01020000000", grade="G1")
        self.db.add_all([self.admin, self.student])
        self.db.flush()
        self.challenge = models.VocabularyChallenge(
            name="Policy Vocab",
            student_id=self.student.id,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 5),
            accumulation_type="all_previous",
            is_active=True,
        )
        self.db.add(self.challenge)
        self.db.flush()
        self.word = models.VocabularyWord(
            challenge_id=self.challenge.id,
            english="rejection",
            normalized_english="rejection",
            accepted_answers=["rejection-meaning"],
            order_index=1,
        )
        self.db.add(self.word)
        self.db.flush()
        self.db.add(
            models.VocabularyDailyAssignment(
                challenge_id=self.challenge.id,
                assignment_date=date(2026, 8, 1),
                word_id=self.word.id,
            )
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_rejection_verb_form_with_part_of_speech_flag_is_auto_acceptable(self):
        session = create_session(self.db, self.challenge, date(2026, 8, 1), "main")
        question = self.db.query(models.VocabularyTestQuestion).filter_by(session_id=session.id).one()
        self.db.add(
            models.VocabularyTestAnswer(
                session_id=session.id,
                question_id=question.id,
                input_answer="rejection-as-verb",
            )
        )
        self.db.commit()
        submit_session(self.db, session)
        answer = self.db.query(models.VocabularyTestAnswer).filter_by(question_id=question.id).one()

        def fake_review(items):
            return [
                GeminiReviewResult(
                    items[0]["review_id"],
                    "ACCEPTABLE",
                    0.91,
                    "rejection-as-verb",
                    "same core meaning despite part-of-speech difference",
                    ["PART_OF_SPEECH_MISMATCH"],
                )
            ]

        with patch("vocabulary.review_vocabulary_answers_with_gemini", side_effect=fake_review):
            result = admin_gemini_batch_review(GeminiBatchReviewIn(review_ids=[answer.id]), db=self.db, admin=self.admin)

        self.assertEqual(result["auto_acceptable_count"], 1)
        self.db.refresh(answer)
        self.assertTrue(answer.manual_is_correct)
        self.assertTrue(answer.gemini_auto_applied)
        self.assertEqual(answer.gemini_verdict, "ACCEPTABLE")
