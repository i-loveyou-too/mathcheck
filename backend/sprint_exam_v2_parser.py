from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
import re
from typing import Any


EXAM_FIELD_LABELS = {
    "시험": "title",
    "title": "title",
    "시험일": "exam_date",
    "exam_date": "exam_date",
    "date": "exam_date",
    "출처": "source_label",
    "source": "source_label",
    "설명": "description",
    "description": "description",
}

VALID_CODE_RE = re.compile(r"^[a-z0-9_]+$")
SECTION_RE = re.compile(r"^\[(.+)]$")
QUESTION_RE = re.compile(r"^(\d+)\s+(\S+)\s+(\S+)\s+(\S+)$")
GRADE_CUT_RE = re.compile(r"^(등급컷|grade[_ ]?cut)\s+(.+)$", re.IGNORECASE)
FIELD_SPLIT_RE = re.compile(r"[:：]")
VALID_PAPER_ROLES = {"common", "elective", "inquiry_slot", "standalone"}
VALID_AGGREGATION_TYPES = {"sum", "standalone"}
VALID_GRADE_CUT_TYPES = {"raw_score_min", "absolute_band"}


@dataclass
class ParseIssue:
    line: int
    code: str
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {"line": self.line, "code": self.code, "message": self.message}


@dataclass
class ParsedQuestion:
    question_no: int
    question_type: str
    correct_answers: list[str]
    score: int
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "question_no": self.question_no,
            "question_type": self.question_type,
            "correct_answers": self.correct_answers,
            "score": self.score,
            "metadata": self.metadata,
        }


@dataclass
class ParsedGradeCut:
    grade: int
    min_score: int
    cut_type: str = "raw_score_min"
    metadata: dict[str, Any] = field(default_factory=dict)

    def key(self) -> tuple[int, str]:
        return (self.grade, self.cut_type)

    def to_dict(self) -> dict[str, Any]:
        return {
            "grade": self.grade,
            "min_score": self.min_score,
            "cut_type": self.cut_type,
            "metadata": self.metadata,
        }


@dataclass
class GroupContext:
    header: str
    line: int
    score_group_code: str | None = None
    score_group_name: str | None = None
    subject_area: str | None = None
    aggregation_type: str | None = None
    grade_cuts: list[ParsedGradeCut] = field(default_factory=list)


@dataclass
class ParsedPaper:
    header: str
    header_line: int
    subject_area: str | None
    subject_code: str | None
    subject_name: str
    paper_role: str
    slot: str | None
    display_order: int
    metadata: dict[str, Any] = field(default_factory=dict)
    listening_youtube_url: str | None = None
    explicit_type: str | None = None
    score_group_code_override: str | None = None
    score_group_name_override: str | None = None
    aggregation_type_override: str | None = None
    group_context: GroupContext | None = None
    questions: list[ParsedQuestion] = field(default_factory=list)
    grade_cuts: list[ParsedGradeCut] = field(default_factory=list)

    @property
    def paper_max_score(self) -> int:
        return sum(question.score for question in self.questions)

    def to_dict(self) -> dict[str, Any]:
        return {
            "subject_code": self.subject_code,
            "subject_name": self.subject_name,
            "paper_role": self.paper_role,
            "slot": self.slot,
            "display_order": self.display_order,
            "metadata": self.metadata,
            "listening_youtube_url": self.listening_youtube_url,
            "questions": [question.to_dict() for question in self.questions],
            "question_count": len(self.questions),
            "paper_max_score": self.paper_max_score,
        }


@dataclass
class ParsedScoreGroup:
    score_group_code: str
    score_group_name: str
    subject_area: str
    aggregation_type: str
    display_order: int
    metadata: dict[str, Any] = field(default_factory=dict)
    grade_cuts: list[ParsedGradeCut] = field(default_factory=list)
    papers: list[ParsedPaper] = field(default_factory=list)
    source_paper_score_sum: int = 0
    assignment_max_score: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "score_group_code": self.score_group_code,
            "score_group_name": self.score_group_name,
            "subject_area": self.subject_area,
            "aggregation_type": self.aggregation_type,
            "display_order": self.display_order,
            "metadata": self.metadata,
            "grade_cuts": [grade_cut.to_dict() for grade_cut in self.grade_cuts],
            "papers": [paper.to_dict() for paper in self.papers],
            "source_paper_score_sum": self.source_paper_score_sum,
            "assignment_max_score": self.assignment_max_score,
        }


