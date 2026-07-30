from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from unittest import TestCase
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import models
import sprint_exam_v2_attempt_service as attempt_service


class SprintExamV2AttemptUnitTests(TestCase):
    def test_answer_normalization_accepts_empty_and_choice_values(self):
        question = models.SprintExamV2Question(id=1, answer_type="choice")

        self.assertEqual(attempt_service._normalize_answer([], question), [])
        self.assertEqual(attempt_service._normalize_answer(None, question), [])
        self.assertEqual(attempt_service._normalize_answer([" 2 "], question), ["2"])

    def test_answer_normalization_rejects_invalid_choice_value(self):
        question = models.SprintExamV2Question(id=1, answer_type="choice")

        with self.assertRaises(attempt_service.SprintExamV2AttemptDomainError) as captured:
            attempt_service._normalize_answer(["6"], question)
        self.assertEqual(captured.exception.code, "INVALID_RESPONSE_FORMAT")

    def test_short_answer_normalization_keeps_strings(self):
        question = models.SprintExamV2Question(id=1, answer_type="short_answer")

        self.assertEqual(attempt_service._normalize_answer([" 17 ", 18], question), ["17", "18"])

    def test_startable_time_window(self):
        assignment = models.SprintExamV2Assignment(
            id=1,
            status="assigned",
            available_from=datetime.now(timezone.utc) - timedelta(minutes=1),
            submission_deadline_at=datetime.now(timezone.utc) + timedelta(minutes=1),
        )
        assignment.papers = [models.SprintExamV2AssignmentPaper(id=1, paper_id=1)]

        attempt_service._validate_assignment_startable(assignment, now=datetime.now(timezone.utc))

    def test_startable_rejects_expired_assignment(self):
        assignment = models.SprintExamV2Assignment(
            id=1,
            status="assigned",
            submission_deadline_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
        assignment.papers = [models.SprintExamV2AssignmentPaper(id=1, paper_id=1)]

        with self.assertRaises(attempt_service.SprintExamV2AttemptConflictError) as captured:
            attempt_service._validate_assignment_startable(assignment, now=datetime.now(timezone.utc))
        self.assertEqual(captured.exception.code, "ASSIGNMENT_EXPIRED")

    def test_start_remaining_ignores_legacy_attempt_limit(self):
        assignment = models.SprintExamV2Assignment(id=1, attempt_limit=3)
        now = datetime.now(timezone.utc)

        with patch.object(
            attempt_service.retake_approval_service,
            "start_eligibility",
            return_value={"base_attempt_count": 1, "available_retake_approval_count": 0},
        ):
            remaining = attempt_service._start_remaining(None, assignment, now=now)

        self.assertEqual(remaining["base_attempts"], 0)
