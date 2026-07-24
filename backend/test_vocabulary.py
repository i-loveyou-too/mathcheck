from datetime import date
from unittest import TestCase

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
from database import Base
from vocabulary import (
    assigned_word_ids,
    bank_day_sequence_for_learning_day,
    create_session,
    cumulative_bank_day_sequence,
    get_session_for_student,
    is_answer_correct,
    normalize_text,
    preview_bank_xlsx,
    session_print_html,
    submit_session,
    vocabulary_day_info,
)
from pathlib import Path


class VocabularyTests(TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.student = models.Student(name="테스트 학생", phone="01000000000", grade="중1")
        self.other_student = models.Student(name="다른 학생", phone="01000000001", grade="중1")
        self.db.add_all([self.student, self.other_student])
        self.db.flush()
        self.challenge = models.VocabularyChallenge(
            name="방학 챌린지",
            student_id=self.student.id,
            start_date=date(2026, 7, 20),
            end_date=date(2026, 7, 24),
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
            for index, (english, answers) in enumerate([
                ("apple", ["사과"]),
                ("run", ["달리다", "운영하다"]),
                ("book", ["책"]),
            ], start=1)
        ]
        self.db.add_all(self.words)
        self.db.flush()
        self.db.add_all([
            models.VocabularyDailyAssignment(challenge_id=self.challenge.id, assignment_date=date(2026, 7, 20), word_id=self.words[0].id),
            models.VocabularyDailyAssignment(challenge_id=self.challenge.id, assignment_date=date(2026, 7, 21), word_id=self.words[1].id),
            models.VocabularyDailyAssignment(challenge_id=self.challenge.id, assignment_date=date(2026, 7, 21), word_id=self.words[0].id),
            models.VocabularyDailyAssignment(challenge_id=self.challenge.id, assignment_date=date(2026, 7, 22), word_id=self.words[2].id),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_normalization_is_predictable(self):
        self.assertEqual(normalize_text("  APPLE   PIE "), "apple pie")

    def test_accumulation_modes_and_duplicate_removal(self):
        target = date(2026, 7, 21)
        self.assertEqual(assigned_word_ids(self.db, self.challenge, target), {self.words[0].id, self.words[1].id})
        self.challenge.accumulation_type = "new_only"
        self.assertEqual(assigned_word_ids(self.db, self.challenge, target), {self.words[0].id, self.words[1].id})
        self.challenge.accumulation_type = "recent_days"
        self.challenge.recent_days = 1
        self.assertEqual(assigned_word_ids(self.db, self.challenge, target), {self.words[0].id, self.words[1].id})

    def test_session_is_reused_and_other_student_is_rejected(self):
        session = create_session(self.db, self.challenge, date(2026, 7, 21), "main")
        duplicate = create_session(self.db, self.challenge, date(2026, 7, 21), "main")
        self.assertEqual(session.id, duplicate.id)
        self.assertEqual(session.total_count, 2)
        with self.assertRaises(HTTPException) as context:
            get_session_for_student(self.db, session.id, self.other_student.id)
        self.assertEqual(context.exception.status_code, 403)

    def test_grading_wrong_note_and_review_mastery(self):
        session = create_session(self.db, self.challenge, date(2026, 7, 21), "main")
        questions = self.db.query(models.VocabularyTestQuestion).filter_by(session_id=session.id).all()
        for question in questions:
            answer = " 운영하다 " if question.english_snapshot == "run" else "틀린 답"
            self.db.add(models.VocabularyTestAnswer(session_id=session.id, question_id=question.id, input_answer=answer))
        self.db.commit()
        submit_session(self.db, session)
        self.assertEqual(session.correct_count, 1)
        with self.assertRaises(HTTPException) as context:
            submit_session(self.db, session)
        self.assertEqual(context.exception.status_code, 400)
        note = self.db.query(models.VocabularyWrongNote).one()
        self.assertEqual(note.status, "unresolved")

        review = create_session(self.db, self.challenge, date(2026, 7, 22), "review")
        question = self.db.query(models.VocabularyTestQuestion).filter_by(session_id=review.id).one()
        self.db.add(models.VocabularyTestAnswer(session_id=review.id, question_id=question.id, input_answer=" 사과 "))
        self.db.commit()
        submit_session(self.db, review)
        self.db.refresh(note)
        self.assertEqual(note.status, "mastered")

    def test_actual_word_master_xlsx_preview(self):
        preview = preview_bank_xlsx(Path("..") / "storage" / "word_master_2000.xlsx")
        self.assertEqual(preview["source_format"], "word_master_flat_sheet")
        self.assertEqual(preview["total_rows"], 2000)
        self.assertEqual(preview["total_words"], 2000)
        self.assertEqual(preview["total_days"], 50)
        self.assertEqual(preview["words_per_day"], 40)
        self.assertEqual(preview["default_daily_test_question_count"], 100)
        self.assertEqual(preview["day_counts"][1], 40)
        self.assertEqual(preview["day_counts"][50], 40)
        self.assertEqual(preview["errors"], [])
        self.assertEqual(preview["sample_words"][0]["english"], "provide")
        self.assertIn("공급하다", preview["sample_words"][0]["accepted_meanings"])

    def test_actual_ebs_xlsx_preview_uses_only_english_to_korean_day_sheets(self):
        preview = preview_bank_xlsx(Path("..") / "storage" / "2027_EBS_VOCA_1800.xlsx")
        self.assertEqual(preview["source_format"], "ebs_day_sheets")
        self.assertEqual(preview["total_rows"], 1800)
        self.assertEqual(preview["total_words"], 1800)
        self.assertEqual(preview["total_days"], 60)
        self.assertEqual(preview["words_per_day"], 30)
        self.assertEqual(preview["default_daily_test_question_count"], 100)
        self.assertEqual(preview["used_sheet_count"], 60)
        self.assertEqual(preview["ignored_sheet_count"], 60)
        self.assertEqual(preview["day_counts"][1], 30)
        self.assertEqual(preview["day_counts"][60], 30)
        self.assertEqual(preview["duplicate_words"], [])
        self.assertEqual(preview["errors"], [])
        first = preview["sample_words"][0]
        self.assertEqual(first["english"], "enthusiastic")
        self.assertEqual(first["raw_meaning"], "a. 열정적인")
        self.assertEqual(first["accepted_meanings"], ["열정적인"])

    def test_ebs_part_of_speech_is_not_required_in_answers(self):
        from vocabulary import parse_ebs_meanings

        self.assertEqual(parse_ebs_meanings("n. 재산, 소유물, 속성")[0], ["재산", "소유물", "속성"])
        self.assertEqual(parse_ebs_meanings("v. 보호하다, 가리다 n. 방패")[0], ["보호하다", "가리다", "방패"])
        self.assertEqual(parse_ebs_meanings("n. 교장 a. 주요한")[0], ["교장", "주요한"])
        self.assertEqual(parse_ebs_meanings("v. (유통 기간이) 끝나다, 만료되다")[0], ["끝나다", "만료되다"])

    def import_preview_bank(self, filename: str) -> models.VocabularyBank:
        preview = preview_bank_xlsx(Path("..") / "storage" / filename)
        self.assertEqual(preview["errors"], [])
        bank = models.VocabularyBank(
            title=preview["title"],
            total_words=preview["total_words"],
            total_days=preview["total_days"],
            words_per_day=preview["words_per_day"],
            default_daily_test_question_count=preview["default_daily_test_question_count"],
            source_filename=preview["source_filename"],
            source_format=preview["source_format"],
            is_active=True,
        )
        self.db.add(bank)
        self.db.flush()
        self.db.add_all(models.VocabularyBankWord(bank_id=bank.id, **item) for item in preview["words"])
        self.db.flush()
        return bank

    def make_bank_challenge(self, bank: models.VocabularyBank, student_id: int, name: str) -> models.VocabularyChallenge:
        challenge = models.VocabularyChallenge(
            name=name,
            student_id=student_id,
            start_date=date(2026, 7, 1),
            end_date=date(2026, 9, 30),
            accumulation_type="fixed_cumulative",
            source_type="word_bank",
            word_bank_id=bank.id,
            daily_new_word_count=bank.words_per_day,
            daily_test_question_count=bank.default_daily_test_question_count,
            start_bank_day=1,
            bank_day_direction="ascending",
            bank_days_per_learning_day=3,
            max_question_count=100,
            is_active=True,
        )
        self.db.add(challenge)
        self.db.flush()
        return challenge

    def test_two_word_banks_are_saved_independently_and_use_bank_specific_counts(self):
        word_master = self.import_preview_bank("word_master_2000.xlsx")
        ebs = self.import_preview_bank("2027_EBS_VOCA_1800.xlsx")
        self.db.commit()

        self.assertEqual(word_master.total_words, 2000)
        self.assertEqual(word_master.total_days, 50)
        self.assertEqual(word_master.words_per_day, 40)
        self.assertEqual(ebs.total_words, 1800)
        self.assertEqual(ebs.total_days, 60)
        self.assertEqual(ebs.words_per_day, 30)
        self.assertEqual(self.db.query(models.VocabularyBankWord).filter_by(bank_id=word_master.id).count(), 2000)
        self.assertEqual(self.db.query(models.VocabularyBankWord).filter_by(bank_id=ebs.id).count(), 1800)

        wm_challenge = self.make_bank_challenge(word_master, self.other_student.id, "WM")
        ebs_challenge = self.make_bank_challenge(ebs, self.other_student.id, "EBS")
        self.db.commit()

        self.assertEqual(create_session(self.db, wm_challenge, date(2026, 7, 1), "main").total_count, 100)
        self.assertEqual(create_session(self.db, ebs_challenge, date(2026, 7, 1), "main").total_count, 90)
        self.assertEqual(create_session(self.db, wm_challenge, date(2026, 7, 2), "main").total_count, 100)
        self.assertEqual(create_session(self.db, ebs_challenge, date(2026, 7, 2), "main").total_count, 100)
        self.assertEqual(create_session(self.db, wm_challenge, date(2026, 7, 3), "main").total_count, 100)
        self.assertEqual(create_session(self.db, ebs_challenge, date(2026, 7, 4), "main").total_count, 100)

    def test_word_bank_fixed_cumulative_counts(self):
        bank = models.VocabularyBank(title="Word Master Test", total_days=50, words_per_day=40)
        self.db.add(bank)
        self.db.flush()
        for index in range(1, 2001):
            day_no = ((index - 1) // 40) + 1
            day_order = ((index - 1) % 40) + 1
            self.db.add(models.VocabularyBankWord(
                bank_id=bank.id,
                day_no=day_no,
                order_index=index,
                day_order=day_order,
                english=f"word{index}",
                normalized_english=f"word{index}",
                accepted_meanings=[f"meaning{index}"],
                raw_meaning=f"meaning{index}",
            ))
        challenge = models.VocabularyChallenge(
            name="Word Bank Challenge",
            student_id=self.other_student.id,
            start_date=date(2026, 7, 1),
            end_date=date(2026, 9, 1),
            accumulation_type="fixed_cumulative",
            source_type="word_bank",
            word_bank_id=bank.id,
            daily_new_word_count=40,
            daily_test_question_count=100,
            start_bank_day=1,
            bank_day_direction="ascending",
            bank_days_per_learning_day=3,
            max_question_count=100,
            is_active=True,
        )
        self.db.add(challenge)
        self.db.commit()

        day1 = create_session(self.db, challenge, date(2026, 7, 1), "main")
        day2 = create_session(self.db, challenge, date(2026, 7, 2), "main")
        day3 = create_session(self.db, challenge, date(2026, 7, 3), "main")
        day51 = create_session(self.db, challenge, date(2026, 8, 20), "main")

        self.assertEqual(day1.total_count, 100)
        self.assertEqual(day2.total_count, 100)
        self.assertEqual(day3.total_count, 100)
        self.assertEqual(day51.total_count, 100)

    def test_word_bank_operating_policy_ascending_three_days_and_fixed_session_pdf(self):
        ebs = self.import_preview_bank("2027_EBS_VOCA_1800.xlsx")
        challenge = self.make_bank_challenge(ebs, self.other_student.id, "EBS ascending")
        self.db.commit()

        self.assertEqual(bank_day_sequence_for_learning_day(challenge, ebs, date(2026, 7, 1)), [1, 2, 3])
        self.assertEqual(cumulative_bank_day_sequence(challenge, ebs, date(2026, 7, 2)), [1, 2, 3, 4, 5, 6])
        info1 = vocabulary_day_info(self.db, challenge, date(2026, 7, 1))
        info2 = vocabulary_day_info(self.db, challenge, date(2026, 7, 2))
        self.assertEqual(info1["cumulative_pool_count"], 90)
        self.assertEqual(info1["question_count"], 90)
        self.assertEqual(info2["cumulative_pool_count"], 180)
        self.assertEqual(info2["question_count"], 100)

        session = create_session(self.db, challenge, date(2026, 7, 2), "main")
        duplicate = create_session(self.db, challenge, date(2026, 7, 2), "main")
        self.assertEqual(session.id, duplicate.id)
        self.assertEqual(session.total_count, 100)
        question_ids = [row.bank_word_id for row in self.db.query(models.VocabularyTestQuestion).filter_by(session_id=session.id).order_by(models.VocabularyTestQuestion.order_index).all()]
        duplicate_ids = [row.bank_word_id for row in self.db.query(models.VocabularyTestQuestion).filter_by(session_id=duplicate.id).order_by(models.VocabularyTestQuestion.order_index).all()]
        self.assertEqual(question_ids, duplicate_ids)
        self.assertEqual(len(question_ids), len(set(question_ids)))
        paper = session_print_html(self.db, session, include_answers=False)
        answer_key = session_print_html(self.db, session, include_answers=True)
        self.assertIn("TEST PAPER", paper)
        self.assertIn("ANSWER KEY", answer_key)
        self.assertIn("DAY 1 ~ DAY 6", paper)

    def test_existing_word_bank_draft_session_expands_after_day_count_change(self):
        ebs = self.import_preview_bank("2027_EBS_VOCA_1800.xlsx")
        challenge = self.make_bank_challenge(ebs, self.other_student.id, "EBS resize")
        challenge.bank_days_per_learning_day = 2
        self.db.commit()

        session = create_session(self.db, challenge, date(2026, 7, 1), "main")
        self.assertEqual(session.total_count, 60)

        challenge.bank_days_per_learning_day = 3
        self.db.commit()
        resized = create_session(self.db, challenge, date(2026, 7, 1), "main")

        self.assertEqual(resized.id, session.id)
        self.assertEqual(resized.total_count, 90)
        self.assertEqual(
            self.db.query(models.VocabularyTestQuestion).filter_by(session_id=session.id).count(),
            90,
        )

    def test_word_master_descending_three_bank_days(self):
        bank = models.VocabularyBank(title="WM Desc", total_words=2000, total_days=50, words_per_day=40, default_daily_test_question_count=100)
        self.db.add(bank)
        self.db.flush()
        for index in range(1, 2001):
            day_no = ((index - 1) // 40) + 1
            day_order = ((index - 1) % 40) + 1
            self.db.add(models.VocabularyBankWord(
                bank_id=bank.id,
                day_no=day_no,
                order_index=index,
                day_order=day_order,
                english=f"wm{index}",
                normalized_english=f"wm{index}",
                accepted_meanings=[f"meaning{index}"],
                raw_meaning=f"meaning{index}",
            ))
        challenge = models.VocabularyChallenge(
            name="WM desc challenge",
            student_id=self.other_student.id,
            start_date=date(2026, 7, 1),
            end_date=date(2026, 9, 1),
            accumulation_type="fixed_cumulative",
            source_type="word_bank",
            word_bank_id=bank.id,
            daily_new_word_count=40,
            daily_test_question_count=100,
            start_bank_day=50,
            bank_day_direction="descending",
            bank_days_per_learning_day=3,
            max_question_count=100,
            is_active=True,
        )
        self.db.add(challenge)
        self.db.commit()

        self.assertEqual(bank_day_sequence_for_learning_day(challenge, bank, date(2026, 7, 1)), [50, 49, 48])
        self.assertEqual(bank_day_sequence_for_learning_day(challenge, bank, date(2026, 7, 2)), [47, 46, 45])
        self.assertEqual(cumulative_bank_day_sequence(challenge, bank, date(2026, 7, 2)), [50, 49, 48, 47, 46, 45])
        day1 = create_session(self.db, challenge, date(2026, 7, 1), "main")
        day2 = create_session(self.db, challenge, date(2026, 7, 2), "main")
        self.assertEqual(day1.total_count, 100)


class AnswerGradingTests(TestCase):
    """기존 단답 정답 채점(정확히 일치)이 깨지지 않으면서, 다중 뜻/구분자/괄호/조사/경미한
    오타까지 정답 처리하되 완전히 다른 답은 오답으로 남는지 검증한다."""

    def test_exact_match_still_works(self):
        self.assertTrue(is_answer_correct("사과", ["사과"]))

    def test_case_and_whitespace_normalization_still_works(self):
        self.assertTrue(is_answer_correct("  Apple ", ["apple"]))

    def test_multiple_separate_accepted_answers_any_one_matches(self):
        self.assertTrue(is_answer_correct("능금", ["사과", "능금"]))

    def test_single_answer_with_comma_separated_meanings(self):
        self.assertTrue(is_answer_correct("달리다", ["뛰다, 달리다"]))

    def test_single_answer_with_slash_separated_meanings(self):
        self.assertTrue(is_answer_correct("능금", ["사과/능금"]))

    def test_single_answer_with_middle_dot_separated_meanings(self):
        self.assertTrue(is_answer_correct("능금", ["사과ㆍ능금"]))

    def test_parenthetical_note_ignored(self):
        self.assertTrue(is_answer_correct("사과", ["사과(과일)"]))
        self.assertTrue(is_answer_correct("사과", ["사과 (fruit)"]))

    def test_common_particle_suffix_tolerated(self):
        self.assertTrue(is_answer_correct("사과를", ["사과"]))
        self.assertTrue(is_answer_correct("사과", ["사과는"]))

    def test_minor_typo_accepted_via_similarity(self):
        self.assertTrue(is_answer_correct("컴퓨타", ["컴퓨터"]))

    def test_completely_different_answer_rejected(self):
        self.assertFalse(is_answer_correct("바나나", ["사과"]))

    def test_empty_answer_rejected(self):
        self.assertFalse(is_answer_correct("", ["사과"]))
        self.assertFalse(is_answer_correct("   ", ["사과"]))

    def test_short_single_character_words_not_fuzzy_matched(self):
        # 한 글자 단어는 유사도 오탐 위험이 커서 정확/정규화 일치만 인정한다.
        self.assertFalse(is_answer_correct("불", ["물"]))
        self.assertTrue(is_answer_correct("물", ["물"]))

    def test_unrelated_short_answer_not_falsely_matched_by_similarity(self):
        self.assertFalse(is_answer_correct("고양이", ["강아지"]))
