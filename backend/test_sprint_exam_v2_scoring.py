from __future__ import annotations

from pathlib import Path
import sys
from unittest import TestCase

sys.path.insert(0, str(Path(__file__).resolve().parent))

import models
from sprint_exam_v2_scoring_service import (
    _recommend_question_combination,
    _score_summary_from_details,
)
from sprint_exam_v2_scoring_validation import (
    SprintExamV2ScoringDomainError,
    calculate_grade,
    compare_answer_values,
    normalize_answer_values,
)


class SprintExamV2ScoringValidationTests(TestCase):
    def test_recommended_question_combination_preserves_priority_policy(self):
        exact = _recommend_question_combination(5, [4, 4, 3, 2, 2])
        self.assertEqual(exact["recommended_question_combination"], [{"score": 3, "count": 1}, {"score": 2, "count": 1}])
        self.assertEqual(exact["recommended_total_score"], 5)
        self.assertEqual(exact["recommended_question_count"], 2)

        single = _recommend_question_combination(4, [4, 3, 2, 2])
        self.assertEqual(single["recommended_question_combination"], [{"score": 4, "count": 1}])

        minimum_overage = _recommend_question_combination(5, [4, 4, 2, 2])
        self.assertEqual(minimum_overage["recommended_question_combination"], [{"score": 4, "count": 1}, {"score": 2, "count": 1}])
        self.assertEqual(minimum_overage["recommended_total_score"], 6)

    def test_recommended_question_combination_handles_many_equal_candidates(self):
        result = _recommend_question_combination(20, [3] * 45)
        self.assertEqual(result["recommended_question_combination"], [{"score": 3, "count": 7}])
        self.assertEqual(result["recommended_total_score"], 21)
        self.assertEqual(result["recommended_question_count"], 7)

    def test_admin_summary_accepts_ungraded_submitted_responses(self):
        summary = _score_summary_from_details(
            [
                {
                    "submitted_answer": ["2"],
                    "is_correct": None,
                    "awarded_points": None,
                    "max_points": 3,
                },
                {
                    "submitted_answer": [],
                    "is_correct": False,
                    "awarded_points": 0,
                    "max_points": 2,
                },
            ]
        )

        self.assertEqual(summary["answered_count"], 1)
        self.assertEqual(summary["correct_count"], 0)
        self.assertEqual(summary["incorrect_count"], 0)
        self.assertEqual(summary["unanswered_count"], 1)
        self.assertEqual(summary["raw_score"], 0)
        self.assertEqual(summary["max_score"], 5)

    def test_choice_answer_normalization_accepts_strings_and_numbers(self):
        self.assertEqual(normalize_answer_values("choice", "2"), ["2"])
        self.assertEqual(normalize_answer_values("choice", 2), ["2"])
        self.assertEqual(normalize_answer_values("choice", [" 2 "]), ["2"])

    def test_multiple_choice_order_and_duplicates_do_not_matter(self):
        self.assertEqual(normalize_answer_values("multiple_choice", ["3", "1", "1"]), ["1", "3"])
        self.assertTrue(compare_answer_values("multiple_choice", ["3", "1"], ["1", "3"]))

    def test_short_answer_uses_minimal_decimal_normalization(self):
        self.assertEqual(normalize_answer_values("short_answer", [" 3.0 "]), ["3"])
        self.assertEqual(normalize_answer_values("short_answer", ["0.50"]), ["0.5"])
        self.assertFalse(compare_answer_values("short_answer", ["1/2"], ["0.5"]))

    def test_short_answer_policy_is_explicitly_pinned(self):
        self.assertTrue(compare_answer_values("short_answer", ["3"], ["3.0"]))
        self.assertTrue(compare_answer_values("short_answer", ["01"], ["1"]))
        self.assertTrue(compare_answer_values("short_answer", ["-0"], ["0"]))
        self.assertTrue(compare_answer_values("short_answer", [" 3 "], ["3"]))
        self.assertFalse(compare_answer_values("short_answer", ["0.5"], ["1/2"]))
        self.assertFalse(compare_answer_values("short_answer", [""], ["1"]))
        self.assertTrue(compare_answer_values("short_answer", ["abc"], ["abc"]))
        self.assertEqual(normalize_answer_values("short_answer", ["not-a-decimal"]), ["not-a-decimal"])

    def test_empty_answer_is_incorrect(self):
        self.assertEqual(normalize_answer_values("choice", []), [])
        self.assertFalse(compare_answer_values("choice", [], ["2"]))

    def test_invalid_choice_answer_is_rejected(self):
        with self.assertRaises(SprintExamV2ScoringDomainError) as captured:
            normalize_answer_values("choice", ["6"])
        self.assertEqual(captured.exception.code, "INVALID_CORRECT_ANSWER")

    def test_unsupported_question_type_is_rejected(self):
        with self.assertRaises(SprintExamV2ScoringDomainError) as captured:
            normalize_answer_values("essay", ["answer"])
        self.assertEqual(captured.exception.code, "UNSUPPORTED_QUESTION_TYPE")

    def test_grade_calculation_uses_best_matching_cut(self):
        cuts = [
            models.SprintExamV2GradeCut(grade=3, min_score=75, cut_type="raw_score_min"),
            models.SprintExamV2GradeCut(grade=1, min_score=92, cut_type="raw_score_min"),
            models.SprintExamV2GradeCut(grade=2, min_score=84, cut_type="raw_score_min"),
        ]
        self.assertEqual(calculate_grade(86, cuts), 2)
        self.assertEqual(calculate_grade(92, cuts), 1)
        self.assertIsNone(calculate_grade(70, cuts))

    def test_absolute_band_uses_same_min_score_semantics(self):
        cuts = [models.SprintExamV2GradeCut(grade=1, min_score=90, cut_type="absolute_band")]
        self.assertEqual(calculate_grade(90, cuts), 1)

    def test_grade_boundary_and_missing_cut_policy(self):
        cuts = [
            models.SprintExamV2GradeCut(grade=2, min_score=80, cut_type="raw_score_min"),
            models.SprintExamV2GradeCut(grade=1, min_score=90, cut_type="raw_score_min"),
        ]
        self.assertEqual(calculate_grade(90, cuts), 1)
        self.assertEqual(calculate_grade(89, cuts), 2)
        self.assertIsNone(calculate_grade(79, cuts))
        self.assertIsNone(calculate_grade(100, []))
