"""SPRINT 모의고사 회차/시험지 (7차 전면 개편).

기존 mock_exam.py(5차, 단일 과목 시리즈)는 데이터가 없고 API 호환을 위해 그대로
남겨두며 손대지 않는다. 이 모듈이 "회차 하나 = 과목별 시험지 여러 개, 학생은
5과목(국어/수학/영어/탐구2)만 자동 배정" 이라는 실제 운영 구조의 새 중심 데이터다.
sprint.py는 이 모듈을 지연 import(순환 참조 방지)로 가져다 쓰고, 이 모듈은
sprint.py를 import하지 않는다 (mock_exam.py/sprint_goals.py와 동일한 패턴).
"""

from __future__ import annotations

import os
import uuid
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

import models
from database import get_db


router = APIRouter(tags=["Sprint Mock Exam Rounds"])

SEOUL_TZ = timezone(timedelta(hours=9))
STORAGE_ROOT = Path("storage")

CORE_SUBJECT_LABELS = {"korean": "국어", "math": "수학", "english": "영어"}
INQUIRY_SUBJECT_LABELS = {
    "life_ethics": "생활과 윤리",
    "ethics_thought": "윤리와 사상",
    "social_culture": "사회문화",
    "east_asian_history": "동아시아사",
}
SUBJECT_LABELS = {**CORE_SUBJECT_LABELS, **INQUIRY_SUBJECT_LABELS}
INQUIRY_SUBJECT_CODES = set(INQUIRY_SUBJECT_LABELS.keys())
ALL_SUBJECT_CODES = set(SUBJECT_LABELS.keys())
REQUIRED_SLOTS = ["korean", "math", "english", "inquiry_1", "inquiry_2"]
SLOT_LABELS = {"korean": "국어", "math": "수학", "english": "영어", "inquiry_1": "탐구 1", "inquiry_2": "탐구 2"}
LOCKED_PAPER_STATUSES = {"submitted", "graded", "confirmed"}

MAX_PAPER_PDF_BYTES = 50 * 1024 * 1024
MAX_LISTENING_AUDIO_BYTES = 100 * 1024 * 1024

COUNT_KR = {1: "한", 2: "두", 3: "세", 4: "네", 5: "다섯", 6: "여섯", 7: "일곱", 8: "여덟", 9: "아홉", 10: "열"}


def subject_group_for_code(subject_code: str) -> str:
    return subject_code if subject_code in CORE_SUBJECT_LABELS else "inquiry"


# ---------------------------------------------------------------------------
# Pydantic 스키마
# ---------------------------------------------------------------------------


class RoundCreateIn(BaseModel):
    round_no: int | None = Field(default=None, ge=1)
    title: str = Field(min_length=1, max_length=200)
    exam_date: date
    start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    submission_deadline_time: str = Field(pattern=r"^\d{2}:\d{2}$")


class RoundUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    exam_date: date | None = None
    start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    submission_deadline_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    is_active: bool | None = None


class PaperCreateIn(BaseModel):
    subject_code: str
    title: str | None = Field(default=None, max_length=200)
    question_count: int = Field(ge=1, le=100)
    total_score: int = Field(default=100, ge=1, le=1000)
    scoring_policy: Literal["equal_split", "manual"] = "equal_split"
    is_required: bool = True

    @model_validator(mode="after")
    def validate_subject(self):
        if self.subject_code not in ALL_SUBJECT_CODES:
            raise ValueError("허용되지 않은 과목입니다.")
        if not self.title:
            self.title = SUBJECT_LABELS[self.subject_code]
        return self


class PaperUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    question_count: int | None = Field(default=None, ge=1, le=100)
    total_score: int | None = Field(default=None, ge=1, le=1000)
    scoring_policy: Literal["equal_split", "manual"] | None = None
    is_required: bool | None = None
    is_active: bool | None = None


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


class OmrAnswerItemIn(BaseModel):
    question_no: int = Field(ge=1)
    selected_answer: int | None = Field(default=None, ge=1, le=5)


class OmrSaveIn(BaseModel):
    student_id: int
    answers: list[OmrAnswerItemIn]


class SubmitIn(BaseModel):
    student_id: int
    force: bool = False


class InquirySubjectsIn(BaseModel):
    student_id: int
    inquiry_subject_1: str | None = None
    inquiry_subject_2: str | None = None

    @model_validator(mode="after")
    def validate_subjects(self):
        for value in (self.inquiry_subject_1, self.inquiry_subject_2):
            if value is not None and value not in INQUIRY_SUBJECT_CODES:
                raise ValueError("허용되지 않은 탐구 선택과목입니다.")
        if (
            self.inquiry_subject_1 is not None
            and self.inquiry_subject_2 is not None
            and self.inquiry_subject_1 == self.inquiry_subject_2
        ):
            raise ValueError("탐구 선택과목 두 개는 서로 달라야 합니다.")
        return self


# ---------------------------------------------------------------------------
# 조회 헬퍼
# ---------------------------------------------------------------------------


def get_program_or_404(db: Session, program_id: int) -> models.SprintProgram:
    program = db.get(models.SprintProgram, program_id)
    if program is None:
        raise HTTPException(status_code=404, detail="SPRINT 프로그램을 찾을 수 없습니다.")
    return program


def get_student_or_404(db: Session, student_id: int) -> models.Student:
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    return student


def get_round_or_404(db: Session, round_id: int) -> models.SprintMockExamRound:
    round_ = db.get(models.SprintMockExamRound, round_id)
    if round_ is None:
        raise HTTPException(status_code=404, detail="모의고사 회차를 찾을 수 없습니다.")
    return round_


def get_paper_or_404(db: Session, paper_id: int) -> models.SprintMockExamPaper:
    paper = db.get(models.SprintMockExamPaper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="시험지를 찾을 수 없습니다.")
    return paper


def get_participant_paper_or_404(db: Session, participant_paper_id: int) -> models.SprintMockExamParticipantPaper:
    row = db.get(models.SprintMockExamParticipantPaper, participant_paper_id)
    if row is None:
        raise HTTPException(status_code=404, detail="배정된 과목을 찾을 수 없습니다.")
    return row


def ensure_student_participant_paper_access(pp: models.SprintMockExamParticipantPaper, student_id: int) -> None:
    if pp.participant.student_id != student_id:
        raise HTTPException(status_code=403, detail="다른 학생의 답안에는 접근할 수 없습니다.")


def ensure_student_paper_access(db: Session, paper: models.SprintMockExamPaper, student_id: int) -> None:
    exists = (
        db.query(models.SprintMockExamParticipantPaper)
        .join(models.SprintMockExamParticipant, models.SprintMockExamParticipantPaper.participant_id == models.SprintMockExamParticipant.id)
        .filter(
            models.SprintMockExamParticipantPaper.paper_id == paper.id,
            models.SprintMockExamParticipant.student_id == student_id,
        )
        .first()
    )
    if exists is None:
        raise HTTPException(status_code=403, detail="배정되지 않은 시험지입니다.")


