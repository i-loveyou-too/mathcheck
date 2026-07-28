from __future__ import annotations

from pathlib import Path
import sys
from unittest import TestCase
from unittest.mock import patch

from sqlalchemy.exc import IntegrityError

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sprint_exam_v2
import sprint_exam_v2_service
from sprint_exam_v2_service import SprintExamV2ConflictError
from sprint_exam_v2_validation import SprintExamV2DomainError, normalize_exam_structure_payload


VALID_PAYLOAD = {
    "exam": {
        "title": "2026 9월 모의고사",
        "exam_date": "2026-09-03",
        "source_label": "9월 평가원",
        "description": "선택 입력",
        "metadata": {"source": "parser-preview"},
    },
    "score_groups": [
        {
            "score_group_code": "korean_total",
            "score_group_name": "국어",
            "subject_area": "korean",
            "aggregation_type": "sum",
            "display_order": 0,
            "metadata": {},
            "grade_cuts": [{"grade": 1, "min_score": 92, "cut_type": "raw_score_min", "metadata": {}}],
            "papers": [
                {
                    "subject_code": "korean_common",
                    "subject_name": "국어 공통",
                    "paper_role": "common",
                    "slot": None,
                    "display_order": 0,
                    "metadata": {},
                    "questions": [
                        {"question_no": 1, "question_type": "choice", "correct_answers": ["2"], "score": 2, "metadata": {}},
                        {"question_no": 2, "question_type": "short_answer", "correct_answers": ["17"], "score": 3, "metadata": {}},
                    ],
                    "question_count": 999,
                    "paper_max_score": 999,
                },
                {
                    "subject_code": "korean_language_media",
                    "subject_name": "언어와 매체",
                    "paper_role": "elective",
                    "slot": None,
                    "display_order": 1,
                    "metadata": {},
                    "questions": [
                        {"question_no": 35, "question_type": "choice", "correct_answers": ["1", "4"], "score": 5, "metadata": {}}
                    ],
                },
            ],
            "source_paper_score_sum": 999,
            "assignment_max_score": 999,
        }
    ],
    "total_score_group_count": 99,
    "total_paper_count": 99,
    "total_question_count": 99,
    "source_paper_score_sum": 99,
}


class FakeDB:
    def __init__(self):
        self.added = []
        self.deleted = []
        self.commit_count = 0
        self.rollback_count = 0
        self.next_id = 1

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = self.next_id
            self.next_id += 1
        self.added.append(obj)

    def flush(self):
        return None

    def commit(self):
        self.commit_count += 1

    def rollback(self):
        self.rollback_count += 1

    def delete(self, obj):
        self.deleted.append(obj)


