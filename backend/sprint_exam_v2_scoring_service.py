from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, load_only, selectinload

import models
from sprint_exam_v2_scoring_validation import (
    SprintExamV2ScoringDomainError,
    calculate_grade,
    compare_answer_values,
    normalize_answer_values,
)


class SprintExamV2ScoringNotFoundError(LookupError):
    pass


class SprintExamV2ScoringConflictError(RuntimeError):
    def __init__(self, code: str, message: str, **context: Any):
        super().__init__(message)
        self.code = code
        self.message = message
        self.context = context

    def detail(self) -> dict[str, Any]:
        detail: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.context:
            detail["context"] = self.context
        return detail


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _attempt_query(db: Session):
    return db.query(models.SprintExamV2Attempt).options(
        selectinload(models.SprintExamV2Attempt.assignment).selectinload(models.SprintExamV2Assignment.exam),
        selectinload(models.SprintExamV2Attempt.assignment).selectinload(models.SprintExamV2Assignment.student),
        selectinload(models.SprintExamV2Attempt.assignment).selectinload(models.SprintExamV2Assignment.papers),
        selectinload(models.SprintExamV2Attempt.responses),
        selectinload(models.SprintExamV2Attempt.scores)
        .selectinload(models.SprintExamV2Score.score_group)
        .selectinload(models.SprintExamV2ScoreGroup.grade_cuts),
        selectinload(models.SprintExamV2Attempt.score_logs),
        selectinload(models.SprintExamV2Attempt.result_publication),
    )


def _load_attempt(db: Session, attempt_id: int, *, lock: bool = False) -> models.SprintExamV2Attempt:
    query = _attempt_query(db).filter(models.SprintExamV2Attempt.id == attempt_id)
    if lock:
        query = query.with_for_update()
    attempt = query.first()
    if attempt is None:
        raise SprintExamV2ScoringNotFoundError("Sprint Exam V2 attempt not found.")
    return attempt


def _load_student_attempt(db: Session, attempt_id: int, student_id: int) -> models.SprintExamV2Attempt:
    attempt = (
        _attempt_query(db)
        .join(models.SprintExamV2Attempt.assignment)
        .filter(
            models.SprintExamV2Attempt.id == attempt_id,
            models.SprintExamV2Assignment.student_id == student_id,
        )
        .first()
    )
    if attempt is None:
        raise SprintExamV2ScoringNotFoundError("Sprint Exam V2 attempt not found.")
    return attempt


def _assigned_papers(assignment: models.SprintExamV2Assignment) -> list[models.SprintExamV2AssignmentPaper]:
    return sorted(
        assignment.papers or [],
        key=lambda item: (
            item.display_order_snapshot or 0,
            item.score_group_code_snapshot or "",
            item.id or 0,
        ),
    )


def _assigned_questions(db: Session, assignment: models.SprintExamV2Assignment) -> list[models.SprintExamV2Question]:
    paper_ids = [paper.paper_id for paper in _assigned_papers(assignment)]
    if not paper_ids:
        return []
    return (
        db.query(models.SprintExamV2Question)
        .options(
            load_only(
                models.SprintExamV2Question.id,
                models.SprintExamV2Question.paper_id,
                models.SprintExamV2Question.question_no,
                models.SprintExamV2Question.answer_type,
                models.SprintExamV2Question.correct_answers,
                models.SprintExamV2Question.points,
                models.SprintExamV2Question.question_metadata,
            )
        )
        .filter(models.SprintExamV2Question.paper_id.in_(paper_ids))
        .all()
    )


def _score_groups(db: Session, assignment: models.SprintExamV2Assignment) -> dict[int, models.SprintExamV2ScoreGroup]:
    group_ids = {paper.score_group_id for paper in _assigned_papers(assignment)}
    if not group_ids:
        return {}
    groups = (
        db.query(models.SprintExamV2ScoreGroup)
        .options(selectinload(models.SprintExamV2ScoreGroup.grade_cuts))
        .filter(models.SprintExamV2ScoreGroup.id.in_(group_ids))
        .all()
    )
    return {group.id: group for group in groups}


