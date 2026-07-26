from __future__ import annotations

import re
from typing import Any

import models


class SprintExamV2AssignmentDomainError(ValueError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        student_id: int | None = None,
        score_group_code: str | None = None,
        selection_value: str | None = None,
        path: str | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.student_id = student_id
        self.score_group_code = score_group_code
        self.selection_value = selection_value
        self.path = path

    def detail(self) -> dict[str, Any]:
        result: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.student_id is not None:
            result["student_id"] = self.student_id
        if self.score_group_code is not None:
            result["score_group_code"] = self.score_group_code
        if self.selection_value is not None:
            result["selection_value"] = self.selection_value
        if self.path is not None:
            result["path"] = self.path
        return result


KOREAN_ELECTIVE_ALIASES = {
    "화법과작문": "korean_speech_writing",
    "화법과 작문": "korean_speech_writing",
    "언어와매체": "korean_language_media",
    "언어와 매체": "korean_language_media",
    "korean_speech_writing": "korean_speech_writing",
    "korean_language_media": "korean_language_media",
}
MATH_ELECTIVE_ALIASES = {
    "확률과통계": "math_probability_statistics",
    "확률과 통계": "math_probability_statistics",
    "미적분": "math_calculus",
    "기하": "math_geometry",
    "math_probability_statistics": "math_probability_statistics",
    "math_calculus": "math_calculus",
    "math_geometry": "math_geometry",
}
INQUIRY_ALIASES = {
    "생활과윤리": "life_ethics",
    "생활과 윤리": "life_ethics",
    "윤리와사상": "ethics_thought",
    "윤리와 사상": "ethics_thought",
    "사회문화": "social_culture",
    "사회 문화": "social_culture",
    "동아시아사": "east_asian_history",
    "life_ethics": "life_ethics",
    "ethics_thought": "ethics_thought",
    "social_culture": "social_culture",
    "east_asian_history": "east_asian_history",
}


def compact(value: str | None) -> str:
    return re.sub(r"\s+", "", str(value or "").strip().lower())


def normalize_selection(value: str | None, aliases: dict[str, str]) -> str | None:
    if not value:
        return None
    raw = str(value).strip()
    return aliases.get(raw) or aliases.get(compact(raw)) or compact(raw)


def normalize_student_subject_selection(student: models.Student, program: models.SprintProgram | None = None) -> dict[str, str | None]:
    inquiry_1 = student.inquiry_subject_1 or (program.inquiry_subject_1 if program is not None else None)
    inquiry_2 = student.inquiry_subject_2 or (program.inquiry_subject_2 if program is not None else None)
    return {
        "korean": normalize_selection(student.korean_elective, KOREAN_ELECTIVE_ALIASES),
        "math": normalize_selection(student.math_elective, MATH_ELECTIVE_ALIASES),
        "inquiry_1": normalize_selection(inquiry_1, INQUIRY_ALIASES),
        "inquiry_2": normalize_selection(inquiry_2, INQUIRY_ALIASES),
    }


def paper_matches_selection(paper: models.SprintExamV2Paper, selection: str | None) -> bool:
    if selection is None:
        return False
    values = {
        compact(paper.subject_code),
        compact(paper.subject_name),
        compact(paper.elective_code),
        compact(paper.elective_name),
    }
    return selection in values


def _one_paper(
    papers: list[models.SprintExamV2Paper],
    *,
    code: str,
    message: str,
    student_id: int,
    score_group_code: str,
    selection_value: str | None = None,
) -> models.SprintExamV2Paper:
    if not papers:
        raise SprintExamV2AssignmentDomainError(
            code,
            message,
            student_id=student_id,
            score_group_code=score_group_code,
            selection_value=selection_value,
        )
    if len(papers) > 1:
        raise SprintExamV2AssignmentDomainError(
            "AMBIGUOUS_PAPER_MATCH",
            "선택값과 일치하는 시험지가 2개 이상입니다.",
            student_id=student_id,
            score_group_code=score_group_code,
            selection_value=selection_value,
        )
    return papers[0]


def _resolve_sum_group(
    group: models.SprintExamV2ScoreGroup,
    student: models.Student,
    selections: dict[str, str | None],
    overrides: dict[str, str] | None,
) -> list[models.SprintExamV2Paper]:
    papers = sorted(group.papers, key=lambda paper: (paper.source_order, paper.id or 0))
    common = _one_paper(
        [paper for paper in papers if paper.paper_role == "common"],
        code="COMMON_PAPER_MISSING",
        message="sum 점수그룹에 common paper가 없습니다.",
        student_id=student.id,
        score_group_code=group.score_group_code,
    )
    electives = [paper for paper in papers if paper.paper_role == "elective"]
    invalid = [paper for paper in papers if paper.paper_role not in {"common", "elective"}]
    if invalid:
        raise SprintExamV2AssignmentDomainError(
            "INVALID_EXAM_PAPER_CONFIGURATION",
            "sum 점수그룹에는 common/elective paper만 포함할 수 있습니다.",
            student_id=student.id,
            score_group_code=group.score_group_code,
        )
    if not electives:
        return [common]

    selection = None
    missing_code = "MATCHING_PAPER_NOT_FOUND"
    if overrides and group.score_group_code in overrides:
        selection = normalize_selection(overrides[group.score_group_code], {overrides[group.score_group_code]: overrides[group.score_group_code]})
    elif group.subject_area == "korean":
        selection = selections["korean"]
        missing_code = "STUDENT_KOREAN_ELECTIVE_MISSING"
    elif group.subject_area == "math":
        selection = selections["math"]
        missing_code = "STUDENT_MATH_ELECTIVE_MISSING"

    if not selection:
        raise SprintExamV2AssignmentDomainError(
            missing_code,
            "학생 선택과목이 없어 선택 paper를 고를 수 없습니다.",
            student_id=student.id,
            score_group_code=group.score_group_code,
        )
    selected = _one_paper(
        [paper for paper in electives if paper_matches_selection(paper, selection)],
        code="MATCHING_PAPER_NOT_FOUND",
        message="학생 선택과목과 일치하는 시험지가 없습니다.",
        student_id=student.id,
        score_group_code=group.score_group_code,
        selection_value=selection,
    )
    return [common, selected]


def _resolve_standalone_group(
    group: models.SprintExamV2ScoreGroup,
    student: models.Student,
    selections: dict[str, str | None],
    overrides: dict[str, str] | None,
) -> list[models.SprintExamV2Paper]:
    papers = sorted(group.papers, key=lambda paper: (paper.source_order, paper.id or 0))
    if group.subject_area == "inquiry":
        selection_values = [value for value in (selections["inquiry_1"], selections["inquiry_2"]) if value]
        if not selection_values:
            raise SprintExamV2AssignmentDomainError(
                "STUDENT_INQUIRY_SELECTION_MISSING",
                "학생 탐구 선택과목이 없습니다.",
                student_id=student.id,
                score_group_code=group.score_group_code,
            )
        matched = [paper for paper in papers if any(paper_matches_selection(paper, selection) for selection in selection_values)]
        if not matched:
            return []
        return [_one_paper(
            matched,
            code="MATCHING_PAPER_NOT_FOUND",
            message="학생 탐구 선택과목과 일치하는 시험지가 없습니다.",
            student_id=student.id,
            score_group_code=group.score_group_code,
            selection_value=",".join(selection_values),
        )]

    if overrides and group.score_group_code in overrides:
        selection = normalize_selection(overrides[group.score_group_code], {overrides[group.score_group_code]: overrides[group.score_group_code]})
        return [_one_paper(
            [paper for paper in papers if paper_matches_selection(paper, selection)],
            code="MATCHING_PAPER_NOT_FOUND",
            message="override와 일치하는 시험지가 없습니다.",
            student_id=student.id,
            score_group_code=group.score_group_code,
            selection_value=selection,
        )]

    if group.subject_area in {"english", "korean_history"}:
        return [_one_paper(
            papers,
            code="INVALID_EXAM_PAPER_CONFIGURATION",
            message="standalone 점수그룹에는 paper가 정확히 1개여야 합니다.",
            student_id=student.id,
            score_group_code=group.score_group_code,
        )]

    return []


def resolve_assignment_papers(
    exam: models.SprintExamV2,
    student: models.Student,
    program: models.SprintProgram | None = None,
    overrides: dict[str, str] | None = None,
) -> tuple[list[models.SprintExamV2Paper], dict[str, str | None]]:
    selections = normalize_student_subject_selection(student, program)
    resolved: list[models.SprintExamV2Paper] = []
    for group in sorted(exam.score_groups, key=lambda item: (item.display_order, item.id or 0)):
        if group.aggregation_type == "sum":
            resolved.extend(_resolve_sum_group(group, student, selections, overrides))
        elif group.aggregation_type == "standalone":
            resolved.extend(_resolve_standalone_group(group, student, selections, overrides))
        else:
            raise SprintExamV2AssignmentDomainError(
                "INVALID_EXAM_PAPER_CONFIGURATION",
                "지원하지 않는 점수그룹 aggregation_type입니다.",
                student_id=student.id,
                score_group_code=group.score_group_code,
            )
    inquiry_groups = [group for group in exam.score_groups if group.subject_area == "inquiry"]
    if inquiry_groups:
        selected_inquiries = [value for value in (selections["inquiry_1"], selections["inquiry_2"]) if value]
        matched_inquiries = {
            selection
            for selection in selected_inquiries
            if any(paper_matches_selection(paper, selection) for paper in resolved)
        }
        missing = [selection for selection in selected_inquiries if selection not in matched_inquiries]
        if missing:
            raise SprintExamV2AssignmentDomainError(
                "MATCHING_PAPER_NOT_FOUND",
                "학생 탐구 선택과목과 일치하는 시험지가 없습니다.",
                student_id=student.id,
                selection_value=",".join(missing),
            )
    return resolved, selections