class SprintExamV2ValidationTests(TestCase):
    def test_preview_payload_can_be_saved_while_computed_fields_are_ignored(self):
        normalized = normalize_exam_structure_payload(VALID_PAYLOAD)

        group = normalized["score_groups"][0]
        self.assertEqual(group["source_paper_score_sum"], 10)
        self.assertEqual(group["assignment_max_score"], 10)
        self.assertEqual(group["papers"][0]["question_count"], 2)
        self.assertEqual(group["papers"][0]["paper_max_score"], 5)

    def test_english_paper_accepts_supported_listening_youtube_urls(self):
        urls = [
            "https://www.youtube.com/watch?v=abcDEF_1234",
            "https://youtu.be/abcDEF_1234",
            "https://www.youtube.com/embed/abcDEF_1234",
        ]

        for url in urls:
            with self.subTest(url=url):
                payload = {
                    "exam": {"title": "A"},
                    "score_groups": [
                        {
                            "score_group_code": "english_total",
                            "score_group_name": "English",
                            "subject_area": "english",
                            "aggregation_type": "standalone",
                            "papers": [
                                {
                                    "subject_code": "english",
                                    "subject_name": "English",
                                    "paper_role": "standalone",
                                    "questions": [{"question_no": 1, "question_type": "choice", "correct_answers": ["1"], "score": 2}],
                                    "listening_youtube_url": url,
                                }
                            ],
                        }
                    ],
                }

                normalized = normalize_exam_structure_payload(payload)

                self.assertEqual(normalized["score_groups"][0]["papers"][0]["listening_youtube_url"], url)

    def test_non_english_paper_rejects_listening_youtube_url(self):
        payload = {
            "exam": {"title": "A"},
            "score_groups": [
                {
                    "score_group_code": "korean_total",
                    "score_group_name": "Korean",
                    "subject_area": "korean",
                    "aggregation_type": "sum",
                    "papers": [
                        {
                            "subject_code": "korean_common",
                            "subject_name": "Korean Common",
                            "paper_role": "common",
                            "questions": [{"question_no": 1, "question_type": "choice", "correct_answers": ["1"], "score": 2}],
                            "listening_youtube_url": "https://youtu.be/abcDEF_1234",
                        }
                    ],
                }
            ],
        }

        with self.assertRaises(SprintExamV2DomainError) as captured:
            normalize_exam_structure_payload(payload)

        self.assertEqual(captured.exception.code, "LISTENING_YOUTUBE_URL_REQUIRES_ENGLISH")

    def test_invalid_listening_youtube_url_is_rejected(self):
        payload = {
            "exam": {"title": "A"},
            "score_groups": [
                {
                    "score_group_code": "english_total",
                    "score_group_name": "English",
                    "subject_area": "english",
                    "aggregation_type": "standalone",
                    "papers": [
                        {
                            "subject_code": "english",
                            "subject_name": "English",
                            "paper_role": "standalone",
                            "questions": [{"question_no": 1, "question_type": "choice", "correct_answers": ["1"], "score": 2}],
                            "listening_youtube_url": "https://example.com/watch?v=abcDEF_1234",
                        }
                    ],
                }
            ],
        }

        with self.assertRaises(SprintExamV2DomainError) as captured:
            normalize_exam_structure_payload(payload)

        self.assertEqual(captured.exception.code, "INVALID_LISTENING_YOUTUBE_URL")

    def test_duplicate_group_code_is_rejected(self):
        payload = {**VALID_PAYLOAD, "score_groups": [VALID_PAYLOAD["score_groups"][0], VALID_PAYLOAD["score_groups"][0]]}

        with self.assertRaises(SprintExamV2DomainError) as captured:
            normalize_exam_structure_payload(payload)
        self.assertEqual(captured.exception.code, "DUPLICATE_SCORE_GROUP_CODE")

    def test_duplicate_question_no_is_rejected(self):
        payload = {**VALID_PAYLOAD}
        payload["score_groups"] = [{**VALID_PAYLOAD["score_groups"][0]}]
        payload["score_groups"][0]["papers"] = [{**VALID_PAYLOAD["score_groups"][0]["papers"][0]}]
        payload["score_groups"][0]["papers"][0]["questions"] = [
            {"question_no": 1, "question_type": "choice", "correct_answers": ["2"], "score": 2},
            {"question_no": 1, "question_type": "choice", "correct_answers": ["3"], "score": 2},
        ]

        with self.assertRaises(SprintExamV2DomainError) as captured:
            normalize_exam_structure_payload(payload)
        self.assertEqual(captured.exception.code, "DUPLICATE_QUESTION_NO")

    def test_invalid_group_composition_is_rejected(self):
        payload = {**VALID_PAYLOAD}
        payload["score_groups"] = [{**VALID_PAYLOAD["score_groups"][0], "aggregation_type": "sum"}]
        payload["score_groups"][0]["papers"] = [
            {
                "subject_code": "english",
                "subject_name": "영어",
                "paper_role": "standalone",
                "slot": None,
                "questions": [{"question_no": 1, "question_type": "choice", "correct_answers": ["1"], "score": 2}],
            }
        ]

        with self.assertRaises(SprintExamV2DomainError) as captured:
            normalize_exam_structure_payload(payload)
        self.assertEqual(captured.exception.code, "INVALID_SUM_GROUP_PAPER_ROLE")

    def test_assigned_patch_missing_score_groups_can_validate_exam_only(self):
        normalized = normalize_exam_structure_payload(
            {"exam": {"title": "A", "source_label": "src", "description": "memo", "metadata": {}}},
            allow_missing_score_groups=True,
        )

        self.assertIsNone(normalized["score_groups"])