def _validate_scorable_attempt(attempt: models.SprintExamV2Attempt, *, rescore: bool) -> None:
    if attempt.status == "voided":
        raise SprintExamV2ScoringConflictError("ATTEMPT_VOIDED", "Voided attempts cannot be scored.")
    if rescore:
        if attempt.status != "scored":
            raise SprintExamV2ScoringConflictError("ATTEMPT_NOT_SCORED", "Only scored attempts can be rescored.")
        return
    if attempt.status == "started":
        raise SprintExamV2ScoringConflictError("ATTEMPT_NOT_SUBMITTED", "Only submitted attempts can be scored.")
    if attempt.status == "scored":
        raise SprintExamV2ScoringConflictError("ATTEMPT_ALREADY_SCORED", "This attempt is already scored.")
    if attempt.status != "submitted":
        raise SprintExamV2ScoringConflictError("ATTEMPT_NOT_SCORABLE", "This attempt cannot be scored.")


def _build_scoring_plan(db: Session, attempt: models.SprintExamV2Attempt) -> dict[str, Any]:
    assignment = attempt.assignment
    assignment_papers = _assigned_papers(assignment)
    if not assignment_papers:
        raise SprintExamV2ScoringConflictError("INVALID_SCORE_GROUP_CONFIGURATION", "This assignment has no selected papers.")
    assignment_paper_by_paper_id = {paper.paper_id: paper for paper in assignment_papers}
    questions = sorted(_assigned_questions(db, assignment), key=lambda item: (item.paper_id, item.question_no, item.id or 0))
    if not questions:
        raise SprintExamV2ScoringConflictError("INVALID_SCORING_CONFIGURATION", "This assignment has no questions.")
    groups_by_id = _score_groups(db, assignment)
    responses_by_question_id = {response.question_id: response for response in attempt.responses}
    return {
        "assignment_papers": assignment_papers,
        "assignment_paper_by_paper_id": assignment_paper_by_paper_id,
        "questions": questions,
        "groups_by_id": groups_by_id,
        "responses_by_question_id": responses_by_question_id,
    }


def _score_questions(attempt: models.SprintExamV2Attempt, plan: dict[str, Any], *, now: datetime) -> dict[str, Any]:
    group_stats: dict[int, dict[str, Any]] = {}
    question_results: list[dict[str, Any]] = []
    correct_count = 0
    incorrect_count = 0
    answered_count = 0
    unanswered_count = 0
    raw_score_total = 0
    max_score_total = 0

    for question in plan["questions"]:
        assignment_paper = plan["assignment_paper_by_paper_id"].get(question.paper_id)
        if assignment_paper is None:
            continue
        group_id = assignment_paper.score_group_id
        stats = group_stats.setdefault(
            group_id,
            {
                "score_group_id": group_id,
                "question_count": 0,
                "answered_count": 0,
                "correct_count": 0,
                "incorrect_count": 0,
                "unanswered_count": 0,
                "raw_score": 0,
                "max_score": 0,
            },
        )
        response = plan["responses_by_question_id"].get(question.id)
        submitted_values = response.answer_values if response is not None else []
        normalized_submitted = normalize_answer_values(question.answer_type, submitted_values)
        normalized_correct = normalize_answer_values(question.answer_type, question.correct_answers)
        answered = bool(normalized_submitted)
        is_correct = compare_answer_values(question.answer_type, normalized_submitted, normalized_correct) if answered else False
        awarded_points = question.points if is_correct else 0

        stats["question_count"] += 1
        stats["max_score"] += question.points
        stats["raw_score"] += awarded_points
        max_score_total += question.points
        raw_score_total += awarded_points
        if answered:
            stats["answered_count"] += 1
            answered_count += 1
        else:
            stats["unanswered_count"] += 1
            unanswered_count += 1
        if is_correct:
            stats["correct_count"] += 1
            correct_count += 1
        elif answered:
            stats["incorrect_count"] += 1
            incorrect_count += 1

        if response is not None:
            response.answer_values = normalized_submitted
            response.answer_value = normalized_submitted[0] if len(normalized_submitted) == 1 else ",".join(normalized_submitted)
            response.is_blank = not answered
            response.is_correct = is_correct
            response.awarded_points = awarded_points
            response.graded_at = now

        question_results.append(
            {
                "question_id": question.id,
                "question_no": question.question_no,
                "paper_id": question.paper_id,
                "score_group_id": group_id,
                "submitted_answer": normalized_submitted,
                "correct_answers": normalized_correct,
                "is_correct": is_correct,
                "awarded_points": awarded_points,
                "max_points": question.points,
                "answered": answered,
            }
        )

    return {
        "group_stats": group_stats,
        "question_results": question_results,
        "summary": {
            "total_question_count": len(question_results),
            "answered_count": answered_count,
            "correct_count": correct_count,
            "incorrect_count": incorrect_count,
            "unanswered_count": unanswered_count,
            "raw_score": raw_score_total,
            "max_score": max_score_total,
        },
    }


