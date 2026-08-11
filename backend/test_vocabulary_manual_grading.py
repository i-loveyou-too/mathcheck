"""영단어 챌린지 관리자 수동 채점 수정 (7차) 테스트.

전체 backend Base.metadata에는 이번 작업과 무관한 진행 중인 다른 기능(Sprint Exam V2)의
SQLite 비호환 서버 기본값(``'{}'::jsonb``)이 섞여 있어 ``Base.metadata.create_all()``을
그대로 쓰면 실패한다. 이 파일은 영단어 채점 기능에 필요한 테이블만 명시적으로 생성해
그 문제를 피한다 (다른 기능의 코드는 건드리지 않는다).
"""

from datetime import date
from unittest import TestCase

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
from database import Base
from vocabulary import (
    GradingActionIn,
    admin_update_manual_grading,
    admin_vocabulary_review_items,
    create_session,
    final_is_correct,
    pending_manual_review_count,
    serialize_session,
    submit_session,
    unresolved_review_questions,
)

VOCAB_TABLES = [
    models.Student.__table__,
    models.Admin.__table__,
    models.VocabularyChallenge.__table__,
    models.VocabularyWord.__table__,
    models.VocabularyDailyAssignment.__table__,
    models.VocabularyTestSession.__table__,
    models.VocabularyTestQuestion.__table__,
    models.VocabularyTestAnswer.__table__,
    models.VocabularyWrongNote.__table__,
    models.VocabularyManualGradingLog.__table__,
]


