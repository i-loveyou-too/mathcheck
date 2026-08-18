from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Literal


Decision = Literal["ACCEPT", "REJECT"]

ANSWER_DELIMITER_PATTERN = re.compile(r"[,/ㆍ·;|]+")
ANSWER_PAREN_PATTERN = re.compile(r"\([^)]*\)|\[[^\]]*\]")
SAFE_PUNCTUATION_PATTERN = re.compile(r"[\"'`.,!?;:()\[\]{}<>~]")
KOREAN_PARTICLE_SUFFIXES = sorted(
    [
        "으로",
        "로",
        "에게",
        "한테",
        "에서",
        "부터",
        "까지",
        "은",
        "는",
        "이",
        "가",
        "을",
        "를",
        "과",
        "와",
        "도",
        "만",
        "의",
        "에",
    ],
    key=len,
    reverse=True,
)
NEGATION_MARKERS = ("안", "못", "불", "무", "비", "없", "않", "아닌")
ANSWER_SIMILARITY_MIN_LENGTH = 3
ANSWER_SIMILARITY_THRESHOLD = 0.84
HANGUL_SYLLABLE_BASE = 0xAC00
HANGUL_SYLLABLE_LAST = 0xD7A3
HANGUL_CHOSUNG = list("ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ")
HANGUL_JUNGSUNG = list("ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ")
HANGUL_JONGSUNG = [""] + list("ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ")


@dataclass(frozen=True)
class GradingOutcome:
    is_correct: bool
    source: str
    matched_answer: str | None = None


def normalize_grading_text(value: str | None) -> str:
    text = (value or "").strip().casefold()
    text = SAFE_PUNCTUATION_PATTERN.sub("", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def compact_korean_spacing(value: str) -> str:
    return re.sub(r"\s+", "", normalize_grading_text(value))


def strip_korean_particle(value: str) -> str:
    for suffix in KOREAN_PARTICLE_SUFFIXES:
        if len(value) > len(suffix) + 1 and value.endswith(suffix):
            return value[: -len(suffix)]
    return value


def decompose_hangul(value: str) -> str:
    result: list[str] = []
    for char in value:
        code = ord(char)
        if HANGUL_SYLLABLE_BASE <= code <= HANGUL_SYLLABLE_LAST:
            offset = code - HANGUL_SYLLABLE_BASE
            cho, remainder = divmod(offset, 21 * 28)
            jung, jong = divmod(remainder, 28)
            result.append(HANGUL_CHOSUNG[cho])
            result.append(HANGUL_JUNGSUNG[jung])
            if HANGUL_JONGSUNG[jong]:
                result.append(HANGUL_JONGSUNG[jong])
        else:
            result.append(char)
    return "".join(result)


def answer_candidate_set(value: str | None) -> set[str]:
    if value is None:
        return set()
    variants = {value, ANSWER_PAREN_PATTERN.sub("", value)}
    candidates: set[str] = set()
    for variant in variants:
        normalized = normalize_grading_text(variant)
        if normalized:
            candidates.add(normalized)
            candidates.add(compact_korean_spacing(normalized))
        for part in ANSWER_DELIMITER_PATTERN.split(variant):
            normalized_part = normalize_grading_text(part)
            if normalized_part:
                candidates.add(normalized_part)
                candidates.add(compact_korean_spacing(normalized_part))
    candidates |= {strip_korean_particle(candidate) for candidate in list(candidates)}
    return {candidate for candidate in candidates if candidate}


def has_negation_mismatch(input_answer: str, accepted_answer: str) -> bool:
    left = compact_korean_spacing(input_answer)
    right = compact_korean_spacing(accepted_answer)
    return any((marker in left) != (marker in right) for marker in NEGATION_MARKERS)


def levenshtein_distance(left: str, right: str) -> int:
    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)
    previous = list(range(len(right) + 1))
    for left_index, left_char in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_char in enumerate(right, start=1):
            current.append(
                min(
                    previous[right_index] + 1,
                    current[right_index - 1] + 1,
                    previous[right_index - 1] + (left_char != right_char),
                )
            )
        previous = current
    return previous[-1]


def is_safe_typo_match(input_answer: str | None, accepted_answers: list[str]) -> bool:
    raw_input = normalize_grading_text(input_answer)
    if len(compact_korean_spacing(raw_input)) < ANSWER_SIMILARITY_MIN_LENGTH:
        return False
    input_compact = compact_korean_spacing(raw_input)
    for accepted in accepted_answers:
        for candidate in answer_candidate_set(accepted):
            accepted_compact = compact_korean_spacing(candidate)
            if len(accepted_compact) < ANSWER_SIMILARITY_MIN_LENGTH:
                continue
            if has_negation_mismatch(input_compact, accepted_compact):
                continue
            distance = levenshtein_distance(input_compact, accepted_compact)
            if distance == 1 and min(len(input_compact), len(accepted_compact)) >= 3:
                ratio = SequenceMatcher(None, decompose_hangul(input_compact), decompose_hangul(accepted_compact)).ratio()
                if ratio >= ANSWER_SIMILARITY_THRESHOLD:
                    return True
    return False


def deterministic_grade(input_answer: str | None, accepted_answers: list[str]) -> GradingOutcome:
    raw_input = (input_answer or "").strip()
    if not raw_input or not accepted_answers:
        return GradingOutcome(False, "blank" if not raw_input else "no_answer")
    if raw_input in accepted_answers:
        return GradingOutcome(True, "exact", raw_input)
    input_candidates = answer_candidate_set(raw_input)
    accepted_candidates: set[str] = set()
    for answer in accepted_answers:
        accepted_candidates |= answer_candidate_set(answer)
    overlap = input_candidates & accepted_candidates
    if overlap:
        return GradingOutcome(True, "normalized", sorted(overlap)[0])
    if is_safe_typo_match(raw_input, accepted_answers):
        return GradingOutcome(True, "safe_typo")
    return GradingOutcome(False, "unresolved")
