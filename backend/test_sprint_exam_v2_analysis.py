from __future__ import annotations

from datetime import date
from pathlib import Path
import sys
from unittest import TestCase

sys.path.insert(0, str(Path(__file__).resolve().parent))

import models
from sprint_exam_v2_analysis_service import _weakness_analysis


def make_attempt(
    attempt_id: int,
    exam_title: str,
    exam_date: date,
    paper: models.SprintExamV2AssignmentPaper,
    questions: list[models.SprintExamV2Question],
    wrong_question_ids: set[int],
) -> models.SprintExamV2Attempt:
    exam_paper = models.SprintExamV2Paper(id=paper.paper_id)
    exam_paper.questions = questions
    exam = models.SprintExamV2(id=attempt_id, title=exam_title, exam_date=exam_date)
    exam.papers = [exam_paper]
    assignment = models.SprintExamV2Assignment(id=attempt_id, student_id=1)
    assignment.exam = exam
    assignment.papers = [paper]
    responses = []
    for question in questions:
        responses.append(
            models.SprintExamV2Response(
                question_id=question.id,
                answer_values=["1"],
                is_correct=question.id not in wrong_question_ids,
            )
        )
    attempt = models.SprintExamV2Attempt(id=attempt_id, assignment_id=attempt_id, status="scored")
    attempt.assignment = assignment
    attempt.responses = responses
    return attempt


def make_paper(
    paper_id: int,
    *,
    subject_code: str,
    subject_name: str,
    score_group_code: str,
    score_group_name: str,
    role: str = "standalone",
) -> models.SprintExamV2AssignmentPaper:
    return models.SprintExamV2AssignmentPaper(
        paper_id=paper_id,
        score_group_id=paper_id,
        subject_code_snapshot=subject_code,
        subject_name_snapshot=subject_name,
        paper_role_snapshot=role,
        score_group_code_snapshot=score_group_code,
        score_group_name_snapshot=score_group_name,
    )


def make_questions(paper_id: int, numbers: list[int]) -> list[models.SprintExamV2Question]:
    return [
        models.SprintExamV2Question(id=paper_id * 100 + number, paper_id=paper_id, question_no=number, points=2)
        for number in numbers
    ]


class SprintExamV2AnalysisTests(TestCase):
    def test_english_repeated_blanks_become_priority_item(self):
        first_paper = make_paper(
            1,
            subject_code="english",
            subject_name="영어",
            score_group_code="english_total",
            score_group_name="영어",
        )
        second_paper = make_paper(
            11,
            subject_code="english",
            subject_name="영어",
            score_group_code="english_total",
            score_group_name="영어",
        )
        attempts = [
            make_attempt(1, "1회", date(2026, 7, 1), first_paper, make_questions(1, [31, 32, 36]), {131, 136}),
            make_attempt(2, "2회", date(2026, 7, 15), second_paper, make_questions(11, [31, 32, 36]), {1131, 1132}),
        ]

        top = _weakness_analysis(attempts)["priority_items"][0]

        self.assertEqual(top["subject_area"], "english")
        self.assertEqual(top["part_name"], "빈칸")
        self.assertEqual(top["wrong_question_numbers"], [31, 32])
        self.assertEqual(top["status_label"], "보완 필요")
        self.assertEqual(top["repeated_question_count"], 1)
        self.assertEqual(
            top["question_wrong_counts"],
            [{"question_no": 31, "wrong_count": 2}, {"question_no": 32, "wrong_count": 1}],
        )

    def test_english_grammar_counts_three_wrong_attempts(self):
        attempts = []
        for index, paper_id in enumerate([4, 5, 6], start=1):
            paper = make_paper(
                paper_id,
                subject_code="english",
                subject_name="영어",
                score_group_code="english_total",
                score_group_name="영어",
            )
            attempts.append(
                make_attempt(
                    index,
                    f"{index}회",
                    date(2026, 7, index),
                    paper,
                    make_questions(paper_id, [29]),
                    {paper_id * 100 + 29},
                )
            )

        item = _weakness_analysis(attempts)["priority_items"][0]

        self.assertEqual(item["part_name"], "어법")
        self.assertEqual(item["question_wrong_counts"], [{"question_no": 29, "wrong_count": 3}])

    def test_korean_common_ranges_follow_literature_then_reading(self):
        paper = make_paper(
            2,
            subject_code="korean_common",
            subject_name="국어 공통",
            score_group_code="korean_total",
            score_group_name="국어",
            role="common",
        )
        questions = make_questions(2, [3, 7, 19])
        attempts = [make_attempt(1, "1회", date(2026, 7, 1), paper, questions, {203, 207, 219})]

        items = {item["part_name"]: item for item in _weakness_analysis(attempts)["priority_items"]}

        self.assertEqual(items["문학"]["wrong_question_numbers"], [3, 7])
        self.assertEqual(items["독서"]["wrong_question_numbers"], [19])

    def test_korean_elective_uses_paper_metadata_not_question_number(self):
        paper = make_paper(
            7,
            subject_code="korean_speech_writing",
            subject_name="화법과 작문",
            score_group_code="korean_total",
            score_group_name="국어",
            role="elective",
        )
        item = _weakness_analysis(
            [make_attempt(1, "1회", date(2026, 7, 1), paper, make_questions(7, [1, 2]), {701, 702})]
        )["priority_items"][0]

        self.assertEqual(item["part_name"], "화법과 작문")
        self.assertNotEqual(item["part_name"], "문학")

    def test_math_killer_questions_are_separated_from_weakness_priority(self):
        paper = make_paper(
            3,
            subject_code="math_common",
            subject_name="수학 공통",
            score_group_code="math_total",
            score_group_name="수학",
            role="common",
        )
        questions = make_questions(3, [14, 15, 20])
        attempts = [make_attempt(1, "1회", date(2026, 7, 1), paper, questions, {314, 315, 320})]

        analysis = _weakness_analysis(attempts)

        self.assertEqual(analysis["priority_items"][0]["part_name"], "공통 반복 오답")
        self.assertEqual(analysis["priority_items"][0]["wrong_question_numbers"], [20])
        self.assertEqual(analysis["high_difficulty_items"][0]["part_name"], "고난도 문항")
        self.assertEqual(analysis["high_difficulty_items"][0]["wrong_question_numbers"], [14, 15])

    def test_math_elective_uses_paper_metadata(self):
        paper = make_paper(
            9,
            subject_code="math_probability_statistics",
            subject_name="확률과 통계",
            score_group_code="math_total",
            score_group_name="수학",
            role="elective",
        )
        item = _weakness_analysis(
            [make_attempt(1, "1회", date(2026, 7, 1), paper, make_questions(9, [23, 24]), {923, 924})]
        )["priority_items"][0]

        self.assertEqual(item["part_name"], "확률과 통계")

    def test_inquiry_wrong_answers_are_excluded_from_weak_parts(self):
        paper = make_paper(
            8,
            subject_code="social_culture",
            subject_name="사회문화",
            score_group_code="social_culture_total",
            score_group_name="사회문화",
            role="inquiry_slot",
        )
        analysis = _weakness_analysis(
            [make_attempt(1, "1회", date(2026, 7, 1), paper, make_questions(8, [1, 2]), {801, 802})]
        )

        self.assertEqual(analysis["priority_items"], [])
        self.assertEqual(analysis["high_difficulty_items"], [])
