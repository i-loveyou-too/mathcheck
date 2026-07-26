from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from unittest import TestCase

sys.path.insert(0, str(Path(__file__).resolve().parent))

import models
import sprint_exam_v2_retake_approval_service as retake_service


class SprintExamV2RetakeApprovalUnitTests(TestCase):
    def test_computed_status_values(self):
        now = datetime.now(timezone.utc)
        available = models.SprintExamV2RetakeApproval(status="approved", expires_at=now + timedelta(minutes=1))
        expired = models.SprintExamV2RetakeApproval(status="approved", expires_at=now - timedelta(seconds=1))
        cancelled = models.SprintExamV2RetakeApproval(status="cancelled")
        used = models.SprintExamV2RetakeApproval(status="approved", used_at=now)

        self.assertEqual(retake_service.compute_approval_status(available, now=now), "available")
        self.assertEqual(retake_service.compute_approval_status(expired, now=now), "expired")
        self.assertEqual(retake_service.compute_approval_status(cancelled, now=now), "cancelled")
        self.assertEqual(retake_service.compute_approval_status(used, now=now), "used")

    def test_expiry_boundary_is_available_at_exact_time(self):
        now = datetime.now(timezone.utc)
        approval = models.SprintExamV2RetakeApproval(status="approved", expires_at=now)

        self.assertEqual(retake_service.compute_approval_status(approval, now=now), "available")

    def test_active_attempt_counts_exclude_voided_and_split_approval_attempts(self):
        assignment = models.SprintExamV2Assignment(attempt_limit=1)
        assignment.attempts = [
            models.SprintExamV2Attempt(status="voided", retake_approval_id=None),
            models.SprintExamV2Attempt(status="submitted", retake_approval_id=None),
            models.SprintExamV2Attempt(status="scored", retake_approval_id=10),
            models.SprintExamV2Attempt(status="voided", retake_approval_id=11),
        ]

        self.assertEqual(
            retake_service.active_attempt_counts(assignment),
            {"base_attempt_count": 1, "approval_attempt_count": 1},
        )