def _score_snapshot(score: models.SprintExamV2Score | None) -> dict[str, Any] | None:
    if score is None:
        return None
    return {
        "score_group_id": score.score_group_id,
        "raw_score": score.raw_score,
        "max_score": score.max_score,
        "correct_count": score.correct_count,
        "blank_count": score.blank_count,
        "grade": score.grade,
        "scoring_version": score.scoring_version,
    }


def _solution_viewer_payload(group: models.SprintExamV2ScoreGroup | None) -> dict[str, Any]:
    available = bool(group and group.solution_drive_file_id and group.solution_is_published)
    return {
        "solution_available": available,
        "solution_viewer_url": (
            f"https://drive.google.com/file/d/{group.solution_drive_file_id}/preview" if available else None
        ),
    }


def _serialize_score(score: models.SprintExamV2Score, group: models.SprintExamV2ScoreGroup | None = None) -> dict[str, Any]:
    group = group or score.score_group
    payload = {
        "score_group_id": score.score_group_id,
        "score_group_code": group.score_group_code if group else None,
        "score_group_name": group.score_group_name if group else None,
        "raw_score": score.raw_score,
        "max_score": score.max_score,
        "grade": score.grade,
        "scoring_version": score.scoring_version,
        "correct_count": score.correct_count,
        "blank_count": score.blank_count,
    }
    payload.update(_solution_viewer_payload(group))
    if group is not None:
        payload["grade_boundaries"] = _grade_boundaries(group)
        payload.update(_next_grade_payload(score, group, []))
    return payload


def _grade_boundaries(group: models.SprintExamV2ScoreGroup) -> list[dict[str, int | str]]:
    return [
        {"grade": cut.grade, "score": cut.min_score, "type": cut.cut_type}
        for cut in sorted(group.grade_cuts or [], key=lambda item: (item.grade, -item.min_score))
    ]


def _recommend_question_combination(points_needed: int, candidate_points: list[int]) -> dict[str, Any]:
    if points_needed <= 0:
        return {
            "recommended_question_combination": [],
            "recommended_total_score": 0,
            "recommended_question_count": 0,
        }
    candidates = sorted([point for point in candidate_points if point > 0], reverse=True)
    if not candidates:
        return {
            "recommended_question_combination": [],
            "recommended_total_score": None,
            "recommended_question_count": None,
        }

    best: tuple[int, ...] | None = None
    best_key: tuple[int, int, tuple[int, ...]] | None = None

    # Keep only the strongest combination for each (question count, subtotal).
    # Reached states are not expanded because adding another question can never
    # improve the primary minimum-question-count priority.
    states: dict[tuple[int, int], tuple[int, ...]] = {(0, 0): ()}
    for point in candidates:
        next_states = dict(states)
        for (count, total), selected in states.items():
            next_count = count + 1
            if best_key is not None and next_count > best_key[0]:
                continue
            next_total = total + point
            combination = tuple(sorted((*selected, point), reverse=True))
            if next_total >= points_needed:
                key = (
                    next_count,
                    next_total - points_needed,
                    tuple(-value for value in combination),
                )
                if best_key is None or key < best_key:
                    best_key = key
                    best = combination
                continue
            if best_key is not None and next_count >= best_key[0]:
                continue
            state_key = (next_count, next_total)
            previous = next_states.get(state_key)
            if previous is None or combination > previous:
                next_states[state_key] = combination
        states = next_states

    if not best:
        return {
            "recommended_question_combination": [],
            "recommended_total_score": None,
            "recommended_question_count": None,
        }
    counts: dict[int, int] = {}
    for point in best:
        counts[point] = counts.get(point, 0) + 1
    combination = [{"score": score, "count": count} for score, count in sorted(counts.items(), reverse=True)]
    return {
        "recommended_question_combination": combination,
        "recommended_total_score": sum(best),
        "recommended_question_count": len(best),
    }