class SprintExamV2ServiceTests(TestCase):
    def test_create_uses_one_commit_and_serializes_detail(self):
        db = FakeDB()

        def load_created_exam(_, exam_id):
            self.assertEqual(exam_id, 1)
            return db.added[0]

        with patch.object(sprint_exam_v2_service, "_load_exam_detail", load_created_exam):
            result = sprint_exam_v2_service.create_exam(db, VALID_PAYLOAD)

        self.assertEqual(db.commit_count, 1)
        self.assertEqual(db.rollback_count, 0)
        self.assertEqual(result["exam"]["title"], "2026 9월 모의고사")
        self.assertEqual(result["exam"]["source_label"], "9월 평가원")
        self.assertEqual(result["total_score_group_count"], 1)
        self.assertEqual(result["total_paper_count"], 2)
        self.assertEqual(result["total_question_count"], 3)
        self.assertEqual(result["source_paper_score_sum"], 10)
        self.assertEqual(result["score_groups"][0]["assignment_max_score"], 10)

    def test_create_rolls_back_on_integrity_error_without_raw_error_exposure(self):
        db = FakeDB()
        db.flush = lambda: (_ for _ in ()).throw(IntegrityError("insert", {}, Exception("raw constraint")))

        with self.assertRaises(SprintExamV2ConflictError) as captured:
            sprint_exam_v2_service.create_exam(db, VALID_PAYLOAD)

        self.assertEqual(db.commit_count, 0)
        self.assertEqual(db.rollback_count, 1)
        self.assertEqual(captured.exception.code, "SPRINT_EXAM_V2_INTEGRITY_ERROR")
        self.assertNotIn("raw constraint", captured.exception.message)

    def test_delete_rejects_assigned_exam(self):
        db = FakeDB()
        exam = type("Exam", (), {"id": 1})()

        with patch.object(sprint_exam_v2_service, "_load_exam_detail", lambda *_: exam), patch.object(
            sprint_exam_v2_service, "_has_assignments", lambda *_: True
        ):
            with self.assertRaises(SprintExamV2ConflictError) as captured:
                sprint_exam_v2_service.delete_exam(db, 1)

        self.assertEqual(captured.exception.code, "EXAM_HAS_ASSIGNMENTS")
        self.assertEqual(db.commit_count, 0)

    def test_route_schema_accepts_preview_computed_fields(self):
        request = sprint_exam_v2.SprintExamV2CreateRequest.model_validate(VALID_PAYLOAD)

        dumped = request.model_dump(mode="json")
        self.assertEqual(dumped["total_score_group_count"], 99)
        self.assertEqual(dumped["score_groups"][0]["papers"][0]["question_count"], 999)


