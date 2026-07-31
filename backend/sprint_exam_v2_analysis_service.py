from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from statistics import mean
from typing import Any

from sqlalchemy.orm import Session, selectinload

import models


class SprintExamV2AnalysisNotFoundError(LookupError):
    pass


KILLER_MATH_QUESTION_NOS = {14, 15, 21, 22}

ENGLISH_PARTS = [
    (range(1, 18), "듣기"),
    (range(18, 21), "실용문"),
    (range(21, 22), "함축 의미"),
    (range(22, 25), "주제·제목·요지·주장"),
    (range(25, 29), "도표"),
    (range(29, 30), "어법"),
    (range(30, 31), "어휘"),
    (range(31, 35), "빈칸"),
    (range(35, 36), "무관한 문장"),
    (range(36, 38), "글의 순서"),
    (range(38, 40), "문장 삽입"),
    (range(40, 41), "요약문"),
    (range(41, 43), "어휘·제목 / 짧은 장문"),
    (range(43, 46), "이야기문 / 긴 장문"),
]

KOREAN_ELECTIVE_NAMES = {
    "korean_speech_writing": "화법과 작문",
    "korean_language_media": "언어와 매체",
}

MATH_ELECTIVE_NAMES = {
    "math_probability_statistics": "확률과 통계",
    "math_calculus": "미적분",
    "math_geometry": "기하",
}

SUBJECT_LABELS = {
    "korean": "국어",
    "math": "수학",
    "english": "영어",
    "inquiry": "탐구",
}


@dataclass
class WeakPart:
    subject_area: str
    subject_name: str
    part_code: str
    part_name: str
    analysis_mode: str = "weakness"
    wrong_question_numbers: set[int] = field(default_factory=set)
    wrong_count: int = 0
    recent_wrong_count: int = 0
    weighted_wrong_count: float = 0
    related_wrongs: list[dict[str, Any]] = field(default_factory=list)
    _question_attempts: dict[int, set[int]] = field(default_factory=dict)

    def add_wrong(
        self,
        *,
        question_no: int,
        attempt_id: int,
        weight: float,
        recent: bool,
        context: dict[str, Any],
    ) -> None:
        self.wrong_question_numbers.add(question_no)
        self.wrong_count += 1
        self.weighted_wrong_count += weight
        if recent:
            self.recent_wrong_count += 1
        self._question_attempts.setdefault(question_no, set()).add(attempt_id)
        self.related_wrongs.append(context)


def _attempt_query(db: Session):
    return db.query(models.SprintExamV2Attempt).options(
        selectinload(models.SprintExamV2Attempt.assignment).selectinload(models.SprintExamV2Assignment.student),
        selectinload(models.SprintExamV2Attempt.assignment)
        .selectinload(models.SprintExamV2Assignment.exam)
        .selectinload(models.SprintExamV2.papers)
        .selectinload(models.SprintExamV2Paper.questions),
        selectinload(models.SprintExamV2Attempt.assignment).selectinload(models.SprintExamV2Assignment.papers),
        selectinload(models.SprintExamV2Attempt.responses),
        selectinload(models.SprintExamV2Attempt.scores).selectinload(models.SprintExamV2Score.score_group),
        selectinload(models.SprintExamV2Attempt.result_publication),
    )


def _load_attempts(db: Session, student_id: int, *, include_unpublished: bool, limit: int) -> list[models.SprintExamV2Attempt]:
    query = (
        _attempt_query(db)
        .join(models.SprintExamV2Attempt.assignment)
        .join(models.SprintExamV2Assignment.exam)
        .filter(
            models.SprintExamV2Assignment.student_id == student_id,
            models.SprintExamV2Attempt.status == "scored",
            models.SprintExamV2Attempt.is_latest_submitted.is_(True),
        )
    )
    if not include_unpublished:
        query = query.join(models.SprintExamV2Attempt.result_publication).filter(
            models.SprintExamV2ResultPublication.status == "published"
        )
    attempts = (
        query.order_by(
            models.SprintExamV2.exam_date.desc().nullslast(),
            models.SprintExamV2Attempt.submitted_at.desc().nullslast(),
            models.SprintExamV2Attempt.id.desc(),
        )
        .limit(limit)
        .all()
    )
    return list(reversed(attempts))