# ---------------------------------------------------------------------------
# 시간/상태
# ---------------------------------------------------------------------------


def now_seoul() -> datetime:
    return datetime.now(timezone.utc).astimezone(SEOUL_TZ)


def compute_deadline_at(exam_date: date, deadline_time: str) -> datetime:
    hour, minute = (int(part) for part in deadline_time.split(":"))
    deadline_date = exam_date + timedelta(days=1) if hour < 5 else exam_date
    return datetime(deadline_date.year, deadline_date.month, deadline_date.day, hour, minute, tzinfo=SEOUL_TZ)


def compute_round_status(round_: models.SprintMockExamRound, now: datetime | None = None) -> str:
    current = (now or now_seoul())
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    current = current.astimezone(SEOUL_TZ)
    if round_.exam_date > current.date():
        return "scheduled"
    deadline = round_.submission_deadline_at
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    return "open" if current <= deadline.astimezone(SEOUL_TZ) else "closed"


def sync_round_status(round_: models.SprintMockExamRound) -> str:
    live = compute_round_status(round_)
    if round_.status != live:
        round_.status = live
    return live


# ---------------------------------------------------------------------------
# 파일 저장 (스트리밍: 전체를 메모리에 올리지 않는다)
# ---------------------------------------------------------------------------


def storage_file_path(storage_key: str) -> Path:
    root = STORAGE_ROOT.resolve()
    path = (STORAGE_ROOT / storage_key).resolve()
    if root not in path.parents:
        raise HTTPException(status_code=400, detail="Invalid storage key.")
    return path


def delete_storage_file(storage_key: str) -> None:
    try:
        storage_file_path(storage_key).unlink(missing_ok=True)
    except OSError:
        pass


def detect_pdf_header(header: bytes) -> None:
    if not header.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드할 수 있습니다.")


def detect_mp3_header(header: bytes) -> None:
    if header[:3] == b"ID3":
        return
    if len(header) >= 2 and header[0] == 0xFF and (header[1] & 0xE0) == 0xE0:
        return
    raise HTTPException(status_code=400, detail="MP3 파일만 업로드할 수 있습니다.")


MPEG1_L3_BITRATES = [None, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, None]
SAMPLE_RATES_V1 = [44100, 48000, 32000, None]


def estimate_mp3_duration_seconds(data: bytes, total_file_size: int) -> int | None:
    """MPEG1 Layer III CBR 기준 최선 추정치. 실패하면 조용히 None (표시하지 않음)."""
    try:
        offset = 0
        if data[:3] == b"ID3" and len(data) >= 10:
            tag_size = ((data[6] & 0x7F) << 21) | ((data[7] & 0x7F) << 14) | ((data[8] & 0x7F) << 7) | (data[9] & 0x7F)
            offset = 10 + tag_size
        limit = min(len(data) - 4, offset + 8192)
        i = offset
        while i < limit:
            if data[i] == 0xFF and (data[i + 1] & 0xE0) == 0xE0:
                b1, b2 = data[i + 1], data[i + 2]
                version_bits = (b1 >> 3) & 0x3
                layer_bits = (b1 >> 1) & 0x3
                if version_bits == 3 and layer_bits == 1:
                    bitrate = MPEG1_L3_BITRATES[(b2 >> 4) & 0xF]
                    sample_rate = SAMPLE_RATES_V1[(b2 >> 2) & 0x3]
                    if bitrate and sample_rate:
                        audio_bytes = max(total_file_size - i, 0)
                        duration = int((audio_bytes * 8) / (bitrate * 1000))
                        return duration or None
                return None
            i += 1
        return None
    except Exception:
        return None


async def save_upload_streamed(file: UploadFile, max_bytes: int, dest: Path, validate_header) -> tuple[int, bytes]:
    """전체 파일을 메모리에 올리지 않고 1MB 청크 단위로 검증 후 저장한다."""
    first_chunk = await file.read(1024 * 1024)
    validate_header(first_chunk[:32])
    dest.parent.mkdir(parents=True, exist_ok=True)
    total = len(first_chunk)
    if total > max_bytes:
        raise HTTPException(status_code=400, detail="파일이 너무 큽니다.")
    with dest.open("wb") as out:
        out.write(first_chunk)
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=400, detail="파일이 너무 큽니다.")
            out.write(chunk)
    if total == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="빈 파일은 업로드할 수 없습니다.")
    return total, first_chunk


def paper_storage_key(program_id: int, round_id: int, paper_id: int, media_type: str, extension: str) -> str:
    sub = "listening" if media_type == "listening_audio" else "paper-file"
    return f"sprint-mock-exams/{program_id}/{round_id}/{paper_id}/{sub}/{uuid.uuid4().hex}.{extension}"


# ---------------------------------------------------------------------------
# 채점
# ---------------------------------------------------------------------------


def grade_participant_paper(db: Session, pp: models.SprintMockExamParticipantPaper, paper: models.SprintMockExamPaper) -> tuple[int, int, int]:
    """paper.questions 기준으로 pp.responses를 채점한다. is_scored=false 문항은 총점/등급에서 제외한다."""
    questions = {q.question_no: q for q in paper.questions}
    responses = {r.question_no: r for r in pp.responses}
    correct_count = 0
    raw_score = 0
    max_score = sum(q.score_points for q in questions.values() if q.is_scored)
    for question_no, question in questions.items():
        response = responses.get(question_no)
        if response is None:
            response = models.SprintMockExamParticipantResponse(participant_paper_id=pp.id, question_no=question_no, selected_answer=None)
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
    pp.raw_score = raw_score
    pp.max_score = max_score
    pp.correct_count = correct_count
    return raw_score, correct_count, max_score


def regrade_paper(db: Session, paper: models.SprintMockExamPaper) -> list[dict]:
    """정답/배점이 바뀐 뒤, 이미 제출된 participant_paper를 재채점하고 감사 로그를 남긴다."""
    affected_rows = (
        db.query(models.SprintMockExamParticipantPaper)
        .filter(
            models.SprintMockExamParticipantPaper.paper_id == paper.id,
            models.SprintMockExamParticipantPaper.status.in_(LOCKED_PAPER_STATUSES),
        )
        .all()
    )
    results = []
    for pp in affected_rows:
        previous_score = pp.raw_score
        previous_correct = pp.correct_count
        raw_score, correct_count, _ = grade_participant_paper(db, pp, paper)
        pp.grading_version += 1
        db.add(models.SprintMockExamParticipantScoreLog(
            participant_paper_id=pp.id,
            grading_version=pp.grading_version,
            previous_raw_score=previous_score,
            new_raw_score=raw_score,
            previous_correct_count=previous_correct,
            new_correct_count=correct_count,
            reason="정답/배점 수정 재채점",
        ))
        results.append({"participant_paper_id": pp.id, "previous_raw_score": previous_score, "new_raw_score": raw_score})
    return results