def _next_grade_payload(
    score: models.SprintExamV2Score,
    group: models.SprintExamV2ScoreGroup,
    candidate_points: list[int],
) -> dict[str, Any]:
    cuts = [
        cut
        for cut in sorted(group.grade_cuts or [], key=lambda item: item.grade)
        if cut.cut_type in {"raw_score_min", "absolute_band"}
    ]
    if not cuts:
        return {
            "next_grade": None,
            "points_to_next_grade": None,
            "recommended_question_combination": [],
            "recommended_total_score": None,
            "recommended_question_count": None,
        }
    if score.grade == 1:
        return {
            "next_grade": None,
            "points_to_next_grade": 0,
            "recommended_question_combination": [],
            "recommended_total_score": 0,
            "recommended_question_count": 0,
        }
    target_grade = (score.grade - 1) if score.grade else max(cut.grade for cut in cuts)
    target_cut = next((cut for cut in cuts if cut.grade == target_grade), None)
    if target_cut is None:
        return {
            "next_grade": None,
            "points_to_next_grade": None,
            "recommended_question_combination": [],
            "recommended_total_score": None,
            "recommended_question_count": None,
        }
    points_needed = max(target_cut.min_score - score.raw_score, 0)
    return {
        "next_grade": target_grade,
        "points_to_next_grade": points_needed,
        **_recommend_question_combination(points_needed, candidate_points),
    }


def _upsert_scores_and_logs(
    db: Session,
    attempt: models.SprintExamV2Attempt,
    scored: dict[str, Any],
    plan: dict[str, Any],
    *,
    now: datetime,
    reason: str,
    rescore: bool,
) -> list[models.SprintExamV2Score]:
    existing_scores = {score.score_group_id: score for score in attempt.scores}
    saved_scores: list[models.SprintExamV2Score] = []
    trigger_type = "admin_rescore" if rescore else "submit"
    for group_id, stats in sorted(scored["group_stats"].items(), key=lambda item: (plan["groups_by_id"][item[0]].display_order, item[0])):
        group = plan["groups_by_id"].get(group_id)
        if group is None:
            raise SprintExamV2ScoringConflictError("INVALID_SCORE_GROUP_CONFIGURATION", "Missing score group for assignment paper.")
        grade = calculate_grade(stats["raw_score"], list(group.grade_cuts or []))
        previous = existing_scores.get(group_id)
        previous_snapshot = _score_snapshot(previous)
        version = (previous.scoring_version + 1) if previous is not None else 1
        if previous is None:
            score = models.SprintExamV2Score(
                attempt_id=attempt.id,
                score_group_id=group_id,
                raw_score=stats["raw_score"],
                max_score=stats["max_score"],
                correct_count=stats["correct_count"],
                blank_count=stats["unanswered_count"],
                grade=grade,
                scoring_version=version,
                scored_at=now,
            )
            db.add(score)
            db.flush()
        else:
            score = previous
            score.raw_score = stats["raw_score"]
            score.max_score = stats["max_score"]
            score.correct_count = stats["correct_count"]
            score.blank_count = stats["unanswered_count"]
            score.grade = grade
            score.scoring_version = version
            score.scored_at = now
        new_snapshot = _score_snapshot(score)
        db.add(
            models.SprintExamV2ScoreLog(
                attempt_id=attempt.id,
                trigger_type=trigger_type,
                previous_score_snapshot=previous_snapshot,
                new_score_snapshot={
                    **(new_snapshot or {}),
                    "score_group_code": group.score_group_code,
                    "reason": reason,
                    "question_count": stats["question_count"],
                    "answered_count": stats["answered_count"],
                    "incorrect_count": stats["incorrect_count"],
                },
                message=reason,
            )
        )
        saved_scores.append(score)
    return saved_scores