class SprintExamV2ScoreGroupSolutionTests(TestCase):
    def test_extract_drive_file_id_accepts_view_link(self):
        from sprint_exam_v2_validation import extract_drive_file_id

        self.assertEqual(
            extract_drive_file_id(
                "https://drive.google.com/file/d/1QSFHRputTIhBNkwJGw6tlmYW1xcKtiOW/view?usp=drive_link", "x"
            ),
            "1QSFHRputTIhBNkwJGw6tlmYW1xcKtiOW",
        )

    def test_extract_drive_file_id_accepts_preview_link(self):
        from sprint_exam_v2_validation import extract_drive_file_id

        self.assertEqual(
            extract_drive_file_id("https://drive.google.com/file/d/1QSFHRputTIhBNkwJGw6tlmYW1xcKtiOW/preview", "x"),
            "1QSFHRputTIhBNkwJGw6tlmYW1xcKtiOW",
        )

    def test_extract_drive_file_id_accepts_raw_id(self):
        from sprint_exam_v2_validation import extract_drive_file_id

        self.assertEqual(
            extract_drive_file_id("1QSFHRputTIhBNkwJGw6tlmYW1xcKtiOW", "x"),
            "1QSFHRputTIhBNkwJGw6tlmYW1xcKtiOW",
        )

    def test_extract_drive_file_id_treats_none_or_blank_as_disconnect(self):
        from sprint_exam_v2_validation import extract_drive_file_id

        self.assertIsNone(extract_drive_file_id(None, "x"))
        self.assertIsNone(extract_drive_file_id("   ", "x"))

    def test_extract_drive_file_id_rejects_garbage_input(self):
        from sprint_exam_v2_validation import extract_drive_file_id

        with self.assertRaises(SprintExamV2DomainError) as captured:
            extract_drive_file_id("not a drive link", "x")
        self.assertEqual(captured.exception.code, "INVALID_DRIVE_LINK")

    def test_extract_drive_file_id_rejects_non_drive_domain(self):
        from sprint_exam_v2_validation import extract_drive_file_id

        with self.assertRaises(SprintExamV2DomainError) as captured:
            extract_drive_file_id("https://example.com/file/d/1QSFHRputTIhBNkwJGw6tlmYW1xcKtiOW/view", "x")
        self.assertEqual(captured.exception.code, "INVALID_DRIVE_LINK")

    def test_update_score_group_solution_extracts_id_and_commits(self):
        db = FakeDB()
        group = type("Group", (), {"id": 5, "solution_drive_file_id": None, "solution_is_published": False})()
        with patch.object(sprint_exam_v2_service, "_load_score_group", lambda *_: group), patch.object(
            sprint_exam_v2_service,
            "serialize_score_group",
            lambda g: {"solution_drive_file_id": g.solution_drive_file_id, "solution_is_published": g.solution_is_published},
        ):
            result = sprint_exam_v2_service.update_score_group_solution(
                db,
                5,
                drive_link_or_id="https://drive.google.com/file/d/1QSFHRputTIhBNkwJGw6tlmYW1xcKtiOW/view?usp=drive_link",
                is_published=True,
            )
        self.assertEqual(group.solution_drive_file_id, "1QSFHRputTIhBNkwJGw6tlmYW1xcKtiOW")
        self.assertTrue(group.solution_is_published)
        self.assertEqual(db.commit_count, 1)
        self.assertEqual(result["solution_drive_file_id"], "1QSFHRputTIhBNkwJGw6tlmYW1xcKtiOW")

    def test_update_score_group_solution_clear_forces_unpublished(self):
        db = FakeDB()
        group = type("Group", (), {"id": 5, "solution_drive_file_id": "old", "solution_is_published": True})()
        with patch.object(sprint_exam_v2_service, "_load_score_group", lambda *_: group), patch.object(
            sprint_exam_v2_service, "serialize_score_group", lambda g: {}
        ):
            sprint_exam_v2_service.update_score_group_solution(db, 5, drive_link_or_id=None, is_published=True)
        self.assertIsNone(group.solution_drive_file_id)
        self.assertFalse(group.solution_is_published)
        self.assertEqual(db.commit_count, 1)

    def test_update_score_group_solution_rejects_invalid_link_without_committing(self):
        db = FakeDB()
        group = type("Group", (), {"id": 5, "solution_drive_file_id": None, "solution_is_published": False})()
        with patch.object(sprint_exam_v2_service, "_load_score_group", lambda *_: group):
            with self.assertRaises(SprintExamV2DomainError) as captured:
                sprint_exam_v2_service.update_score_group_solution(db, 5, drive_link_or_id="garbage", is_published=True)
        self.assertEqual(captured.exception.code, "INVALID_DRIVE_LINK")
        self.assertEqual(db.commit_count, 0)
        self.assertIsNone(group.solution_drive_file_id)
