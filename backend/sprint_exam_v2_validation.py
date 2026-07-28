from __future__ import annotations

from datetime import date
import re
from typing import Any
from urllib.parse import parse_qs, urlparse


VALID_CODE_RE = re.compile(r"^[a-z0-9_]+$")
VALID_AGGREGATION_TYPES = {"sum", "standalone"}
VALID_PAPER_ROLES = {"common", "elective", "inquiry_slot", "standalone"}
VALID_QUESTION_TYPES = {"choice", "short_answer"}
VALID_GRADE_CUT_TYPES = {"raw_score_min", "absolute_band"}
VALID_SLOTS = {"inquiry_1", "inquiry_2"}
YOUTUBE_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,128}$")


class SprintExamV2DomainError(ValueError):
    def __init__(self, code: str, message: str, path: str | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.path = path

    def detail(self) -> dict[str, str]:
        result = {"code": self.code, "message": self.message}
        if self.path:
            result["path"] = self.path
        return result


def _as_date(value: Any, path: str) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise SprintExamV2DomainError("INVALID_EXAM_DATE", "시험일 형식이 올바르지 않습니다.", path) from exc
    raise SprintExamV2DomainError("INVALID_EXAM_DATE", "시험일 형식이 올바르지 않습니다.", path)


def normalize_exam_input(exam: dict[str, Any]) -> dict[str, Any]:
    title = str(exam.get("title") or "").strip()
    if not title:
        raise SprintExamV2DomainError("MISSING_EXAM_TITLE", "시험명은 필수입니다.", "exam.title")

    return {
        "title": title,
        "exam_date": _as_date(exam.get("exam_date"), "exam.exam_date"),
        "source_label": exam.get("source_label"),
        "description": exam.get("description"),
        "metadata": exam.get("metadata") or {},
    }


def _normalize_code(value: Any, code: str, message: str, path: str) -> str:
    normalized = str(value or "").strip()
    if not normalized or not VALID_CODE_RE.fullmatch(normalized):
        raise SprintExamV2DomainError(code, message, path)
    return normalized


def _normalize_text(value: Any, code: str, message: str, path: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise SprintExamV2DomainError(code, message, path)
    return normalized


def normalize_youtube_url(value: Any, path: str) -> str | None:
    if value in (None, ""):
        return None
    url = str(value).strip()
    if not url:
        return None
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise SprintExamV2DomainError("INVALID_LISTENING_YOUTUBE_URL", "Only https YouTube URLs are allowed.", path)

    host = parsed.netloc.lower()
    video_id: str | None = None
    if host == "www.youtube.com" and parsed.path == "/watch":
        values = parse_qs(parsed.query).get("v") or []
        video_id = values[0] if len(values) == 1 else None
    elif host == "www.youtube.com" and parsed.path.startswith("/embed/"):
        parts = [part for part in parsed.path.split("/") if part]
        video_id = parts[1] if len(parts) == 2 and parts[0] == "embed" else None
    elif host == "youtu.be":
        parts = [part for part in parsed.path.split("/") if part]
        video_id = parts[0] if len(parts) == 1 else None

    if not video_id or not YOUTUBE_VIDEO_ID_RE.fullmatch(video_id):
        raise SprintExamV2DomainError("INVALID_LISTENING_YOUTUBE_URL", "YouTube video URL is invalid.", path)
    return url


DRIVE_FILE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{10,100}$")
DRIVE_FILE_URL_RE = re.compile(r"drive\.google\.com/file/d/([A-Za-z0-9_-]{10,100})")


def extract_drive_file_id(value: Any, path: str) -> str | None:
    """정답지 Drive 링크 입력을 파일 ID로 정규화한다.
    지원 형식: /file/d/{ID}/view..., /file/d/{ID}/preview, 또는 순수 파일 ID."""
    if value in (None, ""):
        return None
    text = str(value).strip()
    if not text:
        return None
    match = DRIVE_FILE_URL_RE.search(text)
    if match:
        return match.group(1)
    if DRIVE_FILE_ID_RE.fullmatch(text):
        return text
    raise SprintExamV2DomainError(
        "INVALID_DRIVE_LINK",
        "Google Drive 링크 또는 파일 ID 형식이 올바르지 않습니다.",
        path,
    )


def _normalize_positive_int(value: Any, code: str, message: str, path: str) -> int:
    if isinstance(value, bool):
        raise SprintExamV2DomainError(code, message, path)
    try:
        normalized = int(value)
    except (TypeError, ValueError) as exc:
        raise SprintExamV2DomainError(code, message, path) from exc
    if normalized <= 0:
        raise SprintExamV2DomainError(code, message, path)
    return normalized


def _normalize_non_negative_int(value: Any, code: str, message: str, path: str) -> int:
    if isinstance(value, bool):
        raise SprintExamV2DomainError(code, message, path)
    try:
        normalized = int(value)
    except (TypeError, ValueError) as exc:
        raise SprintExamV2DomainError(code, message, path) from exc
    if normalized < 0:
        raise SprintExamV2DomainError(code, message, path)
    return normalized


def normalize_question_input(question: dict[str, Any], path: str) -> dict[str, Any]:
    question_no = _normalize_positive_int(
        question.get("question_no"),
        "INVALID_QUESTION_NO",
        "문항 번호는 1 이상의 정수여야 합니다.",
        f"{path}.question_no",
    )
    question_type = str(question.get("question_type") or "").strip()
    if question_type not in VALID_QUESTION_TYPES:
        raise SprintExamV2DomainError("INVALID_QUESTION_TYPE", "문항 유형이 올바르지 않습니다.", f"{path}.question_type")

    raw_answers = question.get("correct_answers")
    if not isinstance(raw_answers, list) or not raw_answers:
        raise SprintExamV2DomainError("MISSING_CORRECT_ANSWERS", "정답은 하나 이상이어야 합니다.", f"{path}.correct_answers")
    correct_answers: list[str] = []
    seen_answers: set[str] = set()
    for index, answer in enumerate(raw_answers):
        normalized = str(answer or "").strip()
        if not normalized:
            raise SprintExamV2DomainError("EMPTY_CORRECT_ANSWER", "빈 정답은 허용하지 않습니다.", f"{path}.correct_answers[{index}]")
        if question_type == "choice" and normalized not in {"1", "2", "3", "4", "5"}:
            raise SprintExamV2DomainError("INVALID_CHOICE_ANSWER", "객관식 정답은 1~5만 허용합니다.", f"{path}.correct_answers[{index}]")
        if normalized not in seen_answers:
            seen_answers.add(normalized)
            correct_answers.append(normalized)

    return {
        "question_no": question_no,
        "question_type": question_type,
        "correct_answers": correct_answers,
        "score": _normalize_positive_int(
            question.get("score"),
            "INVALID_QUESTION_SCORE",
            "문항 배점은 1 이상의 정수여야 합니다.",
            f"{path}.score",
        ),
        "metadata": question.get("metadata") or {},
    }


def normalize_grade_cut_input(grade_cut: dict[str, Any], path: str) -> dict[str, Any]:
    cut_type = str(grade_cut.get("cut_type") or "raw_score_min").strip()
    if cut_type not in VALID_GRADE_CUT_TYPES:
        raise SprintExamV2DomainError("INVALID_GRADE_CUT_TYPE", "등급컷 유형이 올바르지 않습니다.", f"{path}.cut_type")
    return {
        "grade": _normalize_positive_int(
            grade_cut.get("grade"),
            "INVALID_GRADE_CUT_GRADE",
            "등급은 1 이상의 정수여야 합니다.",
            f"{path}.grade",
        ),
        "min_score": _normalize_non_negative_int(
            grade_cut.get("min_score"),
            "INVALID_GRADE_CUT_MIN_SCORE",
            "등급컷 점수는 0 이상의 정수여야 합니다.",
            f"{path}.min_score",
        ),
        "cut_type": cut_type,
        "metadata": grade_cut.get("metadata") or {},
    }


def normalize_paper_input(paper: dict[str, Any], path: str) -> dict[str, Any]:
    paper_role = str(paper.get("paper_role") or "").strip()
    if paper_role not in VALID_PAPER_ROLES:
        raise SprintExamV2DomainError("INVALID_PAPER_ROLE", "Invalid paper role.", f"{path}.paper_role")

    slot = paper.get("slot")
    if slot in ("", None):
        slot = None
    if slot is not None and slot not in VALID_SLOTS:
        raise SprintExamV2DomainError("INVALID_PAPER_SLOT", "Invalid paper slot.", f"{path}.slot")
    if paper_role == "inquiry_slot" and slot is None:
        raise SprintExamV2DomainError("MISSING_INQUIRY_SLOT", "Inquiry slot paper requires slot.", f"{path}.slot")
    if paper_role != "inquiry_slot" and slot is not None:
        raise SprintExamV2DomainError("INVALID_PAPER_SLOT", "Only inquiry slot papers may define slot.", f"{path}.slot")

    questions_raw = paper.get("questions")
    if not isinstance(questions_raw, list) or not questions_raw:
        raise SprintExamV2DomainError("MISSING_QUESTIONS", "Paper requires at least one question.", f"{path}.questions")

    questions: list[dict[str, Any]] = []
    seen_question_numbers: set[int] = set()
    for index, question in enumerate(questions_raw):
        normalized = normalize_question_input(question, f"{path}.questions[{index}]")
        if normalized["question_no"] in seen_question_numbers:
            raise SprintExamV2DomainError("DUPLICATE_QUESTION_NO", "Question number is duplicated in the paper.", f"{path}.questions[{index}].question_no")
        seen_question_numbers.add(normalized["question_no"])
        questions.append(normalized)

    subject_code = _normalize_code(
        paper.get("subject_code"),
        "INVALID_SUBJECT_CODE",
        "Invalid subject_code.",
        f"{path}.subject_code",
    )
    listening_youtube_url = normalize_youtube_url(paper.get("listening_youtube_url"), f"{path}.listening_youtube_url")
    if listening_youtube_url and subject_code != "english":
        raise SprintExamV2DomainError(
            "LISTENING_YOUTUBE_URL_REQUIRES_ENGLISH",
            "listening_youtube_url is only allowed on the English paper.",
            f"{path}.listening_youtube_url",
        )

    return {
        "subject_code": subject_code,
        "subject_name": _normalize_text(
            paper.get("subject_name"),
            "MISSING_SUBJECT_NAME",
            "subject_name is required.",
            f"{path}.subject_name",
        ),
        "paper_role": paper_role,
        "slot": slot,
        "display_order": int(paper.get("display_order") or 0),
        "metadata": paper.get("metadata") or {},
        "listening_youtube_url": listening_youtube_url,
        "questions": questions,
        "question_count": len(questions),
        "paper_max_score": sum(question["score"] for question in questions),
    }

def calculate_assignment_max_score(group: dict[str, Any]) -> int | None:
    papers = group["papers"]
    if group["aggregation_type"] == "sum":
        common_papers = [paper for paper in papers if paper["paper_role"] == "common"]
        elective_papers = [paper for paper in papers if paper["paper_role"] == "elective"]
        common_score = common_papers[0]["paper_max_score"] if common_papers else 0
        if not elective_papers:
            return common_score
        elective_scores = {paper["paper_max_score"] for paper in elective_papers}
        if len(elective_scores) != 1:
            return None
        return common_score + next(iter(elective_scores))
    if len(papers) == 1:
        return papers[0]["paper_max_score"]
    return None


def _validate_group_composition(group: dict[str, Any], path: str) -> None:
    papers = group["papers"]
    if group["aggregation_type"] == "sum":
        common_papers = [paper for paper in papers if paper["paper_role"] == "common"]
        invalid_roles = [paper for paper in papers if paper["paper_role"] not in {"common", "elective"}]
        if len(common_papers) > 1:
            raise SprintExamV2DomainError("MULTIPLE_COMMON_PAPERS", "sum 점수그룹에는 common paper가 최대 1개만 가능합니다.", f"{path}.papers")
        if invalid_roles:
            raise SprintExamV2DomainError("INVALID_SUM_GROUP_PAPER_ROLE", "sum 점수그룹에는 common/elective paper만 포함할 수 있습니다.", f"{path}.papers")
        if not common_papers and not papers:
            raise SprintExamV2DomainError("INVALID_SCORE_GROUP_COMPOSITION", "점수그룹 구성이 올바르지 않습니다.", f"{path}.papers")
    else:
        if len(papers) != 1:
            raise SprintExamV2DomainError("STANDALONE_GROUP_MULTIPLE_PAPERS", "standalone 점수그룹에는 paper가 정확히 1개여야 합니다.", f"{path}.papers")


def _validate_grade_cut_order(grade_cuts: list[dict[str, Any]], path: str) -> None:
    by_type: dict[str, list[dict[str, Any]]] = {}
    for cut in grade_cuts:
        by_type.setdefault(cut["cut_type"], []).append(cut)
    for cut_type, cuts in by_type.items():
        previous_score: int | None = None
        for cut in sorted(cuts, key=lambda item: item["grade"]):
            if previous_score is not None and cut["min_score"] >= previous_score:
                raise SprintExamV2DomainError("INVALID_GRADE_CUT_ORDER", "등급컷 점수 순서가 올바르지 않습니다.", path)
            previous_score = cut["min_score"]


def normalize_score_group_input(group: dict[str, Any], path: str) -> dict[str, Any]:
    aggregation_type = str(group.get("aggregation_type") or "").strip()
    if aggregation_type not in VALID_AGGREGATION_TYPES:
        raise SprintExamV2DomainError("INVALID_AGGREGATION_TYPE", "aggregation_type은 sum 또는 standalone이어야 합니다.", f"{path}.aggregation_type")

    papers_raw = group.get("papers")
    if not isinstance(papers_raw, list) or not papers_raw:
        raise SprintExamV2DomainError("MISSING_PAPERS", "점수그룹에는 시험지가 하나 이상 필요합니다.", f"{path}.papers")

    papers: list[dict[str, Any]] = []
    seen_subject_keys: set[tuple[str, str | None]] = set()
    for index, paper in enumerate(papers_raw):
        normalized = normalize_paper_input(paper, f"{path}.papers[{index}]")
        subject_key = (normalized["subject_code"], normalized["slot"])
        if subject_key in seen_subject_keys:
            raise SprintExamV2DomainError("DUPLICATE_SUBJECT_CODE", "점수그룹 안에서 subject_code와 slot 조합이 중복되었습니다.", f"{path}.papers[{index}].subject_code")
        seen_subject_keys.add(subject_key)
        papers.append(normalized)

    grade_cuts_raw = group.get("grade_cuts") or []
    if not isinstance(grade_cuts_raw, list):
        raise SprintExamV2DomainError("INVALID_GRADE_CUTS", "grade_cuts는 배열이어야 합니다.", f"{path}.grade_cuts")
    grade_cuts: list[dict[str, Any]] = []
    seen_grade_cuts: set[tuple[int, str]] = set()
    for index, grade_cut in enumerate(grade_cuts_raw):
        normalized = normalize_grade_cut_input(grade_cut, f"{path}.grade_cuts[{index}]")
        grade_key = (normalized["grade"], normalized["cut_type"])
        if grade_key in seen_grade_cuts:
            raise SprintExamV2DomainError("DUPLICATE_GRADE_CUT", "점수그룹 안에서 등급컷이 중복되었습니다.", f"{path}.grade_cuts[{index}]")
        seen_grade_cuts.add(grade_key)
        grade_cuts.append(normalized)

    normalized_group = {
        "score_group_code": _normalize_code(
            group.get("score_group_code"),
            "INVALID_SCORE_GROUP_CODE",
            "score_group_code 형식이 올바르지 않습니다.",
            f"{path}.score_group_code",
        ),
        "score_group_name": _normalize_text(
            group.get("score_group_name"),
            "MISSING_SCORE_GROUP_NAME",
            "score_group_name은 필수입니다.",
            f"{path}.score_group_name",
        ),
        "subject_area": _normalize_code(
            group.get("subject_area"),
            "INVALID_SUBJECT_AREA",
            "subject_area 형식이 올바르지 않습니다.",
            f"{path}.subject_area",
        ),
        "aggregation_type": aggregation_type,
        "display_order": int(group.get("display_order") or 0),
        "metadata": group.get("metadata") or {},
        "grade_cuts": grade_cuts,
        "papers": papers,
    }
    _validate_group_composition(normalized_group, path)
    _validate_grade_cut_order(grade_cuts, f"{path}.grade_cuts")
    normalized_group["source_paper_score_sum"] = sum(paper["paper_max_score"] for paper in papers)
    normalized_group["assignment_max_score"] = calculate_assignment_max_score(normalized_group)
    return normalized_group


def normalize_exam_structure_payload(payload: dict[str, Any], *, allow_missing_score_groups: bool = False) -> dict[str, Any]:
    if "exam" not in payload or not isinstance(payload["exam"], dict):
        raise SprintExamV2DomainError("MISSING_EXAM", "exam 객체는 필수입니다.", "exam")
    normalized_exam = normalize_exam_input(payload["exam"])

    score_groups_raw = payload.get("score_groups")
    if score_groups_raw is None:
        if allow_missing_score_groups:
            return {"exam": normalized_exam, "score_groups": None}
        raise SprintExamV2DomainError("MISSING_SCORE_GROUPS", "score_groups는 필수입니다.", "score_groups")
    if not isinstance(score_groups_raw, list) or not score_groups_raw:
        raise SprintExamV2DomainError("MISSING_SCORE_GROUPS", "score_groups는 비어 있을 수 없습니다.", "score_groups")

    score_groups: list[dict[str, Any]] = []
    seen_group_codes: set[str] = set()
    seen_exam_papers: set[tuple[str, str | None]] = set()
    for index, score_group in enumerate(score_groups_raw):
        normalized = normalize_score_group_input(score_group, f"score_groups[{index}]")
        if normalized["score_group_code"] in seen_group_codes:
            raise SprintExamV2DomainError("DUPLICATE_SCORE_GROUP_CODE", "시험 안에서 점수그룹 코드가 중복되었습니다.", f"score_groups[{index}].score_group_code")
        seen_group_codes.add(normalized["score_group_code"])
        for paper in normalized["papers"]:
            paper_key = (paper["subject_code"], paper["slot"])
            if paper_key in seen_exam_papers:
                raise SprintExamV2DomainError("DUPLICATE_SUBJECT_CODE", "시험 안에서 subject_code와 slot 조합이 중복되었습니다.", f"score_groups[{index}].papers")
            seen_exam_papers.add(paper_key)
        score_groups.append(normalized)

    return {"exam": normalized_exam, "score_groups": score_groups}


def summarize_structure(score_groups: list[dict[str, Any]]) -> dict[str, int]:
    papers = [paper for group in score_groups for paper in group["papers"]]
    return {
        "total_score_group_count": len(score_groups),
        "total_paper_count": len(papers),
        "total_question_count": sum(len(paper["questions"]) for paper in papers),
        "source_paper_score_sum": sum(group["source_paper_score_sum"] for group in score_groups),
    }
