from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys
from unittest import TestCase, skipUnless

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql.ddl import sort_tables

sys.path.insert(0, str(Path(__file__).resolve().parent))

import database
import main
import models
import admin_auth
import sprint_exam_v2
import sprint_exam_v2_assignment
import sprint_exam_v2_assignment_service
import sprint_exam_v2_attempt
import sprint_exam_v2_attempt_service
import sprint_exam_v2_retake_approval
import sprint_exam_v2_retake_approval_service
import sprint_exam_v2_result_publication
import sprint_exam_v2_result_publication_service
import sprint_exam_v2_scoring
import sprint_exam_v2_scoring_service
import sprint_exam_v2_service
import student_auth


TARGET_DB_NAME = "aimon_sprint_exam_v2_test"
RUN_PG_TESTS = os.getenv("RUN_SPRINT_EXAM_V2_PG_TESTS") == "1"


VALID_PAYLOAD = {
    "exam": {
        "title": "2026 9월 모의고사",
        "exam_date": "2026-09-03",
        "source_label": "9월 평가원",
        "description": "통합 테스트",
        "metadata": {"round": 9, "provider": "KICE"},
    },
    "score_groups": [
        {
            "score_group_code": "korean_total",
            "score_group_name": "국어",
            "subject_area": "korean",
            "aggregation_type": "sum",
            "display_order": 0,
            "metadata": {"area": "language"},
            "grade_cuts": [{"grade": 1, "min_score": 92, "cut_type": "raw_score_min", "metadata": {"source": "manual"}}],
            "papers": [
                {
                    "subject_code": "korean_common",
                    "subject_name": "국어 공통",
                    "paper_role": "common",
                    "slot": None,
                    "display_order": 0,
                    "metadata": {"omr": "auto"},
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
        },
        {
            "score_group_code": "math_total",
            "score_group_name": "수학",
            "subject_area": "math",
            "aggregation_type": "sum",
            "display_order": 1,
            "metadata": {},
            "grade_cuts": [],
            "papers": [
                {
                    "subject_code": "math_common",
                    "subject_name": "수학 공통",
                    "paper_role": "common",
                    "slot": None,
                    "display_order": 0,
                    "metadata": {},
                    "questions": [{"question_no": 1, "question_type": "short_answer", "correct_answers": ["20"], "score": 2}],
                },
                {
                    "subject_code": "math_calculus",
                    "subject_name": "미적분",
                    "paper_role": "elective",
                    "slot": None,
                    "display_order": 1,
                    "metadata": {},
                    "questions": [{"question_no": 23, "question_type": "choice", "correct_answers": ["3"], "score": 3}],
                },
            ],
        },
        {
            "score_group_code": "english_total",
            "score_group_name": "영어",
            "subject_area": "english",
            "aggregation_type": "standalone",
            "display_order": 2,
            "metadata": {},
            "grade_cuts": [{"grade": 1, "min_score": 90, "cut_type": "raw_score_min"}],
            "papers": [
                {
                    "subject_code": "english",
                    "subject_name": "영어",
                    "paper_role": "standalone",
                    "slot": None,
                    "display_order": 0,
                    "metadata": {},
                    "questions": [{"question_no": 1, "question_type": "choice", "correct_answers": ["1"], "score": 2}],
                }
            ],
        },
        {
            "score_group_code": "korean_history_total",
            "score_group_name": "한국사",
            "subject_area": "korean_history",
            "aggregation_type": "standalone",
            "display_order": 3,
            "metadata": {},
            "grade_cuts": [],
            "papers": [
                {
                    "subject_code": "korean_history",
                    "subject_name": "한국사",
                    "paper_role": "standalone",
                    "slot": None,
                    "display_order": 0,
                    "metadata": {},
                    "questions": [{"question_no": 1, "question_type": "choice", "correct_answers": ["4"], "score": 2}],
                }
            ],
        },
        {
            "score_group_code": "life_ethics_total",
            "score_group_name": "생활과 윤리",
            "subject_area": "inquiry",
            "aggregation_type": "standalone",
            "display_order": 4,
            "metadata": {},
            "grade_cuts": [],
            "papers": [
                {
                    "subject_code": "life_ethics",
                    "subject_name": "생활과 윤리",
                    "paper_role": "inquiry_slot",
                    "slot": "inquiry_1",
                    "display_order": 0,
                    "metadata": {},
                    "questions": [{"question_no": 1, "question_type": "choice", "correct_answers": ["5"], "score": 2}],
                }
            ],
        },
        {
            "score_group_code": "social_culture_total",
            "score_group_name": "사회문화",
            "subject_area": "inquiry",
            "aggregation_type": "standalone",
            "display_order": 5,
            "metadata": {},
            "grade_cuts": [],
            "papers": [
                {
                    "subject_code": "social_culture",
                    "subject_name": "사회문화",
                    "paper_role": "inquiry_slot",
                    "slot": "inquiry_2",
                    "display_order": 0,
                    "metadata": {},
                    "questions": [{"question_no": 1, "question_type": "choice", "correct_answers": ["2"], "score": 2}],
                }
            ],
        },
    ],
    "total_score_group_count": 999,
    "total_paper_count": 999,
    "total_question_count": 999,
    "source_paper_score_sum": 999,
}


@skipUnless(RUN_PG_TESTS, "Set RUN_SPRINT_EXAM_V2_PG_TESTS=1 to run PostgreSQL integration tests.")
class SprintExamV2PostgresIntegrationTests(TestCase):
    @classmethod
    def setUpClass(cls):
        base_url = make_url(database.DATABASE_URL)
        cls.url = base_url.set(database=TARGET_DB_NAME)
        if cls.url.database != TARGET_DB_NAME:
            raise RuntimeError("Refusing to run Sprint Exam V2 integration tests outside the dedicated test DB.")
        cls.engine = create_engine(
            cls.url,
            client_encoding="utf8",
            connect_args={"options": "-c client_encoding=utf8"},
        )
        cls.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        cls._reset_schema()
        cls._create_base_tables()
        cls._run_021_migration()

    @classmethod
    def tearDownClass(cls):
        cls._drop_v2_tables()
        cls.engine.dispose()

    @classmethod
    def _reset_schema(cls):
        with cls.engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))

    @classmethod
    def _create_base_tables(cls):
        non_v2_tables = [
            table
            for table in models.Base.metadata.tables.values()
            if not table.name.startswith("sprint_exam_v2_")
        ]
        models.Base.metadata.create_all(bind=cls.engine, tables=sort_tables(non_v2_tables))

    @classmethod
    def _run_021_migration(cls):
        sql = Path(__file__).resolve().parent.joinpath("migrations", "021_create_sprint_exam_v2_tables.sql").read_text(encoding="utf-8")
        with cls.engine.begin() as conn:
            conn.exec_driver_sql(sql)

    @classmethod
    def _drop_v2_tables(cls):
        drop_sql = """
        DROP TABLE IF EXISTS sprint_exam_v2_score_logs CASCADE;
        DROP TABLE IF EXISTS sprint_exam_v2_result_publication_logs CASCADE;
        DROP TABLE IF EXISTS sprint_exam_v2_result_publications CASCADE;
        DROP TABLE IF EXISTS sprint_exam_v2_scores CASCADE;
        DROP TABLE IF EXISTS sprint_exam_v2_responses CASCADE;
        DROP TABLE IF EXISTS sprint_exam_v2_attempts CASCADE;
        DROP TABLE IF EXISTS sprint_exam_v2_retake_approvals CASCADE;
        DROP TABLE IF EXISTS sprint_exam_v2_assignment_papers CASCADE;
        DROP TABLE IF EXISTS sprint_exam_v2_assignments CASCADE;
        DROP TABLE IF EXISTS sprint_exam_v2_grade_cuts CASCADE;
        DROP TABLE IF EXISTS sprint_exam_v2_questions CASCADE;
        DROP TABLE IF EXISTS sprint_exam_v2_papers CASCADE;
        DROP TABLE IF EXISTS sprint_exam_v2_score_groups CASCADE;
        DROP TABLE IF EXISTS sprint_exam_v2_exams CASCADE;
        """
        with cls.engine.begin() as conn:
            conn.exec_driver_sql(drop_sql)

    def setUp(self):
        self._truncate_v2_tables()
        self.db = self.SessionLocal()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    def _truncate_v2_tables(self):
        with self.engine.connect() as conn:
            has_v2_tables = conn.execute(text("select to_regclass('public.sprint_exam_v2_score_logs') is not null")).scalar_one()
        if not has_v2_tables:
            self._reset_schema()
            self._create_base_tables()
            self._run_021_migration()
        with self.engine.begin() as conn:
            conn.exec_driver_sql(
                """
                TRUNCATE TABLE
                    sprint_exam_v2_score_logs,
                    sprint_exam_v2_result_publication_logs,
                    sprint_exam_v2_result_publications,
                    sprint_exam_v2_scores,
                    sprint_exam_v2_responses,
                    sprint_exam_v2_attempts,
                    sprint_exam_v2_retake_approvals,
                    sprint_exam_v2_assignment_papers,
                    sprint_exam_v2_assignments,
                    sprint_exam_v2_grade_cuts,
                    sprint_exam_v2_questions,
                    sprint_exam_v2_papers,
                    sprint_exam_v2_score_groups,
                    sprint_exam_v2_exams
                RESTART IDENTITY CASCADE
                """
            )

    def _assert_key_absent_recursive(self, payload, forbidden_key):
        if isinstance(payload, dict):
            self.assertNotIn(forbidden_key, payload)
            for value in payload.values():
                self._assert_key_absent_recursive(value, forbidden_key)
        elif isinstance(payload, list):
            for item in payload:
                self._assert_key_absent_recursive(item, forbidden_key)

    def _admin_headers(self):
        admin = self.db.query(models.Admin).filter(models.Admin.username == "v2admin").first()
        if admin is None:
            admin = models.Admin(username="v2admin", password="v2admin")
            self.db.add(admin)
            self.db.commit()
        token, _ = admin_auth.create_admin_session_token(admin)
        return [(b"cookie", f"{admin_auth.ADMIN_SESSION_COOKIE}={token}".encode("utf-8"))]

    def _create_v2_assignment_for_student(self, *, phone: str, attempt_limit: int = 1):
        created_exam = sprint_exam_v2_service.create_exam(self.db, VALID_PAYLOAD)
        student = models.Student(
            name=f"Retake Student {phone[-2:]}",
            phone=phone,
            grade="high",
            korean_elective="korean_language_media",
            math_elective="math_calculus",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        self.db.add(student)
        self.db.flush()
        self.db.add(
            models.SprintProgram(
                student_id=student.id,
                title=f"Retake Sprint {phone[-2:]}",
                start_date=date(2026, 9, 1),
                end_date=date(2026, 9, 30),
                is_active=True,
            )
        )
        self.db.commit()
        assigned = sprint_exam_v2_assignment_service.create_assignments(
            self.db,
            {"exam_id": created_exam["exam"]["id"], "student_ids": [student.id], "attempt_limit": attempt_limit},
        )
        return created_exam, student, assigned["created"][0]["assignment_id"]

    def test_01_migration_creates_expected_tables_columns_constraints_indexes(self):
        with self.engine.connect() as conn:
            tables = {
                row[0]
                for row in conn.execute(
                    text("select tablename from pg_tables where schemaname = 'public' and tablename like 'sprint_exam_v2_%'")
                )
            }
            self.assertEqual(len(tables), 14)
            self.assertIn("sprint_exam_v2_exams", tables)

            columns = {
                row[0]: row[1]
                for row in conn.execute(
                    text(
                        """
                        select column_name, data_type
                        from information_schema.columns
                        where table_name = 'sprint_exam_v2_exams'
                        """
                    )
                )
            }
            self.assertEqual(columns["source_label"], "character varying")
            self.assertEqual(columns["metadata"], "jsonb")
            self.assertEqual(columns["parse_summary"], "jsonb")

            assignment_columns = {
                row[0]: row[1]
                for row in conn.execute(
                    text(
                        """
                        select column_name, data_type
                        from information_schema.columns
                        where table_name = 'sprint_exam_v2_assignments'
                        """
                    )
                )
            }
            self.assertEqual(assignment_columns["attempt_limit"], "integer")
            self.assertEqual(assignment_columns["memo"], "text")
            self.assertEqual(assignment_columns["paper_selection_mode"], "character varying")

            retake_columns = {
                row[0]: row[1]
                for row in conn.execute(
                    text(
                        """
                        select column_name, data_type
                        from information_schema.columns
                        where table_name = 'sprint_exam_v2_retake_approvals'
                        """
                    )
                )
            }
            self.assertEqual(retake_columns["expires_at"], "timestamp with time zone")
            self.assertEqual(retake_columns["cancelled_at"], "timestamp with time zone")
            self.assertEqual(retake_columns["metadata"], "jsonb")

            publication_columns = {
                row[0]: row[1]
                for row in conn.execute(
                    text(
                        """
                        select column_name, data_type
                        from information_schema.columns
                        where table_name = 'sprint_exam_v2_result_publications'
                        """
                    )
                )
            }
            self.assertEqual(publication_columns["status"], "character varying")
            self.assertEqual(publication_columns["show_total_score"], "boolean")
            self.assertEqual(publication_columns["published_at"], "timestamp with time zone")

            publication_log_columns = {
                row[0]: row[1]
                for row in conn.execute(
                    text(
                        """
                        select column_name, data_type
                        from information_schema.columns
                        where table_name = 'sprint_exam_v2_result_publication_logs'
                        """
                    )
                )
            }
            self.assertEqual(publication_log_columns["previous_snapshot"], "jsonb")
            self.assertEqual(publication_log_columns["new_snapshot"], "jsonb")

            constraints = {
                row[0]
                for row in conn.execute(
                    text(
                        """
                        select conname
                        from pg_constraint
                        where conrelid in (
                            select oid from pg_class where relname like 'sprint_exam_v2_%'
                        )
                        """
                    )
                )
            }
            self.assertIn("uq_sprint_exam_v2_score_groups_exam_code", constraints)
            self.assertIn("ck_sprint_exam_v2_papers_role", constraints)
            self.assertIn("fk_sprint_exam_v2_retake_approvals_source_attempt", constraints)
            self.assertIn("ck_sprint_exam_v2_assignments_attempt_limit", constraints)
            self.assertIn("ck_sprint_exam_v2_assignments_paper_selection_mode", constraints)
            self.assertIn("uq_sprint_exam_v2_result_publications_attempt", constraints)
            self.assertIn("ck_sprint_exam_v2_result_publications_status", constraints)
            self.assertIn("ck_sprint_exam_v2_result_publication_logs_action", constraints)

            indexes = {
                row[0]
                for row in conn.execute(
                    text("select indexname from pg_indexes where schemaname = 'public' and indexname like 'ix_sprint_exam_v2_%'")
                )
            }
            self.assertIn("ix_sprint_exam_v2_exams_exam_date", indexes)
            self.assertIn("ix_sprint_exam_v2_scores_score_group_id", indexes)
            self.assertIn("ix_sprint_exam_v2_retake_approvals_expires_at", indexes)
            all_v2_indexes = {
                row[0]
                for row in conn.execute(
                    text("select indexname from pg_indexes where schemaname = 'public' and indexname like '%sprint_exam_v2_%'")
                )
            }
            self.assertIn("uq_sprint_exam_v2_attempts_assignment_started", all_v2_indexes)
            self.assertIn("uq_sprint_exam_v2_attempts_retake_approval_id", all_v2_indexes)

        self._drop_v2_tables()
        with self.engine.connect() as conn:
            remaining_v2_tables = conn.execute(
                text("select count(*) from pg_tables where schemaname = 'public' and tablename like 'sprint_exam_v2_%'")
            ).scalar_one()
            self.assertEqual(remaining_v2_tables, 0)
            self.assertTrue(
                conn.execute(text("select to_regclass('public.math_textbooks') is not null")).scalar_one()
            )
            self.assertTrue(
                conn.execute(text("select to_regclass('public.sprint_programs') is not null")).scalar_one()
            )

        self._run_021_migration()
        with self.engine.connect() as conn:
            recreated_v2_tables = conn.execute(
                text("select count(*) from pg_tables where schemaname = 'public' and tablename like 'sprint_exam_v2_%'")
            ).scalar_one()
            self.assertEqual(recreated_v2_tables, 14)

    def test_02_crud_round_trip_update_replace_cascade_and_delete(self):
        created = sprint_exam_v2_service.create_exam(self.db, VALID_PAYLOAD)
        exam_id = created["exam"]["id"]

        self.assertEqual(created["exam"]["source_label"], "9월 평가원")
        self.assertEqual(created["exam"]["metadata"], {"round": 9, "provider": "KICE"})
        self.assertEqual(created["total_score_group_count"], 6)
        self.assertEqual(created["total_paper_count"], 8)
        self.assertEqual(created["total_question_count"], 9)
        self.assertEqual(created["score_groups"][0]["assignment_max_score"], 10)

        stored_exam = self.db.get(models.SprintExamV2, exam_id)
        self.assertEqual(stored_exam.source_label, "9월 평가원")
        self.assertEqual(stored_exam.metadata_json, {"round": 9, "provider": "KICE"})
        self.assertIsNone(stored_exam.parse_summary)

        listed = sprint_exam_v2_service.list_exams(self.db, search="평가원", date_from=date(2026, 1, 1), date_to=date(2026, 12, 31))
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["paper_count"], 8)

        detailed = sprint_exam_v2_service.get_exam(self.db, exam_id)
        self.assertEqual(detailed["score_groups"][4]["papers"][0]["slot"], "inquiry_1")

        patch_payload = {
            "exam": {
                "title": "2026 9월 모의고사 수정",
                "source_label": "수정 출처",
                "description": "수정 설명",
                "metadata": {"round": 9, "updated": True},
            }
        }
        patched = sprint_exam_v2_service.update_exam(self.db, exam_id, patch_payload)
        self.assertEqual(patched["exam"]["title"], "2026 9월 모의고사 수정")
        self.assertEqual(patched["exam"]["source_label"], "수정 출처")
        self.assertEqual(patched["exam"]["metadata"], {"round": 9, "updated": True})

        replacement_payload = {
            "exam": patched["exam"],
            "score_groups": [VALID_PAYLOAD["score_groups"][2]],
        }
        replaced = sprint_exam_v2_service.update_exam(self.db, exam_id, replacement_payload)
        self.assertEqual(replaced["total_score_group_count"], 1)
        self.assertEqual(replaced["total_paper_count"], 1)
        self.assertEqual(self.db.query(models.SprintExamV2Paper).filter_by(exam_id=exam_id).count(), 1)

        deleted = sprint_exam_v2_service.delete_exam(self.db, exam_id)
        self.assertEqual(deleted, {"ok": True, "deleted_exam_id": exam_id})
        self.assertEqual(self.db.query(models.SprintExamV2ScoreGroup).count(), 0)
        self.assertEqual(self.db.query(models.SprintExamV2Paper).count(), 0)
        self.assertEqual(self.db.query(models.SprintExamV2Question).count(), 0)
        self.assertEqual(self.db.query(models.SprintExamV2GradeCut).count(), 0)

    def test_03_transaction_rollback_and_db_constraints(self):
        with self.assertRaises(IntegrityError):
            with self.engine.begin() as conn:
                conn.execute(
                    text(
                        "insert into sprint_exam_v2_score_groups "
                        "(exam_id, score_group_code, score_group_name, subject_area, aggregation_type) "
                        "values (999999, 'bad-code', 'Bad', 'korean', 'sum')"
                    )
                )

        try:
            sprint_exam_v2_service.create_exam(
                self.db,
                {
                    **VALID_PAYLOAD,
                    "score_groups": [
                        {
                            **VALID_PAYLOAD["score_groups"][0],
                            "score_group_code": "bad-code",
                        }
                    ],
                },
            )
        except Exception:
            pass
        self.assertEqual(self.db.query(models.SprintExamV2).count(), 0)
        self.db.execute(text("select 1")).scalar_one()

    def test_04_assigned_exam_locks_structure_and_delete_but_allows_metadata(self):
        created = sprint_exam_v2_service.create_exam(self.db, VALID_PAYLOAD)
        exam_id = created["exam"]["id"]
        student = models.Student(name="PG 학생", phone="01099990000", grade="고3")
        self.db.add(student)
        self.db.flush()
        program = models.SprintProgram(
            student_id=student.id,
            title="PG Sprint",
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 30),
        )
        self.db.add(program)
        self.db.flush()
        self.db.add(models.SprintExamV2Assignment(exam_id=exam_id, sprint_program_id=program.id, student_id=student.id))
        self.db.commit()

        patched = sprint_exam_v2_service.update_exam(
            self.db,
            exam_id,
            {"exam": {"title": "배정 후 제목 수정", "source_label": "locked", "metadata": {"locked": True}}},
        )
        self.assertEqual(patched["exam"]["title"], "배정 후 제목 수정")

        with self.assertRaises(sprint_exam_v2_service.SprintExamV2ConflictError) as update_error:
            sprint_exam_v2_service.update_exam(
                self.db,
                exam_id,
                {"exam": patched["exam"], "score_groups": [VALID_PAYLOAD["score_groups"][2]]},
            )
        self.assertEqual(update_error.exception.code, "ASSIGNED_EXAM_STRUCTURE_LOCKED")

        with self.assertRaises(sprint_exam_v2_service.SprintExamV2ConflictError) as delete_error:
            sprint_exam_v2_service.delete_exam(self.db, exam_id)
        self.assertEqual(delete_error.exception.code, "EXAM_HAS_ASSIGNMENTS")

    def test_05_asgi_api_statuses(self):
        db = self.db

        def override_db():
            yield db

        main.app.dependency_overrides[sprint_exam_v2.get_db] = override_db
        original_session_local = main.SessionLocal
        main.SessionLocal = self.SessionLocal
        try:
            admin_headers = self._admin_headers()
            status_code, body = self._asgi_call("POST", "/admin/sprint-exam-v2/exams", VALID_PAYLOAD, headers=admin_headers)
            self.assertEqual(status_code, 201)
            exam_id = body["exam"]["id"]

            status_code, body = self._asgi_call("GET", "/admin/sprint-exam-v2/exams", headers=admin_headers)
            self.assertEqual(status_code, 200)
            self.assertEqual(body["total"], 1)

            status_code, body = self._asgi_call("GET", f"/admin/sprint-exam-v2/exams/{exam_id}", headers=admin_headers)
            self.assertEqual(status_code, 200)

            status_code, body = self._asgi_call("PATCH", f"/admin/sprint-exam-v2/exams/{exam_id}", {"exam": {"title": "API 수정"}}, headers=admin_headers)
            self.assertEqual(status_code, 200)
            self.assertEqual(body["exam"]["title"], "API 수정")

            status_code, body = self._asgi_call("POST", "/admin/sprint-exam-v2/exams", {"exam": {"title": ""}, "score_groups": []}, headers=admin_headers)
            self.assertEqual(status_code, 400)
            self.assertEqual(body["detail"]["code"], "MISSING_EXAM_TITLE")

            status_code, body = self._asgi_call("POST", "/admin/sprint-exam-v2/exams", {}, headers=admin_headers)
            self.assertEqual(status_code, 422)

            status_code, body = self._asgi_call("GET", "/admin/sprint-exam-v2/exams/999999", headers=admin_headers)
            self.assertEqual(status_code, 404)

            status_code, body = self._asgi_call("DELETE", f"/admin/sprint-exam-v2/exams/{exam_id}", headers=admin_headers)
            self.assertEqual(status_code, 200)
            self.assertEqual(body["deleted_exam_id"], exam_id)
        finally:
            main.SessionLocal = original_session_local
            main.app.dependency_overrides.pop(sprint_exam_v2.get_db, None)

    def _asgi_call(
        self,
        method: str,
        path: str,
        body: dict | None = None,
        headers: list[tuple[bytes, bytes]] | None = None,
    ):
        import asyncio

        async def call():
            encoded = b"" if body is None else json.dumps(body).encode("utf-8")
            messages = [{"type": "http.request", "body": encoded, "more_body": False}]
            send_events = []

            async def receive():
                if messages:
                    return messages.pop(0)
                return {"type": "http.disconnect"}

            async def send(message):
                send_events.append(message)

            request_headers = [(b"content-type", b"application/json"), (b"host", b"testserver")]
            if headers:
                request_headers.extend(headers)
            scope = {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": method,
                "scheme": "http",
                "path": path,
                "raw_path": path.encode("utf-8"),
                "query_string": b"",
                "headers": request_headers,
                "client": ("127.0.0.1", 123),
                "server": ("127.0.0.1", 8000),
                "root_path": "",
            }
            await main.app(scope, receive, send)
            status = next(event["status"] for event in send_events if event["type"] == "http.response.start")
            body_bytes = b"".join(event.get("body", b"") for event in send_events if event["type"] == "http.response.body")
            return status, json.loads(body_bytes.decode("utf-8")) if body_bytes else None

        return asyncio.run(call())

    def test_06_assignment_service_and_student_scope(self):
        created_exam = sprint_exam_v2_service.create_exam(self.db, VALID_PAYLOAD)
        exam_id = created_exam["exam"]["id"]
        student_one = models.Student(
            name="PG 학생 1",
            phone="01090000001",
            grade="고3",
            korean_elective="korean_language_media",
            math_elective="math_calculus",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        student_two = models.Student(
            name="PG 학생 2",
            phone="01090000002",
            grade="고3",
            korean_elective="korean_language_media",
            math_elective="math_calculus",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        self.db.add_all([student_one, student_two])
        self.db.flush()
        self.db.add_all(
            [
                models.SprintProgram(
                    student_id=student_one.id,
                    title="PG Sprint 1",
                    start_date=date(2026, 9, 1),
                    end_date=date(2026, 9, 30),
                    is_active=True,
                ),
                models.SprintProgram(
                    student_id=student_two.id,
                    title="PG Sprint 2",
                    start_date=date(2026, 9, 1),
                    end_date=date(2026, 9, 30),
                    is_active=True,
                ),
            ]
        )
        self.db.commit()

        assigned = sprint_exam_v2_assignment_service.create_assignments(
            self.db,
            {
                "exam_id": exam_id,
                "student_ids": [student_one.id, student_two.id],
                "available_from": None,
                "due_at": None,
                "paper_selection_mode": "student_profile",
            },
        )

        self.assertTrue(assigned["ok"])
        self.assertEqual(len(assigned["created"]), 2)
        assignment_one_id = assigned["created"][0]["assignment_id"]
        detail = sprint_exam_v2_assignment_service.serialize_assignment_detail(
            self.db,
            sprint_exam_v2_assignment_service.get_assignment(self.db, assignment_one_id),
        )
        self.assertEqual(detail["assignment"]["student_id"], student_one.id)
        self.assertEqual(detail["assignment"]["attempt_count"], 0)
        self.assertIsNone(detail["active_attempt"])
        self.assertIsNone(detail["latest_attempt"])
        self.assertEqual(detail["attempts"], [])
        self.assertEqual(detail["student"]["korean_elective"], "korean_language_media")
        self.assertEqual([paper["subject_code"] for paper in detail["papers"]], [
            "korean_common",
            "korean_language_media",
            "math_common",
            "math_calculus",
            "english",
            "korean_history",
            "life_ethics",
            "social_culture",
        ])
        self.assertNotIn("correct_answers", json.dumps(detail, ensure_ascii=False))
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
            self._assert_key_absent_recursive(detail, forbidden_key)

        with self.assertRaises(sprint_exam_v2_assignment_service.SprintExamV2AssignmentConflictError) as duplicate_error:
            sprint_exam_v2_assignment_service.create_assignments(
                self.db,
                {"exam_id": exam_id, "student_ids": [student_one.id]},
            )
        self.assertEqual(duplicate_error.exception.code, "DUPLICATE_EXAM_ASSIGNMENT")

        admin_list = sprint_exam_v2_assignment_service.list_admin_assignments(self.db, search="PG")
        self.assertEqual(admin_list["total"], 2)
        student_list = sprint_exam_v2_assignment_service.list_student_assignments(self.db, student_one.id)
        self.assertEqual(len(student_list["items"]), 1)
        self.assertIsNone(student_list["items"][0]["latest_attempt"])
        with self.assertRaises(sprint_exam_v2_assignment_service.SprintExamV2AssignmentNotFoundError):
            sprint_exam_v2_assignment_service.get_student_assignment(self.db, assignment_one_id, student_two.id)

        patched = sprint_exam_v2_assignment_service.update_assignment(
            self.db,
            assignment_one_id,
            {"due_at": None, "paper_overrides": {"korean_total": "korean_language_media"}},
        )
        self.assertIn("korean_language_media", [paper["subject_code"] for paper in patched["papers"]])

        self.db.add(models.SprintExamV2Attempt(assignment_id=assignment_one_id, attempt_no=1, status="started"))
        self.db.commit()
        with self.assertRaises(sprint_exam_v2_assignment_service.SprintExamV2AssignmentConflictError) as update_error:
            sprint_exam_v2_assignment_service.update_assignment(
                self.db,
                assignment_one_id,
                {"paper_overrides": {"korean_total": "korean_language_media"}},
            )
        self.assertEqual(update_error.exception.code, "ASSIGNMENT_PAPERS_LOCKED")
        with self.assertRaises(sprint_exam_v2_assignment_service.SprintExamV2AssignmentConflictError) as delete_error:
            sprint_exam_v2_assignment_service.delete_assignment(self.db, assignment_one_id)
        self.assertEqual(delete_error.exception.code, "ASSIGNMENT_HAS_ATTEMPTS")

        assignment_two_id = assigned["created"][1]["assignment_id"]
        deleted = sprint_exam_v2_assignment_service.delete_assignment(self.db, assignment_two_id)
        self.assertEqual(deleted["deleted_assignment_id"], assignment_two_id)
        self.assertEqual(
            self.db.query(models.SprintExamV2AssignmentPaper).filter_by(assignment_id=assignment_two_id).count(),
            0,
        )

    def test_07_student_assignment_attempt_summaries_are_scoped_sorted_and_sanitized(self):
        _, student, assignment_id = self._create_v2_assignment_for_student(phone="01090000030", attempt_limit=3)
        other_student = models.Student(name="Attempt Scope Other", phone="01090000031", grade="high")
        self.db.add(other_student)
        self.db.commit()

        def detail():
            return sprint_exam_v2_assignment_service.get_student_assignment(self.db, assignment_id, student.id)

        empty = detail()
        self.assertIsNone(empty["active_attempt"])
        self.assertIsNone(empty["latest_attempt"])
        self.assertEqual(empty["attempts"], [])

        started_one = models.SprintExamV2Attempt(assignment_id=assignment_id, attempt_no=1, status="started")
        self.db.add(started_one)
        self.db.commit()
        started_detail = detail()
        self.assertEqual(started_detail["active_attempt"]["id"], started_one.id)
        self.assertEqual(started_detail["latest_attempt"]["id"], started_one.id)

        started_one.status = "submitted"
        started_one.submitted_at = datetime.now(timezone.utc)
        self.db.commit()
        submitted_detail = detail()
        self.assertIsNone(submitted_detail["active_attempt"])
        self.assertEqual(submitted_detail["latest_attempt"]["status"], "submitted")

        started_one.status = "scored"
        started_one.scored_at = datetime.now(timezone.utc)
        started_two = models.SprintExamV2Attempt(assignment_id=assignment_id, attempt_no=2, status="started")
        self.db.add(started_two)
        self.db.commit()
        scored_started_detail = detail()
        self.assertEqual(scored_started_detail["active_attempt"]["id"], started_two.id)
        self.assertEqual(scored_started_detail["latest_attempt"]["id"], started_two.id)
        self.assertEqual([item["attempt_no"] for item in scored_started_detail["attempts"]], [1, 2])

        started_two.status = "voided"
        started_two.voided_at = datetime.now(timezone.utc)
        self.db.commit()
        scored_voided_detail = detail()
        self.assertIsNone(scored_voided_detail["active_attempt"])
        self.assertEqual(scored_voided_detail["latest_attempt"]["status"], "voided")
        self.assertEqual(scored_voided_detail["attempts"][0]["status"], "scored")
        self.assertEqual(scored_voided_detail["attempts"][1]["status"], "voided")

        list_payload = sprint_exam_v2_assignment_service.list_student_assignments(self.db, student.id)
        self.assertEqual(list_payload["items"][0]["latest_attempt"]["id"], started_two.id)
        for payload in [scored_voided_detail, list_payload]:
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

        with self.assertRaises(sprint_exam_v2_assignment_service.SprintExamV2AssignmentNotFoundError):
            sprint_exam_v2_assignment_service.get_student_assignment(self.db, assignment_id, other_student.id)

    def test_08_assignment_asgi_routes_and_student_cookie(self):
        created_exam = sprint_exam_v2_service.create_exam(self.db, VALID_PAYLOAD)
        student = models.Student(
            name="API 학생",
            phone="01090000003",
            grade="고3",
            korean_elective="korean_language_media",
            math_elective="math_calculus",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        other_student = models.Student(name="다른 학생", phone="01090000004", grade="고3")
        self.db.add_all([student, other_student])
        self.db.flush()
        self.db.add(models.SprintProgram(student_id=student.id, title="API Sprint", start_date=date(2026, 9, 1), end_date=date(2026, 9, 30)))
        self.db.commit()
        token = "assignment-test-token"
        self.db.add(
            models.StudentSession(
                student_id=student.id,
                token_hash=student_auth.hash_token(token),
                expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc),
            )
        )
        self.db.commit()

        def override_db():
            session = self.SessionLocal()
            try:
                yield session
            finally:
                session.close()

        main.app.dependency_overrides[sprint_exam_v2_assignment.get_db] = override_db
        original_session_local = main.SessionLocal
        main.SessionLocal = self.SessionLocal
        try:
            admin_headers = self._admin_headers()
            status_code, body = self._asgi_call(
                "POST",
                "/admin/sprint-exam-v2/assignments",
                {"exam_id": created_exam["exam"]["id"], "student_ids": [student.id]},
                headers=admin_headers,
            )
            self.assertEqual(status_code, 200)
            assignment_id = body["created"][0]["assignment_id"]

            status_code, body = self._asgi_call("GET", "/admin/sprint-exam-v2/assignments", headers=admin_headers)
            self.assertEqual(status_code, 200)
            self.assertEqual(body["total"], 1)

            status_code, body = self._asgi_call("GET", f"/admin/sprint-exam-v2/assignments/{assignment_id}", headers=admin_headers)
            self.assertEqual(status_code, 200)
            self.assertEqual(body["assignment"]["id"], assignment_id)

            status_code, body = self._asgi_call(
                "GET",
                "/student/sprint-exam-v2/assignments",
                headers=[(b"cookie", f"{student_auth.STUDENT_SESSION_COOKIE}={token}".encode("utf-8"))],
            )
            self.assertEqual(status_code, 200)
            self.assertEqual(len(body["items"]), 1)

            status_code, body = self._asgi_call(
                "GET",
                f"/student/sprint-exam-v2/assignments/{assignment_id}",
                headers=[(b"cookie", f"{student_auth.STUDENT_SESSION_COOKIE}={token}".encode("utf-8"))],
            )
            self.assertEqual(status_code, 200)
            self.assertEqual(body["assignment"]["id"], assignment_id)

            status_code, body = self._asgi_call("POST", "/admin/sprint-exam-v2/assignments", {"exam_id": created_exam["exam"]["id"], "student_ids": [student.id]}, headers=admin_headers)
            self.assertEqual(status_code, 409)
            self.assertEqual(body["detail"]["code"], "DUPLICATE_EXAM_ASSIGNMENT")
        finally:
            main.SessionLocal = original_session_local
            main.app.dependency_overrides.pop(sprint_exam_v2_assignment.get_db, None)

    def test_08_attempt_service_lifecycle_and_locks(self):
        created_exam = sprint_exam_v2_service.create_exam(self.db, VALID_PAYLOAD)
        korean_group = (
            self.db.query(models.SprintExamV2ScoreGroup)
            .filter(
                models.SprintExamV2ScoreGroup.exam_id == created_exam["exam"]["id"],
                models.SprintExamV2ScoreGroup.score_group_code == "korean_total",
            )
            .one()
        )
        unassigned_paper = models.SprintExamV2Paper(
            exam_id=created_exam["exam"]["id"],
            score_group_id=korean_group.id,
            subject_code="korean_speech_writing",
            subject_name="?붾쾿怨??묐Ц",
            paper_role="elective",
            total_points=2,
            question_count=1,
            source_order=2,
        )
        self.db.add(unassigned_paper)
        self.db.flush()
        self.db.add(
            models.SprintExamV2Question(
                paper_id=unassigned_paper.id,
                question_no=35,
                answer_type="choice",
                correct_answers=["1"],
                points=2,
                question_metadata={},
            )
        )
        self.db.commit()
        student = models.Student(
            name="Attempt ?숈깮",
            phone="01090000005",
            grade="怨?",
            korean_elective="korean_language_media",
            math_elective="math_calculus",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        other_student = models.Student(
            name="Attempt ?ㅻⅨ ?숈깮",
            phone="01090000006",
            grade="怨?",
            korean_elective="korean_language_media",
            math_elective="math_calculus",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        self.db.add_all([student, other_student])
        self.db.flush()
        self.db.add_all(
            [
                models.SprintProgram(student_id=student.id, title="Attempt Sprint", start_date=date(2026, 9, 1), end_date=date(2026, 9, 30), is_active=True),
                models.SprintProgram(student_id=other_student.id, title="Other Attempt Sprint", start_date=date(2026, 9, 1), end_date=date(2026, 9, 30), is_active=True),
            ]
        )
        self.db.commit()

        assigned = sprint_exam_v2_assignment_service.create_assignments(
            self.db,
            {
                "exam_id": created_exam["exam"]["id"],
                "student_ids": [student.id],
                "attempt_limit": 2,
                "memo": "admin memo",
            },
        )
        assignment_id = assigned["created"][0]["assignment_id"]
        assignment = sprint_exam_v2_assignment_service.get_assignment(self.db, assignment_id)
        self.assertEqual(assignment.attempt_limit, 2)
        self.assertEqual(assignment.memo, "admin memo")
        self.assertEqual(assignment.paper_selection_mode, "student_profile")

        started = sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        self.assertTrue(started["created"])
        attempt_id = started["attempt"]["id"]
        self.assertEqual(started["attempt"]["attempt_no"], 1)

        restarted = sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        self.assertFalse(restarted["created"])
        self.assertEqual(restarted["attempt"]["id"], attempt_id)

        with self.assertRaises(sprint_exam_v2_attempt_service.SprintExamV2AttemptNotFoundError):
            sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, other_student.id)

        detail = sprint_exam_v2_attempt_service.get_attempt(self.db, attempt_id, student.id)
        serialized = json.dumps(detail, ensure_ascii=False)
        self.assertNotIn("correct_answers", serialized)
        self.assertNotIn("grade_cuts", serialized)
        self.assertNotIn("is_correct", serialized)
        self.assertNotIn("earned_score", serialized)
        self.assertNotIn("raw_score_min", serialized)
        paper_subjects = [paper["subject_code"] for paper in detail["papers"]]
        self.assertIn("korean_language_media", paper_subjects)
        self.assertNotIn("korean_speech_writing", paper_subjects)

        questions = [question for paper in detail["papers"] for question in paper["questions"]]
        first_choice = next(question for question in questions if question["question_type"] == "choice")
        first_short = next(question for question in questions if question["question_type"] == "short_answer")

        saved = sprint_exam_v2_attempt_service.save_responses(
            self.db,
            attempt_id,
            student.id,
            [
                {"question_id": first_choice["id"], "answer": ["2"]},
                {"question_id": first_short["id"], "answer": ["17"]},
                {"question_id": first_short["id"], "answer": ["18"]},
            ],
        )
        self.assertTrue(saved["ok"])
        self.assertEqual(saved["saved_count"], 2)
        self.assertEqual(saved["answered_count"], 2)
        restored = sprint_exam_v2_attempt_service.get_attempt(self.db, attempt_id, student.id)
        restored_short = [
            question
            for paper in restored["papers"]
            for question in paper["questions"]
            if question["id"] == first_short["id"]
        ][0]
        self.assertEqual(restored_short["response"]["answer"], ["18"])

        deleted = sprint_exam_v2_attempt_service.save_response(self.db, attempt_id, student.id, first_choice["id"], [])
        self.assertEqual(deleted["deleted_count"], 1)
        self.assertEqual(deleted["answered_count"], 1)

        unassigned_question = (
            self.db.query(models.SprintExamV2Question)
            .join(models.SprintExamV2Paper)
            .filter(models.SprintExamV2Paper.subject_code == "korean_speech_writing")
            .first()
        )
        with self.assertRaises(sprint_exam_v2_attempt_service.SprintExamV2AttemptConflictError) as unassigned_error:
            sprint_exam_v2_attempt_service.save_response(self.db, attempt_id, student.id, unassigned_question.id, ["1"])
        self.assertEqual(unassigned_error.exception.code, "QUESTION_NOT_ASSIGNED")

        submitted = sprint_exam_v2_attempt_service.submit_attempt(self.db, attempt_id, student.id)
        self.assertEqual(submitted["status"], "submitted")
        self.assertGreater(submitted["unanswered_count"], 0)
        self.assertEqual(self.db.query(models.SprintExamV2Score).count(), 0)
        self.assertEqual(self.db.query(models.SprintExamV2ScoreLog).count(), 0)

        submitted_again = sprint_exam_v2_attempt_service.submit_attempt(self.db, attempt_id, student.id)
        self.assertEqual(submitted_again["submitted_at"], submitted["submitted_at"])

        with self.assertRaises(sprint_exam_v2_attempt_service.SprintExamV2AttemptConflictError) as edit_after_submit:
            sprint_exam_v2_attempt_service.save_response(self.db, attempt_id, student.id, first_short["id"], ["19"])
        self.assertEqual(edit_after_submit.exception.code, "ATTEMPT_ALREADY_SUBMITTED")

        second = sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        self.assertTrue(second["created"])
        self.assertEqual(second["attempt"]["attempt_no"], 2)
        sprint_exam_v2_attempt_service.submit_attempt(self.db, second["attempt"]["id"], student.id)
        with self.assertRaises(sprint_exam_v2_attempt_service.SprintExamV2AttemptConflictError) as limit_error:
            sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        self.assertEqual(limit_error.exception.code, "RETAKE_APPROVAL_REQUIRED")
        self.assertTrue(limit_error.exception.context["needs_retake_approval"])

        with self.assertRaises(sprint_exam_v2_assignment_service.SprintExamV2AssignmentConflictError) as limit_update_error:
            sprint_exam_v2_assignment_service.update_assignment(self.db, assignment_id, {"attempt_limit": 1})
        self.assertEqual(limit_update_error.exception.code, "ATTEMPT_LIMIT_BELOW_CURRENT_ATTEMPTS")

    def test_09_attempt_asgi_routes_and_student_cookie(self):
        created_exam = sprint_exam_v2_service.create_exam(self.db, VALID_PAYLOAD)
        student = models.Student(
            name="Attempt API ?숈깮",
            phone="01090000007",
            grade="怨?",
            korean_elective="korean_language_media",
            math_elective="math_calculus",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        self.db.add(student)
        self.db.flush()
        self.db.add(models.SprintProgram(student_id=student.id, title="Attempt API Sprint", start_date=date(2026, 9, 1), end_date=date(2026, 9, 30), is_active=True))
        self.db.commit()
        token = "attempt-test-token"
        self.db.add(
            models.StudentSession(
                student_id=student.id,
                token_hash=student_auth.hash_token(token),
                expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc),
            )
        )
        self.db.commit()
        assigned = sprint_exam_v2_assignment_service.create_assignments(
            self.db,
            {"exam_id": created_exam["exam"]["id"], "student_ids": [student.id]},
        )
        assignment_id = assigned["created"][0]["assignment_id"]

        def override_db():
            session = self.SessionLocal()
            try:
                yield session
            finally:
                session.close()

        main.app.dependency_overrides[sprint_exam_v2_attempt.get_db] = override_db
        original_session_local = main.SessionLocal
        main.SessionLocal = self.SessionLocal
        cookie = [(b"cookie", f"{student_auth.STUDENT_SESSION_COOKIE}={token}".encode("utf-8"))]
        try:
            admin_headers = self._admin_headers()
            status_code, body = self._asgi_call(
                "POST",
                f"/student/sprint-exam-v2/assignments/{assignment_id}/start",
                headers=cookie,
            )
            self.assertEqual(status_code, 201)
            attempt_id = body["attempt"]["id"]

            status_code, body = self._asgi_call(
                "POST",
                f"/student/sprint-exam-v2/assignments/{assignment_id}/start",
                headers=cookie,
            )
            self.assertEqual(status_code, 200)
            self.assertFalse(body["created"])

            status_code, body = self._asgi_call(
                "GET",
                f"/student/sprint-exam-v2/attempts/{attempt_id}",
                headers=cookie,
            )
            self.assertEqual(status_code, 200)
            self.assertNotIn("correct_answers", json.dumps(body, ensure_ascii=False))
            question_id = body["papers"][0]["questions"][0]["id"]

            status_code, body = self._asgi_call(
                "PATCH",
                f"/student/sprint-exam-v2/attempts/{attempt_id}/responses/{question_id}",
                {"answer": ["2"]},
                headers=cookie,
            )
            self.assertEqual(status_code, 200)
            self.assertEqual(body["answered_count"], 1)

            status_code, body = self._asgi_call(
                "PUT",
                f"/student/sprint-exam-v2/attempts/{attempt_id}/responses",
                {"responses": [{"question_id": question_id, "answer": []}]},
                headers=cookie,
            )
            self.assertEqual(status_code, 200)
            self.assertEqual(body["deleted_count"], 1)

            status_code, body = self._asgi_call(
                "POST",
                f"/student/sprint-exam-v2/attempts/{attempt_id}/submit",
                headers=cookie,
            )
            self.assertEqual(status_code, 200)
            self.assertEqual(body["status"], "submitted")

            status_code, body = self._asgi_call(
                "POST",
                f"/student/sprint-exam-v2/attempts/{attempt_id}/submit",
                headers=cookie,
            )
            self.assertEqual(status_code, 200)
            self.assertEqual(body["status"], "submitted")

            status_code, body = self._asgi_call(
                "PATCH",
                f"/student/sprint-exam-v2/attempts/{attempt_id}/responses/{question_id}",
                {"answer": ["3"]},
                headers=cookie,
            )
            self.assertEqual(status_code, 409)
            self.assertEqual(body["detail"]["code"], "ATTEMPT_ALREADY_SUBMITTED")
        finally:
            main.SessionLocal = original_session_local
            main.app.dependency_overrides.pop(sprint_exam_v2_attempt.get_db, None)

    def test_10_attempt_start_rejects_time_window_and_empty_papers(self):
        created_exam = sprint_exam_v2_service.create_exam(self.db, VALID_PAYLOAD)
        student = models.Student(
            name="Attempt Window ?숈깮",
            phone="01090000008",
            grade="怨?",
            korean_elective="korean_language_media",
            math_elective="math_calculus",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        self.db.add(student)
        self.db.flush()
        program = models.SprintProgram(student_id=student.id, title="Window Sprint", start_date=date(2026, 9, 1), end_date=date(2026, 9, 30), is_active=True)
        self.db.add(program)
        self.db.commit()

        assigned = sprint_exam_v2_assignment_service.create_assignments(
            self.db,
            {
                "exam_id": created_exam["exam"]["id"],
                "student_ids": [student.id],
                "available_from": datetime.now(timezone.utc) + timedelta(hours=1),
            },
        )
        assignment_id = assigned["created"][0]["assignment_id"]
        with self.assertRaises(sprint_exam_v2_attempt_service.SprintExamV2AttemptConflictError) as not_available:
            sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        self.assertEqual(not_available.exception.code, "ASSIGNMENT_NOT_AVAILABLE_YET")

        sprint_exam_v2_assignment_service.update_assignment(
            self.db,
            assignment_id,
            {
                "available_from": None,
                "due_at": datetime.now(timezone.utc) - timedelta(minutes=1),
            },
        )
        with self.assertRaises(sprint_exam_v2_attempt_service.SprintExamV2AttemptConflictError) as expired:
            sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        self.assertEqual(expired.exception.code, "ASSIGNMENT_EXPIRED")

        second_exam = sprint_exam_v2_service.create_exam(
            self.db,
            {
                **VALID_PAYLOAD,
                "exam": {
                    **VALID_PAYLOAD["exam"],
                    "title": "No Paper Exam",
                    "exam_date": "2026-10-01",
                },
            },
        )
        empty_assignment = models.SprintExamV2Assignment(
            exam_id=second_exam["exam"]["id"],
            sprint_program_id=program.id,
            student_id=student.id,
            status="assigned",
            attempt_limit=1,
            paper_selection_mode="student_profile",
        )
        self.db.add(empty_assignment)
        self.db.commit()
        with self.assertRaises(sprint_exam_v2_attempt_service.SprintExamV2AttemptConflictError) as no_papers:
            sprint_exam_v2_attempt_service.start_attempt(self.db, empty_assignment.id, student.id)
        self.assertEqual(no_papers.exception.code, "ASSIGNMENT_HAS_NO_PAPERS")

    def test_11_concurrent_start_creates_single_started_attempt(self):
        created_exam = sprint_exam_v2_service.create_exam(self.db, VALID_PAYLOAD)
        student = models.Student(
            name="Concurrent Attempt ?숈깮",
            phone="01090000009",
            grade="怨?",
            korean_elective="korean_language_media",
            math_elective="math_calculus",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        self.db.add(student)
        self.db.flush()
        self.db.add(models.SprintProgram(student_id=student.id, title="Concurrent Sprint", start_date=date(2026, 9, 1), end_date=date(2026, 9, 30), is_active=True))
        self.db.commit()
        assigned = sprint_exam_v2_assignment_service.create_assignments(
            self.db,
            {"exam_id": created_exam["exam"]["id"], "student_ids": [student.id]},
        )
        assignment_id = assigned["created"][0]["assignment_id"]

        def start_in_new_session():
            session = self.SessionLocal()
            try:
                return sprint_exam_v2_attempt_service.start_attempt(session, assignment_id, student.id)
            finally:
                session.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: start_in_new_session(), range(2)))

        self.assertEqual(sum(1 for result in results if result["created"]), 1)
        self.assertEqual(len({result["attempt"]["id"] for result in results}), 1)
        self.assertEqual(
            self.db.query(models.SprintExamV2Attempt)
            .filter(
                models.SprintExamV2Attempt.assignment_id == assignment_id,
                models.SprintExamV2Attempt.status == "started",
            )
            .count(),
            1,
        )

    def test_12_scoring_service_scores_rescores_and_sanitizes_student_result(self):
        created_exam = sprint_exam_v2_service.create_exam(self.db, VALID_PAYLOAD)
        korean_cut = (
            self.db.query(models.SprintExamV2GradeCut)
            .join(models.SprintExamV2GradeCut.score_group)
            .filter(
                models.SprintExamV2ScoreGroup.exam_id == created_exam["exam"]["id"],
                models.SprintExamV2ScoreGroup.score_group_code == "korean_total",
                models.SprintExamV2GradeCut.grade == 1,
            )
            .one()
        )
        korean_cut.min_score = 9
        korean_group = korean_cut.score_group
        unselected_paper = models.SprintExamV2Paper(
            exam_id=created_exam["exam"]["id"],
            score_group_id=korean_group.id,
            subject_code="korean_speech_writing",
            subject_name="Unselected Korean Elective",
            paper_role="elective",
            total_points=2,
            question_count=1,
            omr_metadata={},
            source_order=99,
        )
        self.db.add(unselected_paper)
        self.db.flush()
        self.db.add(
            models.SprintExamV2Question(
                paper_id=unselected_paper.id,
                question_no=36,
                answer_type="choice",
                correct_answers=["1"],
                points=2,
                question_metadata={},
            )
        )
        self.db.commit()
        student = models.Student(
            name="Scoring 학생",
            phone="01090000010",
            grade="고3",
            korean_elective="korean_language_media",
            math_elective="math_calculus",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        other_student = models.Student(
            name="Scoring 다른 학생",
            phone="01090000011",
            grade="고3",
            korean_elective="korean_language_media",
            math_elective="math_calculus",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        self.db.add_all([student, other_student])
        self.db.flush()
        self.db.add_all(
            [
                models.SprintProgram(student_id=student.id, title="Scoring Sprint", start_date=date(2026, 9, 1), end_date=date(2026, 9, 30), is_active=True),
                models.SprintProgram(student_id=other_student.id, title="Other Scoring Sprint", start_date=date(2026, 9, 1), end_date=date(2026, 9, 30), is_active=True),
            ]
        )
        self.db.commit()
        assigned = sprint_exam_v2_assignment_service.create_assignments(
            self.db,
            {"exam_id": created_exam["exam"]["id"], "student_ids": [student.id]},
        )
        assignment_id = assigned["created"][0]["assignment_id"]
        started = sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        attempt_id = started["attempt"]["id"]

        with self.assertRaises(sprint_exam_v2_scoring_service.SprintExamV2ScoringConflictError) as started_error:
            sprint_exam_v2_scoring_service.score_attempt(self.db, attempt_id)
        self.assertEqual(started_error.exception.code, "ATTEMPT_NOT_SUBMITTED")

        detail = sprint_exam_v2_attempt_service.get_attempt(self.db, attempt_id, student.id)
        questions = [question for paper in detail["papers"] for question in paper["questions"]]
        by_subject_and_no = {
            (paper["subject_code"], question["question_no"]): question["id"]
            for paper in detail["papers"]
            for question in paper["questions"]
        }
        self.assertTrue(questions)
        sprint_exam_v2_attempt_service.save_responses(
            self.db,
            attempt_id,
            student.id,
            [
                {"question_id": by_subject_and_no[("korean_common", 1)], "answer": ["2"]},
                {"question_id": by_subject_and_no[("korean_common", 2)], "answer": ["18"]},
                {"question_id": by_subject_and_no[("korean_language_media", 35)], "answer": ["4", "1"]},
                {"question_id": by_subject_and_no[("math_common", 1)], "answer": ["20"]},
                {"question_id": by_subject_and_no[("math_calculus", 23)], "answer": ["2"]},
                {"question_id": by_subject_and_no[("english", 1)], "answer": ["1"]},
            ],
        )
        submitted = sprint_exam_v2_attempt_service.submit_attempt(self.db, attempt_id, student.id)
        self.assertEqual(submitted["status"], "submitted")
        self.assertEqual(self.db.query(models.SprintExamV2Score).count(), 0)
        self.assertEqual(self.db.query(models.SprintExamV2ScoreLog).count(), 0)

        scored = sprint_exam_v2_scoring_service.score_attempt(self.db, attempt_id)
        self.assertEqual(scored["status"], "scored")
        self.assertEqual(scored["summary"]["correct_count"], 4)
        self.assertEqual(scored["summary"]["incorrect_count"], 2)
        self.assertEqual(scored["summary"]["unanswered_count"], 3)
        self.assertEqual(scored["summary"]["max_score"], 23)
        scores_by_code = {score["score_group_code"]: score for score in scored["scores"]}
        self.assertEqual(scores_by_code["korean_total"]["raw_score"], 7)
        self.assertEqual(scores_by_code["korean_total"]["max_score"], 10)
        self.assertIsNone(scores_by_code["korean_total"]["grade"])
        self.assertEqual(scores_by_code["math_total"]["raw_score"], 2)
        self.assertEqual(scores_by_code["math_total"]["max_score"], 5)
        self.assertEqual(scores_by_code["life_ethics_total"]["raw_score"], 0)
        self.assertEqual(scores_by_code["life_ethics_total"]["max_score"], 2)
        self.assertEqual(scores_by_code["social_culture_total"]["raw_score"], 0)
        self.assertEqual(scores_by_code["social_culture_total"]["max_score"], 2)
        self.assertEqual(scores_by_code["english_total"]["raw_score"], 2)
        self.assertEqual(scores_by_code["english_total"]["max_score"], 2)
        self.assertEqual(scores_by_code["english_total"]["grade"], None)
        self.assertEqual(scores_by_code["korean_history_total"]["raw_score"], 0)
        self.assertEqual(scores_by_code["korean_history_total"]["max_score"], 2)
        self.assertNotEqual(scores_by_code["korean_total"]["max_score"], 12)
        self.assertEqual(self.db.query(models.SprintExamV2Score).count(), 6)
        self.assertEqual(self.db.query(models.SprintExamV2ScoreLog).count(), 6)
        self.assertEqual(self.db.get(models.SprintExamV2Attempt, attempt_id).status, "scored")
        correct_response = (
            self.db.query(models.SprintExamV2Response)
            .filter(
                models.SprintExamV2Response.attempt_id == attempt_id,
                models.SprintExamV2Response.question_id == by_subject_and_no[("korean_common", 1)],
            )
            .one()
        )
        self.assertIs(correct_response.is_correct, True)
        self.assertEqual(correct_response.awarded_points, 2)
        self.assertIsNotNone(correct_response.graded_at)
        wrong_response = (
            self.db.query(models.SprintExamV2Response)
            .filter(
                models.SprintExamV2Response.attempt_id == attempt_id,
                models.SprintExamV2Response.question_id == by_subject_and_no[("math_calculus", 23)],
            )
            .one()
        )
        self.assertIs(wrong_response.is_correct, False)
        self.assertEqual(wrong_response.awarded_points, 0)
        self.assertIsNotNone(wrong_response.graded_at)
        unanswered_response = (
            self.db.query(models.SprintExamV2Response)
            .filter(
                models.SprintExamV2Response.attempt_id == attempt_id,
                models.SprintExamV2Response.question_id == by_subject_and_no[("korean_history", 1)],
            )
            .first()
        )
        self.assertIsNone(unanswered_response)
        initial_logs = self.db.query(models.SprintExamV2ScoreLog).filter(models.SprintExamV2ScoreLog.attempt_id == attempt_id).all()
        initial_korean_log = next(log for log in initial_logs if log.new_score_snapshot.get("score_group_code") == "korean_total")
        self.assertEqual(initial_korean_log.trigger_type, "submit")
        self.assertEqual(initial_korean_log.message, "initial_scoring")
        self.assertIsNone(initial_korean_log.previous_score_snapshot)
        self.assertEqual(initial_korean_log.new_score_snapshot["raw_score"], 7)
        self.assertEqual(initial_korean_log.new_score_snapshot["max_score"], 10)

        with self.assertRaises(sprint_exam_v2_scoring_service.SprintExamV2ScoringConflictError) as duplicate_score:
            sprint_exam_v2_scoring_service.score_attempt(self.db, attempt_id)
        self.assertEqual(duplicate_score.exception.code, "ATTEMPT_ALREADY_SCORED")

        korean_question = self.db.get(models.SprintExamV2Question, by_subject_and_no[("korean_common", 2)])
        korean_question.correct_answers = ["18"]
        self.db.commit()
        rescored = sprint_exam_v2_scoring_service.score_attempt(self.db, attempt_id, reason="manual_rescore", rescore=True)
        self.assertEqual(rescored["summary"]["correct_count"], 5)
        self.assertEqual(self.db.query(models.SprintExamV2ScoreLog).count(), 12)
        updated_korean_score = (
            self.db.query(models.SprintExamV2Score)
            .join(models.SprintExamV2Score.score_group)
            .filter(models.SprintExamV2Score.attempt_id == attempt_id, models.SprintExamV2ScoreGroup.score_group_code == "korean_total")
            .one()
        )
        self.assertEqual(updated_korean_score.raw_score, 10)
        self.assertEqual(updated_korean_score.grade, 1)
        self.assertEqual(updated_korean_score.scoring_version, 2)
        rescore_logs = self.db.query(models.SprintExamV2ScoreLog).filter(models.SprintExamV2ScoreLog.attempt_id == attempt_id).all()
        korean_rescore_log = next(
            log
            for log in rescore_logs
            if log.message == "manual_rescore" and log.new_score_snapshot.get("score_group_code") == "korean_total"
        )
        self.assertEqual(korean_rescore_log.trigger_type, "admin_rescore")
        self.assertEqual(korean_rescore_log.previous_score_snapshot["raw_score"], 7)
        self.assertIsNone(korean_rescore_log.previous_score_snapshot["grade"])
        self.assertEqual(korean_rescore_log.previous_score_snapshot["scoring_version"], 1)
        self.assertEqual(korean_rescore_log.new_score_snapshot["raw_score"], 10)
        self.assertEqual(korean_rescore_log.new_score_snapshot["grade"], 1)
        self.assertEqual(korean_rescore_log.new_score_snapshot["scoring_version"], 2)

        same_result_rescore = sprint_exam_v2_scoring_service.score_attempt(self.db, attempt_id, reason="same_result_rescore", rescore=True)
        self.assertEqual(same_result_rescore["summary"]["correct_count"], 5)
        self.assertEqual(self.db.query(models.SprintExamV2ScoreLog).count(), 18)
        self.db.refresh(updated_korean_score)
        self.assertEqual(updated_korean_score.scoring_version, 3)
        same_result_logs = self.db.query(models.SprintExamV2ScoreLog).filter(models.SprintExamV2ScoreLog.attempt_id == attempt_id).all()
        same_result_korean_log = next(
            log
            for log in same_result_logs
            if log.message == "same_result_rescore" and log.new_score_snapshot.get("score_group_code") == "korean_total"
        )
        self.assertEqual(same_result_korean_log.previous_score_snapshot["raw_score"], 10)
        self.assertEqual(same_result_korean_log.new_score_snapshot["raw_score"], 10)

        admin_detail = sprint_exam_v2_scoring_service.get_admin_attempt_detail(self.db, attempt_id)
        admin_json = json.dumps(admin_detail, ensure_ascii=False)
        self.assertIn("correct_answers", admin_json)
        self.assertEqual(len(admin_detail["score_logs"]), 18)
        self.assertEqual(admin_detail["publication"]["computed_status"], "unpublished")

        with self.assertRaises(sprint_exam_v2_result_publication_service.SprintExamV2PublicationConflictError) as unpublished_result:
            sprint_exam_v2_scoring_service.get_student_result(self.db, attempt_id, student.id)
        self.assertEqual(unpublished_result.exception.code, "RESULT_NOT_PUBLISHED")

        published = sprint_exam_v2_result_publication_service.publish_attempt(self.db, attempt_id, {"message": "publish for result"}, actor_admin_id=None)
        self.assertEqual(published["publication"]["status"], "published")

        student_result = sprint_exam_v2_scoring_service.get_student_result(self.db, attempt_id, student.id)
        for forbidden_key in [
            "correct_answers",
            "grade_cuts",
            "min_score",
            "raw_score_min",
            "absolute_band",
            "score_logs",
            "previous_score_snapshot",
            "new_score_snapshot",
            "parse_diagnostics",
            "parser_diagnostics",
            "diagnostics",
        ]:
            self._assert_key_absent_recursive(student_result, forbidden_key)
        student_json = json.dumps(student_result, ensure_ascii=False)
        self.assertNotIn(other_student.name, student_json)
        self.assertNotIn(other_student.phone, student_json)
        self.assertEqual(student_result["summary"]["correct_count"], 5)
        with self.assertRaises(sprint_exam_v2_scoring_service.SprintExamV2ScoringNotFoundError):
            sprint_exam_v2_scoring_service.get_student_result(self.db, attempt_id, other_student.id)

    def test_13_scoring_asgi_routes_and_student_result_cookie(self):
        created_exam = sprint_exam_v2_service.create_exam(self.db, VALID_PAYLOAD)
        student = models.Student(
            name="Scoring API 학생",
            phone="01090000012",
            grade="고3",
            korean_elective="korean_language_media",
            math_elective="math_calculus",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        self.db.add(student)
        self.db.flush()
        self.db.add(models.SprintProgram(student_id=student.id, title="Scoring API Sprint", start_date=date(2026, 9, 1), end_date=date(2026, 9, 30), is_active=True))
        self.db.commit()
        token = "scoring-test-token"
        self.db.add(
            models.StudentSession(
                student_id=student.id,
                token_hash=student_auth.hash_token(token),
                expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc),
            )
        )
        self.db.commit()
        assigned = sprint_exam_v2_assignment_service.create_assignments(
            self.db,
            {"exam_id": created_exam["exam"]["id"], "student_ids": [student.id]},
        )
        assignment_id = assigned["created"][0]["assignment_id"]
        attempt_id = sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)["attempt"]["id"]
        detail = sprint_exam_v2_attempt_service.get_attempt(self.db, attempt_id, student.id)
        question_id = detail["papers"][0]["questions"][0]["id"]
        sprint_exam_v2_attempt_service.save_response(self.db, attempt_id, student.id, question_id, ["2"])
        sprint_exam_v2_attempt_service.submit_attempt(self.db, attempt_id, student.id)

        def override_db():
            session = self.SessionLocal()
            try:
                yield session
            finally:
                session.close()

        main.app.dependency_overrides[sprint_exam_v2_scoring.get_db] = override_db
        main.app.dependency_overrides[sprint_exam_v2_attempt.get_db] = override_db
        main.app.dependency_overrides[sprint_exam_v2_result_publication.get_db] = override_db
        original_session_local = main.SessionLocal
        main.SessionLocal = self.SessionLocal
        cookie = [(b"cookie", f"{student_auth.STUDENT_SESSION_COOKIE}={token}".encode("utf-8"))]
        try:
            admin_headers = self._admin_headers()
            status_code, body = self._asgi_call(
                "GET",
                f"/student/sprint-exam-v2/attempts/{attempt_id}/result",
                headers=cookie,
            )
            self.assertEqual(status_code, 409)
            self.assertEqual(body["detail"]["code"], "RESULT_NOT_SCORED")

            status_code, body = self._asgi_call(
                "POST",
                f"/admin/sprint-exam-v2/attempts/{attempt_id}/score",
                {"reason": "initial_scoring"},
                headers=admin_headers,
            )
            self.assertEqual(status_code, 200)
            self.assertEqual(body["status"], "scored")

            status_code, body = self._asgi_call(
                "GET",
                f"/admin/sprint-exam-v2/attempts/{attempt_id}",
                headers=admin_headers,
            )
            self.assertEqual(status_code, 200)
            self.assertIn("correct_answers", json.dumps(body, ensure_ascii=False))

            status_code, body = self._asgi_call(
                "GET",
                f"/student/sprint-exam-v2/attempts/{attempt_id}/result",
                headers=cookie,
            )
            self.assertEqual(status_code, 403)
            self.assertEqual(body["detail"]["code"], "RESULT_NOT_PUBLISHED")

            status_code, body = self._asgi_call(
                "POST",
                f"/admin/sprint-exam-v2/attempts/{attempt_id}/publish",
                {"show_correct_answers": False, "message": "api publish"},
                headers=admin_headers,
            )
            self.assertEqual(status_code, 200)
            self.assertEqual(body["publication"]["status"], "published")

            status_code, body = self._asgi_call(
                "GET",
                f"/student/sprint-exam-v2/attempts/{attempt_id}/result",
                headers=cookie,
            )
            self.assertEqual(status_code, 200)
            result_json = json.dumps(body, ensure_ascii=False)
            self.assertNotIn("correct_answers", result_json)
            self.assertNotIn("grade_cuts", result_json)
            self.assertIn("scores", body)

            status_code, body = self._asgi_call(
                "POST",
                f"/admin/sprint-exam-v2/attempts/{attempt_id}/rescore",
                {"reason": "manual_rescore"},
                headers=admin_headers,
            )
            self.assertEqual(status_code, 200)
            self.assertEqual(body["status"], "scored")
        finally:
            main.SessionLocal = original_session_local
            main.app.dependency_overrides.pop(sprint_exam_v2_scoring.get_db, None)
            main.app.dependency_overrides.pop(sprint_exam_v2_attempt.get_db, None)
            main.app.dependency_overrides.pop(sprint_exam_v2_result_publication.get_db, None)

    def test_14_scoring_rejects_voided_and_invalid_rescore_statuses(self):
        created_exam = sprint_exam_v2_service.create_exam(self.db, VALID_PAYLOAD)
        student = models.Student(
            name="Scoring Status Student",
            phone="01090000013",
            grade="high",
            korean_elective="korean_language_media",
            math_elective="math_calculus",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        self.db.add(student)
        self.db.flush()
        self.db.add(models.SprintProgram(student_id=student.id, title="Scoring Status Sprint", start_date=date(2026, 9, 1), end_date=date(2026, 9, 30), is_active=True))
        self.db.commit()
        assigned = sprint_exam_v2_assignment_service.create_assignments(
            self.db,
            {"exam_id": created_exam["exam"]["id"], "student_ids": [student.id]},
        )
        assignment_id = assigned["created"][0]["assignment_id"]
        attempt_id = sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)["attempt"]["id"]

        with self.assertRaises(sprint_exam_v2_scoring_service.SprintExamV2ScoringConflictError) as started_rescore:
            sprint_exam_v2_scoring_service.score_attempt(self.db, attempt_id, rescore=True)
        self.assertEqual(started_rescore.exception.code, "ATTEMPT_NOT_SCORED")

        attempt = self.db.get(models.SprintExamV2Attempt, attempt_id)
        attempt.status = "voided"
        attempt.voided_at = datetime.now(timezone.utc)
        self.db.commit()
        with self.assertRaises(sprint_exam_v2_scoring_service.SprintExamV2ScoringConflictError) as voided_initial:
            sprint_exam_v2_scoring_service.score_attempt(self.db, attempt_id)
        self.assertEqual(voided_initial.exception.code, "ATTEMPT_VOIDED")
        with self.assertRaises(sprint_exam_v2_scoring_service.SprintExamV2ScoringConflictError) as voided_rescore:
            sprint_exam_v2_scoring_service.score_attempt(self.db, attempt_id, rescore=True)
        self.assertEqual(voided_rescore.exception.code, "ATTEMPT_VOIDED")
        self.assertEqual(self.db.query(models.SprintExamV2Score).count(), 0)
        self.assertEqual(self.db.query(models.SprintExamV2ScoreLog).count(), 0)

    def test_15_grade_cut_conflicts_are_rejected_before_persist(self):
        duplicate_grade_payload = deepcopy(VALID_PAYLOAD)
        duplicate_grade_payload["score_groups"][0]["grade_cuts"] = [
            {"grade": 1, "min_score": 92, "cut_type": "raw_score_min"},
            {"grade": 1, "min_score": 90, "cut_type": "raw_score_min"},
        ]
        with self.assertRaises(sprint_exam_v2_service.SprintExamV2DomainError) as duplicate_cut:
            sprint_exam_v2_service.create_exam(self.db, duplicate_grade_payload)
        self.assertEqual(duplicate_cut.exception.code, "DUPLICATE_GRADE_CUT")
        self.assertEqual(self.db.query(models.SprintExamV2).count(), 0)

        conflicting_order_payload = deepcopy(VALID_PAYLOAD)
        conflicting_order_payload["score_groups"][0]["grade_cuts"] = [
            {"grade": 1, "min_score": 80, "cut_type": "raw_score_min"},
            {"grade": 2, "min_score": 90, "cut_type": "raw_score_min"},
        ]
        with self.assertRaises(sprint_exam_v2_service.SprintExamV2DomainError) as invalid_order:
            sprint_exam_v2_service.create_exam(self.db, conflicting_order_payload)
        self.assertEqual(invalid_order.exception.code, "INVALID_GRADE_CUT_ORDER")
        self.assertEqual(self.db.query(models.SprintExamV2).count(), 0)

    def test_16_scoring_transaction_rolls_back_partial_updates(self):
        created_exam = sprint_exam_v2_service.create_exam(self.db, VALID_PAYLOAD)
        student = models.Student(
            name="Scoring Rollback Student",
            phone="01090000014",
            grade="high",
            korean_elective="korean_language_media",
            math_elective="math_calculus",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        self.db.add(student)
        self.db.flush()
        self.db.add(models.SprintProgram(student_id=student.id, title="Scoring Rollback Sprint", start_date=date(2026, 9, 1), end_date=date(2026, 9, 30), is_active=True))
        self.db.commit()
        assigned = sprint_exam_v2_assignment_service.create_assignments(
            self.db,
            {"exam_id": created_exam["exam"]["id"], "student_ids": [student.id]},
        )
        attempt_id = sprint_exam_v2_attempt_service.start_attempt(self.db, assigned["created"][0]["assignment_id"], student.id)["attempt"]["id"]
        detail = sprint_exam_v2_attempt_service.get_attempt(self.db, attempt_id, student.id)
        question_id = detail["papers"][0]["questions"][0]["id"]
        sprint_exam_v2_attempt_service.save_response(self.db, attempt_id, student.id, question_id, ["2"])
        sprint_exam_v2_attempt_service.submit_attempt(self.db, attempt_id, student.id)

        original_upsert = sprint_exam_v2_scoring_service._upsert_scores_and_logs

        def fail_after_response_grading(*args, **kwargs):
            raise RuntimeError("forced scoring rollback")

        sprint_exam_v2_scoring_service._upsert_scores_and_logs = fail_after_response_grading
        try:
            with self.assertRaises(RuntimeError):
                sprint_exam_v2_scoring_service.score_attempt(self.db, attempt_id)
        finally:
            sprint_exam_v2_scoring_service._upsert_scores_and_logs = original_upsert

        self.assertEqual(self.db.execute(text("select 1")).scalar_one(), 1)
        attempt = self.db.get(models.SprintExamV2Attempt, attempt_id)
        self.assertEqual(attempt.status, "submitted")
        self.assertIsNone(attempt.scored_at)
        response = (
            self.db.query(models.SprintExamV2Response)
            .filter(
                models.SprintExamV2Response.attempt_id == attempt_id,
                models.SprintExamV2Response.question_id == question_id,
            )
            .one()
        )
        self.assertIsNone(response.is_correct)
        self.assertIsNone(response.awarded_points)
        self.assertIsNone(response.graded_at)
        self.assertEqual(self.db.query(models.SprintExamV2Score).count(), 0)
        self.assertEqual(self.db.query(models.SprintExamV2ScoreLog).count(), 0)

        fresh_session = self.SessionLocal()
        try:
            self.assertEqual(fresh_session.get(models.SprintExamV2Attempt, attempt_id).status, "submitted")
            self.assertEqual(fresh_session.query(models.SprintExamV2Score).count(), 0)
            self.assertEqual(fresh_session.execute(text("select 1")).scalar_one(), 1)
        finally:
            fresh_session.close()

        scored = sprint_exam_v2_scoring_service.score_attempt(self.db, attempt_id)
        self.assertEqual(scored["status"], "scored")
        self.assertEqual(self.db.query(models.SprintExamV2ScoreLog).count(), 6)

    def test_17_concurrent_score_attempt_creates_single_score_set(self):
        created_exam = sprint_exam_v2_service.create_exam(self.db, VALID_PAYLOAD)
        student = models.Student(
            name="Concurrent Scoring Student",
            phone="01090000015",
            grade="high",
            korean_elective="korean_language_media",
            math_elective="math_calculus",
            inquiry_subject_1="life_ethics",
            inquiry_subject_2="social_culture",
        )
        self.db.add(student)
        self.db.flush()
        self.db.add(models.SprintProgram(student_id=student.id, title="Concurrent Scoring Sprint", start_date=date(2026, 9, 1), end_date=date(2026, 9, 30), is_active=True))
        self.db.commit()
        assigned = sprint_exam_v2_assignment_service.create_assignments(
            self.db,
            {"exam_id": created_exam["exam"]["id"], "student_ids": [student.id]},
        )
        attempt_id = sprint_exam_v2_attempt_service.start_attempt(self.db, assigned["created"][0]["assignment_id"], student.id)["attempt"]["id"]
        detail = sprint_exam_v2_attempt_service.get_attempt(self.db, attempt_id, student.id)
        question_id = detail["papers"][0]["questions"][0]["id"]
        sprint_exam_v2_attempt_service.save_response(self.db, attempt_id, student.id, question_id, ["2"])
        sprint_exam_v2_attempt_service.submit_attempt(self.db, attempt_id, student.id)

        def score_in_new_session():
            session = self.SessionLocal()
            try:
                scored = sprint_exam_v2_scoring_service.score_attempt(session, attempt_id)
                return {"kind": "ok", "status": scored["status"]}
            except sprint_exam_v2_scoring_service.SprintExamV2ScoringConflictError as exc:
                return {"kind": "conflict", "detail": exc.detail()}
            finally:
                session.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: score_in_new_session(), range(2)))

        self.assertEqual(sum(1 for result in results if result["kind"] == "ok"), 1)
        self.assertEqual(sum(1 for result in results if result["kind"] == "conflict"), 1)
        conflict = next(result for result in results if result["kind"] == "conflict")
        self.assertEqual(conflict["detail"]["code"], "ATTEMPT_ALREADY_SCORED")
        conflict_json = json.dumps(conflict["detail"], ensure_ascii=False)
        self.assertNotIn("IntegrityError", conflict_json)
        self.assertNotIn("duplicate key", conflict_json)
        self.assertNotIn("SQL", conflict_json)
        self.db.expire_all()
        self.assertEqual(self.db.get(models.SprintExamV2Attempt, attempt_id).status, "scored")
        self.assertEqual(self.db.query(models.SprintExamV2Score).filter(models.SprintExamV2Score.attempt_id == attempt_id).count(), 6)
        self.assertEqual(self.db.query(models.SprintExamV2ScoreLog).filter(models.SprintExamV2ScoreLog.attempt_id == attempt_id).count(), 6)

    def test_18_retake_approval_admin_crud_status_and_assignment_delete_guard(self):
        created_exam, student, assignment_id = self._create_v2_assignment_for_student(phone="01090000016")
        future = datetime.now(timezone.utc) + timedelta(days=1)
        created = sprint_exam_v2_retake_approval_service.create_retake_approval(
            self.db,
            {"assignment_id": assignment_id, "reason": "extra attempt", "memo": "admin memo", "expires_at": future},
        )
        approval = created["approval"]
        self.assertEqual(approval["assignment_id"], assignment_id)
        self.assertEqual(approval["student_id"], student.id)
        self.assertEqual(approval["status"], "approved")
        self.assertEqual(approval["computed_status"], "available")
        self.assertEqual(approval["used_attempt_id"], None)
        self.assertEqual(approval["memo"], "admin memo")

        listed = sprint_exam_v2_retake_approval_service.list_retake_approvals(self.db, student_id=student.id)
        self.assertEqual(listed["total"], 1)
        listed_by_exam = sprint_exam_v2_retake_approval_service.list_retake_approvals(self.db, exam_id=created_exam["exam"]["id"])
        self.assertEqual(listed_by_exam["items"][0]["id"], approval["id"])
        detail = sprint_exam_v2_retake_approval_service.get_retake_approval_detail(self.db, approval["id"])
        self.assertEqual(detail["approval"]["assignment"]["base_attempt_count"], 0)
        self.assertTrue(detail["approval"]["can_cancel"])
        self.assertTrue(detail["approval"]["can_edit"])

        updated = sprint_exam_v2_retake_approval_service.update_retake_approval(
            self.db,
            approval["id"],
            {"reason": "updated reason", "memo": "updated memo", "expires_at": future + timedelta(days=1)},
        )
        self.assertEqual(updated["approval"]["reason"], "updated reason")
        self.assertEqual(updated["approval"]["memo"], "updated memo")

        with self.assertRaises(sprint_exam_v2_retake_approval_service.SprintExamV2RetakeApprovalDomainError) as past_expiry:
            sprint_exam_v2_retake_approval_service.create_retake_approval(
                self.db,
                {"assignment_id": assignment_id, "expires_at": datetime.now(timezone.utc) - timedelta(seconds=1)},
            )
        self.assertEqual(past_expiry.exception.code, "INVALID_RETAKE_APPROVAL_EXPIRY")

        with self.assertRaises(sprint_exam_v2_assignment_service.SprintExamV2AssignmentConflictError) as delete_error:
            sprint_exam_v2_assignment_service.delete_assignment(self.db, assignment_id)
        self.assertEqual(delete_error.exception.code, "ASSIGNMENT_HAS_RETAKE_APPROVALS")

        cancelled = sprint_exam_v2_retake_approval_service.cancel_retake_approval(self.db, approval["id"])
        self.assertEqual(cancelled["approval"]["status"], "cancelled")
        self.assertEqual(cancelled["approval"]["computed_status"], "cancelled")
        cancelled_again = sprint_exam_v2_retake_approval_service.cancel_retake_approval(self.db, approval["id"])
        self.assertEqual(cancelled_again["approval"]["computed_status"], "cancelled")

        with self.assertRaises(sprint_exam_v2_retake_approval_service.SprintExamV2RetakeApprovalConflictError) as edit_cancelled:
            sprint_exam_v2_retake_approval_service.update_retake_approval(self.db, approval["id"], {"reason": "cannot edit"})
        self.assertEqual(edit_cancelled.exception.code, "RETAKE_APPROVAL_NOT_EDITABLE")

    def test_19_retake_approval_start_consumes_once_and_preserves_attempt_numbering(self):
        _, student, assignment_id = self._create_v2_assignment_for_student(phone="01090000017", attempt_limit=1)
        base_started = sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        self.assertTrue(base_started["created"])
        self.assertEqual(base_started["start_type"], "base")
        sprint_exam_v2_attempt_service.submit_attempt(self.db, base_started["attempt"]["id"], student.id)

        with self.assertRaises(sprint_exam_v2_attempt_service.SprintExamV2AttemptConflictError) as needs_approval:
            sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        self.assertEqual(needs_approval.exception.code, "RETAKE_APPROVAL_REQUIRED")
        self.assertTrue(needs_approval.exception.context["needs_retake_approval"])

        expired = models.SprintExamV2RetakeApproval(
            assignment_id=assignment_id,
            status="approved",
            requested_reason="expired",
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
        cancelled = models.SprintExamV2RetakeApproval(
            assignment_id=assignment_id,
            status="cancelled",
            requested_reason="cancelled",
            expires_at=datetime.now(timezone.utc) + timedelta(days=2),
        )
        self.db.add_all([expired, cancelled])
        self.db.commit()
        with self.assertRaises(sprint_exam_v2_attempt_service.SprintExamV2AttemptConflictError):
            sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)

        late_approval = sprint_exam_v2_retake_approval_service.create_retake_approval(
            self.db,
            {"assignment_id": assignment_id, "reason": "late", "expires_at": datetime.now(timezone.utc) + timedelta(days=3)},
        )["approval"]
        early_approval = sprint_exam_v2_retake_approval_service.create_retake_approval(
            self.db,
            {"assignment_id": assignment_id, "reason": "early", "expires_at": datetime.now(timezone.utc) + timedelta(days=1)},
        )["approval"]
        retake_started = sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        self.assertTrue(retake_started["created"])
        self.assertEqual(retake_started["start_type"], "retake_approval")
        self.assertEqual(retake_started["attempt"]["attempt_no"], 2)
        self.assertEqual(retake_started["attempt"]["retake_approval_id"], early_approval["id"])
        self.assertEqual(retake_started["remaining"]["available_retake_approvals"], 1)
        used_approval = self.db.get(models.SprintExamV2RetakeApproval, early_approval["id"])
        self.assertEqual(used_approval.status, "approved")
        self.assertIsNotNone(used_approval.used_at)

        idempotent = sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        self.assertFalse(idempotent["created"])
        self.assertEqual(idempotent["attempt"]["id"], retake_started["attempt"]["id"])
        self.assertEqual(idempotent["remaining"]["available_retake_approvals"], 1)

        with self.assertRaises(sprint_exam_v2_retake_approval_service.SprintExamV2RetakeApprovalConflictError) as cancel_used:
            sprint_exam_v2_retake_approval_service.cancel_retake_approval(self.db, early_approval["id"])
        self.assertEqual(cancel_used.exception.code, "RETAKE_APPROVAL_NOT_CANCELLABLE")

        attempt = self.db.get(models.SprintExamV2Attempt, retake_started["attempt"]["id"])
        attempt.status = "voided"
        attempt.voided_at = datetime.now(timezone.utc)
        self.db.commit()
        next_retake = sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        self.assertEqual(next_retake["attempt"]["attempt_no"], 3)
        self.assertEqual(next_retake["attempt"]["retake_approval_id"], late_approval["id"])
        self.assertEqual(
            self.db.query(models.SprintExamV2Attempt)
            .filter(models.SprintExamV2Attempt.retake_approval_id == early_approval["id"])
            .count(),
            1,
        )

    def test_20_retake_approval_concurrent_start_uses_single_approval(self):
        _, student, assignment_id = self._create_v2_assignment_for_student(phone="01090000018", attempt_limit=1)
        base_started = sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        sprint_exam_v2_attempt_service.submit_attempt(self.db, base_started["attempt"]["id"], student.id)
        approval_id = sprint_exam_v2_retake_approval_service.create_retake_approval(
            self.db,
            {"assignment_id": assignment_id, "reason": "concurrent", "expires_at": datetime.now(timezone.utc) + timedelta(days=1)},
        )["approval"]["id"]

        def start_in_new_session():
            session = self.SessionLocal()
            try:
                result = sprint_exam_v2_attempt_service.start_attempt(session, assignment_id, student.id)
                return {"kind": "ok", "created": result["created"], "attempt_id": result["attempt"]["id"]}
            except sprint_exam_v2_attempt_service.SprintExamV2AttemptConflictError as exc:
                return {"kind": "conflict", "detail": exc.detail()}
            finally:
                session.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: start_in_new_session(), range(2)))

        self.assertEqual(sum(1 for result in results if result["kind"] == "ok"), 2)
        self.assertEqual(sum(1 for result in results if result["kind"] == "ok" and result["created"]), 1)
        self.assertEqual(len({result["attempt_id"] for result in results if result["kind"] == "ok"}), 1)
        self.db.expire_all()
        self.assertEqual(
            self.db.query(models.SprintExamV2Attempt)
            .filter(models.SprintExamV2Attempt.retake_approval_id == approval_id)
            .count(),
            1,
        )
        self.assertEqual(
            self.db.query(models.SprintExamV2Attempt)
            .filter(models.SprintExamV2Attempt.assignment_id == assignment_id, models.SprintExamV2Attempt.status == "started")
            .count(),
            1,
        )
        conflict_json = json.dumps(results, ensure_ascii=False)
        self.assertNotIn("IntegrityError", conflict_json)
        self.assertNotIn("duplicate key", conflict_json)

    def test_21_retake_start_transaction_rolls_back_approval_consumption(self):
        _, student, assignment_id = self._create_v2_assignment_for_student(phone="01090000019", attempt_limit=1)
        base_started = sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        sprint_exam_v2_attempt_service.submit_attempt(self.db, base_started["attempt"]["id"], student.id)
        approval_id = sprint_exam_v2_retake_approval_service.create_retake_approval(
            self.db,
            {"assignment_id": assignment_id, "reason": "rollback", "expires_at": datetime.now(timezone.utc) + timedelta(days=1)},
        )["approval"]["id"]

        original_commit = self.db.commit

        def fail_commit():
            raise RuntimeError("forced retake start rollback")

        self.db.commit = fail_commit
        try:
            with self.assertRaises(RuntimeError):
                sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        finally:
            self.db.commit = original_commit

        self.assertEqual(self.db.execute(text("select 1")).scalar_one(), 1)
        approval = self.db.get(models.SprintExamV2RetakeApproval, approval_id)
        self.assertIsNone(approval.used_at)
        self.assertEqual(
            self.db.query(models.SprintExamV2Attempt)
            .filter(models.SprintExamV2Attempt.retake_approval_id == approval_id)
            .count(),
            0,
        )
        fresh_session = self.SessionLocal()
        try:
            self.assertIsNone(fresh_session.get(models.SprintExamV2RetakeApproval, approval_id).used_at)
            self.assertEqual(fresh_session.execute(text("select 1")).scalar_one(), 1)
        finally:
            fresh_session.close()

        started = sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        self.assertEqual(started["attempt"]["retake_approval_id"], approval_id)

    def test_22_retake_approval_asgi_routes_and_student_start_cookie(self):
        _, student, assignment_id = self._create_v2_assignment_for_student(phone="01090000020", attempt_limit=1)
        token = "retake-start-token"
        self.db.add(
            models.StudentSession(
                student_id=student.id,
                token_hash=student_auth.hash_token(token),
                expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc),
            )
        )
        self.db.commit()
        base_started = sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)
        sprint_exam_v2_attempt_service.submit_attempt(self.db, base_started["attempt"]["id"], student.id)

        db = self.db

        def override_db():
            yield db

        main.app.dependency_overrides[sprint_exam_v2_retake_approval.get_db] = override_db
        main.app.dependency_overrides[sprint_exam_v2_attempt.get_db] = override_db
        original_session_local = main.SessionLocal
        main.SessionLocal = self.SessionLocal
        cookie = [(b"cookie", f"{student_auth.STUDENT_SESSION_COOKIE}={token}".encode("utf-8"))]
        try:
            admin_headers = self._admin_headers()
            status_code, body = self._asgi_call(
                "POST",
                "/admin/sprint-exam-v2/retake-approvals",
                {
                    "assignment_id": assignment_id,
                    "reason": "api approval",
                    "memo": "hidden from student",
                    "expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
                },
                headers=admin_headers,
            )
            self.assertEqual(status_code, 200)
            approval_id = body["approval"]["id"]
            self.assertEqual(body["approval"]["computed_status"], "available")
            self.assertEqual(body["approval"]["memo"], "hidden from student")

            status_code, body = self._asgi_call("GET", f"/admin/sprint-exam-v2/retake-approvals/{approval_id}", headers=admin_headers)
            self.assertEqual(status_code, 200)
            self.assertEqual(body["approval"]["assignment"]["base_attempt_count"], 1)

            status_code, body = self._asgi_call(
                "PATCH",
                f"/admin/sprint-exam-v2/retake-approvals/{approval_id}",
                {"reason": "api updated"},
                headers=admin_headers,
            )
            self.assertEqual(status_code, 200)
            self.assertEqual(body["approval"]["reason"], "api updated")

            status_code, body = self._asgi_call(
                "POST",
                f"/student/sprint-exam-v2/assignments/{assignment_id}/start",
                headers=cookie,
            )
            self.assertEqual(status_code, 201)
            self.assertEqual(body["start_type"], "retake_approval")
            self.assertEqual(body["attempt"]["retake_approval_id"], approval_id)
            body_json = json.dumps(body, ensure_ascii=False)
            self.assertNotIn("hidden from student", body_json)
            self.assertNotIn("approved_by", body_json)

            status_code, body = self._asgi_call("DELETE", f"/admin/sprint-exam-v2/retake-approvals/{approval_id}", headers=admin_headers)
            self.assertEqual(status_code, 409)
            self.assertEqual(body["detail"]["code"], "RETAKE_APPROVAL_NOT_CANCELLABLE")
        finally:
            main.SessionLocal = original_session_local
            main.app.dependency_overrides.pop(sprint_exam_v2_retake_approval.get_db, None)
            main.app.dependency_overrides.pop(sprint_exam_v2_attempt.get_db, None)

    def test_23_admin_sprint_exam_v2_routes_require_admin_session(self):
        _, student, _ = self._create_v2_assignment_for_student(phone="01090000021", attempt_limit=1)
        student_token = "student-only-admin-block-token"
        self.db.add(
            models.StudentSession(
                student_id=student.id,
                token_hash=student_auth.hash_token(student_token),
                expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc),
            )
        )
        self.db.commit()
        student_headers = [(b"cookie", f"{student_auth.STUDENT_SESSION_COOKIE}={student_token}".encode("utf-8"))]
        admin_paths = [
            ("POST", "/admin/sprint-exam-v2/exams/parse-preview", {"text": "title: Sample"}),
            ("POST", "/admin/sprint-exam-v2/exams", VALID_PAYLOAD),
            ("GET", "/admin/sprint-exam-v2/exams", None),
            ("GET", "/admin/sprint-exam-v2/exams/1", None),
            ("PATCH", "/admin/sprint-exam-v2/exams/1", {"exam": {"title": "blocked"}}),
            ("DELETE", "/admin/sprint-exam-v2/exams/1", None),
            ("POST", "/admin/sprint-exam-v2/assignments", {"exam_id": 1, "student_ids": [student.id]}),
            ("GET", "/admin/sprint-exam-v2/assignments", None),
            ("GET", "/admin/sprint-exam-v2/assignments/1", None),
            ("PATCH", "/admin/sprint-exam-v2/assignments/1", {"memo": "blocked"}),
            ("DELETE", "/admin/sprint-exam-v2/assignments/1", None),
            ("GET", "/admin/sprint-exam-v2/attempts/1", None),
            ("POST", "/admin/sprint-exam-v2/attempts/1/score", {"reason": "initial_scoring"}),
            ("POST", "/admin/sprint-exam-v2/attempts/1/rescore", {"reason": "manual_rescore"}),
            ("GET", "/admin/sprint-exam-v2/attempts/1/publication", None),
            ("POST", "/admin/sprint-exam-v2/attempts/1/publish", {"message": "blocked"}),
            ("POST", "/admin/sprint-exam-v2/attempts/1/unpublish", {"message": "blocked"}),
            ("PATCH", "/admin/sprint-exam-v2/attempts/1/publication", {"show_total_score": True}),
            ("POST", "/admin/sprint-exam-v2/retake-approvals", {"assignment_id": 1, "reason": "blocked"}),
            ("GET", "/admin/sprint-exam-v2/retake-approvals", None),
            ("GET", "/admin/sprint-exam-v2/retake-approvals/1", None),
            ("PATCH", "/admin/sprint-exam-v2/retake-approvals/1", {"reason": "blocked"}),
            ("DELETE", "/admin/sprint-exam-v2/retake-approvals/1", None),
        ]

        db = self.db

        def override_db():
            yield db

        main.app.dependency_overrides[admin_auth.get_db] = override_db
        main.app.dependency_overrides[sprint_exam_v2.get_db] = override_db
        main.app.dependency_overrides[sprint_exam_v2_assignment.get_db] = override_db
        main.app.dependency_overrides[sprint_exam_v2_attempt.get_db] = override_db
        main.app.dependency_overrides[sprint_exam_v2_scoring.get_db] = override_db
        main.app.dependency_overrides[sprint_exam_v2_retake_approval.get_db] = override_db
        main.app.dependency_overrides[sprint_exam_v2_result_publication.get_db] = override_db
        original_session_local = main.SessionLocal
        main.SessionLocal = self.SessionLocal
        try:
            for method, path, body in admin_paths:
                status_code, response_body = self._asgi_call(method, path, body)
                self.assertEqual(status_code, 401, path)
                self.assertNotIn("correct_answers", json.dumps(response_body, ensure_ascii=False))
                self.assertNotIn("score_logs", json.dumps(response_body, ensure_ascii=False))

                status_code, response_body = self._asgi_call(method, path, body, headers=student_headers)
                self.assertEqual(status_code, 401, path)
                self.assertNotIn("correct_answers", json.dumps(response_body, ensure_ascii=False))
                self.assertNotIn("score_logs", json.dumps(response_body, ensure_ascii=False))

            admin_headers = self._admin_headers()
            status_code, body = self._asgi_call("GET", "/admin/sprint-exam-v2/exams", headers=admin_headers)
            self.assertEqual(status_code, 200)
            status_code, body = self._asgi_call("POST", "/admin/sprint-exam-v2/exams/parse-preview", {"text": "title: Sample"}, headers=admin_headers)
            self.assertIn(status_code, {200, 400})
        finally:
            main.SessionLocal = original_session_local
            main.app.dependency_overrides.pop(admin_auth.get_db, None)
            main.app.dependency_overrides.pop(sprint_exam_v2.get_db, None)
            main.app.dependency_overrides.pop(sprint_exam_v2_assignment.get_db, None)
            main.app.dependency_overrides.pop(sprint_exam_v2_attempt.get_db, None)
            main.app.dependency_overrides.pop(sprint_exam_v2_scoring.get_db, None)
            main.app.dependency_overrides.pop(sprint_exam_v2_retake_approval.get_db, None)
            main.app.dependency_overrides.pop(sprint_exam_v2_result_publication.get_db, None)

    def test_24_existing_admin_routes_require_admin_session(self):
        student = models.Student(
            name="Admin Protected Student",
            phone="01090000022",
            grade="high",
        )
        self.db.add(student)
        self.db.flush()
        student_token = "student-only-existing-admin-block-token"
        self.db.add(
            models.StudentSession(
                student_id=student.id,
                token_hash=student_auth.hash_token(student_token),
                expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc),
            )
        )
        self.db.commit()
        student_headers = [(b"cookie", f"{student_auth.STUDENT_SESSION_COOKIE}={student_token}".encode("utf-8"))]

        db = self.db

        def override_db():
            yield db

        original_session_local = main.SessionLocal
        main.SessionLocal = self.SessionLocal
        main.app.dependency_overrides[main.get_db] = override_db
        try:
            for method, path in [("GET", "/admin/students"), ("GET", "/admin/sprints")]:
                status_code, body = self._asgi_call(method, path)
                self.assertEqual(status_code, 401, path)
                self.assertNotIn("Admin Protected Student", json.dumps(body, ensure_ascii=False))

                status_code, body = self._asgi_call(method, path, headers=student_headers)
                self.assertEqual(status_code, 401, path)
                self.assertNotIn("Admin Protected Student", json.dumps(body, ensure_ascii=False))

            invalid_headers = [(b"cookie", f"{admin_auth.ADMIN_SESSION_COOKIE}=invalid".encode("utf-8"))]
            status_code, body = self._asgi_call("GET", "/admin/students", headers=invalid_headers)
            self.assertEqual(status_code, 401)

            admin = self.db.query(models.Admin).filter(models.Admin.username == "expiredadmin").first()
            if admin is None:
                admin = models.Admin(username="expiredadmin", password="expiredadmin")
                self.db.add(admin)
                self.db.commit()
            expired_token, _ = admin_auth.create_admin_session_token(admin, now=datetime.now(timezone.utc) - timedelta(hours=13))
            status_code, body = self._asgi_call(
                "GET",
                "/admin/students",
                headers=[(b"cookie", f"{admin_auth.ADMIN_SESSION_COOKIE}={expired_token}".encode("utf-8"))],
            )
            self.assertEqual(status_code, 401)

            ghost_admin = models.Admin(id=999999, username="ghost", password="ghost")
            ghost_token, _ = admin_auth.create_admin_session_token(ghost_admin)
            status_code, body = self._asgi_call(
                "GET",
                "/admin/students",
                headers=[(b"cookie", f"{admin_auth.ADMIN_SESSION_COOKIE}={ghost_token}".encode("utf-8"))],
            )
            self.assertEqual(status_code, 401)

            status_code, body = self._asgi_call("GET", "/admin/students", headers=self._admin_headers())
            self.assertEqual(status_code, 200)
            self.assertIn("Admin Protected Student", json.dumps(body, ensure_ascii=False))

            status_code, body = self._asgi_call("POST", "/auth/admin-logout", headers=self._admin_headers())
            self.assertEqual(status_code, 200)
            self.assertTrue(body["ok"])
        finally:
            main.SessionLocal = original_session_local
            main.app.dependency_overrides.pop(main.get_db, None)

    def test_25_result_publication_policy_visibility_rescore_and_concurrency(self):
        created_exam, student, assignment_id = self._create_v2_assignment_for_student(phone="01090000023")
        token = "publication-student-token"
        self.db.add(
            models.StudentSession(
                student_id=student.id,
                token_hash=student_auth.hash_token(token),
                expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc),
            )
        )
        self.db.commit()
        attempt_id = sprint_exam_v2_attempt_service.start_attempt(self.db, assignment_id, student.id)["attempt"]["id"]
        detail = sprint_exam_v2_attempt_service.get_attempt(self.db, attempt_id, student.id)
        question_by_subject_and_no = {
            (paper["subject_code"], question["question_no"]): question["id"]
            for paper in detail["papers"]
            for question in paper["questions"]
        }
        sprint_exam_v2_attempt_service.save_responses(
            self.db,
            attempt_id,
            student.id,
            [
                {"question_id": question_by_subject_and_no[("korean_common", 1)], "answer": ["2"]},
                {"question_id": question_by_subject_and_no[("korean_common", 2)], "answer": ["18"]},
            ],
        )
        sprint_exam_v2_attempt_service.submit_attempt(self.db, attempt_id, student.id)
        sprint_exam_v2_scoring_service.score_attempt(self.db, attempt_id)

        with self.assertRaises(sprint_exam_v2_result_publication_service.SprintExamV2PublicationConflictError) as unpublished:
            sprint_exam_v2_scoring_service.get_student_result(self.db, attempt_id, student.id)
        self.assertEqual(unpublished.exception.code, "RESULT_NOT_PUBLISHED")

        default_publication = sprint_exam_v2_result_publication_service.get_publication(self.db, attempt_id)["publication"]
        self.assertEqual(default_publication["status"], "unpublished")
        self.assertEqual(default_publication["computed_status"], "unpublished")

        published = sprint_exam_v2_result_publication_service.publish_attempt(
            self.db,
            attempt_id,
            {"show_total_score": True, "show_grade": False, "show_score_groups": False, "show_question_results": True, "message": "first publish"},
            actor_admin_id=None,
        )["publication"]
        self.assertEqual(published["status"], "published")
        self.assertTrue(published["published_at"])
        self.assertEqual(len(published["logs"]), 1)
        student_result = sprint_exam_v2_scoring_service.get_student_result(self.db, attempt_id, student.id)
        self.assertEqual(student_result["result_status"], "published")
        self.assertIn("summary", student_result)
        self.assertIn("questions", student_result)
        self.assertNotIn("scores", student_result)
        self._assert_key_absent_recursive(student_result, "grade")
        self._assert_key_absent_recursive(student_result, "correct_answers")
        self._assert_key_absent_recursive(student_result, "score_logs")
        self._assert_key_absent_recursive(student_result, "grade_cuts")

        same_publish = sprint_exam_v2_result_publication_service.publish_attempt(
            self.db,
            attempt_id,
            {"show_total_score": True, "show_grade": False, "show_score_groups": False, "show_question_results": True},
            actor_admin_id=None,
        )["publication"]
        self.assertEqual(len(same_publish["logs"]), 1)

        updated = sprint_exam_v2_result_publication_service.update_publication(
            self.db,
            attempt_id,
            {"show_correct_answers": True, "message": "show answers"},
            actor_admin_id=None,
        )["publication"]
        self.assertTrue(updated["options"]["show_correct_answers"])
        self.assertEqual(updated["logs"][-1]["action"], "settings_updated")
        with_answers = sprint_exam_v2_scoring_service.get_student_result(self.db, attempt_id, student.id)
        self.assertIn("correct_answers", json.dumps(with_answers, ensure_ascii=False))
        self._assert_key_absent_recursive(with_answers, "grade_cuts")

        korean_question = self.db.get(models.SprintExamV2Question, question_by_subject_and_no[("korean_common", 2)])
        korean_question.correct_answers = ["18"]
        self.db.commit()
        before_publication_log_count = self.db.query(models.SprintExamV2ResultPublicationLog).count()
        rescored = sprint_exam_v2_scoring_service.score_attempt(self.db, attempt_id, reason="manual_rescore", rescore=True)
        self.assertEqual(rescored["status"], "scored")
        self.assertEqual(self.db.query(models.SprintExamV2ResultPublicationLog).count(), before_publication_log_count)
        after_rescore = sprint_exam_v2_scoring_service.get_student_result(self.db, attempt_id, student.id)
        self.assertEqual(after_rescore["summary"]["correct_count"], 2)
        self.assertEqual(
            sprint_exam_v2_result_publication_service.get_publication(self.db, attempt_id)["publication"]["status"],
            "published",
        )

        unpublished_result = sprint_exam_v2_result_publication_service.unpublish_attempt(
            self.db,
            attempt_id,
            {"message": "hide again"},
            actor_admin_id=None,
        )["publication"]
        self.assertEqual(unpublished_result["status"], "unpublished")
        self.assertTrue(unpublished_result["unpublished_at"])
        self.assertTrue(unpublished_result["options"]["show_correct_answers"])
        with self.assertRaises(sprint_exam_v2_result_publication_service.SprintExamV2PublicationConflictError):
            sprint_exam_v2_scoring_service.get_student_result(self.db, attempt_id, student.id)

        republished = sprint_exam_v2_result_publication_service.publish_attempt(self.db, attempt_id, actor_admin_id=None)["publication"]
        self.assertEqual(republished["status"], "published")
        attempt = self.db.get(models.SprintExamV2Attempt, attempt_id)
        attempt.status = "voided"
        attempt.voided_at = datetime.now(timezone.utc)
        self.db.commit()
        with self.assertRaises(sprint_exam_v2_result_publication_service.SprintExamV2PublicationConflictError) as voided_result:
            sprint_exam_v2_scoring_service.get_student_result(self.db, attempt_id, student.id)
        self.assertEqual(voided_result.exception.code, "RESULT_VOIDED")
        attempt.status = "scored"
        attempt.voided_at = None
        self.db.commit()

        original_commit = self.db.commit

        def fail_commit():
            raise RuntimeError("forced publication rollback")

        self.db.commit = fail_commit
        try:
            with self.assertRaises(RuntimeError):
                sprint_exam_v2_result_publication_service.update_publication(
                    self.db,
                    attempt_id,
                    {"show_total_score": False, "show_grade": True, "show_score_groups": True, "show_question_results": True},
                    actor_admin_id=None,
                )
        finally:
            self.db.commit = original_commit
        self.assertEqual(self.db.execute(text("select 1")).scalar_one(), 1)
        self.db.expire_all()
        self.assertTrue(self.db.get(models.SprintExamV2ResultPublication, republished["id"]).show_total_score)
        fresh_session = self.SessionLocal()
        try:
            self.assertTrue(fresh_session.query(models.SprintExamV2ResultPublication).filter_by(attempt_id=attempt_id).one().show_total_score)
            self.assertEqual(fresh_session.execute(text("select 1")).scalar_one(), 1)
        finally:
            fresh_session.close()

        def publish_in_new_session():
            session = self.SessionLocal()
            try:
                return sprint_exam_v2_result_publication_service.publish_attempt(session, attempt_id, actor_admin_id=None)["publication"]["status"]
            finally:
                session.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = list(executor.map(lambda _: publish_in_new_session(), range(2)))
        self.assertEqual(statuses, ["published", "published"])
        self.assertEqual(
            self.db.query(models.SprintExamV2ResultPublication).filter(models.SprintExamV2ResultPublication.attempt_id == attempt_id).count(),
            1,
        )

        db = self.db

        def override_db():
            yield db

        main.app.dependency_overrides[sprint_exam_v2_result_publication.get_db] = override_db
        original_session_local = main.SessionLocal
        main.SessionLocal = self.SessionLocal
        student_headers = [(b"cookie", f"{student_auth.STUDENT_SESSION_COOKIE}={token}".encode("utf-8"))]
        try:
            status_code, body = self._asgi_call("POST", f"/admin/sprint-exam-v2/attempts/{attempt_id}/publish")
            self.assertEqual(status_code, 401)
            status_code, body = self._asgi_call("POST", f"/admin/sprint-exam-v2/attempts/{attempt_id}/publish", headers=student_headers)
            self.assertEqual(status_code, 401)
            status_code, body = self._asgi_call(
                "POST",
                f"/admin/sprint-exam-v2/attempts/{attempt_id}/publish",
                headers=[(b"cookie", f"{admin_auth.ADMIN_SESSION_COOKIE}=invalid".encode("utf-8"))],
            )
            self.assertEqual(status_code, 401)
            status_code, body = self._asgi_call(
                "GET",
                f"/admin/sprint-exam-v2/attempts/{attempt_id}/publication",
                headers=self._admin_headers(),
            )
            self.assertEqual(status_code, 200)
            self.assertEqual(body["publication"]["status"], "published")
        finally:
            main.SessionLocal = original_session_local
            main.app.dependency_overrides.pop(sprint_exam_v2_result_publication.get_db, None)