def _student_payload(student: models.Student | None, student_id: int) -> dict[str, Any]:
    if student is None:
        return {"id": student_id, "name": None, "grade": None}
    return {"id": student.id, "name": student.name, "grade": student.grade}


def _score_payload(score: models.SprintExamV2Score, stats: dict[str, int] | None = None) -> dict[str, Any]:
    group = score.score_group
    stats = stats or {}
    return {
        "score_group_id": score.score_group_id,
        "score_group_code": group.score_group_code if group else None,
        "score_group_name": group.score_group_name if group else None,
        "subject_area": group.subject_area if group else None,
        "raw_score": score.raw_score,
        "max_score": score.max_score,
        "grade": score.grade,
        "correct_count": score.correct_count,
        "incorrect_count": stats.get("incorrect_count"),
        "blank_count": score.blank_count,
        "total_question_count": stats.get("total_question_count"),
    }


def _assigned_paper_by_id(attempt: models.SprintExamV2Attempt) -> dict[int, models.SprintExamV2AssignmentPaper]:
    return {paper.paper_id: paper for paper in attempt.assignment.papers or []}


def _question_stats_by_group(attempt: models.SprintExamV2Attempt) -> dict[int, dict[str, int]]:
    assignment_papers = _assigned_paper_by_id(attempt)
    responses = {response.question_id: response for response in attempt.responses or []}
    stats: dict[int, dict[str, int]] = {}
    for paper in attempt.assignment.exam.papers or []:
        assignment_paper = assignment_papers.get(paper.id)
        if assignment_paper is None:
            continue
        group_stats = stats.setdefault(
            assignment_paper.score_group_id,
            {"total_question_count": 0, "correct_count": 0, "incorrect_count": 0, "blank_count": 0},
        )
        for question in paper.questions or []:
            response = responses.get(question.id)
            group_stats["total_question_count"] += 1
            if response is None or not response.answer_values:
                group_stats["blank_count"] += 1
            elif response.is_correct is True:
                group_stats["correct_count"] += 1
            else:
                group_stats["incorrect_count"] += 1
    return stats


def _attempt_payload(attempt: models.SprintExamV2Attempt) -> dict[str, Any]:
    scores = sorted(attempt.scores or [], key=lambda item: (item.score_group.score_group_code if item.score_group else "", item.id or 0))
    stats_by_group = _question_stats_by_group(attempt)
    total_score = sum(score.raw_score for score in scores)
    total_max_score = sum(score.max_score for score in scores)
    return {
        "attempt_id": attempt.id,
        "assignment_id": attempt.assignment_id,
        "exam_id": attempt.assignment.exam.id,
        "exam_title": attempt.assignment.exam.title,
        "exam_date": attempt.assignment.exam.exam_date.isoformat() if attempt.assignment.exam.exam_date else None,
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "scored_at": attempt.scored_at.isoformat() if attempt.scored_at else None,
        "total_score": total_score,
        "total_max_score": total_max_score,
        "scores": [_score_payload(score, stats_by_group.get(score.score_group_id)) for score in scores],
    }


def _change(current: int | None, previous: int | None) -> int | None:
    if current is None or previous is None:
        return None
    return current - previous


def _grade_change(current: int | None, previous: int | None) -> int | None:
    if current is None or previous is None:
        return None
    return previous - current


def _overall_summary(attempts: list[models.SprintExamV2Attempt]) -> dict[str, Any]:
    total_scores = [sum(score.raw_score for score in attempt.scores or []) for attempt in attempts]
    latest = total_scores[-1] if total_scores else None
    previous = total_scores[-2] if len(total_scores) >= 2 else None
    return {
        "latest_total_score": latest,
        "previous_total_score": previous,
        "total_score_change": _change(latest, previous),
        "highest_total_score": max(total_scores) if total_scores else None,
        "average_total_score": round(mean(total_scores), 1) if total_scores else None,
        "attempt_count": len(attempts),
    }


