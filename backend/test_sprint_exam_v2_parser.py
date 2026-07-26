from __future__ import annotations

from pathlib import Path
import asyncio
import json
import sys
from unittest import TestCase

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parent))

import admin_auth
import main
import models
import sprint_exam_v2
from sprint_exam_v2_parser import parse_sprint_exam_v2_text


VALID_TEXT = """시험: 2026 9월 모의고사
시험일: 2026-09-03
출처: 9월 평가원
설명: 선택 입력

[국어 공통]
subject_code: korean_common
type: common
1 객관식 2 2점
2 주관식 17 3점
등급컷 1=92, 2=84

[국어 선택: 언어와 매체]
subject_code: korean_language_media
type: elective
35 객관식 3 2점
36 객관식 1|4 3점

[탐구1: 생활과 윤리]
subject_code: life_ethics
type: inquiry
1 객관식 5 2점

[영어]
subject_code: english
type: standalone
1 choice 1 2
grade_cut 1=90
"""


def codes(issues):
    return [issue.code for issue in issues]


def group_by_code(preview, code):
    return next(group for group in preview["score_groups"] if group["score_group_code"] == code)


class SprintExamV2ParserTests(TestCase):
    def parse(self, text: str):
        return parse_sprint_exam_v2_text(text)

    def test_valid_full_input_uses_score_group_preview(self):
        result = self.parse(VALID_TEXT)

        self.assertTrue(result.ok, [error.to_dict() for error in result.errors])
        self.assertEqual(result.errors, [])
        self.assertEqual(result.preview["exam"]["title"], "2026 9월 모의고사")
        self.assertEqual(result.preview["exam"]["exam_date"], "2026-09-03")
        self.assertEqual(result.preview["exam"]["source_label"], "9월 평가원")
        self.assertEqual(result.preview["exam"]["description"], "선택 입력")
        self.assertEqual(result.preview["exam"]["metadata"], {})
        self.assertEqual(result.preview["total_score_group_count"], 3)
        self.assertEqual(result.preview["total_paper_count"], 4)
        self.assertEqual(result.preview["total_question_count"], 6)
        self.assertNotIn("total_score", result.preview)
        self.assertNotIn("papers", result.preview)
        self.assertIsNotNone(result.normalized_output)

    def test_crlf_bom_comments_and_blank_lines_are_ignored(self):
        text = "\ufeff# comment\r\n\r\n" + VALID_TEXT.replace("\n", "\r\n")
        result = self.parse(text)

        self.assertTrue(result.ok, [error.to_dict() for error in result.errors])
        self.assertEqual(result.preview["exam"]["title"], "2026 9월 모의고사")

    def test_korean_common_and_elective_merge_into_korean_total(self):
        result = self.parse(VALID_TEXT)
        group = group_by_code(result.preview, "korean_total")

        self.assertEqual(group["score_group_name"], "국어")
        self.assertEqual(group["subject_area"], "korean")
        self.assertEqual(group["aggregation_type"], "sum")
        self.assertEqual(group["source_paper_score_sum"], 10)
        self.assertEqual(group["assignment_max_score"], 10)
        self.assertEqual([paper["paper_role"] for paper in group["papers"]], ["common", "elective"])
        self.assertEqual(group["papers"][0]["paper_max_score"], 5)
        self.assertEqual(group["papers"][1]["paper_max_score"], 5)

    def test_math_common_and_electives_merge_into_math_total(self):
        result = self.parse(
            """시험: A
[수학 공통]
subject_code: math_common
type: common
1 choice 2 2

[수학 선택: 미적분]
subject_code: math_calculus
type: elective
1 short_answer 17 3점

[수학 선택: 기하]
subject_code: math_geometry
type: elective
1 choice 4 3점
"""
        )
        group = group_by_code(result.preview, "math_total")

        self.assertTrue(result.ok, [error.to_dict() for error in result.errors])
        self.assertEqual(group["score_group_name"], "수학")
        self.assertEqual(group["subject_area"], "math")
        self.assertEqual(group["aggregation_type"], "sum")
        self.assertEqual(group["assignment_max_score"], 5)
        self.assertEqual(len(group["papers"]), 3)

    def test_english_and_korean_history_are_standalone_groups(self):
        result = self.parse(
            """시험: A
[영어]
subject_code: english
1 choice 1 2점

[한국사]
subject_code: korean_history
1 choice 3 2점
"""
        )

        self.assertTrue(result.ok, [error.to_dict() for error in result.errors])
        english = group_by_code(result.preview, "english_total")
        history = group_by_code(result.preview, "korean_history_total")
        self.assertEqual(english["aggregation_type"], "standalone")
        self.assertEqual(history["aggregation_type"], "standalone")
        self.assertEqual(english["assignment_max_score"], 2)
        self.assertEqual(history["assignment_max_score"], 2)

    def test_inquiry_slots_are_subject_groups_with_slots(self):
        result = self.parse(
            """시험: A
[탐구1: 생활과 윤리]
subject_code: life_ethics
type: inquiry
1 choice 5 2점

[탐구2: 사회문화]
subject_code: social_culture
type: inquiry
1 choice 3 2점
"""
        )

        self.assertTrue(result.ok, [error.to_dict() for error in result.errors])
        inquiry_1 = group_by_code(result.preview, "life_ethics_total")
        inquiry_2 = group_by_code(result.preview, "social_culture_total")
        self.assertEqual(inquiry_1["subject_area"], "inquiry")
        self.assertEqual(inquiry_2["subject_area"], "inquiry")
        self.assertEqual(inquiry_1["papers"][0]["paper_role"], "inquiry_slot")
        self.assertEqual(inquiry_1["papers"][0]["slot"], "inquiry_1")
        self.assertEqual(inquiry_2["papers"][0]["slot"], "inquiry_2")

    def test_paper_question_shape_matches_v2_contract(self):
        result = self.parse(VALID_TEXT)
        question = group_by_code(result.preview, "korean_total")["papers"][0]["questions"][0]

        self.assertEqual(question["question_no"], 1)
        self.assertEqual(question["question_type"], "choice")
        self.assertEqual(question["correct_answers"], ["2"])
        self.assertEqual(question["score"], 2)
        self.assertEqual(question["metadata"], {})
        self.assertNotIn("answer_type", question)
        self.assertNotIn("points", question)

    def test_english_listening_youtube_url_is_parsed(self):
        result = self.parse(
            """시험: A
[영어]
subject_code: english
type: standalone
listening_youtube_url: https://youtu.be/abcDEF_1234
1 choice 1 2
"""
        )

        self.assertTrue(result.ok, [error.to_dict() for error in result.errors])
        paper = group_by_code(result.preview, "english_total")["papers"][0]
        self.assertEqual(paper["listening_youtube_url"], "https://youtu.be/abcDEF_1234")
        self.assertIn("listening_youtube_url: https://youtu.be/abcDEF_1234", result.normalized_output)

    def test_multiple_choice_deduplicates_answers_preserving_order(self):
        result = self.parse(
            """시험: A
[국어 공통]
subject_code: korean_common
1 객관식 1|4|1|5 2점
"""
        )

        self.assertTrue(result.ok, [error.to_dict() for error in result.errors])
        question = group_by_code(result.preview, "korean_total")["papers"][0]["questions"][0]
        self.assertEqual(question["correct_answers"], ["1", "4", "5"])

    def test_short_answer_keeps_string_value(self):
        result = self.parse(
            """시험: A
[수학 공통]
subject_code: math_common
1 주관식 17a 3점
"""
        )

        self.assertTrue(result.ok, [error.to_dict() for error in result.errors])
        question = group_by_code(result.preview, "math_total")["papers"][0]["questions"][0]
        self.assertEqual(question["question_type"], "short_answer")
        self.assertEqual(question["correct_answers"], ["17a"])

    def test_grade_cuts_are_moved_to_score_group(self):
        result = self.parse(VALID_TEXT)
        group = group_by_code(result.preview, "korean_total")

        self.assertEqual(group["grade_cuts"][0], {"grade": 1, "min_score": 92, "cut_type": "raw_score_min", "metadata": {}})
        self.assertNotIn("grade_cuts", group["papers"][0])

    def test_duplicate_identical_group_grade_cut_merges_with_warning(self):
        result = self.parse(
            """시험: A
[국어 공통]
subject_code: korean_common
1 choice 2 2점
등급컷 1=92

[국어 선택: 언어와 매체]
subject_code: korean_language_media
1 choice 3 2점
등급컷 1=92
"""
        )
        group = group_by_code(result.preview, "korean_total")

        self.assertTrue(result.ok, [error.to_dict() for error in result.errors])
        self.assertIn("DUPLICATE_IDENTICAL_GROUP_GRADE_CUT", codes(result.warnings))
        self.assertEqual(len(group["grade_cuts"]), 1)

    def test_conflicting_group_grade_cut_is_error(self):
        result = self.parse(
            """시험: A
[국어 공통]
subject_code: korean_common
1 choice 2 2점
등급컷 1=92

[국어 선택: 언어와 매체]
subject_code: korean_language_media
1 choice 3 2점
등급컷 1=90
"""
        )

        self.assertFalse(result.ok)
        self.assertIn("CONFLICTING_GROUP_GRADE_CUT", codes(result.errors))

    def test_grade_cut_order_must_be_non_increasing(self):
        result = self.parse(
            """시험: A
[영어]
subject_code: english
1 choice 1 2점
등급컷 1=90, 2=91
"""
        )

        self.assertFalse(result.ok)
        self.assertIn("INVALID_GRADE_CUT", codes(result.errors))

    def test_common_two_papers_is_error(self):
        result = self.parse(
            """시험: A
[국어 공통]
subject_code: korean_common
1 choice 2 2점

[국어 공통]
subject_code: korean_common_alt
1 choice 3 2점
"""
        )

        self.assertFalse(result.ok)
        self.assertIn("MULTIPLE_COMMON_PAPERS", codes(result.errors))

    def test_standalone_group_multiple_papers_is_error(self):
        result = self.parse(
            """시험: A
[영어]
subject_code: english
1 choice 1 2점

[영어]
subject_code: english_alt
1 choice 2 2점
"""
        )

        self.assertFalse(result.ok)
        self.assertIn("STANDALONE_GROUP_MULTIPLE_PAPERS", codes(result.errors))

    def test_elective_max_score_mismatch_warns_and_nulls_assignment_max_score(self):
        result = self.parse(
            """시험: A
[국어 공통]
subject_code: korean_common
1 choice 2 2점

[국어 선택: 언어와 매체]
subject_code: korean_language_media
1 choice 3 3점

[국어 선택: 화법과 작문]
subject_code: korean_speech_writing
1 choice 4 4점
"""
        )
        group = group_by_code(result.preview, "korean_total")

        self.assertTrue(result.ok, [error.to_dict() for error in result.errors])
        self.assertIn("ELECTIVE_MAX_SCORE_MISMATCH", codes(result.warnings))
        self.assertIsNone(group["assignment_max_score"])
        self.assertEqual(group["source_paper_score_sum"], 9)
        self.assertEqual(result.preview["source_paper_score_sum"], 9)

    def test_score_group_override_matching_auto_values_is_allowed(self):
        result = self.parse(
            """시험: A
[국어 공통]
subject_code: korean_common
score_group_code: korean_total
score_group_name: 국어
aggregation_type: sum
1 choice 2 2점
"""
        )

        self.assertTrue(result.ok, [error.to_dict() for error in result.errors])

    def test_score_group_override_conflict_is_error(self):
        result = self.parse(
            """시험: A
[국어 공통]
subject_code: korean_common
score_group_code: english_total
1 choice 2 2점
"""
        )

        self.assertFalse(result.ok)
        self.assertIn("SCORE_GROUP_OVERRIDE_CONFLICT", codes(result.errors))

    def test_missing_exam_title(self):
        result = self.parse("[국어 공통]\nsubject_code: korean_common\n1 choice 2 2점\n")

        self.assertFalse(result.ok)
        self.assertIn("MISSING_EXAM_TITLE", codes(result.errors))

    def test_invalid_exam_date(self):
        result = self.parse("시험: A\n시험일: 2026-02-31\n[국어 공통]\nsubject_code: korean_common\n1 choice 2 2점\n")

        self.assertFalse(result.ok)
        self.assertIn("INVALID_EXAM_DATE", codes(result.errors))

    def test_missing_subject_code(self):
        result = self.parse("시험: A\n[국어 공통]\n1 choice 2 2점\n")

        self.assertFalse(result.ok)
        self.assertIn("MISSING_SUBJECT_CODE", codes(result.errors))

    def test_invalid_subject_code(self):
        result = self.parse("시험: A\n[국어 공통]\nsubject_code: Korean-Common\n1 choice 2 2점\n")

        self.assertFalse(result.ok)
        self.assertIn("INVALID_SUBJECT_CODE", codes(result.errors))

    def test_duplicate_paper(self):
        result = self.parse(
            """시험: A
[국어 공통]
subject_code: korean_common
1 choice 2 2점

[국어 공통]
subject_code: korean_common
1 choice 3 2점
"""
        )

        self.assertFalse(result.ok)
        self.assertIn("DUPLICATE_PAPER", codes(result.errors))

    def test_duplicate_question(self):
        result = self.parse("시험: A\n[국어 공통]\nsubject_code: korean_common\n1 choice 2 2점\n1 choice 3 2점\n")

        self.assertFalse(result.ok)
        self.assertIn("DUPLICATE_QUESTION_NO", codes(result.errors))

    def test_invalid_answer_separator_choice_answer_and_points(self):
        separator = self.parse("시험: A\n[국어 공통]\nsubject_code: korean_common\n1 choice 1||4 2점\n")
        choice = self.parse("시험: A\n[국어 공통]\nsubject_code: korean_common\n1 choice 9 2점\n")
        zero = self.parse("시험: A\n[국어 공통]\nsubject_code: korean_common\n1 choice 2 0점\n")
        decimal = self.parse("시험: A\n[국어 공통]\nsubject_code: korean_common\n1 choice 2 1.5점\n")

        self.assertIn("EMPTY_CORRECT_ANSWER", codes(separator.errors))
        self.assertIn("INVALID_CHOICE_ANSWER", codes(choice.errors))
        self.assertIn("INVALID_POINTS", codes(zero.errors))
        self.assertIn("INVALID_POINTS", codes(decimal.errors))

    def test_header_type_conflict(self):
        result = self.parse("시험: A\n[국어 공통]\nsubject_code: korean_common\ntype: elective\n1 choice 2 2점\n")

        self.assertFalse(result.ok)
        self.assertIn("HEADER_TYPE_CONFLICT", codes(result.errors))

    def test_unknown_paper_line(self):
        result = self.parse("시험: A\n[국어 공통]\nsubject_code: korean_common\nnonsense\n")

        self.assertFalse(result.ok)
        self.assertIn("UNKNOWN_PAPER_LINE", codes(result.errors))

    def test_multiple_errors_are_accumulated(self):
        result = self.parse("시험일: bad\n[국어 공통]\nsubject_code: BAD\n1 bad 2 0점\n")

        self.assertIn("INVALID_EXAM_DATE", codes(result.errors))
        self.assertIn("INVALID_SUBJECT_CODE", codes(result.errors))
        self.assertIn("INVALID_ANSWER_TYPE", codes(result.errors))
        self.assertIn("MISSING_EXAM_TITLE", codes(result.errors))

    def test_normalized_output_is_none_on_error_and_present_with_warning(self):
        bad = self.parse("시험: A\n[국어 공통]\nsubject_code: BAD\n")
        warning = self.parse(
            """시험: A
[국어 공통]
subject_code: korean_common
1 choice 2 2점
등급컷 1=92

[국어 선택: 언어와 매체]
subject_code: korean_language_media
1 choice 3 2점
등급컷 1=92
"""
        )

        self.assertIsNone(bad.normalized_output)
        self.assertTrue(warning.ok)
        self.assertIsNotNone(warning.normalized_output)

    def test_normalized_output_round_trips_to_same_preview(self):
        result = self.parse(VALID_TEXT)
        reparsed = self.parse(result.normalized_output or "")

        self.assertTrue(reparsed.ok, [error.to_dict() for error in reparsed.errors])
        self.assertEqual(reparsed.preview, result.preview)
        self.assertEqual(reparsed.normalized_output, result.normalized_output)

    def test_parser_preview_keys_map_to_v2_orm_contract(self):
        result = self.parse(VALID_TEXT)
        score_group = result.preview["score_groups"][0]
        paper = score_group["papers"][0]

        self.assertLessEqual(
            {
                "score_group_code",
                "score_group_name",
                "subject_area",
                "aggregation_type",
                "display_order",
                "metadata",
            },
            set(score_group),
        )
        self.assertLessEqual(
            {
                "subject_code",
                "subject_name",
                "paper_role",
                "slot",
                "display_order",
                "metadata",
                "paper_max_score",
            },
            set(paper),
        )

    def test_parser_has_no_database_dependency(self):
        source = Path(__file__).with_name("sprint_exam_v2_parser.py").read_text(encoding="utf-8")

        for forbidden in ("SessionLocal", "get_db", "commit(", "flush(", "merge(", "delete("):
            self.assertNotIn(forbidden, source)


