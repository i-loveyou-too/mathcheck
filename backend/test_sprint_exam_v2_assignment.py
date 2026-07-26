from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path
import sys
from unittest import TestCase

sys.path.insert(0, str(Path(__file__).resolve().parent))

import models
import sprint_exam_v2_assignment_service as assignment_service
from sprint_exam_v2_assignment_validation import (
    SprintExamV2AssignmentDomainError,
    normalize_student_subject_selection,
    resolve_assignment_papers,
)


def paper(subject_code: str, subject_name: str, role: str, order: int = 0, slot: str | None = None):
    return models.SprintExamV2Paper(
        subject_code=subject_code,
        subject_name=subject_name,
        paper_role=role,
        source_order=order,
        slot=slot,
        total_points=10,
        question_count=1,
    )


def group(code: str, area: str, aggregation: str, papers):
    score_group = models.SprintExamV2ScoreGroup(
        score_group_code=code,
        score_group_name=code,
        subject_area=area,
        aggregation_type=aggregation,
        display_order=0,
    )
    score_group.papers = papers
    for item in papers:
        item.score_group = score_group
    return score_group


class SprintExamV2AssignmentValidationTests(TestCase):
    def test_student_subject_selection_normalizes_known_values(self):
        student = models.Student(
            id=1,
            name="A",
            phone="1",
            grade="고3",
            korean_elective="언어와 매체",
            math_elective="미적분",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="사회문화",
        )

        self.assertEqual(
            normalize_student_subject_selection(student),
            {
                "korean": "korean_language_media",
                "math": "math_calculus",
                "inquiry_1": "life_ethics",
                "inquiry_2": "social_culture",
            },
        )

    def test_resolve_assignment_papers_uses_student_profile(self):
        student = models.Student(
            id=1,
            name="A",
            phone="1",
            grade="고3",
            korean_elective="언어와 매체",
            math_elective="미적분",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        exam = models.SprintExamV2(title="E", exam_date=date(2026, 9, 3))
        exam.score_groups = [
            group(
                "korean_total",
                "korean",
                "sum",
                [
                    paper("korean_common", "국어 공통", "common"),
                    paper("korean_language_media", "언어와 매체", "elective", 1),
                    paper("korean_speech_writing", "화법과 작문", "elective", 2),
                ],
            ),
            group("english_total", "english", "standalone", [paper("english", "영어", "standalone")]),
            group("life_ethics_total", "inquiry", "standalone", [paper("life_ethics", "생활과 윤리", "inquiry_slot", slot="inquiry_1")]),
            group("social_culture_total", "inquiry", "standalone", [paper("social_culture", "사회문화", "inquiry_slot", slot="inquiry_2")]),
            group("east_asian_history_total", "inquiry", "standalone", [paper("east_asian_history", "동아시아사", "inquiry_slot", slot="inquiry_2")]),
        ]

        resolved, selections = resolve_assignment_papers(exam, student)

        self.assertEqual([item.subject_code for item in resolved], ["korean_common", "korean_language_media", "english", "life_ethics", "social_culture"])
        self.assertEqual(selections["korean"], "korean_language_media")

    def test_missing_required_elective_raises_domain_error(self):
        student = models.Student(id=1, name="A", phone="1", grade="고3")
        exam = models.SprintExamV2(title="E")
        exam.score_groups = [
            group(
                "korean_total",
                "korean",
                "sum",
                [paper("korean_common", "국어 공통", "common"), paper("korean_language_media", "언어와 매체", "elective")],
            )
        ]

        with self.assertRaises(SprintExamV2AssignmentDomainError) as captured:
            resolve_assignment_papers(exam, student)
        self.assertEqual(captured.exception.code, "STUDENT_KOREAN_ELECTIVE_MISSING")

    def test_override_selects_elective_for_sum_group(self):
        student = models.Student(id=1, name="A", phone="1", grade="고3", korean_elective="언어와 매체")
        exam = models.SprintExamV2(title="E")
        exam.score_groups = [
            group(
                "korean_total",
                "korean",
                "sum",
                [
                    paper("korean_common", "국어 공통", "common"),
                    paper("korean_language_media", "언어와 매체", "elective"),
                    paper("korean_speech_writing", "화법과 작문", "elective"),
                ],
            )
        ]

        resolved, _ = resolve_assignment_papers(exam, student, overrides={"korean_total": "korean_speech_writing"})

        self.assertEqual([item.subject_code for item in resolved], ["korean_common", "korean_speech_writing"])

    def test_student_attempt_payload_is_minimal(self):
        attempt = models.SprintExamV2Attempt(
            id=10,
            assignment_id=99,
            attempt_no=2,
            status="scored",
            started_at=datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc),
            submitted_at=datetime(2026, 7, 1, 10, 0, tzinfo=timezone.utc),
            scored_at=datetime(2026, 7, 1, 11, 0, tzinfo=timezone.utc),
            retake_approval_id=123,
        )

        payload = assignment_service._attempt_payload(attempt)

        self.assertEqual(
            set(payload or {}),
            {"id", "attempt_no", "status", "started_at", "submitted_at", "scored_at"},
        )
        self.assertNotIn("assignment_id", payload)
        self.assertNotIn("retake_approval_id", payload)

    def test_student_attempt_selection_policy(self):
        assignment = models.SprintExamV2Assignment(id=1)
        self.assertIsNone(assignment_service._active_attempt(assignment))
        self.assertIsNone(assignment_service._latest_attempt(assignment))

        scored_one = models.SprintExamV2Attempt(id=10, attempt_no=1, status="scored")
        started_two = models.SprintExamV2Attempt(id=11, attempt_no=2, status="started")
        assignment.attempts = [started_two, scored_one]
        self.assertEqual(assignment_service._active_attempt(assignment), started_two)
        self.assertEqual(assignment_service._latest_attempt(assignment), started_two)

        submitted_two = models.SprintExamV2Attempt(id=12, attempt_no=2, status="submitted")
        assignment.attempts = [scored_one, submitted_two]
        self.assertIsNone(assignment_service._active_attempt(assignment))
        self.assertEqual(assignment_service._latest_attempt(assignment), submitted_two)

        voided_two = models.SprintExamV2Attempt(id=13, attempt_no=2, status="voided")
        assignment.attempts = [scored_one, voided_two]
        self.assertIsNone(assignment_service._active_attempt(assignment))
        self.assertEqual(assignment_service._latest_attempt(assignment), voided_two)

    def test_student_attempt_summaries_are_sorted_and_do_not_leak_sensitive_keys(self):
        attempts = [
            models.SprintExamV2Attempt(id=12, assignment_id=1, attempt_no=2, status="voided", retake_approval_id=9),
            models.SprintExamV2Attempt(id=10, assignment_id=1, attempt_no=1, status="scored"),
            models.SprintExamV2Attempt(id=11, assignment_id=1, attempt_no=2, status="started", retake_approval_id=8),
        ]
        ordered = sorted(attempts, key=lambda attempt: (attempt.attempt_no or 0, attempt.id or 0))
        payload = {
            "active_attempt": assignment_service._attempt_payload(attempts[2]),
            "latest_attempt": assignment_service._attempt_payload(assignment_service._latest_attempt(models.SprintExamV2Assignment(attempts=attempts))),
            "attempts": [assignment_service._attempt_payload(attempt) for attempt in ordered],
        }

        self.assertEqual([item["id"] for item in payload["attempts"]], [10, 11, 12])
        self.assertEqual(payload["active_attempt"]["id"], 11)
        self.assertEqual(payload["latest_attempt"]["id"], 12)
        for forbidden_key in [
            "assignment_id",
            "retake_approval_id",
            "answer_values",
            "response",
            "scores",
            "score_logs",
            "correct_answers",
            "publication",
            "published_by_admin_id",
        ]:
            self._assert_key_absent_recursive(payload, forbidden_key)

    def _assert_key_absent_recursive(self, payload, forbidden_key):
        if isinstance(payload, dict):
            self.assertNotIn(forbidden_key, payload)
            for value in payload.values():
                self._assert_key_absent_recursive(value, forbidden_key)
        elif isinstance(payload, list):
            for item in payload:
                self._assert_key_absent_recursive(item, forbidden_key)