# ---------------------------------------------------------------------------
# 등급 계산 + 오답 조합 DP + 코칭 문구
# ---------------------------------------------------------------------------


def _count_kr(n: int) -> str:
    return COUNT_KR.get(n, str(n))


def build_coaching_message(target_grade: int, suggested_point_values: list[int]) -> str:
    if not suggested_point_values:
        return ""
    counts = Counter(suggested_point_values)
    distinct_values = sorted(counts.keys(), reverse=True)
    if len(distinct_values) == 1:
        value = distinct_values[0]
        count = counts[value]
        if count == 1:
            return f"{value}점 문항 한 문제만 더 맞히면 {target_grade}등급이에요!"
        return f"{value}점 문항 {_count_kr(count)} 문제만 더 맞히면 {target_grade}등급이에요!"
    if all(counts[v] == 1 for v in distinct_values):
        joined = "과 ".join(f"{v}점 문항" for v in distinct_values)
        return f"{joined}을 한 문제씩 더 맞히면 {target_grade}등급이에요!"
    parts = []
    for value in distinct_values:
        count = counts[value]
        count_phrase = "한 문제" if count == 1 else f"{_count_kr(count)} 문제"
        parts.append(f"{value}점 문항 {count_phrase}")
    joined = "와 ".join(parts)
    return f"{joined}를 더 맞히면 {target_grade}등급이에요!"


def _combo_sort_key(entry: tuple[int, tuple[int, ...], int]) -> tuple:
    count, points_tuple, min_q = entry
    return (count, points_tuple, min_q)


def suggest_next_grade_combo(needed_score: int, wrong_items: list[dict]) -> dict:
    """작은 정수 배점 기반 0/1 DP: needed_score 이상을 만드는 오답 문항의 최소 조합을 찾는다.
    우선순위: 1) 초과 점수 최소 2) 문항 수 최소 3) 배점 구성/문항번호로 결정적 tie-break."""
    if needed_score <= 0:
        return {"reachable": True, "minimum_question_count": 0, "suggested_question_nos": [], "suggested_point_values": [], "suggested_total_points": 0}
    dp: dict[int, tuple[int, tuple[int, ...], int, list[int]]] = {0: (0, (), 10**9, [])}
    for idx, item in enumerate(wrong_items):
        pts = item["score_points"]
        qno = item["question_no"]
        updates: dict[int, tuple[int, tuple[int, ...], int, list[int]]] = {}
        for s, (cnt, points_tuple, min_q, items) in dp.items():
            ns = s + pts
            candidate = (cnt + 1, tuple(sorted(points_tuple + (pts,), reverse=True)), min(min_q, qno), items + [idx])
            current_best = updates.get(ns) or dp.get(ns)
            if current_best is None or _combo_sort_key(candidate[:3]) < _combo_sort_key(current_best[:3]):
                updates[ns] = candidate
        for s, candidate in updates.items():
            existing = dp.get(s)
            if existing is None or _combo_sort_key(candidate[:3]) < _combo_sort_key(existing[:3]):
                dp[s] = candidate
    reachable_sums = [s for s in dp if s >= needed_score and s > 0]
    if not reachable_sums:
        return {"reachable": False}
    best_sum = min(reachable_sums, key=lambda s: (s - needed_score, dp[s][0], dp[s][1], dp[s][2]))
    cnt, _points_tuple, _min_q, items = dp[best_sum]
    suggested = sorted((wrong_items[i] for i in items), key=lambda it: it["question_no"])
    return {
        "reachable": True,
        "achieved_sum": best_sum,
        "minimum_question_count": cnt,
        "suggested_question_nos": [it["question_no"] for it in suggested],
        "suggested_point_values": [it["score_points"] for it in suggested],
        "suggested_total_points": best_sum,
    }


