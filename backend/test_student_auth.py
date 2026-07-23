from unittest import TestCase

from fastapi import HTTPException, Response
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

import main
import models
import student_auth
from database import Base


def make_db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine, sessionmaker(bind=engine)()


def request_with_cookie(token: str | None) -> Request:
    headers = []
    if token:
        headers.append((b"cookie", f"{student_auth.STUDENT_SESSION_COOKIE}={token}".encode("utf-8")))
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers})


class StudentCookieAuthTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()
        self.student = models.Student(name="A", phone="01012345678", grade="고3")
        self.other = models.Student(name="B", phone="01099999999", grade="고3")
        self.db.add_all([self.student, self.other])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_login_sets_httponly_cookie_and_me_restores_student(self):
        response = Response()
        payload = student_auth.issue_student_session(self.db, response, self.student)
        self.assertEqual(payload["id"], self.student.id)
        cookie = response.headers["set-cookie"].lower()
        self.assertIn("aimon_student_session=", cookie)
        self.assertIn("httponly", cookie)
        self.assertIn("samesite=lax", cookie)
        token = response.headers["set-cookie"].split("aimon_student_session=", 1)[1].split(";", 1)[0]
        restored = student_auth.get_current_student_from_cookie(self.db, request_with_cookie(token), touch=False)
        self.assertEqual(restored.id, self.student.id)

    def test_missing_expired_or_revoked_session_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            student_auth.get_current_student_from_cookie(self.db, request_with_cookie(None), touch=False)
        self.assertEqual(ctx.exception.status_code, 401)

        response = Response()
        student_auth.issue_student_session(self.db, response, self.student)
        token = response.headers["set-cookie"].split("aimon_student_session=", 1)[1].split(";", 1)[0]
        student_auth.revoke_current_student_session(self.db, request_with_cookie(token), Response())
        with self.assertRaises(HTTPException) as ctx:
            student_auth.get_current_student_from_cookie(self.db, request_with_cookie(token), touch=False)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_student_id_tamper_helpers(self):
        self.assertEqual(main.student_id_from_query("1"), 1)
        self.assertEqual(main.student_id_from_path("/students/2/summary"), 2)
        self.assertEqual(main.extract_student_id_from_json({"student_id": "3"}), 3)
        with self.assertRaises(HTTPException):
            main.student_id_from_query("abc")

    def test_legacy_progress_reads_are_not_blocked_by_student_cookie_middleware(self):
        self.assertTrue(main.is_legacy_read_only_progress_path("GET", "/student/progress-summary"))
        self.assertTrue(main.is_legacy_read_only_progress_path("GET", "/student/weekly-tasks"))
        self.assertTrue(main.is_legacy_read_only_progress_path("GET", "/student/daily-tasks"))
        self.assertTrue(main.is_legacy_read_only_progress_path("GET", "/units/1/tasks"))
        self.assertFalse(main.is_legacy_read_only_progress_path("POST", "/progress/check"))
        self.assertFalse(main.is_legacy_read_only_progress_path("GET", "/student/sprint/dashboard"))

    def test_phone_normalization_does_not_store_phone_in_cookie(self):
        self.assertEqual(student_auth.normalize_phone("010-1234-5678"), "01012345678")
        response = Response()
        student_auth.issue_student_session(self.db, response, self.student)
        cookie = response.headers["set-cookie"]
        self.assertNotIn(self.student.phone, cookie)
        cookie_value = cookie.split("aimon_student_session=", 1)[1].split(";", 1)[0]
        self.assertNotEqual(cookie_value, str(self.student.id))