class ManualGradingLogicTests(TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine, tables=VOCAB_TABLES)
        self.db = sessionmaker(bind=self.engine)()
        self.admin = models.Admin(username="admin1", password="x")
        self.other_admin = models.Admin(username="admin2", password="x")
        self.student = models.Student(name="학생", phone="01000000000", grade="고3")
        self.other_student = models.Student(name="다른학생", phone="01000000002", grade="고3")
        self.db.add_all([self.admin, self.other_admin, self.student, self.other_student])
        self.db.flush()
        self.challenge = models.VocabularyChallenge(
            name="채점 테스트",
            student_id=self.student.id,
            start_date=date(2026, 7, 20),
            end_date=date(2026, 7, 24),
            accumulation_type="all_previous",
            is_active=True,
        )
        self.db.add(self.challenge)
        self.db.flush()
        self.words = [
            models.VocabularyWord(
                challenge_id=self.challenge.id,
                english=english,
                normalized_english=english,
                accepted_answers=answers,
                order_index=index,
            )
            for index, (english, answers) in enumerate(
                [("apple", ["사과"]), ("run", ["달리다"])], start=1
            )
        ]
        self.db.add_all(self.words)
        self.db.flush()
        self.db.add_all([
            models.VocabularyDailyAssignment(
                challenge_id=self.challenge.id, assignment_date=date(2026, 7, 20), word_id=self.words[0].id
            ),
            models.VocabularyDailyAssignment(
                challenge_id=self.challenge.id, assignment_date=date(2026, 7, 20), word_id=self.words[1].id
            ),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _submitted_session(self, challenge, study_date, answers_by_word):
        session = create_session(self.db, challenge, study_date, "main")
        questions = self.db.query(models.VocabularyTestQuestion).filter_by(session_id=session.id).all()
        for question in questions:
            answer_text = answers_by_word.get(question.english_snapshot, "")
            self.db.add(models.VocabularyTestAnswer(session_id=session.id, question_id=question.id, input_answer=answer_text))
        self.db.commit()
        submit_session(self.db, session)
        return session

    def _answer_for(self, session, english):
        question = self.db.query(models.VocabularyTestQuestion).filter_by(
            session_id=session.id, english_snapshot=english
        ).one()
        return self.db.query(models.VocabularyTestAnswer).filter_by(question_id=question.id).one()

    # 1. 자동 오답 -> 수동 정답
    def test_mark_correct_overrides_wrong_auto_grading(self):
        session = self._submitted_session(self.challenge, date(2026, 7, 20), {"apple": "사과", "run": "틀림"})
        answer = self._answer_for(session, "run")
        self.assertFalse(answer.is_correct)

        result = admin_update_manual_grading(
            session_id=session.id,
            answer_id=answer.id,
            payload=GradingActionIn(action="mark_correct", reason="유사 표현 인정"),
            db=self.db,
            admin=self.admin,
        )

        self.db.refresh(answer)
        self.db.refresh(session)
        self.assertFalse(answer.is_correct)  # 자동채점 원본 보존
        self.assertTrue(answer.manual_is_correct)
        self.assertEqual(answer.manual_reason, "유사 표현 인정")
        self.assertEqual(answer.manual_graded_by, self.admin.id)
        self.assertIsNotNone(answer.manual_graded_at)
        self.assertTrue(result["question"]["is_correct"])
        self.assertTrue(result["question"]["is_manual_override"])
        self.assertEqual(session.correct_count, 2)
        self.assertEqual(session.score, 100)

    # 2. 자동 정답 -> 수동 오답
    def test_mark_incorrect_overrides_correct_auto_grading(self):
        session = self._submitted_session(self.challenge, date(2026, 7, 20), {"apple": "사과", "run": "달리다"})
        answer = self._answer_for(session, "run")
        self.assertTrue(answer.is_correct)

        admin_update_manual_grading(
            session_id=session.id,
            answer_id=answer.id,
            payload=GradingActionIn(action="mark_incorrect", reason="답 오인정"),
            db=self.db,
            admin=self.admin,
        )

        self.db.refresh(answer)
        self.db.refresh(session)
        self.assertTrue(answer.is_correct)  # 자동채점 원본 보존
        self.assertFalse(answer.manual_is_correct)
        self.assertEqual(session.correct_count, 1)
        self.assertEqual(session.score, 50)
        note = self.db.query(models.VocabularyWrongNote).filter_by(
            word_id=self.words[1].id, student_id=self.student.id
        ).one()
        self.assertEqual(note.status, "unresolved")

    # 3. 자동 복원
    def test_restore_auto_reverts_manual_override(self):
        session = self._submitted_session(self.challenge, date(2026, 7, 20), {"apple": "사과", "run": "틀림"})
        answer = self._answer_for(session, "run")
        admin_update_manual_grading(
            session_id=session.id, answer_id=answer.id,
            payload=GradingActionIn(action="mark_correct"), db=self.db, admin=self.admin,
        )
        admin_update_manual_grading(
            session_id=session.id, answer_id=answer.id,
            payload=GradingActionIn(action="restore_auto", reason="원복"), db=self.db, admin=self.admin,
        )

        self.db.refresh(answer)
        self.db.refresh(session)
        self.assertIsNone(answer.manual_is_correct)
        self.assertIsNone(answer.manual_reason)
        self.assertIsNone(answer.manual_graded_by)
        self.assertIsNone(answer.manual_graded_at)
        self.assertFalse(final_is_correct(answer))
        self.assertEqual(session.correct_count, 1)

    # 4, 5. 점수/정답률 재계산 (전체 재제출 없이)
    def test_score_and_rate_recompute_without_full_resubmission(self):
        session = self._submitted_session(self.challenge, date(2026, 7, 20), {"apple": "틀림", "run": "틀림"})
        self.assertEqual(session.score, 0)

        answer = self._answer_for(session, "apple")
        admin_update_manual_grading(
            session_id=session.id, answer_id=answer.id,
            payload=GradingActionIn(action="mark_correct"), db=self.db, admin=self.admin,
        )

        self.db.refresh(session)
        self.assertEqual(session.correct_count, 1)
        self.assertEqual(session.total_count, 2)
        self.assertEqual(session.score, 50)
        self.assertEqual(session.status, "submitted")  # 전체 재제출 불필요

    # 6. 오답노트 반영 (정답->오답 시 생성, 오답->정답 시 해소)
    def test_wrong_note_created_and_resolved_by_override(self):
        session = self._submitted_session(self.challenge, date(2026, 7, 20), {"apple": "사과", "run": "달리다"})
        answer = self._answer_for(session, "run")

        admin_update_manual_grading(
            session_id=session.id, answer_id=answer.id,
            payload=GradingActionIn(action="mark_incorrect"), db=self.db, admin=self.admin,
        )
        note = self.db.query(models.VocabularyWrongNote).filter_by(
            word_id=self.words[1].id, student_id=self.student.id
        ).one()
        self.assertEqual(note.status, "unresolved")
        self.assertEqual(note.wrong_count, 1)

        admin_update_manual_grading(
            session_id=session.id, answer_id=answer.id,
            payload=GradingActionIn(action="mark_correct"), db=self.db, admin=self.admin,
        )
        self.db.refresh(note)
        self.assertEqual(note.status, "mastered")

    # 6-2. 반복 토글 시 wrong_count가 중복 증가하지 않는지 (동일 판정 재수정은 no-op)
    def test_repeated_same_action_does_not_double_count_wrong_note(self):
        session = self._submitted_session(self.challenge, date(2026, 7, 20), {"apple": "사과", "run": "달리다"})
        answer = self._answer_for(session, "run")
        admin_update_manual_grading(
            session_id=session.id, answer_id=answer.id,
            payload=GradingActionIn(action="mark_incorrect"), db=self.db, admin=self.admin,
        )
        admin_update_manual_grading(
            session_id=session.id, answer_id=answer.id,
            payload=GradingActionIn(action="mark_incorrect"), db=self.db, admin=self.admin,
        )
        note = self.db.query(models.VocabularyWrongNote).filter_by(
            word_id=self.words[1].id, student_id=self.student.id
        ).one()
        self.assertEqual(note.wrong_count, 1)

    # 7. 재시험 대상 반영
    def test_review_target_reflects_manual_override(self):
        session = self._submitted_session(self.challenge, date(2026, 7, 20), {"apple": "사과", "run": "달리다"})
        answer = self._answer_for(session, "run")

        admin_update_manual_grading(
            session_id=session.id, answer_id=answer.id,
            payload=GradingActionIn(action="mark_incorrect"), db=self.db, admin=self.admin,
        )
        words, _source_type = unresolved_review_questions(self.db, self.challenge)
        self.assertIn(self.words[1].id, [word.id for word in words])

        admin_update_manual_grading(
            session_id=session.id, answer_id=answer.id,
            payload=GradingActionIn(action="restore_auto"), db=self.db, admin=self.admin,
        )
        words, _source_type = unresolved_review_questions(self.db, self.challenge)
        self.assertNotIn(self.words[1].id, [word.id for word in words])

    # 8. 다른 학생/다른 세션 응답 수정 차단 (소속 검증)
    def test_answer_from_mismatched_session_is_rejected(self):
        session_a = self._submitted_session(self.challenge, date(2026, 7, 20), {"apple": "사과", "run": "달리다"})

        other_challenge = models.VocabularyChallenge(
            name="다른 챌린지",
            student_id=self.other_student.id,
            start_date=date(2026, 7, 20),
            end_date=date(2026, 7, 24),
            accumulation_type="all_previous",
            is_active=True,
        )
        self.db.add(other_challenge)
        self.db.flush()
        other_word = models.VocabularyWord(
            challenge_id=other_challenge.id, english="cat", normalized_english="cat",
            accepted_answers=["고양이"], order_index=1,
        )
        self.db.add(other_word)
        self.db.flush()
        self.db.add(models.VocabularyDailyAssignment(
            challenge_id=other_challenge.id, assignment_date=date(2026, 7, 20), word_id=other_word.id
        ))
        self.db.commit()
        session_b = self._submitted_session(other_challenge, date(2026, 7, 20), {"cat": "고양이"})
        answer_b = self.db.query(models.VocabularyTestAnswer).filter_by(session_id=session_b.id).one()

        with self.assertRaises(HTTPException) as context:
            admin_update_manual_grading(
                session_id=session_a.id, answer_id=answer_b.id,
                payload=GradingActionIn(action="mark_correct"), db=self.db, admin=self.admin,
            )
        self.assertEqual(context.exception.status_code, 404)

    # 감사로그: append-only, 여러 번 수정 이력 추적, restore_auto도 기록됨
    def test_audit_log_is_append_only_and_tracks_full_history(self):
        session = self._submitted_session(self.challenge, date(2026, 7, 20), {"apple": "사과", "run": "틀림"})
        answer = self._answer_for(session, "run")

        admin_update_manual_grading(
            session_id=session.id, answer_id=answer.id,
            payload=GradingActionIn(action="mark_correct", reason="A"), db=self.db, admin=self.admin,
        )
        admin_update_manual_grading(
            session_id=session.id, answer_id=answer.id,
            payload=GradingActionIn(action="restore_auto", reason="B"), db=self.db, admin=self.other_admin,
        )

        logs = self.db.query(models.VocabularyManualGradingLog).filter_by(
            answer_id=answer.id
        ).order_by(models.VocabularyManualGradingLog.id).all()
        self.assertEqual(len(logs), 2)
        self.assertEqual(logs[0].action, "mark_correct")
        self.assertEqual(logs[0].previous_final, False)
        self.assertEqual(logs[0].new_final, True)
        self.assertEqual(logs[0].admin_id, self.admin.id)
        self.assertEqual(logs[1].action, "restore_auto")
        self.assertEqual(logs[1].previous_final, True)
        self.assertEqual(logs[1].new_final, False)
        self.assertEqual(logs[1].admin_id, self.other_admin.id)

    # 기존 자동채점 원본 보존 (여러 액션을 반복해도 is_correct는 불변)
    def test_auto_is_correct_is_never_overwritten(self):
        session = self._submitted_session(self.challenge, date(2026, 7, 20), {"apple": "사과", "run": "틀림"})
        answer = self._answer_for(session, "run")
        original_auto = answer.is_correct

        for action in ["mark_correct", "mark_incorrect", "restore_auto", "mark_correct"]:
            admin_update_manual_grading(
                session_id=session.id, answer_id=answer.id,
                payload=GradingActionIn(action=action), db=self.db, admin=self.admin,
            )
            self.db.refresh(answer)
            self.assertEqual(answer.is_correct, original_auto)

    # 학생 결과에는 관리자 내부 정보(사유/수정자)를 노출하지 않고 최종판정만 반영
    def test_student_result_reflects_final_judgment_without_admin_details(self):
        session = self._submitted_session(self.challenge, date(2026, 7, 20), {"apple": "사과", "run": "틀림"})
        answer = self._answer_for(session, "run")
        admin_update_manual_grading(
            session_id=session.id, answer_id=answer.id,
            payload=GradingActionIn(action="mark_correct", reason="비공개 사유"), db=self.db, admin=self.admin,
        )
        self.db.refresh(session)

        student_view = serialize_session(self.db, session, include_result=True)
        run_item = next(item for item in student_view["questions"] if item["english"] == "run")
        self.assertTrue(run_item["is_correct"])
        self.assertNotIn("manual_reason", run_item)
        self.assertNotIn("manual_graded_by", run_item)
        self.assertNotIn("manual_graded_at", run_item)
        self.assertNotIn("auto_is_correct", run_item)
        self.assertNotIn("is_manual_override", run_item)

        admin_view = serialize_session(self.db, session, include_result=True, for_admin=True)
        admin_run_item = next(item for item in admin_view["questions"] if item["english"] == "run")
        self.assertEqual(admin_run_item["manual_reason"], "비공개 사유")
        self.assertEqual(admin_run_item["manual_graded_by"], self.admin.id)
        self.assertFalse(admin_run_item["auto_is_correct"])
        self.assertTrue(admin_run_item["is_manual_override"])

    def test_grading_before_submission_is_rejected(self):
        session = create_session(self.db, self.challenge, date(2026, 7, 20), "main")
        question = self.db.query(models.VocabularyTestQuestion).filter_by(session_id=session.id).first()
        self.db.add(models.VocabularyTestAnswer(session_id=session.id, question_id=question.id, input_answer=""))
        self.db.commit()
        answer = self.db.query(models.VocabularyTestAnswer).filter_by(question_id=question.id).one()
        with self.assertRaises(HTTPException) as context:
            admin_update_manual_grading(
                session_id=session.id, answer_id=answer.id,
                payload=GradingActionIn(action="mark_correct"), db=self.db, admin=self.admin,
            )
        self.assertEqual(context.exception.status_code, 400)

    def test_blank_answer_is_auto_confirmed_wrong_without_pending_review(self):
        session = self._submitted_session(self.challenge, date(2026, 7, 20), {"apple": "   ", "run": "틀림"})
        blank_answer = self._answer_for(session, "apple")
        text_wrong_answer = self._answer_for(session, "run")

        self.assertFalse(blank_answer.is_correct)
        self.assertFalse(blank_answer.manual_is_correct)
        self.assertEqual(blank_answer.input_answer, "")
        self.assertFalse(final_is_correct(blank_answer))
        self.assertFalse(text_wrong_answer.is_correct)
        self.assertIsNone(text_wrong_answer.manual_is_correct)
        self.assertEqual(pending_manual_review_count(self.db, session.id), 1)

    def test_existing_pending_blank_answer_is_excluded_from_integrated_review(self):
        session = self._submitted_session(self.challenge, date(2026, 7, 20), {"apple": "   ", "run": "달리다"})
        blank_answer = self._answer_for(session, "apple")
        blank_answer.input_answer = "   "
        blank_answer.manual_is_correct = None
        self.db.commit()

        self.assertEqual(pending_manual_review_count(self.db, session.id), 0)
        result = admin_vocabulary_review_items(review_status="pending", db=self.db, admin=self.admin)
        self.assertEqual(result["items"], [])

    def test_blank_answer_cannot_be_marked_correct_manually(self):
        session = self._submitted_session(self.challenge, date(2026, 7, 20), {"apple": "", "run": "달리다"})
        blank_answer = self._answer_for(session, "apple")

        with self.assertRaises(HTTPException) as context:
            admin_update_manual_grading(
                session_id=session.id,
                answer_id=blank_answer.id,
                payload=GradingActionIn(action="mark_correct"),
                db=self.db,
                admin=self.admin,
            )
        self.assertEqual(context.exception.status_code, 400)


# ---------------------------------------------------------------------------
# 인증/권한 테스트: 실제 HTTP + AdminSessionMiddleware 경로를 검증하려면 FastAPI
# TestClient가 필요하다. main/database는 프로세스 첫 import 시 이미 실제
# create_engine(...)을 호출하므로, import 전에 sqlalchemy.create_engine을
# 이 테스트만의 SQLite 엔진으로 바꿔치기한다 (기존 세션의 검증된 방식).
# ---------------------------------------------------------------------------

import sqlalchemy  # noqa: E402
from sqlalchemy.pool import StaticPool as _StaticPool  # noqa: E402

_real_create_engine = sqlalchemy.create_engine
_http_test_engine = _real_create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=_StaticPool
)


def _fake_create_engine(*_args, **_kwargs):
    return _http_test_engine


sqlalchemy.create_engine = _fake_create_engine

Base.metadata.create_all(_http_test_engine, tables=VOCAB_TABLES + [models.StudentSession.__table__])
_HttpTestSession = sessionmaker(bind=_http_test_engine)

import database as _database  # noqa: E402
_database.SessionLocal = _HttpTestSession

import main as _main  # noqa: E402
_main.SessionLocal = _HttpTestSession

import admin_auth  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


class ManualGradingAuthTests(TestCase):
    def setUp(self):
        self.db = _HttpTestSession()
        self.client = TestClient(_main.app)
        self.admin = models.Admin(username="grading-admin-http", password="x")
        self.student = models.Student(name="학생http", phone="01099990000", grade="고3")
        self.db.add_all([self.admin, self.student])
        self.db.flush()
        self.challenge = models.VocabularyChallenge(
            name="http 테스트",
            student_id=self.student.id,
            start_date=date(2026, 7, 20),
            end_date=date(2026, 7, 24),
            accumulation_type="all_previous",
            is_active=True,
        )
        self.db.add(self.challenge)
        self.db.flush()
        word = models.VocabularyWord(
            challenge_id=self.challenge.id, english="apple", normalized_english="apple",
            accepted_answers=["사과"], order_index=1,
        )
        self.db.add(word)
        self.db.flush()
        self.db.add(models.VocabularyDailyAssignment(
            challenge_id=self.challenge.id, assignment_date=date(2026, 7, 20), word_id=word.id
        ))
        self.db.commit()

        session = create_session(self.db, self.challenge, date(2026, 7, 20), "main")
        question = self.db.query(models.VocabularyTestQuestion).filter_by(session_id=session.id).one()
        self.db.add(models.VocabularyTestAnswer(session_id=session.id, question_id=question.id, input_answer="틀림"))
        self.db.commit()
        submit_session(self.db, session)
        self.session_id = session.id
        self.answer_id = self.db.query(models.VocabularyTestAnswer).filter_by(session_id=session.id).one().id

    def tearDown(self):
        self.db.query(models.VocabularyManualGradingLog).delete()
        self.db.query(models.VocabularyTestAnswer).delete()
        self.db.query(models.VocabularyTestQuestion).delete()
        self.db.query(models.VocabularyWrongNote).delete()
        self.db.query(models.VocabularyTestSession).delete()
        self.db.query(models.VocabularyDailyAssignment).delete()
        self.db.query(models.VocabularyWord).delete()
        self.db.query(models.VocabularyChallenge).delete()
        self.db.query(models.Admin).delete()
        self.db.query(models.Student).delete()
        self.db.commit()
        self.db.close()

    def _grading_url(self):
        return f"/admin/vocabulary-attempts/{self.session_id}/responses/{self.answer_id}/grading"

    # 관리자 인증 필요: 쿠키 없이 호출하면 차단
    def test_grading_endpoint_requires_admin_session(self):
        response = self.client.patch(self._grading_url(), json={"action": "mark_correct"})
        self.assertEqual(response.status_code, 401)

    # 일반 학생 API로 수정 불가: 학생 로그인 쿠키만 있는 상태로는 차단
    def test_grading_endpoint_rejects_student_session(self):
        login = self.client.post("/auth/student-login", json={"phone": self.student.phone})
        self.assertEqual(login.status_code, 200)
        response = self.client.patch(self._grading_url(), json={"action": "mark_correct"})
        self.assertEqual(response.status_code, 401)

    # 유효한 관리자 세션이면 정상 동작
    def test_grading_endpoint_succeeds_with_valid_admin_session(self):
        token, _ = admin_auth.create_admin_session_token(self.admin)
        self.client.cookies.set(admin_auth.ADMIN_SESSION_COOKIE, token)
        response = self.client.patch(self._grading_url(), json={"action": "mark_correct", "reason": "확인"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["question"]["is_correct"])
        self.assertTrue(body["question"]["is_manual_override"])