class SprintExamV2ParsePreviewEndpointTests(TestCase):
    def test_endpoint_returns_normal_200_body(self):
        payload = sprint_exam_v2.SprintExamV2ParsePreviewRequest(text=VALID_TEXT)
        response = sprint_exam_v2.admin_parse_sprint_exam_v2_preview(payload)

        self.assertTrue(response["ok"])
        self.assertEqual(response["preview"]["total_score_group_count"], 3)

    def test_endpoint_parse_errors_still_return_http_200_body(self):
        payload = sprint_exam_v2.SprintExamV2ParsePreviewRequest(text="시험: A\nunknown\n")
        response = sprint_exam_v2.admin_parse_sprint_exam_v2_preview(payload)

        self.assertFalse(response["ok"])
        self.assertIn("UNKNOWN_TOP_LEVEL_LINE", [error["code"] for error in response["errors"]])

    def test_request_body_errors_are_pydantic_validation_errors(self):
        with self.assertRaises(ValidationError):
            sprint_exam_v2.SprintExamV2ParsePreviewRequest.model_validate({})
        with self.assertRaises(ValidationError):
            sprint_exam_v2.SprintExamV2ParsePreviewRequest.model_validate({"text": 123})

    def test_endpoint_is_exposed_in_openapi(self):
        paths = main.app.openapi()["paths"]

        self.assertIn("/admin/sprint-exam-v2/exams/parse-preview", paths)

    def test_asgi_direct_calls_cover_success_parse_error_and_422(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        models.Admin.__table__.create(bind=engine)
        SessionLocal = sessionmaker(bind=engine)
        setup_db = SessionLocal()
        admin = models.Admin(username="parseradmin", password="parseradmin")
        setup_db.add(admin)
        setup_db.commit()
        setup_db.refresh(admin)
        token, _ = admin_auth.create_admin_session_token(admin)
        setup_db.close()

        def override_db():
            session = SessionLocal()
            try:
                yield session
            finally:
                session.close()

        async def call(body):
            encoded = json.dumps(body).encode("utf-8")
            messages = []
            send_events = []

            async def receive():
                if messages:
                    return messages.pop(0)
                return {"type": "http.disconnect"}

            async def send(message):
                send_events.append(message)

            messages.append(
                {
                    "type": "http.request",
                    "body": encoded,
                    "more_body": False,
                }
            )
            scope = {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": "POST",
                "scheme": "http",
                "path": "/admin/sprint-exam-v2/exams/parse-preview",
                "raw_path": b"/admin/sprint-exam-v2/exams/parse-preview",
                "query_string": b"",
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"host", b"testserver"),
                    (b"cookie", f"{admin_auth.ADMIN_SESSION_COOKIE}={token}".encode("utf-8")),
                ],
                "client": ("127.0.0.1", 123),
                "server": ("127.0.0.1", 8000),
                "root_path": "",
            }
            await main.app(scope, receive, send)
            status = next(event["status"] for event in send_events if event["type"] == "http.response.start")
            body_bytes = b"".join(event.get("body", b"") for event in send_events if event["type"] == "http.response.body")
            return status, json.loads(body_bytes.decode("utf-8"))

        main.app.dependency_overrides[admin_auth.get_db] = override_db
        original_session_local = main.SessionLocal
        main.SessionLocal = SessionLocal
        try:
            ok_status, ok_body = asyncio.run(call({"text": VALID_TEXT}))
            error_status, error_body = asyncio.run(call({"text": "시험: A\nunknown\n"}))
            invalid_status, invalid_body = asyncio.run(call({}))
        finally:
            main.SessionLocal = original_session_local
            main.app.dependency_overrides.pop(admin_auth.get_db, None)
            engine.dispose()

        self.assertEqual(ok_status, 200)
        self.assertTrue(ok_body["ok"])
        self.assertEqual(error_status, 200)
        self.assertFalse(error_body["ok"])
        self.assertEqual(invalid_status, 422)
        self.assertEqual(invalid_body["detail"][0]["type"], "missing")
