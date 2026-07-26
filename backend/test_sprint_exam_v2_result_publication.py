from __future__ import annotations

from pathlib import Path
import sys
from unittest import TestCase
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import models
import sprint_exam_v2_scoring
from sprint_exam_v2_result_publication_service import computed_publication_status, sanitize_student_result
from sprint_exam_v2_result_publication_validation import (
    DEFAULT_PUBLICATION_OPTIONS,
    SprintExamV2PublicationDomainError,
    normalize_publication_options,
)


class SprintExamV2ResultPublicationUnitTests(TestCase):
    def test_student_result_route_does_not_touch_session(self):
        request = object()
        db = object()
        student = type("StudentStub", (), {"id": 17})()
        expected = {"result_status": "published"}

        with (
            patch.object(
                sprint_exam_v2_scoring.student_auth,
                "get_current_student_from_cookie",
                return_value=student,
            ) as get_student,
            patch.object(
                sprint_exam_v2_scoring.scoring_service,
                "get_student_result",
                return_value=expected,
            ) as get_result,
        ):
            result = sprint_exam_v2_scoring.student_get_sprint_exam_v2_result(9, request, db)

        self.assertEqual(result, expected)
        get_student.assert_called_once_with(db, request, touch=False)
        get_result.assert_called_once_with(db, 9, student.id)

    def test_default_options_and_computed_statuses(self):
        self.assertEqual(
            normalize_publication_options({}),
            DEFAULT_PUBLICATION_OPTIONS,
        )
        self.assertEqual(computed_publication_status(models.SprintExamV2Attempt(status="started")), "not_scored")
        self.assertEqual(computed_publication_status(models.SprintExamV2Attempt(status="submitted")), "not_scored")
        self.assertEqual(computed_publication_status(models.SprintExamV2Attempt(status="voided")), "voided")
        self.assertEqual(computed_publication_status(models.SprintExamV2Attempt(status="scored")), "unpublished")
        attempt = models.SprintExamV2Attempt(status="scored")
        attempt.result_publication = models.SprintExamV2ResultPublication(status="published")
        self.assertEqual(computed_publication_status(attempt), "published")

    def test_option_dependencies_are_pinned(self):
        with self.assertRaises(SprintExamV2PublicationDomainError) as all_false:
            normalize_publication_options(
                {
                    "show_total_score": False,
                    "show_grade": False,
                    "show_score_groups": False,
                    "show_question_results": False,
                    "show_correct_answers": False,
                    "show_explanations": False,
                }
            )
        self.assertEqual(all_false.exception.code, "INVALID_PUBLICATION_OPTIONS")

        with self.assertRaises(SprintExamV2PublicationDomainError) as correct_without_questions:
            normalize_publication_options({"show_question_results": False, "show_correct_answers": True})
        self.assertEqual(correct_without_questions.exception.path, "show_correct_answers")

        with self.assertRaises(SprintExamV2PublicationDomainError) as explanations_without_questions:
            normalize_publication_options({"show_question_results": False, "show_explanations": True})
        self.assertEqual(explanations_without_questions.exception.path, "show_explanations")

    def test_student_sanitizer_removes_forbidden_keys_recursively(self):
        publication = models.SprintExamV2ResultPublication(
            status="published",
            show_total_score=False,
            show_grade=False,
            show_score_groups=False,
            show_question_results=False,
            show_correct_answers=False,
            show_explanations=False,
        )
        payload = {
            "summary": {"raw_score": 10, "max_score": 20, "grade_cuts": [{"min_score": 10}]},
            "scores": [{"grade": 1, "score_logs": [{"previous_score_snapshot": {}}]}],
            "questions": [
                {
                    "is_correct": True,
                    "awarded_points": 2,
                    "correct_answers": ["2"],
                    "explanation": "hidden",
                    "nested": [{"answer_key": ["2"], "parser_diagnostics": {"x": 1}}],
                }
            ],
            "published_by_admin_id": 1,
        }
        sanitized = sanitize_student_result(payload, publication)
        self.assertEqual(sanitized["result_status"], "published")
        for key in [
            "summary",
            "scores",
            "questions",
            "raw_score",
            "max_score",
            "grade",
            "grade_cuts",
            "min_score",
            "score_logs",
            "previous_score_snapshot",
            "is_correct",
            "awarded_points",
            "correct_answers",
            "answer_key",
            "explanation",
            "parser_diagnostics",
            "published_by_admin_id",
        ]:
            self._assert_key_absent_recursive(sanitized, key)

    def test_student_sanitizer_can_show_correct_answers_only_with_question_results(self):
        publication = models.SprintExamV2ResultPublication(
            status="published",
            show_total_score=True,
            show_grade=True,
            show_score_groups=True,
            show_question_results=True,
            show_correct_answers=True,
            show_explanations=False,
        )
        payload = {"questions": [{"correct_answers": ["2"], "explanation": "hidden"}], "summary": {"raw_score": 2}}
        sanitized = sanitize_student_result(payload, publication)
        self.assertIn("correct_answers", sanitized["questions"][0])
        self.assertNotIn("explanation", sanitized["questions"][0])

    def test_student_sanitizer_supports_grade_without_score_group_scores(self):
        publication = models.SprintExamV2ResultPublication(
            status="published",
            show_total_score=False,
            show_grade=True,
            show_score_groups=False,
            show_question_results=False,
            show_correct_answers=False,
            show_explanations=False,
        )
        payload = {
            "scores": [
                {
                    "score_group_id": 1,
                    "score_group_code": "korean_total",
                    "score_group_name": "국어",
                    "raw_score": 92,
                    "max_score": 100,
                    "grade": 1,
                }
            ]
        }
        sanitized = sanitize_student_result(payload, publication)
        self.assertEqual(sanitized["grades"], [{"score_group_code": "korean_total", "score_group_name": "국어", "grade": 1}])
        self.assertNotIn("scores", sanitized)
        self._assert_key_absent_recursive(sanitized, "raw_score")
        self._assert_key_absent_recursive(sanitized, "max_score")

    def _assert_key_absent_recursive(self, payload, forbidden_key):
        if isinstance(payload, dict):
            self.assertNotIn(forbidden_key, payload)
            for value in payload.values():
                self._assert_key_absent_recursive(value, forbidden_key)
        elif isinstance(payload, list):
            for item in payload:
                self._assert_key_absent_recursive(item, forbidden_key)