@dataclass
class ParseResult:
    ok: bool
    errors: list[ParseIssue]
    warnings: list[ParseIssue]
    preview: dict[str, Any]
    normalized_output: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "errors": [error.to_dict() for error in self.errors],
            "warnings": [warning.to_dict() for warning in self.warnings],
            "preview": self.preview,
            "normalized_output": self.normalized_output,
        }


def issue(line: int, code: str, message: str) -> ParseIssue:
    return ParseIssue(line=line, code=code, message=message)


def empty_preview() -> dict[str, Any]:
    return {
        "exam": {},
        "score_groups": [],
        "total_score_group_count": 0,
        "total_paper_count": 0,
        "total_question_count": 0,
        "source_paper_score_sum": 0,
    }


def normalize_lines(text: str) -> list[tuple[int, str]]:
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n").replace("\t", " ")
    if cleaned.startswith("\ufeff"):
        cleaned = cleaned[1:]
    return [(index, line.strip()) for index, line in enumerate(cleaned.split("\n"), start=1)]


def split_field(line: str) -> tuple[str, str] | None:
    parts = FIELD_SPLIT_RE.split(line, maxsplit=1)
    if len(parts) != 2:
        return None
    return parts[0].strip(), parts[1].strip()


def parse_exam_field(line: str) -> tuple[str, str] | None:
    field = split_field(line)
    if field is None:
        return None
    key, value = field
    mapped = EXAM_FIELD_LABELS.get(key.lower()) or EXAM_FIELD_LABELS.get(key)
    if not mapped:
        return None
    return mapped, value


def parse_iso_date(value: str) -> bool:
    try:
        date.fromisoformat(value)
        return True
    except ValueError:
        return False


def normalize_question_type(value: str) -> str | None:
    lowered = value.strip().lower()
    if lowered in {"choice", "객관식"}:
        return "choice"
    if lowered in {"short_answer", "short-answer", "shortanswer", "주관식"}:
        return "short_answer"
    return None


