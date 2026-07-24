"""SPRINT 모의고사 공통 카탈로그 + 학생별 배정 (8차 전면 개편).

시험(문제/정답/배점/등급컷/시험지·해설지 PDF/영어듣기 MP3)은 과목 하나당 한 번만
SprintMockExamCatalog에 저장하고, 학생마다 복제하지 않는다. 학생마다 달라지는 것은
SprintMockExamAssignment의 일정(exam_date/available_from/deadline/공개시각)과
제출 답안/점수뿐이다.

7차(sprint_mock_rounds.py, 회차당 5과목 자동배정)와 5차(mock_exam.py, 단일과목 시리즈)는
운영 DB에 실제 배정/응시 기록이 있어 그대로 둔다 — 삭제/변환하지 않는다. 이 모듈이 학생
화면이 사용하는 새로운 기본 시스템이다. 파일 검증/스트리밍/등급-코칭 엔진은 이미 검증된
sprint_mock_rounds.py의 구현을 그대로 재사용한다 (중복 구현하지 않는다).
"""

from __future__ import annotations

import os
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

import models
from database import get_db
from sprint_mock_rounds import (
    MAX_LISTENING_AUDIO_BYTES,
    MAX_PAPER_PDF_BYTES,
    SEOUL_TZ,
    STORAGE_ROOT,
    build_coaching_message,
    delete_storage_file,
    detect_mp3_header,
    detect_pdf_header,
    estimate_mp3_duration_seconds,
    now_seoul,
    save_upload_streamed,
    storage_file_path,
    suggest_next_grade_combo,
)


router = APIRouter(tags=["Sprint Mock Exam Catalog"])

LOCKED_ASSIGNMENT_STATUSES = {"submitted", "graded", "confirmed"}
MEDIA_TYPES = {"worksheet_pdf", "solution_pdf", "listening_audio"}


# ---------------------------------------------------------------------------
# Pydantic 스키마
# ---------------------------------------------------------------------------


class CatalogCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    subject: str = Field(min_length=1, max_length=50)
    question_count: int = Field(ge=1, le=100)
    total_score: int = Field(default=100, ge=1, le=1000)
    duration_minutes: int | None = Field(default=None, ge=1, le=600)
    is_published: bool = False
    sort_order: int = 0


class CatalogUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    subject: str | None = Field(default=None, min_length=1, max_length=50)
    question_count: int | None = Field(default=None, ge=1, le=100)
    total_score: int | None = Field(default=None, ge=1, le=1000)
    duration_minutes: int | None = Field(default=None, ge=1, le=600)
    is_published: bool | None = None
    sort_order: int | None = None


class QuestionItemIn(BaseModel):
    question_no: int = Field(ge=1)
    correct_answer: int = Field(ge=1, le=5)
    score_points: int = Field(ge=0)
    category: str | None = Field(default=None, max_length=100)
    is_scored: bool = True
    memo: str | None = Field(default=None, max_length=300)


class QuestionSetIn(BaseModel):
    questions: list[QuestionItemIn] = Field(min_length=1)


class GradeCutItemIn(BaseModel):
    grade: int = Field(ge=1, le=8)
    minimum_score: int = Field(ge=0)


class GradeCutSetIn(BaseModel):
    grade_cuts: list[GradeCutItemIn]

    @model_validator(mode="after")
    def validate_order(self):
        by_grade: dict[int, int] = {}
        for item in self.grade_cuts:
            if item.grade in by_grade:
                raise ValueError("등급은 중복될 수 없습니다.")
            by_grade[item.grade] = item.minimum_score
        grades_sorted = sorted(by_grade.keys())
        for i in range(len(grades_sorted) - 1):
            g1, g2 = grades_sorted[i], grades_sorted[i + 1]
            if by_grade[g1] <= by_grade[g2]:
                raise ValueError("상위 등급(작은 번호)의 커트라인이 하위 등급보다 높아야 합니다 (1등급컷 > 2등급컷 > ...).")
        return self


class AssignmentScheduleIn(BaseModel):
    student_id: int
    exam_date: date
    available_from: datetime
    submission_deadline_at: datetime
    result_open_at: datetime | None = None
    solution_open_at: datetime | None = None

    @model_validator(mode="after")
    def validate_window(self):
        if self.submission_deadline_at < self.available_from:
            raise ValueError("submission_deadline_at은 available_from보다 빠를 수 없습니다.")
        return self


class BulkAssignIn(BaseModel):
    assignments: list[AssignmentScheduleIn] = Field(min_length=1)


class AssignmentUpdateIn(BaseModel):
    exam_date: date | None = None
    available_from: datetime | None = None
    submission_deadline_at: datetime | None = None
    result_open_at: datetime | None = None
    solution_open_at: datetime | None = None