def _group_trends(attempts: list[models.SprintExamV2Attempt]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    labels: dict[str, dict[str, Any]] = {}
    for attempt in attempts:
        for score in attempt.scores or []:
            group = score.score_group
            code = group.score_group_code if group else str(score.score_group_id)
            labels[code] = {
                "score_group_id": score.score_group_id,
                "score_group_code": code,
                "score_group_name": group.score_group_name if group else None,
                "subject_area": group.subject_area if group else None,
            }
            grouped.setdefault(code, []).append(
                {
                    "attempt_id": attempt.id,
                    "exam_title": attempt.assignment.exam.title,
                    "exam_date": attempt.assignment.exam.exam_date.isoformat() if attempt.assignment.exam.exam_date else None,
                    "raw_score": score.raw_score,
                    "max_score": score.max_score,
                    "grade": score.grade,
                }
            )
    trends: list[dict[str, Any]] = []
    for code, history in grouped.items():
        enriched_history = []
        for index, item in enumerate(history):
            previous = history[index - 1] if index > 0 else None
            enriched_history.append(
                {
                    **item,
                    "score_change": _change(item["raw_score"], previous["raw_score"] if previous else None),
                    "grade_change": _grade_change(item["grade"], previous["grade"] if previous else None),
                    "previous_grade": previous["grade"] if previous else None,
                }
            )
        latest = enriched_history[-1]
        previous = enriched_history[-2] if len(enriched_history) >= 2 else None
        scores = [item["raw_score"] for item in enriched_history]
        trends.append(
            {
                **labels[code],
                "history": enriched_history,
                "latest_score": latest["raw_score"],
                "previous_score": previous["raw_score"] if previous else None,
                "score_change": latest["score_change"],
                "latest_grade": latest["grade"],
                "previous_grade": previous["grade"] if previous else None,
                "grade_change": latest["grade_change"],
                "highest_score": max(scores),
                "average_score": round(mean(scores), 1),
            }
        )
    return sorted(trends, key=lambda item: (item.get("subject_area") or "", item.get("score_group_code") or ""))


def _paper_for_question(attempt: models.SprintExamV2Attempt, question: models.SprintExamV2Question) -> models.SprintExamV2AssignmentPaper | None:
    return _assigned_paper_by_id(attempt).get(question.paper_id)


def _english_part(question_no: int) -> tuple[str, str]:
    for number_range, label in ENGLISH_PARTS:
        if question_no in number_range:
            return (f"english_{label}", label)
    return ("english_other", "기타")


def _compact_text(value: str | None) -> str:
    return "".join(str(value or "").split())


def _korean_elective_name(paper: models.SprintExamV2AssignmentPaper) -> tuple[str, str] | None:
    code = paper.subject_code_snapshot or ""
    if code in KOREAN_ELECTIVE_NAMES:
        return code, KOREAN_ELECTIVE_NAMES[code]
    compact_name = _compact_text(paper.subject_name_snapshot)
    if compact_name == "화법과작문":
        return "korean_speech_writing", "화법과 작문"
    if compact_name == "언어와매체":
        return "korean_language_media", "언어와 매체"
    return None


def _korean_elective_from_assignment(assignment: models.SprintExamV2Assignment | None) -> tuple[str, str] | None:
    if assignment is None:
        return None
    compact_name = _compact_text(assignment.korean_elective_snapshot)
    if compact_name == "화법과작문":
        return "korean_speech_writing", "화법과 작문"
    if compact_name == "언어와매체":
        return "korean_language_media", "언어와 매체"
    code = assignment.korean_elective_snapshot or ""
    if code in KOREAN_ELECTIVE_NAMES:
        return code, KOREAN_ELECTIVE_NAMES[code]
    return None


def _math_elective_name(paper: models.SprintExamV2AssignmentPaper) -> tuple[str, str] | None:
    code = paper.subject_code_snapshot or ""
    if code in MATH_ELECTIVE_NAMES:
        return code, MATH_ELECTIVE_NAMES[code]
    compact_name = _compact_text(paper.subject_name_snapshot)
    if compact_name == "확률과통계":
        return "math_probability_statistics", "확률과 통계"
    if compact_name == "미적분":
        return "math_calculus", "미적분"
    if compact_name == "기하":
        return "math_geometry", "기하"
    return None


def _korean_part(
    paper: models.SprintExamV2AssignmentPaper,
    question_no: int,
    assignment: models.SprintExamV2Assignment | None = None,
) -> tuple[str, str]:
    elective = _korean_elective_name(paper)
    if elective is not None:
        return elective
    if question_no >= 31:
        assignment_elective = _korean_elective_from_assignment(assignment)
        if assignment_elective is not None:
            return assignment_elective
    if paper.paper_role_snapshot == "elective":
        name = KOREAN_ELECTIVE_NAMES.get(paper.subject_code_snapshot, paper.subject_name_snapshot)
        return (paper.subject_code_snapshot, name)
    if 1 <= question_no <= 18:
        return ("korean_literature", "문학")
    if 19 <= question_no <= 30:
        return ("korean_reading", "독서")
    return ("korean_common_other", "국어 공통")


def _math_part(paper: models.SprintExamV2AssignmentPaper, question_no: int) -> tuple[str, str, str]:
    if question_no in KILLER_MATH_QUESTION_NOS:
        return ("math_killer", "고난도 문항", "high_difficulty")
    elective = _math_elective_name(paper)
    if elective is not None:
        return (elective[0], elective[1], "weakness")
    if paper.paper_role_snapshot == "elective":
        name = MATH_ELECTIVE_NAMES.get(paper.subject_code_snapshot, paper.subject_name_snapshot)
        return (paper.subject_code_snapshot, name, "weakness")
    return ("math_common_repeated", "공통 반복 오답", "weakness")


def _subject_area_from_paper(paper: models.SprintExamV2AssignmentPaper) -> str:
    code = paper.score_group_code_snapshot or paper.subject_code_snapshot
    if code.startswith("korean"):
        return "korean"
    if code.startswith("math"):
        return "math"
    if code.startswith("english"):
        return "english"
    return "inquiry" if paper.paper_role_snapshot == "inquiry_slot" else "other"


def _weak_part_key(
    paper: models.SprintExamV2AssignmentPaper,
    question_no: int,
    assignment: models.SprintExamV2Assignment | None = None,
) -> tuple[str, str, str, str, str] | None:
    subject_area = _subject_area_from_paper(paper)
    subject_name = SUBJECT_LABELS.get(subject_area, paper.score_group_name_snapshot)
    if subject_area == "inquiry":
        return None
    if subject_area == "korean":
        part_code, part_name = _korean_part(paper, question_no, assignment)
        return (subject_area, subject_name, part_code, part_name, "weakness")
    if subject_area == "math":
        part_code, part_name, mode = _math_part(paper, question_no)
        return (subject_area, subject_name, part_code, part_name, mode)
    if subject_area == "english":
        part_code, part_name = _english_part(question_no)
        return (subject_area, subject_name, part_code, part_name, "weakness")
    return None


def _wrong_items_by_attempt(attempt: models.SprintExamV2Attempt) -> list[tuple[models.SprintExamV2Question, models.SprintExamV2Response | None]]:
    responses = {response.question_id: response for response in attempt.responses or []}
    assigned_paper_ids = {paper.paper_id for paper in attempt.assignment.papers or []}
    questions = [
        question
        for paper in attempt.assignment.exam.papers or []
        for question in paper.questions or []
        if question.paper_id in assigned_paper_ids
    ]
    wrong_items: list[tuple[models.SprintExamV2Question, models.SprintExamV2Response | None]] = []
    for question in questions:
        response = responses.get(question.id)
        if response is None or response.is_correct is not True:
            wrong_items.append((question, response))
    return wrong_items


def _weakness_analysis(attempts: list[models.SprintExamV2Attempt]) -> dict[str, Any]:
    parts: dict[tuple[str, str], WeakPart] = {}
    high_difficulty: dict[tuple[str, str], WeakPart] = {}
    total = len(attempts)
    for index, attempt in enumerate(attempts):
        weight = float(index + 1)
        recent = index == total - 1
        for question, response in _wrong_items_by_attempt(attempt):
            paper = _paper_for_question(attempt, question)
            if paper is None:
                continue
            key = _weak_part_key(paper, question.question_no, attempt.assignment)
            if key is None:
                continue
            subject_area, subject_name, part_code, part_name, mode = key
            bucket = high_difficulty if mode == "high_difficulty" else parts
            part_key = (subject_area, part_code)
            part = bucket.setdefault(
                part_key,
                WeakPart(
                    subject_area=subject_area,
                    subject_name=subject_name,
                    part_code=part_code,
                    part_name=part_name,
                    analysis_mode=mode,
                ),
            )
            part.add_wrong(
                question_no=question.question_no,
                attempt_id=attempt.id,
                weight=weight,
                recent=recent,
                context={
                    "attempt_id": attempt.id,
                    "exam_title": attempt.assignment.exam.title,
                    "exam_date": attempt.assignment.exam.exam_date.isoformat() if attempt.assignment.exam.exam_date else None,
                    "subject_code": paper.subject_code_snapshot,
                    "subject_name": paper.subject_name_snapshot,
                    "question_no": question.question_no,
                    "submitted_answer": response.answer_values if response is not None and response.answer_values else [],
                },
            )
    return {
        "priority_items": _rank_parts(parts.values()),
        "high_difficulty_items": _rank_parts(high_difficulty.values(), ranked=False),
    }


def _rank_parts(parts: Any, *, ranked: bool = True) -> list[dict[str, Any]]:
    serialized = []
    for part in parts:
        question_wrong_counts = [
            {"question_no": question_no, "wrong_count": len(attempt_ids)}
            for question_no, attempt_ids in sorted(part._question_attempts.items())
        ]
        repeated_question_count = sum(1 for item in question_wrong_counts if item["wrong_count"] >= 2)
        history_map: dict[tuple[str, str | None, int], set[int]] = {}
        for wrong in part.related_wrongs:
            history_key = (wrong["exam_title"], wrong["exam_date"], wrong["attempt_id"])
            history_map.setdefault(history_key, set()).add(wrong["question_no"])
        wrong_history_by_exam = [
            {
                "exam_title": title,
                "exam_date": exam_date,
                "attempt_id": attempt_id,
                "question_numbers": sorted(numbers),
            }
            for (title, exam_date, attempt_id), numbers in history_map.items()
        ]
        wrong_history_by_exam.sort(key=lambda item: (item["exam_date"] or "", item["attempt_id"]), reverse=True)
        priority_score = part.weighted_wrong_count + repeated_question_count * 1.5 + part.recent_wrong_count
        serialized.append(
            {
                "rank": None,
                "subject_area": part.subject_area,
                "subject_name": part.subject_name,
                "part_code": part.part_code,
                "part_name": part.part_name,
                "status_label": "보완 필요",
                "analysis_mode": part.analysis_mode,
                "wrong_question_numbers": sorted(part.wrong_question_numbers),
                "question_wrong_counts": question_wrong_counts,
                "wrong_history_by_exam": wrong_history_by_exam,
                "wrong_count": part.wrong_count,
                "recent_wrong_count": part.recent_wrong_count,
                "repeated_question_count": repeated_question_count,
                "priority_score": round(priority_score, 2),
                "related_wrongs": sorted(
                    part.related_wrongs,
                    key=lambda item: (item["exam_date"] or "", item["attempt_id"], item["question_no"]),
                ),
            }
        )
    serialized.sort(
        key=lambda item: (
            -item["priority_score"],
            -item["wrong_count"],
            item["subject_area"],
            item["part_name"],
        )
    )
    if ranked:
        for index, item in enumerate(serialized, start=1):
            item["rank"] = index
    return serialized


def get_student_analysis(
    db: Session,
    student_id: int,
    *,
    include_unpublished: bool = False,
    limit: int = 5,
) -> dict[str, Any]:
    limit = min(max(int(limit or 5), 1), 20)
    attempts = _load_attempts(db, student_id, include_unpublished=include_unpublished, limit=limit)
    student = attempts[-1].assignment.student if attempts else db.query(models.Student).filter(models.Student.id == student_id).first()
    if student is None:
        raise SprintExamV2AnalysisNotFoundError("Student not found.")
    return {
        "student": _student_payload(student, student_id),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "analysis_source": {
            "attempt_count": len(attempts),
            "limit": limit,
            "include_unpublished": include_unpublished,
        },
        "summary": _overall_summary(attempts),
        "score_group_trends": _group_trends(attempts),
        "weak_part_analysis": _weakness_analysis(attempts),
        "attempts": [_attempt_payload(attempt) for attempt in attempts],
    }
