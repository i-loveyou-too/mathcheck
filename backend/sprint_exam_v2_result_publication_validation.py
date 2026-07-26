from __future__ import annotations

from typing import Any


DEFAULT_PUBLICATION_OPTIONS = {
    "show_total_score": True,
    "show_grade": True,
    "show_score_groups": True,
    "show_question_results": True,
    "show_correct_answers": False,
    "show_explanations": False,
}

OPTION_KEYS = tuple(DEFAULT_PUBLICATION_OPTIONS.keys())
PRIMARY_OPTION_KEYS = ("show_total_score", "show_grade", "show_score_groups", "show_question_results")


class SprintExamV2PublicationDomainError(ValueError):
    def __init__(self, code: str, message: str, path: str | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.path = path

    def detail(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "path": self.path}


def normalize_publication_options(payload: dict[str, Any] | None, *, base: dict[str, bool] | None = None) -> dict[str, bool]:
    options = dict(base or DEFAULT_PUBLICATION_OPTIONS)
    for key in OPTION_KEYS:
        if payload is not None and key in payload and payload[key] is not None:
            options[key] = bool(payload[key])
    validate_publication_options(options)
    return options


def validate_publication_options(options: dict[str, bool]) -> None:
    if not any(options.get(key) for key in PRIMARY_OPTION_KEYS):
        raise SprintExamV2PublicationDomainError(
            "INVALID_PUBLICATION_OPTIONS",
            "At least one result visibility option must be enabled.",
        )
    if options.get("show_correct_answers") and not options.get("show_question_results"):
        raise SprintExamV2PublicationDomainError(
            "INVALID_PUBLICATION_OPTIONS",
            "Correct answers can be shown only when question results are shown.",
            "show_correct_answers",
        )
    if options.get("show_explanations") and not options.get("show_question_results"):
        raise SprintExamV2PublicationDomainError(
            "INVALID_PUBLICATION_OPTIONS",
            "Explanations can be shown only when question results are shown.",
            "show_explanations",
        )


def publication_snapshot(status: str, options: dict[str, bool], *, published_at: str | None, unpublished_at: str | None) -> dict[str, Any]:
    return {
        "status": status,
        **{key: bool(options.get(key)) for key in OPTION_KEYS},
        "published_at": published_at,
        "unpublished_at": unpublished_at,
    }
