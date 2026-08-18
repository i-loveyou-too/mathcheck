from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Any, Literal

from fastapi import HTTPException


logger = logging.getLogger(__name__)

GEMINI_VOCAB_DEFAULT_MODEL = "gemini-2.5-flash-lite"
GEMINI_VOCAB_CHUNK_SIZE = 30
GEMINI_CORRECT_CONFIDENCE = 0.90
GEMINI_ACCEPTABLE_CONFIDENCE = 0.90
GEMINI_WRONG_CONFIDENCE = 0.95
GEMINI_BLOCKING_RISK_FLAGS = {
    "TOO_BROAD",
    "TOO_NARROW",
    "NEGATION",
    "AMBIGUOUS_POLYSEMY",
    "PARTIAL_OVERLAP",
}
GEMINI_RISK_FLAGS = sorted(GEMINI_BLOCKING_RISK_FLAGS | {"PART_OF_SPEECH_MISMATCH"})
GEMINI_VERDICTS = {"CORRECT", "ACCEPTABLE", "WRONG", "REVIEW"}

VOCABULARY_GEMINI_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "review_id": {"type": "integer"},
                    "verdict": {"type": "string", "enum": sorted(GEMINI_VERDICTS)},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "normalized_answer": {"type": "string"},
                    "reason": {"type": "string"},
                    "risk_flags": {
                        "type": "array",
                        "items": {"type": "string", "enum": GEMINI_RISK_FLAGS},
                    },
                },
                "required": [
                    "review_id",
                    "verdict",
                    "confidence",
                    "normalized_answer",
                    "reason",
                    "risk_flags",
                ],
            },
        }
    },
    "required": ["results"],
}

VOCABULARY_GEMINI_PROMPT = """You are a strict assistant for Korean high-school English vocabulary grading.
Decide whether each Korean student answer is equivalent enough to the registered Korean meanings.
Accept natural synonyms, common translations, particles/endings/spacing differences, and minor typos that do not change meaning.
Do not reject only because of a part-of-speech difference. If the core meaning is the same and a Korean high-school vocabulary test would commonly accept it, use ACCEPTABLE.
If a part-of-speech difference also changes the core meaning, use WRONG or REVIEW.
Reject related-only words, partial overlap, too broad/narrow concepts, negation changes, antonyms, and changed core meanings.
If uncertain, use REVIEW. Return short Korean reasons only."""


@dataclass(frozen=True)
class GeminiReviewResult:
    review_id: int
    verdict: Literal["CORRECT", "ACCEPTABLE", "WRONG", "REVIEW"]
    confidence: float
    normalized_answer: str
    reason: str
    risk_flags: list[str]


def gemini_model_name() -> str:
    return os.getenv("GEMINI_VOCAB_MODEL") or GEMINI_VOCAB_DEFAULT_MODEL


def should_auto_apply_gemini(result: GeminiReviewResult) -> Literal["correct", "acceptable", "wrong", "review"]:
    if GEMINI_BLOCKING_RISK_FLAGS.intersection(result.risk_flags):
        return "review"
    if result.verdict == "CORRECT" and result.confidence >= GEMINI_CORRECT_CONFIDENCE:
        return "correct"
    if result.verdict == "ACCEPTABLE" and result.confidence >= GEMINI_ACCEPTABLE_CONFIDENCE:
        return "acceptable"
    if result.verdict == "WRONG" and result.confidence >= GEMINI_WRONG_CONFIDENCE:
        return "wrong"
    return "review"


def _parse_gemini_payload(payload: str) -> list[GeminiReviewResult]:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ValueError("Gemini returned invalid JSON.") from exc
    results = data.get("results")
    if not isinstance(results, list):
        raise ValueError("Gemini response is missing results.")
    parsed: list[GeminiReviewResult] = []
    for item in results:
        verdict = item.get("verdict")
        confidence = float(item.get("confidence", 0))
        risk_flags = item.get("risk_flags") or []
        if verdict not in GEMINI_VERDICTS or not isinstance(risk_flags, list):
            raise ValueError("Gemini response does not match schema.")
        parsed.append(
            GeminiReviewResult(
                review_id=int(item["review_id"]),
                verdict=verdict,
                confidence=max(0.0, min(1.0, confidence)),
                normalized_answer=str(item.get("normalized_answer") or ""),
                reason=str(item.get("reason") or "")[:300],
                risk_flags=[flag for flag in risk_flags if flag in GEMINI_RISK_FLAGS],
            )
        )
    return parsed


def _extract_gemini_status_code(exc: Exception) -> int | str | None:
    for attr in ("status_code", "code"):
        value = getattr(exc, attr, None)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return value
    response = getattr(exc, "response", None)
    response_status = getattr(response, "status_code", None)
    if isinstance(response_status, int):
        return response_status
    if isinstance(response_status, str) and response_status.isdigit():
        return response_status
    status = getattr(exc, "status", None)
    if isinstance(status, int):
        return status
    if isinstance(status, str) and status.isdigit():
        return status
    return None


def _safe_gemini_error_message(exc: Exception) -> str:
    raw_message = getattr(exc, "message", None) or str(exc)
    message = " ".join(str(raw_message).split())
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        message = message.replace(api_key, "[REDACTED]")
    message = re.sub(r"(?i)\bbearer\s+[A-Za-z0-9._~+/-]+=*", "Bearer [REDACTED]", message)
    return re.sub(
        r"(?i)\b(api[_-]?key|key|token|authorization|password)\s*[:=]\s*[^&\s,;]+",
        r"\1=[REDACTED]",
        message,
    )


def review_vocabulary_answers_with_gemini(items: list[dict[str, Any]]) -> list[GeminiReviewResult]:
    if not items:
        return []
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API key is not configured.")
    try:
        from google import genai
    except Exception as exc:  # pragma: no cover - dependency/environment guard
        raise HTTPException(status_code=500, detail="Gemini SDK is not installed.") from exc

    client = genai.Client(api_key=api_key)
    prompt = {
        "instruction": VOCABULARY_GEMINI_PROMPT,
        "items": items,
    }
    model = gemini_model_name()
    try:
        interaction = client.interactions.create(
            model=model,
            input=json.dumps(prompt, ensure_ascii=False),
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": VOCABULARY_GEMINI_SCHEMA,
            },
        )
        return _parse_gemini_payload(interaction.output_text or "")
    except HTTPException:
        raise
    except Exception as exc:
        message = _safe_gemini_error_message(exc)
        logger.warning(
            "Gemini vocabulary review failed: model=%s, chunk_size=%s, error_type=%s, status=%s, message=%s",
            model,
            len(items),
            type(exc).__name__,
            _extract_gemini_status_code(exc),
            message,
        )
        if "429" in message or "RESOURCE_EXHAUSTED" in message or "quota" in message.lower():
            raise HTTPException(
                status_code=429,
                detail="Gemini free-tier quota or rate limit was reached.",
            ) from exc
        raise HTTPException(status_code=502, detail="Gemini review failed.") from exc