def compute_grade_analysis(pp: models.SprintMockExamParticipantPaper, paper: models.SprintMockExamPaper) -> dict | None:
    grade_cuts = list(paper.grade_cuts)
    if not grade_cuts or pp.raw_score is None:
        return None
    cutoffs = {gc.grade: gc.minimum_score for gc in grade_cuts}
    registered_grades = sorted(cutoffs.keys())
    raw_score = pp.raw_score
    current_grade = 9
    for g in registered_grades:
        if raw_score >= cutoffs[g]:
            current_grade = g
            break
    result = {
        "grade": current_grade,
        "current_grade_cutoff": cutoffs.get(current_grade),
        "target_grade": None,
        "target_cutoff": None,
        "needed_score": 0,
        "minimum_question_count": 0,
        "suggested_question_nos": [],
        "suggested_point_values": [],
        "suggested_total_points": 0,
        "coaching_message": None,
        "reachable": None,
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

    questions_by_no = {q.question_no: q for q in paper.questions if q.is_scored}
    wrong_items = []
    for response in pp.responses:
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
# 자동 배정 (participant / participant_paper sync)
# ---------------------------------------------------------------------------


def recompute_participant_status(participant: models.SprintMockExamParticipant, db: Session | None = None) -> None:
    if db is not None:
        rows = db.query(models.SprintMockExamParticipantPaper).filter_by(participant_id=participant.id).all()
    else:
        rows = participant.papers
    slot_status = {row.subject_slot: row.status for row in rows}
    if any(slot_status.get(slot) is None for slot in REQUIRED_SLOTS):
        participant.status = "not_started" if all(slot_status.get(s) in {None, "needs_selection", "not_started"} for s in REQUIRED_SLOTS) else "in_progress"
        participant.completed_at = None
        return
    if any(slot_status.get(slot) in {"needs_selection", "not_started", "draft"} for slot in REQUIRED_SLOTS):
        any_progress = any(slot_status.get(slot) in {"draft", "submitted", "graded", "confirmed"} for slot in REQUIRED_SLOTS)
        participant.status = "in_progress" if any_progress else "not_started"
        participant.completed_at = None
        return
    if participant.status != "completed":
        participant.completed_at = datetime.now(timezone.utc)
    participant.status = "completed"


def sync_participants(db: Session, round_: models.SprintMockExamRound) -> dict:
    """program_id로 지정된 학생(오늘 구조상 1명)을 이 회차의 participant로 만들고,
    국어/수학/영어/탐구 paper를 자동 연결한다. 이미 제출한 학생 데이터는 건드리지 않는다.

    round_.papers/participant.papers 관계 컬렉션은 별도 커밋을 거친 이전 호출에서
    이미 로드되어 캐시된 채로 남아있을 수 있으므로(SQLAlchemy identity map), 항상
    DB에서 새로 조회해 최신 상태를 기준으로 동기화한다."""
    program = db.get(models.SprintProgram, round_.sprint_program_id)
    student_id = program.student_id

    participant = (
        db.query(models.SprintMockExamParticipant)
        .filter_by(mock_exam_round_id=round_.id, student_id=student_id)
        .first()
    )
    if participant is None:
        participant = models.SprintMockExamParticipant(mock_exam_round_id=round_.id, student_id=student_id, status="not_started")
        db.add(participant)
        db.flush()

    papers = db.query(models.SprintMockExamPaper).filter_by(mock_exam_round_id=round_.id, is_active=True).all()
    papers_by_code = {p.subject_code: p for p in papers}
    slot_specs = [
        ("korean", "korean"),
        ("math", "math"),
        ("english", "english"),
        ("inquiry_1", program.inquiry_subject_1),
        ("inquiry_2", program.inquiry_subject_2),
    ]
    existing_slots = {
        pp.subject_slot: pp
        for pp in db.query(models.SprintMockExamParticipantPaper).filter_by(participant_id=participant.id).all()
    }
    for slot, subject_code in slot_specs:
        paper = papers_by_code.get(subject_code) if subject_code else None
        row = existing_slots.get(slot)
        if row is None:
            row = models.SprintMockExamParticipantPaper(
                participant_id=participant.id,
                paper_id=paper.id if paper else None,
                subject_slot=slot,
                status="needs_selection" if paper is None else "not_started",
            )
            db.add(row)
            existing_slots[slot] = row
        elif row.status in {"needs_selection", "not_started"}:
            new_paper_id = paper.id if paper else None
            if row.paper_id != new_paper_id:
                row.paper_id = new_paper_id
                row.status = "needs_selection" if paper is None else "not_started"
    db.flush()
    db.refresh(participant)
    recompute_participant_status(participant, db)
    return {"participant_id": participant.id}


def apply_inquiry_subject_change(db: Session, program: models.SprintProgram) -> None:
    """탐구 선택과목이 바뀌면, 아직 제출 전인 회차의 inquiry_1/inquiry_2 슬롯만 재연결한다."""
    rounds = db.query(models.SprintMockExamRound).filter_by(sprint_program_id=program.id).all()
    for round_ in rounds:
        sync_participants(db, round_)


# ---------------------------------------------------------------------------
# 직렬화
# ---------------------------------------------------------------------------


def media_dict(media: models.SprintMockExamPaperMedia) -> dict:
    kind = "paper-file" if media.media_type == "paper_pdf" else "listening-audio"
    return {
        "id": media.id,
        "media_type": media.media_type,
        "original_filename": media.original_filename,
        "mime_type": media.mime_type,
        "file_size": media.file_size,
        "duration_seconds": media.duration_seconds,
        "student_url": f"/student/sprint/mock-exam-papers/{media.paper_id}/{kind}",
        "admin_url": f"/admin/mock-exam-papers/{media.paper_id}/{kind}",
    }


def question_dict(question: models.SprintMockExamPaperQuestion, reveal: bool) -> dict:
    payload = {"question_no": question.question_no, "score_points": question.score_points, "category": question.category, "is_scored": question.is_scored}
    if reveal:
        payload["correct_answer"] = question.correct_answer
        payload["memo"] = question.memo
    return payload


def grade_cut_dict(gc: models.SprintMockExamPaperGradeCut) -> dict:
    return {"grade": gc.grade, "minimum_score": gc.minimum_score}


def paper_dict(paper: models.SprintMockExamPaper, reveal: bool = False, include_media: bool = True) -> dict:
    payload = {
        "id": paper.id,
        "mock_exam_round_id": paper.mock_exam_round_id,
        "subject_group": paper.subject_group,
        "subject_code": paper.subject_code,
        "subject_label": SUBJECT_LABELS.get(paper.subject_code, paper.subject_code),
        "title": paper.title,
        "question_count": paper.question_count,
        "total_score": paper.total_score,
        "scoring_policy": paper.scoring_policy,
        "is_required": paper.is_required,
        "is_active": paper.is_active,
        "has_answer_key": len(paper.questions) > 0,
        "answer_key_total": sum(q.score_points for q in paper.questions if q.is_scored),
        "grade_cuts": [grade_cut_dict(gc) for gc in sorted(paper.grade_cuts, key=lambda x: x.grade)],
    }
    if include_media:
        payload["media"] = [media_dict(m) for m in paper.media]
    if reveal:
        payload["questions"] = [question_dict(q, True) for q in paper.questions]
    return payload


def participant_paper_dict(pp: models.SprintMockExamParticipantPaper, reveal: bool = False) -> dict:
    paper = pp.paper
    payload = {
        "id": pp.id,
        "participant_id": pp.participant_id,
        "paper_id": pp.paper_id,
        "subject_slot": pp.subject_slot,
        "slot_label": SLOT_LABELS.get(pp.subject_slot, pp.subject_slot),
        "subject_label": SUBJECT_LABELS.get(paper.subject_code, None) if paper else None,
        "status": pp.status,
        "submitted_at": pp.submitted_at,
        "raw_score": pp.raw_score,
        "max_score": pp.max_score,
        "correct_count": pp.correct_count,
        "wrong_count": len([r for r in pp.responses if r.selected_answer is not None and r.is_correct is False]),
        "unanswered_count": len([r for r in pp.responses if r.selected_answer is None]) if pp.responses else 0,
        "paper": paper_dict(paper, reveal=False, include_media=True) if paper else None,
    }
    if reveal and paper is not None:
        payload["grade_analysis"] = compute_grade_analysis(pp, paper)
        payload["responses"] = [
            {
                "question_no": r.question_no,
                "selected_answer": r.selected_answer,
                "correct_answer": next((q.correct_answer for q in paper.questions if q.question_no == r.question_no), None),
                "is_correct": r.is_correct,
                "score_points": next((q.score_points for q in paper.questions if q.question_no == r.question_no), None),
                "awarded_points": r.awarded_points,
                "category": next((q.category for q in paper.questions if q.question_no == r.question_no), None),
                "is_recommended_for_next_grade": bool(
                    payload["grade_analysis"]
                    and r.question_no in (payload["grade_analysis"].get("suggested_question_nos") or [])
                ),
            }
            for r in sorted(pp.responses, key=lambda x: x.question_no)
        ]
    return payload


def participant_dict(participant: models.SprintMockExamParticipant, reveal: bool = False) -> dict:
    return {
        "id": participant.id,
        "mock_exam_round_id": participant.mock_exam_round_id,
        "student_id": participant.student_id,
        "status": participant.status,
        "assigned_at": participant.assigned_at,
        "completed_at": participant.completed_at,
        "papers": [participant_paper_dict(pp, reveal=reveal) for pp in sorted(participant.papers, key=lambda x: REQUIRED_SLOTS.index(x.subject_slot) if x.subject_slot in REQUIRED_SLOTS else 99)],
    }


def round_dict(db: Session, round_: models.SprintMockExamRound, include_stats: bool = False) -> dict:
    sync_round_status(round_)
    payload = {
        "id": round_.id,
        "sprint_program_id": round_.sprint_program_id,
        "round_no": round_.round_no,
        "title": round_.title,
        "exam_date": round_.exam_date,
        "start_time": round_.start_time,
        "submission_deadline_at": round_.submission_deadline_at,
        "status": round_.status,
        "is_active": round_.is_active,
        "papers": [paper_dict(p) for p in round_.papers],
    }
    if include_stats:
        payload["stats"] = round_stats(round_)
    return payload


def round_stats(round_: models.SprintMockExamRound) -> dict:
    participants = list(round_.participants)
    total = len(participants)
    inquiry_unset = 0
    per_subject: dict[str, dict[str, int]] = {}
    not_started = pending = submitted = graded = completed = 0
    for participant in participants:
        if participant.status == "completed":
            completed += 1
        slot_by = {pp.subject_slot: pp for pp in participant.papers}
        if slot_by.get("inquiry_1", None) is None or slot_by["inquiry_1"].status == "needs_selection" or slot_by.get("inquiry_2") is None or slot_by["inquiry_2"].status == "needs_selection":
            inquiry_unset += 1
        for pp in participant.papers:
            code = pp.paper.subject_code if pp.paper else pp.subject_slot
            bucket = per_subject.setdefault(code, {"assigned": 0, "submitted": 0, "graded": 0})
            bucket["assigned"] += 1
            if pp.status == "submitted":
                bucket["submitted"] += 1
                submitted += 1
            elif pp.status in {"graded", "confirmed"}:
                bucket["graded"] += 1
                graded += 1
            elif pp.status in {"needs_selection", "not_started"}:
                not_started += 1
            elif pp.status == "draft":
                pending += 1
    return {
        "total_participants": total,
        "inquiry_unset_count": inquiry_unset,
        "not_attempted_count": not_started,
        "draft_count": pending,
        "submitted_count": submitted,
        "graded_count": graded,
        "completed_count": completed,
        "per_subject": per_subject,
    }


# ---------------------------------------------------------------------------
# 관리자: 회차
# ---------------------------------------------------------------------------


@router.post("/admin/sprints/{program_id}/mock-exam-rounds", status_code=201)
def admin_create_round(program_id: int, payload: RoundCreateIn, db: Session = Depends(get_db)):
    program = get_program_or_404(db, program_id)
    round_no = payload.round_no
    if round_no is None:
        last = db.query(models.SprintMockExamRound).filter_by(sprint_program_id=program_id).order_by(models.SprintMockExamRound.round_no.desc()).first()
        round_no = (last.round_no + 1) if last else 1
    if db.query(models.SprintMockExamRound).filter_by(sprint_program_id=program_id, round_no=round_no).first():
        raise HTTPException(status_code=400, detail=f"{round_no}회차가 이미 존재합니다.")
    deadline_at = compute_deadline_at(payload.exam_date, payload.submission_deadline_time)
    round_ = models.SprintMockExamRound(
        sprint_program_id=program.id,
        round_no=round_no,
        title=payload.title,
        exam_date=payload.exam_date,
        start_time=payload.start_time,
        submission_deadline_at=deadline_at,
        status="scheduled",
    )
    db.add(round_)
    db.flush()
    sync_participants(db, round_)
    db.commit()
    db.refresh(round_)
    return round_dict(db, round_, include_stats=True)


@router.get("/admin/sprints/{program_id}/mock-exam-rounds")
def admin_list_rounds(program_id: int, db: Session = Depends(get_db)):
    get_program_or_404(db, program_id)
    rounds = db.query(models.SprintMockExamRound).filter_by(sprint_program_id=program_id).order_by(models.SprintMockExamRound.round_no).all()
    return [round_dict(db, r, include_stats=True) for r in rounds]


@router.get("/admin/mock-exam-rounds/{round_id}")
def admin_get_round(round_id: int, db: Session = Depends(get_db)):
    round_ = get_round_or_404(db, round_id)
    payload = round_dict(db, round_, include_stats=True)
    payload["participants"] = [participant_dict(p, reveal=True) for p in round_.participants]
    return payload


@router.patch("/admin/mock-exam-rounds/{round_id}")
def admin_update_round(round_id: int, payload: RoundUpdateIn, db: Session = Depends(get_db)):
    round_ = get_round_or_404(db, round_id)
    values = payload.model_dump(exclude_unset=True)
    deadline_time = values.pop("submission_deadline_time", None)
    for key, value in values.items():
        setattr(round_, key, value)
    if deadline_time or "exam_date" in values:
        time_value = deadline_time or (round_.submission_deadline_at.astimezone(SEOUL_TZ).strftime("%H:%M"))
        round_.submission_deadline_at = compute_deadline_at(round_.exam_date, time_value)
    db.commit()
    db.refresh(round_)
    return round_dict(db, round_, include_stats=True)


@router.delete("/admin/mock-exam-rounds/{round_id}")
def admin_delete_round(round_id: int, db: Session = Depends(get_db)):
    round_ = get_round_or_404(db, round_id)
    locked = (
        db.query(models.SprintMockExamParticipantPaper)
        .join(models.SprintMockExamParticipant)
        .filter(
            models.SprintMockExamParticipant.mock_exam_round_id == round_id,
            models.SprintMockExamParticipantPaper.status.in_(LOCKED_PAPER_STATUSES),
        )
        .first()
    )
    if locked is not None:
        raise HTTPException(status_code=400, detail="이미 제출된 답안이 있는 회차는 삭제할 수 없습니다. 비활성화를 사용하세요.")
    storage_keys = [m.storage_key for paper in round_.papers for m in paper.media]
    db.delete(round_)
    db.commit()
    for key in storage_keys:
        delete_storage_file(key)
    return {"deleted": True}


@router.post("/admin/mock-exam-rounds/{round_id}/sync-participants")
def admin_sync_participants(round_id: int, db: Session = Depends(get_db)):
    round_ = get_round_or_404(db, round_id)
    result = sync_participants(db, round_)
    db.commit()
    db.refresh(round_)
    return round_dict(db, round_, include_stats=True) | {"sync_result": result}


@router.post("/admin/mock-exam-rounds/{round_id}/confirm-all")
def admin_confirm_all(round_id: int, db: Session = Depends(get_db)):
    round_ = get_round_or_404(db, round_id)
    rows = (
        db.query(models.SprintMockExamParticipantPaper)
        .join(models.SprintMockExamParticipant)
        .filter(models.SprintMockExamParticipant.mock_exam_round_id == round_id, models.SprintMockExamParticipantPaper.status == "graded")
        .all()
    )
    for row in rows:
        row.status = "confirmed"
    db.commit()
    db.refresh(round_)
    return round_dict(db, round_, include_stats=True) | {"confirmed_count": len(rows)}


# ---------------------------------------------------------------------------
# 관리자: 시험지(paper)
# ---------------------------------------------------------------------------


@router.post("/admin/mock-exam-rounds/{round_id}/papers", status_code=201)
def admin_create_paper(round_id: int, payload: PaperCreateIn, db: Session = Depends(get_db)):
    round_ = get_round_or_404(db, round_id)
    if db.query(models.SprintMockExamPaper).filter_by(mock_exam_round_id=round_id, subject_code=payload.subject_code).first():
        raise HTTPException(status_code=400, detail="이 회차에 이미 등록된 과목입니다.")
    paper = models.SprintMockExamPaper(
        mock_exam_round_id=round_id,
        subject_group=subject_group_for_code(payload.subject_code),
        subject_code=payload.subject_code,
        title=payload.title,
        question_count=payload.question_count,
        total_score=payload.total_score,
        scoring_policy=payload.scoring_policy,
        is_required=payload.is_required,
        order_index=len(round_.papers),
    )
    db.add(paper)
    db.flush()
    sync_participants(db, round_)
    db.commit()
    db.refresh(paper)
    return paper_dict(paper, reveal=True)


@router.get("/admin/mock-exam-papers/{paper_id}")
def admin_get_paper(paper_id: int, db: Session = Depends(get_db)):
    return paper_dict(get_paper_or_404(db, paper_id), reveal=True)


@router.patch("/admin/mock-exam-papers/{paper_id}")
def admin_update_paper(paper_id: int, payload: PaperUpdateIn, db: Session = Depends(get_db)):
    paper = get_paper_or_404(db, paper_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(paper, key, value)
    db.commit()
    db.refresh(paper)
    return paper_dict(paper, reveal=True)


@router.delete("/admin/mock-exam-papers/{paper_id}")
def admin_delete_paper(paper_id: int, db: Session = Depends(get_db)):
    paper = get_paper_or_404(db, paper_id)
    locked = db.query(models.SprintMockExamParticipantPaper).filter(
        models.SprintMockExamParticipantPaper.paper_id == paper_id,
        models.SprintMockExamParticipantPaper.status.in_(LOCKED_PAPER_STATUSES),
    ).first()
    if locked is not None:
        raise HTTPException(status_code=400, detail="이미 제출된 답안이 있는 시험지는 삭제할 수 없습니다. 비활성화를 사용하세요.")
    round_ = paper.round
    storage_keys = [m.storage_key for m in paper.media]
    # 아직 응시하지 않은 participant_paper의 연결만 해제한다 (participant 자체는 유지).
    for pp in list(paper.participant_papers):
        if pp.status in {"needs_selection", "not_started"}:
            pp.paper_id = None
            pp.status = "needs_selection"
    db.delete(paper)
    db.commit()
    for key in storage_keys:
        delete_storage_file(key)
    if round_ is not None:
        for participant in round_.participants:
            recompute_participant_status(participant, db)
        db.commit()
    return {"deleted": True}


@router.put("/admin/mock-exam-papers/{paper_id}/questions")
def admin_set_questions(paper_id: int, payload: QuestionSetIn, db: Session = Depends(get_db)):
    paper = get_paper_or_404(db, paper_id)
    if len(payload.questions) != paper.question_count:
        raise HTTPException(status_code=400, detail=f"정답 개수({len(payload.questions)})가 문항 수({paper.question_count})와 일치하지 않습니다.")
    question_nos = [item.question_no for item in payload.questions]
    if sorted(question_nos) != list(range(1, paper.question_count + 1)):
        raise HTTPException(status_code=400, detail="문제 번호가 1부터 문항 수까지 빠짐없이 있어야 합니다.")
    scored_total = sum(item.score_points for item in payload.questions if item.is_scored)
    if scored_total != paper.total_score:
        raise HTTPException(status_code=400, detail=f"채점 대상 문항 배점 합({scored_total})이 시험지 총점({paper.total_score})과 일치해야 합니다.")

    paper.questions = []
    db.flush()
    for item in payload.questions:
        db.add(models.SprintMockExamPaperQuestion(
            paper_id=paper_id,
            question_no=item.question_no,
            correct_answer=item.correct_answer,
            score_points=item.score_points,
            category=item.category,
            is_scored=item.is_scored,
            memo=item.memo,
        ))
    db.flush()
    db.refresh(paper)
    regrade_results = regrade_paper(db, paper)
    for pp in paper.participant_papers:
        recompute_participant_status(pp.participant, db)
    db.commit()
    db.refresh(paper)
    return paper_dict(paper, reveal=True) | {"regraded_count": len(regrade_results)}


@router.put("/admin/mock-exam-papers/{paper_id}/grade-cuts")
def admin_set_grade_cuts(paper_id: int, payload: GradeCutSetIn, db: Session = Depends(get_db)):
    paper = get_paper_or_404(db, paper_id)
    for item in payload.grade_cuts:
        if item.minimum_score > paper.total_score:
            raise HTTPException(status_code=400, detail=f"{item.grade}등급컷({item.minimum_score})이 시험지 총점({paper.total_score})을 초과할 수 없습니다.")
    paper.grade_cuts = []
    db.flush()
    for item in payload.grade_cuts:
        db.add(models.SprintMockExamPaperGradeCut(paper_id=paper_id, grade=item.grade, minimum_score=item.minimum_score))
    db.commit()
    db.refresh(paper)
    return paper_dict(paper, reveal=True)


@router.post("/admin/mock-exam-papers/{paper_id}/paper-file", status_code=201)
async def admin_upload_paper_file(paper_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    paper = get_paper_or_404(db, paper_id)
    round_ = paper.round
    storage_key = paper_storage_key(round_.sprint_program_id, round_.id, paper.id, "paper_pdf", "pdf")
    path = storage_file_path(storage_key)
    size, _header = await save_upload_streamed(file, MAX_PAPER_PDF_BYTES, path, detect_pdf_header)
    existing = next((m for m in paper.media if m.media_type == "paper_pdf"), None)
    old_key = existing.storage_key if existing else None
    if existing is not None:
        db.delete(existing)
        db.flush()
    media = models.SprintMockExamPaperMedia(
        paper_id=paper.id, media_type="paper_pdf", storage_key=storage_key,
        original_filename=os.path.basename(file.filename or ""), mime_type="application/pdf", file_size=size,
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


@router.delete("/admin/mock-exam-papers/{paper_id}/paper-file")
def admin_delete_paper_file(paper_id: int, db: Session = Depends(get_db)):
    paper = get_paper_or_404(db, paper_id)
    media = next((m for m in paper.media if m.media_type == "paper_pdf"), None)
    if media is None:
        raise HTTPException(status_code=404, detail="등록된 문제지 파일이 없습니다.")
    storage_key = media.storage_key
    db.delete(media)
    db.commit()
    delete_storage_file(storage_key)
    return {"deleted": True}


@router.get("/admin/mock-exam-papers/{paper_id}/paper-file")
def admin_get_paper_file(paper_id: int, db: Session = Depends(get_db)):
    paper = get_paper_or_404(db, paper_id)
    media = next((m for m in paper.media if m.media_type == "paper_pdf"), None)
    if media is None:
        raise HTTPException(status_code=404, detail="등록된 문제지 파일이 없습니다.")
    path = storage_file_path(media.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=media.mime_type, filename=media.original_filename or path.name)


@router.post("/admin/mock-exam-papers/{paper_id}/listening-audio", status_code=201)
async def admin_upload_listening_audio(paper_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    paper = get_paper_or_404(db, paper_id)
    if paper.subject_code != "english":
        raise HTTPException(status_code=400, detail="영어 시험지에만 영어듣기 파일을 등록할 수 있습니다.")
    round_ = paper.round
    storage_key = paper_storage_key(round_.sprint_program_id, round_.id, paper.id, "listening_audio", "mp3")
    path = storage_file_path(storage_key)
    size, first_chunk = await save_upload_streamed(file, MAX_LISTENING_AUDIO_BYTES, path, detect_mp3_header)
    duration = estimate_mp3_duration_seconds(first_chunk, size)
    existing = next((m for m in paper.media if m.media_type == "listening_audio"), None)
    old_key = existing.storage_key if existing else None
    if existing is not None:
        db.delete(existing)
        db.flush()
    media = models.SprintMockExamPaperMedia(
        paper_id=paper.id, media_type="listening_audio", storage_key=storage_key,
        original_filename=os.path.basename(file.filename or ""), mime_type="audio/mpeg", file_size=size,
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


@router.delete("/admin/mock-exam-papers/{paper_id}/listening-audio")
def admin_delete_listening_audio(paper_id: int, db: Session = Depends(get_db)):
    paper = get_paper_or_404(db, paper_id)
    media = next((m for m in paper.media if m.media_type == "listening_audio"), None)
    if media is None:
        raise HTTPException(status_code=404, detail="등록된 듣기 파일이 없습니다.")
    storage_key = media.storage_key
    db.delete(media)
    db.commit()
    delete_storage_file(storage_key)
    return {"deleted": True}


@router.get("/admin/mock-exam-papers/{paper_id}/listening-audio")
def admin_get_listening_audio(paper_id: int, db: Session = Depends(get_db)):
    paper = get_paper_or_404(db, paper_id)
    media = next((m for m in paper.media if m.media_type == "listening_audio"), None)
    if media is None:
        raise HTTPException(status_code=404, detail="등록된 듣기 파일이 없습니다.")
    path = storage_file_path(media.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=media.mime_type, filename=media.original_filename or path.name)


@router.get("/admin/mock-exam-rounds/{round_id}/participants")
def admin_list_participants(round_id: int, db: Session = Depends(get_db)):
    round_ = get_round_or_404(db, round_id)
    return [participant_dict(p, reveal=True) for p in round_.participants]


# ---------------------------------------------------------------------------
# 학생: 회차/과목 조회 + 다운로드
# ---------------------------------------------------------------------------


@router.get("/student/sprint/mock-exam-rounds")
def student_list_rounds(student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    participants = db.query(models.SprintMockExamParticipant).filter_by(student_id=student_id).all()
    rows = []
    for participant in participants:
        round_ = participant.round
        payload = round_dict(db, round_)
        payload["participant"] = participant_dict(participant)
        rows.append(payload)
    rows.sort(key=lambda r: r["exam_date"], reverse=True)
    return rows


@router.get("/student/sprint/mock-exam-rounds/{round_id}")
def student_get_round(round_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    round_ = get_round_or_404(db, round_id)
    participant = db.query(models.SprintMockExamParticipant).filter_by(mock_exam_round_id=round_id, student_id=student_id).first()
    if participant is None:
        raise HTTPException(status_code=403, detail="이 회차에 배정되지 않았습니다.")
    payload = round_dict(db, round_)
    payload["participant"] = participant_dict(participant)
    return payload


@router.get("/student/sprint/mock-exam-papers/{paper_id}")
def student_get_paper(paper_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    paper = get_paper_or_404(db, paper_id)
    ensure_student_paper_access(db, paper, student_id)
    return paper_dict(paper, reveal=False)


@router.get("/student/sprint/mock-exam-papers/{paper_id}/paper-file")
def student_get_paper_file(paper_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    paper = get_paper_or_404(db, paper_id)
    ensure_student_paper_access(db, paper, student_id)
    media = next((m for m in paper.media if m.media_type == "paper_pdf"), None)
    if media is None:
        raise HTTPException(status_code=404, detail="등록된 문제지 파일이 없습니다.")
    path = storage_file_path(media.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=media.mime_type, filename=media.original_filename or path.name)


@router.get("/student/sprint/mock-exam-papers/{paper_id}/listening-audio")
def student_get_listening_audio(paper_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    paper = get_paper_or_404(db, paper_id)
    ensure_student_paper_access(db, paper, student_id)
    media = next((m for m in paper.media if m.media_type == "listening_audio"), None)
    if media is None:
        raise HTTPException(status_code=404, detail="등록된 듣기 파일이 없습니다.")
    path = storage_file_path(media.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return FileResponse(path, media_type=media.mime_type, filename=media.original_filename or path.name)


# ---------------------------------------------------------------------------
# 학생: OMR / 제출 / 결과
# ---------------------------------------------------------------------------


@router.get("/student/sprint/mock-exam-participant-papers/{participant_paper_id}/omr")
def student_get_omr(participant_paper_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    pp = get_participant_paper_or_404(db, participant_paper_id)
    ensure_student_participant_paper_access(pp, student_id)
    if pp.paper_id is None:
        raise HTTPException(status_code=400, detail="탐구 선택과목을 먼저 설정해주세요.")
    if pp.status in LOCKED_PAPER_STATUSES:
        raise HTTPException(status_code=400, detail="이미 제출된 과목은 답안을 수정할 수 없습니다.")
    paper = pp.paper
    responses = {r.question_no: r.selected_answer for r in pp.responses}
    return {
        "participant_paper": participant_paper_dict(pp),
        "answers": [{"question_no": q, "selected_answer": responses.get(q)} for q in range(1, paper.question_count + 1)],
    }


@router.put("/student/sprint/mock-exam-participant-papers/{participant_paper_id}/omr")
def student_save_omr(participant_paper_id: int, payload: OmrSaveIn, db: Session = Depends(get_db)):
    get_student_or_404(db, payload.student_id)
    pp = get_participant_paper_or_404(db, participant_paper_id)
    ensure_student_participant_paper_access(pp, payload.student_id)
    if pp.paper_id is None:
        raise HTTPException(status_code=400, detail="탐구 선택과목을 먼저 설정해주세요.")
    if pp.status in LOCKED_PAPER_STATUSES:
        raise HTTPException(status_code=400, detail="이미 제출된 과목은 답안을 수정할 수 없습니다.")
    paper = pp.paper
    valid_question_nos = set(range(1, paper.question_count + 1))
    existing = {r.question_no: r for r in pp.responses}
    for item in payload.answers:
        if item.question_no not in valid_question_nos:
            raise HTTPException(status_code=400, detail=f"문항 번호 {item.question_no}는 이 시험지에 존재하지 않습니다.")
        response = existing.get(item.question_no)
        if response is None:
            response = models.SprintMockExamParticipantResponse(participant_paper_id=pp.id, question_no=item.question_no)
            db.add(response)
            existing[item.question_no] = response
        response.selected_answer = item.selected_answer
    pp.status = "draft"
    db.commit()
    recompute_participant_status(pp.participant, db)
    db.commit()
    answered = sum(1 for r in existing.values() if r.selected_answer is not None)
    return {"saved": True, "answered_count": answered, "question_count": paper.question_count}


@router.post("/student/sprint/mock-exam-participant-papers/{participant_paper_id}/submit")
def student_submit_paper(participant_paper_id: int, payload: SubmitIn, db: Session = Depends(get_db)):
    get_student_or_404(db, payload.student_id)
    pp = get_participant_paper_or_404(db, participant_paper_id)
    ensure_student_participant_paper_access(pp, payload.student_id)
    if pp.paper_id is None:
        raise HTTPException(status_code=400, detail="탐구 선택과목을 먼저 설정해주세요.")
    if pp.status in LOCKED_PAPER_STATUSES:
        raise HTTPException(status_code=400, detail="이미 제출된 과목입니다.")
    paper = pp.paper
    if not paper.questions:
        raise HTTPException(status_code=400, detail="정답이 아직 등록되지 않아 채점할 수 없습니다.")
    answered_nos = {r.question_no for r in pp.responses if r.selected_answer is not None}
    unanswered = [n for n in range(1, paper.question_count + 1) if n not in answered_nos]
    if unanswered and not payload.force:
        raise HTTPException(status_code=409, detail=f"미응답 문항이 {len(unanswered)}개 있습니다. 그대로 제출하려면 다시 확인해주세요.")
    pp.submitted_at = datetime.now(timezone.utc)
    grade_participant_paper(db, pp, paper)
    pp.status = "graded"
    db.commit()
    recompute_participant_status(pp.participant, db)
    db.commit()
    db.refresh(pp)
    return participant_paper_dict(pp, reveal=True)


@router.get("/student/sprint/mock-exam-participant-papers/{participant_paper_id}/result")
def student_get_result(participant_paper_id: int, student_id: int, db: Session = Depends(get_db)):
    get_student_or_404(db, student_id)
    pp = get_participant_paper_or_404(db, participant_paper_id)
    ensure_student_participant_paper_access(pp, student_id)
    if pp.status not in {"graded", "confirmed"}:
        raise HTTPException(status_code=400, detail="아직 채점되지 않은 과목입니다.")
    return participant_paper_dict(pp, reveal=True)


@router.patch("/student/sprint/inquiry-subjects")
def student_update_inquiry_subjects(payload: InquirySubjectsIn, db: Session = Depends(get_db)):
    student = get_student_or_404(db, payload.student_id)
    programs = db.query(models.SprintProgram).filter_by(student_id=student.id, is_active=True).all()
    if not programs:
        raise HTTPException(status_code=404, detail="활성화된 SPRINT가 없습니다.")

    # 슬롯(inquiry_1/2)별로 "이미 제출된 현재 과목"을 구하고, 그 슬롯의 값이 바뀌는지만 검사한다.
    # (새로 요청한 값이 우연히 다른 슬롯에서 이미 제출된 과목과 같은 코드인 경우를 막는 게 아니라,
    #  제출을 마친 슬롯 자체를 다른 과목으로 바꾸려는 시도를 막아야 한다.)
    for program in programs:
        locked_slot_codes: dict[str, str] = {}
        for row in (
            db.query(models.SprintMockExamParticipantPaper)
            .join(models.SprintMockExamParticipant)
            .join(models.SprintMockExamRound)
            .filter(
                models.SprintMockExamRound.sprint_program_id == program.id,
                models.SprintMockExamParticipantPaper.subject_slot.in_(["inquiry_1", "inquiry_2"]),
                models.SprintMockExamParticipantPaper.status.in_(LOCKED_PAPER_STATUSES),
            )
        ):
            if row.paper is not None:
                locked_slot_codes[row.subject_slot] = row.paper.subject_code

        for slot, new_value in (("inquiry_1", payload.inquiry_subject_1), ("inquiry_2", payload.inquiry_subject_2)):
            locked_code = locked_slot_codes.get(slot)
            if locked_code is not None and new_value != locked_code:
                raise HTTPException(status_code=400, detail=f"'{SUBJECT_LABELS.get(locked_code, locked_code)}'는 이미 제출된 과목이라 변경할 수 없습니다.")

    for program in programs:
        program.inquiry_subject_1 = payload.inquiry_subject_1
        program.inquiry_subject_2 = payload.inquiry_subject_2
        apply_inquiry_subject_change(db, program)
    db.commit()
    return {
        "inquiry_subject_1": payload.inquiry_subject_1,
        "inquiry_subject_2": payload.inquiry_subject_2,
    }


# ---------------------------------------------------------------------------
# 대시보드 요약 (sprint.py가 지연 import로 재사용)
# ---------------------------------------------------------------------------


def mock_round_home_summary(db: Session, program: models.SprintProgram, student_id: int) -> dict:
    today = now_seoul().date()
    participants = (
        db.query(models.SprintMockExamParticipant)
        .join(models.SprintMockExamRound)
        .filter(models.SprintMockExamRound.sprint_program_id == program.id, models.SprintMockExamParticipant.student_id == student_id)
        .all()
    )
    if not participants:
        return {"available": True, "status": "none", "round": None, "path": "/student/sprint/mock-exam-rounds"}
    upcoming = [p for p in participants if p.round.exam_date >= today and sync_round_status(p.round) != "closed"]
    if not upcoming:
        return {"available": True, "status": "none", "round": None, "path": "/student/sprint/mock-exam-rounds"}
    upcoming.sort(key=lambda p: p.round.exam_date)
    participant = upcoming[0]
    round_ = participant.round
    return {
        "available": True,
        "status": "scheduled" if round_.status == "scheduled" else "open",
        "round": {"id": round_.id, "round_no": round_.round_no, "title": round_.title, "exam_date": round_.exam_date, "status": round_.status},
        "days_remaining": (round_.exam_date - today).days,
        "participant_status": participant.status,
        "path": f"/student/sprint/mock-exam-rounds/{round_.id}",
    }