def remove_duplicate_answers(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def parse_question(line: str) -> ParsedQuestion | str:
    match = QUESTION_RE.match(line)
    if not match:
        return "INVALID_QUESTION_FORMAT"
    raw_no, raw_type, raw_answers, raw_score = match.groups()
    question_no = int(raw_no)
    if question_no <= 0:
        return "INVALID_QUESTION_NO"

    question_type = normalize_question_type(raw_type)
    if question_type is None:
        return "INVALID_ANSWER_TYPE"

    if raw_answers == "" or "||" in raw_answers or raw_answers.startswith("|") or raw_answers.endswith("|"):
        return "EMPTY_CORRECT_ANSWER"
    correct_answers = [answer.strip() for answer in raw_answers.split("|")]
    if any(answer == "" for answer in correct_answers):
        return "EMPTY_CORRECT_ANSWER"
    correct_answers = remove_duplicate_answers(correct_answers)
    if question_type == "choice" and any(answer not in {"1", "2", "3", "4", "5"} for answer in correct_answers):
        return "INVALID_CHOICE_ANSWER"

    score_text = raw_score
    if score_text.endswith("점"):
        score_text = score_text[:-1]
    if not re.fullmatch(r"\d+", score_text):
        return "INVALID_POINTS"
    score = int(score_text)
    if score <= 0:
        return "INVALID_POINTS"

    return ParsedQuestion(
        question_no=question_no,
        question_type=question_type,
        correct_answers=correct_answers,
        score=score,
    )


def parse_grade_cut(line: str) -> list[ParsedGradeCut] | str | None:
    match = GRADE_CUT_RE.match(line)
    if not match:
        return None
    body = match.group(2).strip()
    if not body:
        return "INVALID_GRADE_CUT"

    cut_type = "raw_score_min"
    type_match = re.match(r"^(raw_score_min|absolute_band)\s+(.+)$", body)
    if type_match:
        cut_type = type_match.group(1)
        body = type_match.group(2).strip()
    if cut_type not in VALID_GRADE_CUT_TYPES:
        return "INVALID_GRADE_CUT"

    cuts: list[ParsedGradeCut] = []
    for item in re.split(r"\s*[,/]\s*", body):
        if not item:
            continue
        item_match = re.fullmatch(r"(\d+)\s*[=:]\s*(\d+)", item.strip())
        if not item_match:
            return "INVALID_GRADE_CUT"
        grade = int(item_match.group(1))
        min_score = int(item_match.group(2))
        if grade < 1 or min_score < 0:
            return "INVALID_GRADE_CUT"
        cuts.append(ParsedGradeCut(grade=grade, min_score=min_score, cut_type=cut_type))
    return cuts if cuts else "INVALID_GRADE_CUT"


def infer_header(header: str) -> tuple[str | None, str, str, str | None]:
    compact = re.sub(r"\s+", "", header)
    subject_name = header.strip()
    subject_area: str | None = None
    paper_role = "standalone"
    slot: str | None = None

    if "국어" in compact:
        subject_area = "korean"
        paper_role = "elective" if "선택" in compact else "common" if "공통" in compact else "standalone"
        if FIELD_SPLIT_RE.search(header):
            subject_name = FIELD_SPLIT_RE.split(header, maxsplit=1)[1].strip()
    elif "수학" in compact:
        subject_area = "math"
        paper_role = "elective" if "선택" in compact else "common" if "공통" in compact else "standalone"
        if FIELD_SPLIT_RE.search(header):
            subject_name = FIELD_SPLIT_RE.split(header, maxsplit=1)[1].strip()
    elif "영어" in compact:
        subject_area = "english"
        subject_name = "영어"
    elif "한국사" in compact:
        subject_area = "korean_history"
        subject_name = "한국사"
    elif "탐구" in compact:
        subject_area = "inquiry"
        if "탐구1" in compact:
            paper_role = "inquiry_slot"
            slot = "inquiry_1"
        elif "탐구2" in compact:
            paper_role = "inquiry_slot"
            slot = "inquiry_2"
        if FIELD_SPLIT_RE.search(header):
            subject_name = FIELD_SPLIT_RE.split(header, maxsplit=1)[1].strip()
    elif "제2외국어" in compact or "일본어" in compact or "중국어" in compact:
        subject_area = "second_language"
        if FIELD_SPLIT_RE.search(header):
            subject_name = FIELD_SPLIT_RE.split(header, maxsplit=1)[1].strip()

    return subject_area, subject_name, paper_role, slot


def normalize_explicit_type(value: str, inferred_slot: str | None) -> str | None:
    normalized = value.strip().lower()
    if normalized not in {"common", "elective", "inquiry", "inquiry_slot", "standalone"}:
        return None
    if normalized == "inquiry":
        return "inquiry_slot" if inferred_slot else "standalone"
    return normalized


def default_group_for_paper(paper: ParsedPaper) -> tuple[str, str, str, str]:
    if paper.subject_area == "korean" and paper.paper_role in {"common", "elective"}:
        return ("korean_total", "국어", "korean", "sum")
    if paper.subject_area == "math" and paper.paper_role in {"common", "elective"}:
        return ("math_total", "수학", "math", "sum")
    if paper.subject_area == "english":
        return ("english_total", "영어", "english", "standalone")
    if paper.subject_area == "korean_history":
        return ("korean_history_total", "한국사", "korean_history", "standalone")
    if paper.subject_area == "inquiry" and paper.subject_code:
        return (f"{paper.subject_code}_total", paper.subject_name, "inquiry", "standalone")
    if paper.subject_code:
        return (f"{paper.subject_code}_total", paper.subject_name, paper.subject_area or "other", "standalone")
    return ("unknown_total", paper.subject_name, paper.subject_area or "other", "standalone")


def sort_issues(issues: list[ParseIssue]) -> list[ParseIssue]:
    return [item[1] for item in sorted(enumerate(issues), key=lambda item: (item[1].line, item[0]))]


def merge_grade_cuts(
    group: ParsedScoreGroup,
    cuts: list[ParsedGradeCut],
    line: int,
    warnings: list[ParseIssue],
    errors: list[ParseIssue],
) -> None:
    existing = {cut.key(): cut for cut in group.grade_cuts}
    for cut in cuts:
        current = existing.get(cut.key())
        if current is None:
            existing[cut.key()] = cut
            group.grade_cuts.append(cut)
            continue
        if current.min_score == cut.min_score:
            warnings.append(
                issue(
                    line,
                    "DUPLICATE_IDENTICAL_GROUP_GRADE_CUT",
                    "같은 점수그룹의 동일한 등급컷을 하나로 병합했습니다.",
                )
            )
        else:
            errors.append(
                issue(
                    line,
                    "CONFLICTING_GROUP_GRADE_CUT",
                    "같은 점수그룹의 등급컷 값이 서로 충돌합니다.",
                )
            )


def validate_grade_cut_order(group: ParsedScoreGroup, errors: list[ParseIssue]) -> None:
    by_type: dict[str, list[ParsedGradeCut]] = {}
    for cut in group.grade_cuts:
        by_type.setdefault(cut.cut_type, []).append(cut)
    for cut_type, cuts in by_type.items():
        if cut_type not in VALID_GRADE_CUT_TYPES:
            errors.append(issue(1, "INVALID_GRADE_CUT", f"{group.score_group_name} 등급컷 cut_type이 올바르지 않습니다."))
            continue
        ordered = sorted(cuts, key=lambda item: item.grade)
        previous_score: int | None = None
        for cut in ordered:
            if previous_score is not None and cut.min_score >= previous_score:
                errors.append(issue(1, "INVALID_GRADE_CUT", f"{group.score_group_name} 등급컷 점수 순서가 올바르지 않습니다."))
            previous_score = cut.min_score


def apply_override_conflict_checks(
    paper: ParsedPaper,
    default_code: str,
    default_name: str,
    default_area: str,
    default_aggregation: str,
    errors: list[ParseIssue],
) -> None:
    context = paper.group_context
    explicit_code = paper.score_group_code_override or (context.score_group_code if context else None)
    explicit_name = paper.score_group_name_override or (context.score_group_name if context else None)
    explicit_area = context.subject_area if context else None
    explicit_aggregation = paper.aggregation_type_override or (context.aggregation_type if context else None)

    if explicit_code and explicit_code != default_code:
        errors.append(issue(paper.header_line, "SCORE_GROUP_OVERRIDE_CONFLICT", "명시한 score_group_code가 자동 추론 값과 충돌합니다."))
    if explicit_name and explicit_name != default_name:
        errors.append(issue(paper.header_line, "SCORE_GROUP_OVERRIDE_CONFLICT", "명시한 score_group_name이 자동 추론 값과 충돌합니다."))
    if explicit_area and explicit_area != default_area:
        errors.append(issue(paper.header_line, "SCORE_GROUP_OVERRIDE_CONFLICT", "명시한 subject_area가 자동 추론 값과 충돌합니다."))
    if explicit_aggregation and explicit_aggregation != default_aggregation:
        errors.append(issue(paper.header_line, "SCORE_GROUP_OVERRIDE_CONFLICT", "명시한 aggregation_type이 자동 추론 값과 충돌합니다."))


def build_score_groups(
    papers: list[ParsedPaper],
    warnings: list[ParseIssue],
    errors: list[ParseIssue],
) -> list[ParsedScoreGroup]:
    groups: dict[str, ParsedScoreGroup] = {}
    ordered_groups: list[ParsedScoreGroup] = []

    for paper in papers:
        default_code, default_name, default_area, default_aggregation = default_group_for_paper(paper)
        apply_override_conflict_checks(
            paper,
            default_code,
            default_name,
            default_area,
            default_aggregation,
            errors,
        )

        group = groups.get(default_code)
        if group is None:
            group = ParsedScoreGroup(
                score_group_code=default_code,
                score_group_name=default_name,
                subject_area=default_area,
                aggregation_type=default_aggregation,
                display_order=len(ordered_groups),
            )
            groups[default_code] = group
            ordered_groups.append(group)
            if paper.group_context:
                merge_grade_cuts(group, paper.group_context.grade_cuts, paper.group_context.line, warnings, errors)
        group.papers.append(paper)
        merge_grade_cuts(group, paper.grade_cuts, paper.header_line, warnings, errors)

    for group in ordered_groups:
        group.source_paper_score_sum = sum(paper.paper_max_score for paper in group.papers)
        if group.aggregation_type == "sum":
            common_papers = [paper for paper in group.papers if paper.paper_role == "common"]
            elective_papers = [paper for paper in group.papers if paper.paper_role == "elective"]
            invalid_roles = [paper for paper in group.papers if paper.paper_role not in {"common", "elective"}]
            if len(common_papers) > 1:
                errors.append(issue(common_papers[1].header_line, "MULTIPLE_COMMON_PAPERS", "sum 점수그룹에는 common paper가 최대 1개만 가능합니다."))
            if invalid_roles:
                errors.append(issue(invalid_roles[0].header_line, "INVALID_SUM_GROUP_PAPER_ROLE", "sum 점수그룹에는 common/elective paper만 포함할 수 있습니다."))
            if not common_papers and not elective_papers:
                errors.append(issue(1, "INVALID_SCORE_GROUP_COMPOSITION", f"{group.score_group_name} 점수그룹 구성이 올바르지 않습니다."))

            common_score = common_papers[0].paper_max_score if common_papers else 0
            if elective_papers:
                elective_scores = {paper.paper_max_score for paper in elective_papers}
                if len(elective_scores) == 1:
                    group.assignment_max_score = common_score + next(iter(elective_scores))
                else:
                    group.assignment_max_score = None
                    warnings.append(
                        issue(
                            elective_papers[0].header_line,
                            "ELECTIVE_MAX_SCORE_MISMATCH",
                            "선택 paper들의 만점이 달라 assignment_max_score를 계산하지 않았습니다.",
                        )
                    )
            else:
                group.assignment_max_score = common_score
        else:
            if len(group.papers) > 1:
                errors.append(issue(group.papers[1].header_line, "STANDALONE_GROUP_MULTIPLE_PAPERS", "standalone 점수그룹에는 paper가 정확히 1개여야 합니다."))
            if len(group.papers) == 0:
                errors.append(issue(1, "STANDALONE_GROUP_MISSING_PAPER", "standalone 점수그룹에 paper가 없습니다."))
            group.assignment_max_score = group.papers[0].paper_max_score if len(group.papers) == 1 else None
        validate_grade_cut_order(group, errors)

    return ordered_groups


def make_preview(exam: dict[str, str | None], score_groups: list[ParsedScoreGroup]) -> dict[str, Any]:
    score_group_dicts = [group.to_dict() for group in score_groups]
    papers = [paper for group in score_groups for paper in group.papers]
    return {
        "exam": {
            "title": exam.get("title"),
            "exam_date": exam.get("exam_date"),
            "source_label": exam.get("source_label"),
            "description": exam.get("description"),
            "metadata": {},
        },
        "score_groups": score_group_dicts,
        "total_score_group_count": len(score_group_dicts),
        "total_paper_count": len(papers),
        "total_question_count": sum(len(paper.questions) for paper in papers),
        "source_paper_score_sum": sum(group.source_paper_score_sum for group in score_groups),
    }


def make_normalized_output(exam: dict[str, str | None], score_groups: list[ParsedScoreGroup]) -> str:
    lines: list[str] = [f"시험: {exam['title']}"]
    if exam.get("exam_date"):
        lines.append(f"시험일: {exam['exam_date']}")
    if exam.get("source_label"):
        lines.append(f"출처: {exam['source_label']}")
    if exam.get("description"):
        lines.append(f"설명: {exam['description']}")

    for group in score_groups:
        lines.append("")
        lines.append(f"[점수그룹: {group.score_group_name}]")
        lines.append(f"score_group_code: {group.score_group_code}")
        lines.append(f"score_group_name: {group.score_group_name}")
        lines.append(f"subject_area: {group.subject_area}")
        lines.append(f"aggregation_type: {group.aggregation_type}")
        if group.grade_cuts:
            for cut_type in sorted({cut.cut_type for cut in group.grade_cuts}):
                cuts = [cut for cut in group.grade_cuts if cut.cut_type == cut_type]
                prefix = "등급컷" if cut_type == "raw_score_min" else f"등급컷 {cut_type}"
                body = ", ".join(f"{cut.grade}={cut.min_score}" for cut in sorted(cuts, key=lambda item: item.grade))
                lines.append(f"{prefix} {body}")

        for paper in group.papers:
            lines.append("")
            lines.append(f"[{paper.header}]")
            lines.append(f"subject_code: {paper.subject_code}")
            lines.append(f"type: {paper.paper_role}")
            if paper.listening_youtube_url:
                lines.append(f"listening_youtube_url: {paper.listening_youtube_url}")
            for question in sorted(paper.questions, key=lambda item: item.question_no):
                answers = "|".join(question.correct_answers)
                lines.append(f"{question.question_no} {question.question_type} {answers} {question.score}점")

    return "\n".join(lines) + "\n"


def parse_sprint_exam_v2_text(text: str) -> ParseResult:
    errors: list[ParseIssue] = []
    warnings: list[ParseIssue] = []
    exam: dict[str, str | None] = {
        "title": None,
        "exam_date": None,
        "source_label": None,
        "description": None,
    }
    seen_exam_fields: set[str] = set()
    papers: list[ParsedPaper] = []
    current_paper: ParsedPaper | None = None
    current_group_context: GroupContext | None = None
    active_section: str | None = None
    seen_paper_keys: set[tuple[str, str | None]] = set()
    question_numbers_by_paper: dict[int, set[int]] = {}
    grade_cuts_by_group_context: dict[int, set[tuple[int, str]]] = {}
    grade_cuts_by_paper: dict[int, set[tuple[int, str]]] = {}

    for line_no, line in normalize_lines(text):
        if not line or line.startswith("#"):
            continue

        header_match = SECTION_RE.match(line)
        if header_match:
            header = header_match.group(1).strip()
            lowered_header = header.lower()
            if lowered_header.startswith("score_group:") or header.startswith("점수그룹:"):
                name = FIELD_SPLIT_RE.split(header, maxsplit=1)[1].strip()
                current_group_context = GroupContext(header=header, line=line_no, score_group_name=name)
                grade_cuts_by_group_context[id(current_group_context)] = set()
                current_paper = None
                active_section = "group"
                continue

            subject_area, subject_name, paper_role, slot = infer_header(header)
            current_paper = ParsedPaper(
                header=header,
                header_line=line_no,
                subject_area=subject_area,
                subject_code=None,
                subject_name=subject_name,
                paper_role=paper_role,
                slot=slot,
                display_order=len(papers),
                group_context=current_group_context,
            )
            papers.append(current_paper)
            question_numbers_by_paper[id(current_paper)] = set()
            grade_cuts_by_paper[id(current_paper)] = set()
            active_section = "paper"
            continue

        exam_field = parse_exam_field(line)
        if exam_field and active_section is None:
            key, value = exam_field
            if key in seen_exam_fields:
                errors.append(issue(line_no, "DUPLICATE_EXAM_FIELD", f"{key} field is duplicated."))
                continue
            seen_exam_fields.add(key)
            if key == "exam_date" and value and not parse_iso_date(value):
                errors.append(issue(line_no, "INVALID_EXAM_DATE", "시험일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다."))
                continue
            exam[key] = value
            continue
        if exam_field and active_section is not None:
            errors.append(issue(line_no, "MISPLACED_EXAM_FIELD", "시험 메타데이터는 paper section 전에만 입력할 수 있습니다."))
            continue
        if active_section is None:
            errors.append(issue(line_no, "UNKNOWN_TOP_LEVEL_LINE", "paper section 밖에서 해석할 수 없는 줄입니다."))
            continue

        grade_cut_result = parse_grade_cut(line)
        if grade_cut_result is not None:
            if isinstance(grade_cut_result, str):
                errors.append(issue(line_no, grade_cut_result, "등급컷 형식이 올바르지 않습니다."))
                continue
            if active_section == "group" and current_group_context is not None:
                seen_cuts = grade_cuts_by_group_context[id(current_group_context)]
                for cut in grade_cut_result:
                    if cut.key() in seen_cuts:
                        errors.append(issue(line_no, "DUPLICATE_GRADE_CUT", "같은 section 안의 등급컷 grade가 중복입니다."))
                        continue
                    seen_cuts.add(cut.key())
                    current_group_context.grade_cuts.append(cut)
                continue
            if current_paper is not None:
                seen_cuts = grade_cuts_by_paper[id(current_paper)]
                for cut in grade_cut_result:
                    if cut.key() in seen_cuts:
                        errors.append(issue(line_no, "DUPLICATE_GRADE_CUT", "같은 paper 안의 등급컷 grade가 중복입니다."))
                        continue
                    seen_cuts.add(cut.key())
                    current_paper.grade_cuts.append(cut)
                continue

        field = split_field(line)
        if field is not None:
            key, value = field
            key = key.strip().lower()
            value = value.strip()
            if active_section == "group" and current_group_context is not None:
                if key == "score_group_code":
                    if not VALID_CODE_RE.fullmatch(value):
                        errors.append(issue(line_no, "INVALID_SCORE_GROUP_CODE", "score_group_code 형식이 올바르지 않습니다."))
                    else:
                        current_group_context.score_group_code = value
                    continue
                if key == "score_group_name":
                    if not value:
                        errors.append(issue(line_no, "INVALID_SCORE_GROUP_NAME", "score_group_name은 비어 있을 수 없습니다."))
                    else:
                        current_group_context.score_group_name = value
                    continue
                if key == "subject_area":
                    if not VALID_CODE_RE.fullmatch(value):
                        errors.append(issue(line_no, "INVALID_SUBJECT_AREA", "subject_area 형식이 올바르지 않습니다."))
                    else:
                        current_group_context.subject_area = value
                    continue
                if key == "aggregation_type":
                    if value not in VALID_AGGREGATION_TYPES:
                        errors.append(issue(line_no, "INVALID_AGGREGATION_TYPE", "aggregation_type은 sum 또는 standalone이어야 합니다."))
                    else:
                        current_group_context.aggregation_type = value
                    continue
                errors.append(issue(line_no, "UNKNOWN_TOP_LEVEL_LINE", "점수그룹 section 안에서 해석할 수 없는 key입니다."))
                continue

            if current_paper is None:
                errors.append(issue(line_no, "UNKNOWN_TOP_LEVEL_LINE", "해석할 수 없는 줄입니다."))
                continue
            if key == "subject_code":
                if not value:
                    errors.append(issue(line_no, "MISSING_SUBJECT_CODE", "subject_code가 비어 있습니다."))
                    continue
                if not VALID_CODE_RE.fullmatch(value):
                    errors.append(issue(line_no, "INVALID_SUBJECT_CODE", "subject_code는 영문 소문자, 숫자, underscore만 허용합니다."))
                    continue
                paper_key = (value, current_paper.slot)
                if paper_key in seen_paper_keys:
                    errors.append(issue(line_no, "DUPLICATE_PAPER", "같은 subject_code와 slot 조합의 paper가 중복입니다."))
                    continue
                seen_paper_keys.add(paper_key)
                current_paper.subject_code = value
                continue
            if key in {"type", "paper_role"}:
                explicit_type = normalize_explicit_type(value, current_paper.slot)
                if explicit_type is None:
                    errors.append(issue(line_no, "HEADER_TYPE_CONFLICT", "type 값은 common, elective, inquiry, inquiry_slot, standalone 중 하나여야 합니다."))
                    continue
                if current_paper.paper_role and explicit_type != current_paper.paper_role:
                    errors.append(issue(line_no, "HEADER_TYPE_CONFLICT", "header에서 추론한 type과 명시한 type이 충돌합니다."))
                    continue
                current_paper.paper_role = explicit_type
                current_paper.explicit_type = value
                continue
            if key == "score_group_code":
                if not VALID_CODE_RE.fullmatch(value):
                    errors.append(issue(line_no, "INVALID_SCORE_GROUP_CODE", "score_group_code 형식이 올바르지 않습니다."))
                else:
                    current_paper.score_group_code_override = value
                continue
            if key == "score_group_name":
                if not value:
                    errors.append(issue(line_no, "INVALID_SCORE_GROUP_NAME", "score_group_name은 비어 있을 수 없습니다."))
                else:
                    current_paper.score_group_name_override = value
                continue
            if key == "aggregation_type":
                if value not in VALID_AGGREGATION_TYPES:
                    errors.append(issue(line_no, "INVALID_AGGREGATION_TYPE", "aggregation_type은 sum 또는 standalone이어야 합니다."))
                else:
                    current_paper.aggregation_type_override = value
                continue
            if key == "listening_youtube_url":
                current_paper.listening_youtube_url = value or None
                continue
            errors.append(issue(line_no, "UNKNOWN_PAPER_LINE", "paper section 안에서 해석할 수 없는 key입니다."))
            continue

        if active_section != "paper" or current_paper is None:
            errors.append(issue(line_no, "UNKNOWN_TOP_LEVEL_LINE", "점수그룹 section 안에서 해석할 수 없는 줄입니다."))
            continue
        if not re.match(r"^\d+\s+", line):
            errors.append(issue(line_no, "UNKNOWN_PAPER_LINE", "paper section 안에서 해석할 수 없는 줄입니다."))
            continue

        question_result = parse_question(line)
        if isinstance(question_result, str):
            errors.append(issue(line_no, question_result, "문항 형식이 올바르지 않습니다."))
            continue
        seen_questions = question_numbers_by_paper[id(current_paper)]
        if question_result.question_no in seen_questions:
            errors.append(issue(line_no, "DUPLICATE_QUESTION_NO", f"{current_paper.subject_name} {question_result.question_no}번이 중복입니다."))
            continue
        seen_questions.add(question_result.question_no)
        current_paper.questions.append(question_result)

    if not exam.get("title"):
        errors.append(issue(1, "MISSING_EXAM_TITLE", "시험명이 필요합니다."))

    for paper in papers:
        if not paper.subject_code:
            errors.append(issue(paper.header_line, "MISSING_SUBJECT_CODE", f"{paper.subject_name} paper는 subject_code가 필요합니다."))
        if not paper.questions:
            errors.append(issue(paper.header_line, "MISSING_QUESTIONS", f"{paper.subject_name} paper는 문항이 필요합니다."))

    score_groups = build_score_groups(papers, warnings, errors)
    ordered_errors = sort_issues(errors)
    ordered_warnings = sort_issues(warnings)
    ok = not ordered_errors
    preview = make_preview(exam, score_groups) if ok else empty_preview()
    normalized_output = make_normalized_output(exam, score_groups) if ok else None
    return ParseResult(
        ok=ok,
        errors=ordered_errors,
        warnings=ordered_warnings,
        preview=preview,
        normalized_output=normalized_output,
    )