def score_attempt(db: Session, attempt_id: int, *, reason: str = "initial_scoring", rescore: bool = False) -> dict[str, Any]:
    now = _now_utc()
    try:
        attempt = _load_attempt(db, attempt_id, lock=True)
        _validate_scorable_attempt(attempt, rescore=rescore)
        plan = _build_scoring_plan(db, attempt)
        scored = _score_questions(attempt, plan, now=now)
        scores = _upsert_scores_and_logs(db, attempt, scored, plan, now=now, reason=reason, rescore=rescore)
        attempt.status = "scored"
        attempt.scored_at = now
        db.commit()
        refreshed = _load_attempt(db, attempt_id)
        groups_by_id = _score_groups(db, refreshed.assignment)
        return {
            "ok": True,
            "attempt_id": refreshed.id,
            "status": refreshed.status,
            "scores": [_serialize_score(score, groups_by_id.get(score.score_group_id)) for score in sorted(refreshed.scores, key=lambda item: item.score_group_id)],
            "summary": scored["summary"],
        }
    except IntegrityError as exc:
        db.rollback()
        raise SprintExamV2ScoringConflictError("SCORING_CONFLICT", "Scoring conflict occurred.") from exc
    except Exception:
        db.rollback()
        raise


def _question_detail_payload(
    attempt: models.SprintExamV2Attempt,
    *,
    include_correct_answers: bool,
    include_explanations: bool = False,
) -> list[dict[str, Any]]:
    assignment_paper_by_paper_id = {paper.paper_id: paper for paper in _assigned_papers(attempt.assignment)}
    response_by_question_id = {response.question_id: response for response in attempt.responses}
    questions = sorted(
        [question for paper in attempt.assignment.exam.papers for question in paper.questions if question.paper_id in assignment_paper_by_paper_id],
        key=lambda item: (assignment_paper_by_paper_id[item.paper_id].display_order_snapshot, item.question_no, item.id or 0),
    )
    items: list[dict[str, Any]] = []
    for question in questions:
        assignment_paper = assignment_paper_by_paper_id[question.paper_id]
        response = response_by_question_id.get(question.id)
        answer = response.answer_values if response is not None and response.answer_values else []
        item = {
            "question_id": question.id,
            "question_no": question.question_no,
            "subject_code": assignment_paper.subject_code_snapshot,
            "subject_name": assignment_paper.subject_name_snapshot,
            "score_group_id": assignment_paper.score_group_id,
            "score_group_code": assignment_paper.score_group_code_snapshot,
            "submitted_answer": answer,
            "is_correct": response.is_correct if response is not None else False,
            "awarded_points": response.awarded_points if response is not None else 0,
            "max_points": question.points,
        }
        if include_correct_answers:
            item["correct_answers"] = question.correct_answers or []
        if include_explanations and question.explanation:
            item["explanation"] = question.explanation
        items.append(item)
    return items