class OmrAnswerItemIn(BaseModel):
    question_no: int = Field(ge=1)
    selected_answer: int | None = Field(default=None, ge=1, le=5)


class OmrSaveIn(BaseModel):
    student_id: int
    answers: list[OmrAnswerItemIn]


class SubmitIn(BaseModel):
    student_id: int
    force: bool = False


# ---------------------------------------------------------------------------
# 조회 헬퍼
# ---------------------------------------------------------------------------


def get_catalog_or_404(db: Session, catalog_id: int) -> models.SprintMockExamCatalog:
    catalog = db.get(models.SprintMockExamCatalog, catalog_id)
    if catalog is None:
        raise HTTPException(status_code=404, detail="모의고사를 찾을 수 없습니다.")
    return catalog


def get_student_or_404(db: Session, student_id: int) -> models.Student:
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    return student


def get_assignment_or_404(db: Session, assignment_id: int) -> models.SprintMockExamAssignment:
    assignment = db.get(models.SprintMockExamAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="배정을 찾을 수 없습니다.")
    return assignment


def ensure_student_assignment_access(assignment: models.SprintMockExamAssignment, student_id: int) -> None:
    if assignment.student_id != student_id:
        raise HTTPException(status_code=403, detail="다른 학생의 배정에는 접근할 수 없습니다.")


def get_student_assignment_for_catalog(db: Session, catalog_id: int, student_id: int) -> models.SprintMockExamAssignment:
    assignment = (
        db.query(models.SprintMockExamAssignment)
        .filter_by(catalog_id=catalog_id, student_id=student_id)
        .first()
    )
    if assignment is None:
        raise HTTPException(status_code=403, detail="배정되지 않은 시험입니다.")
    return assignment


def ensure_started(assignment: models.SprintMockExamAssignment) -> None:
    if now_seoul() < to_seoul(assignment.available_from):
        raise HTTPException(status_code=403, detail="아직 응시 가능 시간이 아닙니다.")


