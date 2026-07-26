from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any


class SprintExamV2ScoringDomainError(ValueError):
    def __init__(self, code: str, message: str, path: str | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.path = path

    def detail(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "path": self.path}


AUTO_SCORABLE_TYPES = {"choice", "short_answer", "multiple_choice"}


def normalize_answer_values(question_type: str, values: Any) -> list[str]:
    if values is None:
        return []
    raw_values = values if isinstance(values, list) else [values]
    normalized: list[str] = []
    for value in raw_values:
        text = str(value).strip()
        if not text:
            continue
        if question_type in {"choice", "multiple_choice"} and text not in {"1", "2", "3", "4", "5"}:
            raise SprintExamV2ScoringDomainError("INVALID_CORRECT_ANSWER", "Choice answers must be between 1 and 5.")
        normalized.append(text)
    if question_type in {"choice", "multiple_choice"}:
        return sorted(set(normalized))
    if question_type == "short_answer":
        return [_normalize_short_answer(value) for value in normalized]
    raise SprintExamV2ScoringDomainError("UNSUPPORTED_QUESTION_TYPE", "This question type cannot be auto-scored.")


def _normalize_short_answer(value: str) -> str:
    text = value.strip()
    try:
        decimal = Decimal(text)
    except InvalidOperation:
        return text
    if decimal == 0:
        return "0"
    if decimal == decimal.to_integral_value():
        return str(decimal.quantize(Decimal(1)))
    return format(decimal.normalize(), "f")


def compare_answer_values(question_type: str, submitted: Any, correct: Any) -> bool:
    normalized_submitted = normalize_answer_values(question_type, submitted)
    normalized_correct = normalize_answer_values(question_type, correct)
    if not normalized_submitted or not normalized_correct:
        return False
    if question_type in {"choice", "multiple_choice"}:
        return normalized_submitted == normalized_correct
    if question_type == "short_answer":
        return any(value in normalized_correct for value in normalized_submitted)
    raise SprintExamV2ScoringDomainError("UNSUPPORTED_QUESTION_TYPE", "This question type cannot be auto-scored.")


def calculate_grade(raw_score: int, grade_cuts: list[Any]) -> int | None:
    matching = [
        grade_cut.grade
        for grade_cut in grade_cuts
        if raw_score >= grade_cut.min_score and grade_cut.cut_type in {"raw_score_min", "absolute_band"}
    ]
    return min(matching) if matching else None