def _score_summary_from_details(details: list[dict[str, Any]]) -> dict[str, int]:
    answered_count = sum(1 for item in details if item["submitted_answer"])
    correct_count = sum(1 for item in details if item["is_correct"] is True)
    incorrect_count = sum(1 for item in details if item["submitted_answer"] and item["is_correct"] is False)
    unanswered_count = sum(1 for item in details if not item["submitted_answer"])
    return {
        "total_question_count": len(details),
        "answered_count": answered_count,
        "correct_count": correct_count,
        "incorrect_count": incorrect_count,
        "unanswered_count": unanswered_count,
        "raw_score": sum(item["awarded_points"] or 0 for item in details),
        "max_score": sum(item["max_points"] for item in details),
    }


def _serialize_scores_with_recommendations(
    attempt: models.SprintExamV2Attempt,
    details: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    missed_points_by_group: dict[int, list[int]] = {}
    for item in details:
        if not item["is_correct"]:
            missed_points_by_group.setdefault(item["score_group_id"], []).append(item["max_points"])
    payloads: list[dict[str, Any]] = []
    for score in sorted(attempt.scores, key=lambda item: item.score_group_id):
        payload = _serialize_score(score)
        if score.score_group is not None:
            payload.update(_next_grade_payload(score, score.score_group, missed_points_by_group.get(score.score_group_id, [])))
        payloads.append(payload)
    return payloads


def get_admin_attempt_detail(db: Session, attempt_id: int) -> dict[str, Any]:
    import sprint_exam_v2_result_publication_service as publication_service

    attempt = _load_attempt(db, attempt_id)
    details = _question_detail_payload(attempt, include_correct_answers=True)
    return {
        "attempt": _attempt_payload(attempt),
        "student": _student_payload(attempt.assignment.student),
        "assignment": _assignment_payload(attempt.assignment),
        "exam": _exam_payload(attempt.assignment.exam),
        "questions": details,
        "scores": _serialize_scores_with_recommendations(attempt, details),
        "score_logs": [
            {
                "id": log.id,
                "trigger_type": log.trigger_type,
                "message": log.message,
                "previous_score_snapshot": log.previous_score_snapshot,
                "new_score_snapshot": log.new_score_snapshot,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in sorted(attempt.score_logs, key=lambda item: item.created_at or datetime.min.replace(tzinfo=timezone.utc))
        ],
        "publication": publication_service.serialize_publication(attempt, include_logs=True),
        "summary": _score_summary_from_details(details),
    }


def get_student_result(db: Session, attempt_id: int, student_id: int) -> dict[str, Any]:
    import sprint_exam_v2_result_publication_service as publication_service

    attempt = _load_student_attempt(db, attempt_id, student_id)
    publication = publication_service.require_student_result_publication(attempt)
    details = _question_detail_payload(
        attempt,
        include_correct_answers=publication.show_correct_answers,
        include_explanations=publication.show_explanations,
    )
    result = {
        "attempt": _attempt_payload(attempt),
        "assignment": _assignment_payload(attempt.assignment),
        "exam": _exam_payload(attempt.assignment.exam),
        "questions": details,
        "scores": _serialize_scores_with_recommendations(attempt, details),
        "summary": _score_summary_from_details(details),
    }
    return publication_service.sanitize_student_result(result, publication)


def _attempt_payload(attempt: models.SprintExamV2Attempt) -> dict[str, Any]:
    return {
        "id": attempt.id,
        "assignment_id": attempt.assignment_id,
        "attempt_no": attempt.attempt_no,
        "status": attempt.status,
        "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "scored_at": attempt.scored_at.isoformat() if attempt.scored_at else None,
    }


def _assignment_payload(assignment: models.SprintExamV2Assignment) -> dict[str, Any]:
    return {
        "id": assignment.id,
        "student_id": assignment.student_id,
        "status": assignment.status,
        "due_at": assignment.submission_deadline_at.isoformat() if assignment.submission_deadline_at else None,
    }


def _exam_payload(exam: models.SprintExamV2) -> dict[str, Any]:
    return {
        "id": exam.id,
        "title": exam.title,
        "exam_date": exam.exam_date.isoformat() if exam.exam_date else None,
    }


def _student_payload(student: models.Student) -> dict[str, Any]:
    return {"id": student.id, "name": student.name, "grade": student.grade}