def to_seoul(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(SEOUL_TZ)


# ---------------------------------------------------------------------------
# 파일 저장 (7차와 동일한 검증/스트리밍 헬퍼 재사용)
# ---------------------------------------------------------------------------


def catalog_storage_key(catalog_id: int, media_type: str, extension: str) -> str:
    import uuid
    return f"sprint-mock-catalog/{catalog_id}/{media_type}/{uuid.uuid4().hex}.{extension}"


# ---------------------------------------------------------------------------
# 채점 (7차 grade_participant_paper와 동일한 로직, assignment 대상)
# ---------------------------------------------------------------------------


def grade_assignment(db: Session, assignment: models.SprintMockExamAssignment, catalog: models.SprintMockExamCatalog) -> tuple[int, int, int]:
    questions = {q.question_no: q for q in catalog.questions}
    responses = {r.question_no: r for r in assignment.responses}
    correct_count = 0
    raw_score = 0
    max_score = sum(q.score_points for q in questions.values() if q.is_scored)
    for question_no, question in questions.items():
        response = responses.get(question_no)
        if response is None:
            response = models.SprintMockExamAssignmentResponse(assignment_id=assignment.id, question_no=question_no, selected_answer=None)
            db.add(response)
            responses[question_no] = response
        is_correct = response.selected_answer is not None and response.selected_answer == question.correct_answer
        response.is_correct = is_correct
        if question.is_scored:
            response.awarded_points = question.score_points if is_correct else 0
            if is_correct:
                correct_count += 1
                raw_score += question.score_points
        else:
            response.awarded_points = 0
    assignment.raw_score = raw_score
    assignment.max_score = max_score
    assignment.correct_count = correct_count
    return raw_score, correct_count, max_score


def regrade_catalog(db: Session, catalog: models.SprintMockExamCatalog) -> list[dict]:
    affected = (
        db.query(models.SprintMockExamAssignment)
        .filter(
            models.SprintMockExamAssignment.catalog_id == catalog.id,
            models.SprintMockExamAssignment.status.in_(LOCKED_ASSIGNMENT_STATUSES),
        )
        .all()
    )
    results = []
    for assignment in affected:
        previous_score = assignment.raw_score
        previous_correct = assignment.correct_count
        raw_score, correct_count, _ = grade_assignment(db, assignment, catalog)
        assignment.grading_version += 1
        db.add(models.SprintMockExamAssignmentScoreLog(
            assignment_id=assignment.id, grading_version=assignment.grading_version,
            previous_raw_score=previous_score, new_raw_score=raw_score,
            previous_correct_count=previous_correct, new_correct_count=correct_count,
            reason="정답/배점 수정 재채점",
        ))
        results.append({"assignment_id": assignment.id, "previous_raw_score": previous_score, "new_raw_score": raw_score})
    return results


def compute_grade_analysis(assignment: models.SprintMockExamAssignment, catalog: models.SprintMockExamCatalog) -> dict | None:
    grade_cuts = list(catalog.grade_cuts)
    if not grade_cuts or assignment.raw_score is None:
        return None
    cutoffs = {gc.grade: gc.minimum_score for gc in grade_cuts}
    registered_grades = sorted(cutoffs.keys())
    raw_score = assignment.raw_score
    current_grade = 9
    for g in registered_grades:
        if raw_score >= cutoffs[g]:
            current_grade = g
            break
    result = {
        "grade": current_grade, "current_grade_cutoff": cutoffs.get(current_grade),
        "target_grade": None, "target_cutoff": None, "needed_score": 0,
        "minimum_question_count": 0, "suggested_question_nos": [], "suggested_point_values": [],
        "suggested_total_points": 0, "coaching_message": None, "reachable": None,
    }
    better_grades = [g for g in registered_grades if g < current_grade]
    if not better_grades:
        if current_grade == min(registered_grades):
            result["coaching_message"] = f"{current_grade}등급을 달성했어요!"
        return result
    target_grade = max(better_grades)
    target_cutoff = cutoffs[target_grade]
    needed = target_cutoff - raw_score
    result["target_grade"] = target_grade
    result["target_cutoff"] = target_cutoff
    result["needed_score"] = max(needed, 0)
    if needed <= 0:
        return result
    questions_by_no = {q.question_no: q for q in catalog.questions if q.is_scored}
    wrong_items = []
    for response in assignment.responses:
        question = questions_by_no.get(response.question_no)
        if question is None:
            continue
        if not response.is_correct:
            wrong_items.append({"question_no": question.question_no, "score_points": question.score_points, "category": question.category})
    combo = suggest_next_grade_combo(needed, wrong_items)
    if not combo.get("reachable"):
        result["reachable"] = False
        result["coaching_message"] = f"현재 오답 문항을 모두 회수해도 등록된 {target_grade}등급컷에는 도달하지 않습니다."
        return result
    result["reachable"] = True
    result["minimum_question_count"] = combo["minimum_question_count"]
    result["suggested_question_nos"] = combo["suggested_question_nos"]
    result["suggested_point_values"] = combo["suggested_point_values"]
    result["suggested_total_points"] = combo["suggested_total_points"]
    result["coaching_message"] = build_coaching_message(target_grade, combo["suggested_point_values"])
    return result


# ---------------------------------------------------------------------------
# 직렬화
# ---------------------------------------------------------------------------


def media_dict(media: models.SprintMockExamCatalogMedia) -> dict:
    kind = {"worksheet_pdf": "worksheet-file", "solution_pdf": "solution-file", "listening_audio": "listening-audio"}[media.media_type]
    return {
        "id": media.id, "media_type": media.media_type, "original_filename": media.original_filename,
        "mime_type": media.mime_type, "file_size": media.file_size, "duration_seconds": media.duration_seconds,
        "student_url": f"/student/sprint/mock-exam-catalog/{media.catalog_id}/{kind}",
        "admin_url": f"/admin/mock-exam-catalog/{media.catalog_id}/{kind}",
    }


def question_dict(question: models.SprintMockExamCatalogQuestion, reveal: bool) -> dict:
    payload = {"question_no": question.question_no, "score_points": question.score_points, "category": question.category, "is_scored": question.is_scored}
    if reveal:
        payload["correct_answer"] = question.correct_answer
        payload["memo"] = question.memo
    return payload


def grade_cut_dict(gc: models.SprintMockExamCatalogGradeCut) -> dict:
    return {"grade": gc.grade, "minimum_score": gc.minimum_score}


def catalog_dict(catalog: models.SprintMockExamCatalog, reveal: bool = False) -> dict:
    payload = {
        "id": catalog.id, "title": catalog.title, "subject": catalog.subject,
        "question_count": catalog.question_count, "total_score": catalog.total_score,
        "duration_minutes": catalog.duration_minutes, "is_published": catalog.is_published,
        "sort_order": catalog.sort_order,
        "has_answer_key": len(catalog.questions) > 0,
        "answer_key_total": sum(q.score_points for q in catalog.questions if q.is_scored),
        "grade_cuts": [grade_cut_dict(gc) for gc in sorted(catalog.grade_cuts, key=lambda x: x.grade)],
        "media": [media_dict(m) for m in catalog.media],
        "assignment_count": len(catalog.assignments),
        "created_at": catalog.created_at, "updated_at": catalog.updated_at,
    }
    if reveal:
        payload["questions"] = [question_dict(q, True) for q in catalog.questions]
    return payload


def assignment_dict(assignment: models.SprintMockExamAssignment, catalog: models.SprintMockExamCatalog | None = None, reveal: bool = False) -> dict:
    catalog = catalog or assignment.catalog
    now = now_seoul()
    started = now >= to_seoul(assignment.available_from)
    result_open = assignment.result_open_at is None or now >= to_seoul(assignment.result_open_at)
    solution_open = assignment.status in LOCKED_ASSIGNMENT_STATUSES and (assignment.solution_open_at is None or now >= to_seoul(assignment.solution_open_at))
    payload = {
        "id": assignment.id, "catalog_id": assignment.catalog_id, "student_id": assignment.student_id,
        "exam_date": assignment.exam_date, "available_from": assignment.available_from,
        "submission_deadline_at": assignment.submission_deadline_at,
        "result_open_at": assignment.result_open_at, "solution_open_at": assignment.solution_open_at,
        "status": assignment.status, "submitted_at": assignment.submitted_at,
        "raw_score": assignment.raw_score if result_open else None,
        "max_score": assignment.max_score if result_open else None,
        "correct_count": assignment.correct_count if result_open else None,
        "is_started": started, "is_result_open": result_open, "is_solution_open": solution_open,
        "catalog": {
            "id": catalog.id, "title": catalog.title, "subject": catalog.subject,
            "question_count": catalog.question_count, "total_score": catalog.total_score,
            "duration_minutes": catalog.duration_minutes,
            "media": [media_dict(m) for m in catalog.media],
        },
    }
    if reveal and result_open:
        payload["grade_analysis"] = compute_grade_analysis(assignment, catalog)
        payload["responses"] = [
            {
                "question_no": r.question_no, "selected_answer": r.selected_answer,
                "correct_answer": next((q.correct_answer for q in catalog.questions if q.question_no == r.question_no), None),
                "is_correct": r.is_correct,
                "score_points": next((q.score_points for q in catalog.questions if q.question_no == r.question_no), None),
                "awarded_points": r.awarded_points,
                "category": next((q.category for q in catalog.questions if q.question_no == r.question_no), None),
                "is_recommended_for_next_grade": bool(
                    payload.get("grade_analysis")
                    and r.question_no in (payload["grade_analysis"].get("suggested_question_nos") or [])
                ),
            }
            for r in sorted(assignment.responses, key=lambda x: x.question_no)
        ]
    return payload


# ---------------------------------------------------------------------------
# 관리자: 공통 카탈로그
# ---------------------------------------------------------------------------


@router.post("/admin/mock-exam-catalog", status_code=201)
def admin_create_catalog(payload: CatalogCreateIn, db: Session = Depends(get_db)):
    catalog = models.SprintMockExamCatalog(**payload.model_dump())
    db.add(catalog)
    db.commit()
    db.refresh(catalog)
    return catalog_dict(catalog, reveal=True)


@router.get("/admin/mock-exam-catalog")
def admin_list_catalog(db: Session = Depends(get_db)):
    rows = db.query(models.SprintMockExamCatalog).order_by(
        models.SprintMockExamCatalog.sort_order, models.SprintMockExamCatalog.id
    ).all()
    return [catalog_dict(row) for row in rows]


@router.get("/admin/mock-exam-catalog/{catalog_id}")
def admin_get_catalog(catalog_id: int, db: Session = Depends(get_db)):
    catalog = get_catalog_or_404(db, catalog_id)
    payload = catalog_dict(catalog, reveal=True)
    payload["assignments"] = [assignment_dict(a, catalog) for a in catalog.assignments]
    return payload


@router.patch("/admin/mock-exam-catalog/{catalog_id}")
def admin_update_catalog(catalog_id: int, payload: CatalogUpdateIn, db: Session = Depends(get_db)):
    catalog = get_catalog_or_404(db, catalog_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(catalog, key, value)
    db.commit()
    db.refresh(catalog)
    return catalog_dict(catalog, reveal=True)


@router.delete("/admin/mock-exam-catalog/{catalog_id}")
def admin_delete_catalog(catalog_id: int, db: Session = Depends(get_db)):
    catalog = get_catalog_or_404(db, catalog_id)
    locked = [a for a in catalog.assignments if a.status in LOCKED_ASSIGNMENT_STATUSES]
    if locked:
        raise HTTPException(status_code=400, detail="이미 제출된 배정이 있는 시험은 삭제할 수 없습니다. 비공개로 전환하세요.")
    storage_keys = [m.storage_key for m in catalog.media]
    db.delete(catalog)
    db.commit()
    for key in storage_keys:
        delete_storage_file(key)
    return {"deleted": True}


@router.put("/admin/mock-exam-catalog/{catalog_id}/questions")
def admin_set_questions(catalog_id: int, payload: QuestionSetIn, db: Session = Depends(get_db)):
    catalog = get_catalog_or_404(db, catalog_id)
    if len(payload.questions) != catalog.question_count:
        raise HTTPException(status_code=400, detail=f"정답 개수({len(payload.questions)})가 문항 수({catalog.question_count})와 일치하지 않습니다.")
    question_nos = [item.question_no for item in payload.questions]
    if sorted(question_nos) != list(range(1, catalog.question_count + 1)):
        raise HTTPException(status_code=400, detail="문제 번호가 1부터 문항 수까지 빠짐없이 있어야 합니다.")
    scored_total = sum(item.score_points for item in payload.questions if item.is_scored)
    if scored_total != catalog.total_score:
        raise HTTPException(status_code=400, detail=f"채점 대상 문항 배점 합({scored_total})이 시험 총점({catalog.total_score})과 일치해야 합니다.")

    db.query(models.SprintMockExamCatalogQuestion).filter_by(catalog_id=catalog_id).delete(synchronize_session=False)
    db.flush()
    for item in payload.questions:
        db.add(models.SprintMockExamCatalogQuestion(
            catalog_id=catalog_id, question_no=item.question_no, correct_answer=item.correct_answer,
            score_points=item.score_points, category=item.category, is_scored=item.is_scored, memo=item.memo,
        ))
    db.flush()
    db.refresh(catalog)
    regrade_results = regrade_catalog(db, catalog)
    db.commit()
    db.refresh(catalog)
    return catalog_dict(catalog, reveal=True) | {"regraded_count": len(regrade_results)}


@router.put("/admin/mock-exam-catalog/{catalog_id}/grade-cuts")
def admin_set_grade_cuts(catalog_id: int, payload: GradeCutSetIn, db: Session = Depends(get_db)):
    catalog = get_catalog_or_404(db, catalog_id)
    for item in payload.grade_cuts:
        if item.minimum_score > catalog.total_score:
            raise HTTPException(status_code=400, detail=f"{item.grade}등급컷({item.minimum_score})이 시험 총점({catalog.total_score})을 초과할 수 없습니다.")
    db.query(models.SprintMockExamCatalogGradeCut).filter_by(catalog_id=catalog_id).delete(synchronize_session=False)
    db.flush()
    for item in payload.grade_cuts:
        db.add(models.SprintMockExamCatalogGradeCut(catalog_id=catalog_id, grade=item.grade, minimum_score=item.minimum_score))
    db.commit()
    db.refresh(catalog)
    return catalog_dict(catalog, reveal=True)


async def _upload_catalog_media(catalog_id: int, media_type: str, file: UploadFile, db: Session, max_bytes: int, validate_header, mime_type: str, extension: str) -> dict:
    catalog = get_catalog_or_404(db, catalog_id)
    storage_key = catalog_storage_key(catalog_id, media_type, extension)
    path = storage_file_path(storage_key)
    size, first_chunk = await save_upload_streamed(file, max_bytes, path, validate_header)
    duration = estimate_mp3_duration_seconds(first_chunk, size) if media_type == "listening_audio" else None
    existing = next((m for m in catalog.media if m.media_type == media_type), None)
    old_key = existing.storage_key if existing else None
    if existing is not None:
        db.delete(existing)
        db.flush()
    media = models.SprintMockExamCatalogMedia(
        catalog_id=catalog_id, media_type=media_type, storage_key=storage_key,
        original_filename=os.path.basename(file.filename or ""), mime_type=mime_type, file_size=size,
        duration_seconds=duration,
    )
    db.add(media)
    try:
        db.commit()
    except Exception:
        db.rollback()
        delete_storage_file(storage_key)
        raise
    if old_key:
        delete_storage_file(old_key)
    db.refresh(media)
    return media_dict(media)


def _get_catalog_media_or_404(catalog: models.SprintMockExamCatalog, media_type: str) -> models.SprintMockExamCatalogMedia:
    media = next((m for m in catalog.media if m.media_type == media_type), None)
    if media is None:
        raise HTTPException(status_code=404, detail="등록된 파일이 없습니다.")
    return media


def _delete_catalog_media(catalog: models.SprintMockExamCatalog, media_type: str, db: Session) -> dict:
    media = _get_catalog_media_or_404(catalog, media_type)
    storage_key = media.storage_key
    db.delete(media)
    db.commit()
    delete_storage_file(storage_key)
    return {"deleted": True}


@router.post("/admin/mock-exam-catalog/{catalog_id}/worksheet-file", status_code=201)
async def admin_upload_worksheet_file(catalog_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    return await _upload_catalog_media(catalog_id, "worksheet_pdf", file, db, MAX_PAPER_PDF_BYTES, detect_pdf_header, "application/pdf", "pdf")


@router.delete("/admin/mock-exam-catalog/{catalog_id}/worksheet-file")
def admin_delete_worksheet_file(catalog_id: int, db: Session = Depends(get_db)):
    return _delete_catalog_media(get_catalog_or_404(db, catalog_id), "worksheet_pdf", db)


@router.get("/admin/mock-exam-catalog/{catalog_id}/worksheet-file")
def admin_get_worksheet_file(catalog_id: int, db: Session = Depends(get_db)):
    media = _get_catalog_media_or_404(get_catalog_or_404(db, catalog_id), "worksheet_pdf")
    path = storage_file_path(media.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=media.mime_type, filename=media.original_filename or path.name)


@router.post("/admin/mock-exam-catalog/{catalog_id}/solution-file", status_code=201)
async def admin_upload_solution_file(catalog_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    return await _upload_catalog_media(catalog_id, "solution_pdf", file, db, MAX_PAPER_PDF_BYTES, detect_pdf_header, "application/pdf", "pdf")


@router.delete("/admin/mock-exam-catalog/{catalog_id}/solution-file")
def admin_delete_solution_file(catalog_id: int, db: Session = Depends(get_db)):
    return _delete_catalog_media(get_catalog_or_404(db, catalog_id), "solution_pdf", db)


@router.get("/admin/mock-exam-catalog/{catalog_id}/solution-file")
def admin_get_solution_file(catalog_id: int, db: Session = Depends(get_db)):
    media = _get_catalog_media_or_404(get_catalog_or_404(db, catalog_id), "solution_pdf")
    path = storage_file_path(media.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=media.mime_type, filename=media.original_filename or path.name, content_disposition_type="inline")


@router.post("/admin/mock-exam-catalog/{catalog_id}/listening-audio", status_code=201)
async def admin_upload_listening_audio(catalog_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    return await _upload_catalog_media(catalog_id, "listening_audio", file, db, MAX_LISTENING_AUDIO_BYTES, detect_mp3_header, "audio/mpeg", "mp3")


@router.delete("/admin/mock-exam-catalog/{catalog_id}/listening-audio")
def admin_delete_listening_audio(catalog_id: int, db: Session = Depends(get_db)):
    return _delete_catalog_media(get_catalog_or_404(db, catalog_id), "listening_audio", db)


@router.get("/admin/mock-exam-catalog/{catalog_id}/listening-audio")
def admin_get_listening_audio(catalog_id: int, db: Session = Depends(get_db)):
    media = _get_catalog_media_or_404(get_catalog_or_404(db, catalog_id), "listening_audio")
    path = storage_file_path(media.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=media.mime_type, filename=media.original_filename or path.name)


# ---------------------------------------------------------------------------
# 관리자: 학생 배정 ("동기화"라는 모호한 버튼 대신 학생 배정 / 배정 수정으로 명확히 분리)
# ---------------------------------------------------------------------------


@router.post("/admin/mock-exam-catalog/{catalog_id}/assignments")
def admin_bulk_assign(catalog_id: int, payload: BulkAssignIn, db: Session = Depends(get_db)):
    """여러 학생에게 같은 시험을 배정한다. 시험지·정답은 공유하고, 학생마다 일정만 다르게
    저장한다. 이미 배정된 학생(mock_exam_id+student_id 중복)은 건너뛰고, 한 학생 실패가
    나머지 배정을 막지 않는다."""
    catalog = get_catalog_or_404(db, catalog_id)
    results = []
    for item in payload.assignments:
        student = db.get(models.Student, item.student_id)
        if student is None:
            results.append({"student_id": item.student_id, "status": "failed", "error": "학생을 찾을 수 없습니다."})
            continue
        existing = db.query(models.SprintMockExamAssignment).filter_by(catalog_id=catalog.id, student_id=item.student_id).first()
        if existing is not None:
            results.append({"student_id": item.student_id, "status": "duplicate", "assignment_id": existing.id})
            continue
        try:
            assignment = models.SprintMockExamAssignment(
                catalog_id=catalog.id, student_id=item.student_id, exam_date=item.exam_date,
                available_from=item.available_from, submission_deadline_at=item.submission_deadline_at,
                result_open_at=item.result_open_at, solution_open_at=item.solution_open_at,
                status="not_started",
            )
            db.add(assignment)
            db.commit()
            db.refresh(assignment)
            results.append({"student_id": item.student_id, "status": "created", "assignment_id": assignment.id})
        except Exception as exc:
            db.rollback()
            results.append({"student_id": item.student_id, "status": "failed", "error": str(exc)})
    return {"results": results}


@router.get("/admin/mock-exam-catalog/{catalog_id}/assignments")
def admin_list_assignments(catalog_id: int, db: Session = Depends(get_db)):
    catalog = get_catalog_or_404(db, catalog_id)
    return [assignment_dict(a, catalog) for a in catalog.assignments]


@router.patch("/admin/mock-exam-assignments/{assignment_id}")
def admin_update_assignment(assignment_id: int, payload: AssignmentUpdateIn, db: Session = Depends(get_db)):
    """배정 수정: 학생별 시험일/응시가능시간/마감/공개시각을 개별적으로 바꾼다."""
    assignment = get_assignment_or_404(db, assignment_id)
    values = payload.model_dump(exclude_unset=True)
    available_from = values.get("available_from", assignment.available_from)
    submission_deadline_at = values.get("submission_deadline_at", assignment.submission_deadline_at)
    if submission_deadline_at < available_from:
        raise HTTPException(status_code=400, detail="submission_deadline_at은 available_from보다 빠를 수 없습니다.")
    for key, value in values.items():
        setattr(assignment, key, value)
    db.commit()
    db.refresh(assignment)
    return assignment_dict(assignment)


@router.delete("/admin/mock-exam-assignments/{assignment_id}")
def admin_delete_assignment(assignment_id: int, db: Session = Depends(get_db)):
    assignment = get_assignment_or_404(db, assignment_id)
    if assignment.status in LOCKED_ASSIGNMENT_STATUSES:
        raise HTTPException(status_code=400, detail="이미 제출된 배정은 삭제할 수 없습니다.")
    db.delete(assignment)
    db.commit()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# 학생: 배정 조회 + 파일(시간 게이트)
# ---------------------------------------------------------------------------


@router.get("/student/sprint/mock-exam-assignments")
def student_list_assignments(student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    rows = db.query(models.SprintMockExamAssignment).filter_by(student_id=student_id).order_by(models.SprintMockExamAssignment.exam_date.desc()).all()
    return [assignment_dict(a) for a in rows]


@router.get("/student/sprint/mock-exam-assignments/{assignment_id}")
def student_get_assignment(assignment_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    assignment = get_assignment_or_404(db, assignment_id)
    ensure_student_assignment_access(assignment, student_id)
    return assignment_dict(assignment, reveal=True)


@router.get("/student/sprint/mock-exam-catalog/{catalog_id}/worksheet-file")
def student_get_worksheet_file(catalog_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    assignment = get_student_assignment_for_catalog(db, catalog_id, student_id)
    ensure_started(assignment)
    media = _get_catalog_media_or_404(assignment.catalog, "worksheet_pdf")
    path = storage_file_path(media.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=media.mime_type, filename=media.original_filename or path.name)


@router.get("/student/sprint/mock-exam-catalog/{catalog_id}/listening-audio")
def student_get_listening_audio(catalog_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    assignment = get_student_assignment_for_catalog(db, catalog_id, student_id)
    ensure_started(assignment)
    media = _get_catalog_media_or_404(assignment.catalog, "listening_audio")
    path = storage_file_path(media.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=media.mime_type, filename=media.original_filename or path.name)


@router.get("/student/sprint/mock-exam-catalog/{catalog_id}/solution-file")
def student_get_solution_file(catalog_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    assignment = get_student_assignment_for_catalog(db, catalog_id, student_id)
    if assignment.status not in LOCKED_ASSIGNMENT_STATUSES:
        raise HTTPException(status_code=403, detail="OMR을 최종 제출해야 해설을 볼 수 있습니다.")
    if assignment.solution_open_at is not None and now_seoul() < to_seoul(assignment.solution_open_at):
        raise HTTPException(status_code=403, detail="아직 해설이 공개되지 않았습니다.")
    media = _get_catalog_media_or_404(assignment.catalog, "solution_pdf")
    path = storage_file_path(media.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    # 다운로드 대화상자 대신 인라인으로 열어 웹 뷰어(프론트 PDF.js)에서 표시하게 한다.
    return FileResponse(path, media_type=media.mime_type, filename=media.original_filename or path.name, content_disposition_type="inline")


# ---------------------------------------------------------------------------
# 학생: OMR / 제출 / 결과
# ---------------------------------------------------------------------------


@router.get("/student/sprint/mock-exam-assignments/{assignment_id}/omr")
def student_get_omr(assignment_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    assignment = get_assignment_or_404(db, assignment_id)
    ensure_student_assignment_access(assignment, student_id)
    ensure_started(assignment)
    if assignment.status in LOCKED_ASSIGNMENT_STATUSES:
        raise HTTPException(status_code=400, detail="이미 제출된 시험은 답안을 수정할 수 없습니다.")
    catalog = assignment.catalog
    responses = {r.question_no: r.selected_answer for r in assignment.responses}
    return {
        "assignment": assignment_dict(assignment),
        "answers": [{"question_no": q, "selected_answer": responses.get(q)} for q in range(1, catalog.question_count + 1)],
    }


@router.put("/student/sprint/mock-exam-assignments/{assignment_id}/omr")
def student_save_omr(assignment_id: int, payload: OmrSaveIn, db: Session = Depends(get_db)):
    get_student_or_404(db, payload.student_id)
    assignment = get_assignment_or_404(db, assignment_id)
    ensure_student_assignment_access(assignment, payload.student_id)
    ensure_started(assignment)
    if assignment.status in LOCKED_ASSIGNMENT_STATUSES:
        raise HTTPException(status_code=400, detail="이미 제출된 시험은 답안을 수정할 수 없습니다.")
    catalog = assignment.catalog
    valid_question_nos = set(range(1, catalog.question_count + 1))
    existing = {r.question_no: r for r in assignment.responses}
    for item in payload.answers:
        if item.question_no not in valid_question_nos:
            raise HTTPException(status_code=400, detail=f"문항 번호 {item.question_no}는 이 시험에 존재하지 않습니다.")
        response = existing.get(item.question_no)
        if response is None:
            response = models.SprintMockExamAssignmentResponse(assignment_id=assignment.id, question_no=item.question_no)
            db.add(response)
            existing[item.question_no] = response
        response.selected_answer = item.selected_answer
    assignment.status = "draft"
    db.commit()
    answered = sum(1 for r in existing.values() if r.selected_answer is not None)
    return {"saved": True, "answered_count": answered, "question_count": catalog.question_count}


@router.post("/student/sprint/mock-exam-assignments/{assignment_id}/submit")
def student_submit_assignment(assignment_id: int, payload: SubmitIn, db: Session = Depends(get_db)):
    get_student_or_404(db, payload.student_id)
    assignment = get_assignment_or_404(db, assignment_id)
    ensure_student_assignment_access(assignment, payload.student_id)
    ensure_started(assignment)
    if assignment.status in LOCKED_ASSIGNMENT_STATUSES:
        raise HTTPException(status_code=400, detail="이미 제출된 시험입니다.")
    catalog = assignment.catalog
    if not catalog.questions:
        raise HTTPException(status_code=400, detail="정답이 아직 등록되지 않아 채점할 수 없습니다.")
    answered_nos = {r.question_no for r in assignment.responses if r.selected_answer is not None}
    unanswered = [n for n in range(1, catalog.question_count + 1) if n not in answered_nos]
    if unanswered and not payload.force:
        raise HTTPException(status_code=409, detail=f"미응답 문항이 {len(unanswered)}개 있습니다. 그대로 제출하려면 다시 확인해주세요.")
    assignment.submitted_at = datetime.now(timezone.utc)
    grade_assignment(db, assignment, catalog)
    assignment.status = "graded"
    db.commit()
    db.refresh(assignment)
    return assignment_dict(assignment, reveal=True)


@router.get("/student/sprint/mock-exam-assignments/{assignment_id}/result")
def student_get_result(assignment_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    assignment = get_assignment_or_404(db, assignment_id)
    ensure_student_assignment_access(assignment, student_id)
    if assignment.status not in LOCKED_ASSIGNMENT_STATUSES:
        raise HTTPException(status_code=400, detail="아직 채점되지 않은 시험입니다.")
    return assignment_dict(assignment, reveal=True)


# ---------------------------------------------------------------------------
# 대시보드 요약 (sprint.py가 지연 import로 재사용)
# ---------------------------------------------------------------------------


def mock_catalog_home_summary(db: Session, student_id: int) -> dict:
    today = now_seoul().date()
    assignments = db.query(models.SprintMockExamAssignment).filter_by(student_id=student_id).all()
    if not assignments:
        return {"available": True, "status": "none", "assignment": None, "path": "/student/sprint/mock-exam-assignments"}
    upcoming = [a for a in assignments if a.exam_date >= today and a.status not in LOCKED_ASSIGNMENT_STATUSES]
    if not upcoming:
        return {"available": True, "status": "none", "assignment": None, "path": "/student/sprint/mock-exam-assignments"}
    upcoming.sort(key=lambda a: a.exam_date)
    assignment = upcoming[0]
    started = now_seoul() >= to_seoul(assignment.available_from)
    return {
        "available": True,
        "status": "open" if started else "scheduled",
        "assignment": {"id": assignment.id, "title": assignment.catalog.title, "subject": assignment.catalog.subject, "exam_date": assignment.exam_date},
        "days_remaining": (assignment.exam_date - today).days,
        "path": f"/student/sprint/mock-exam-assignments/{assignment.id}",
    }
