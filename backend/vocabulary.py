from __future__ import annotations

import random
import re
from html import escape
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from database import get_db
from study_dates import get_study_date


router = APIRouter(tags=["Vocabulary"])
ACCUMULATION_TYPES = {"new_only", "all_previous", "recent_days", "fixed_cumulative"}
XLSX_NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
EBS_EN_TO_KO_SHEET = re.compile(r"Day(\d+)\(\uc601\u2192\ud55c\)")
EBS_KO_TO_EN_SHEET = re.compile(r"Day\d+\(\ud55c\u2192\uc601\)")


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).casefold()


def normalize_answers(values: list[str]) -> list[str]:
    answers: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = re.sub(r"\s+", " ", value.strip())
        normalized = normalize_text(cleaned)
        if normalized and normalized not in seen:
            answers.append(cleaned)
            seen.add(normalized)
    if not answers:
        raise HTTPException(status_code=400, detail="At least one accepted answer is required.")
    return answers


def parse_meanings(raw_meaning: str) -> tuple[list[str], list[str]]:
    warnings: list[str] = []
    candidates: list[str] = []
    for part in raw_meaning.split(","):
        cleaned = re.sub(r"\s+", " ", part.strip())
        if not cleaned:
            continue
        candidates.append(cleaned)
        without_notes = re.sub(r"\([^)]*\)", "", cleaned)
        without_notes = re.sub(r"\[[^\]]*\]", "", without_notes)
        without_notes = re.sub(r"\s+", " ", without_notes.strip())
        if without_notes and without_notes != cleaned:
            candidates.append(without_notes)
            warnings.append(f"optional note stripped: {cleaned}")
        bracket = re.search(r"^(.*)\[([^\]]+)\](.*)$", cleaned)
        if bracket:
            prefix, alt, suffix = bracket.groups()
            base = re.sub(r"\s+", " ", f"{prefix}{suffix}".strip())
            expanded = re.sub(r"\s+", " ", f"{alt}{suffix}".strip())
            if base:
                candidates.append(base)
            if expanded:
                candidates.append(expanded)
            warnings.append(f"bracket meaning expanded: {cleaned}")
    return normalize_answers(candidates), warnings


def xlsx_workbook(path: Path) -> dict:
    with ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        sheets = []
        for sheet in workbook.find("a:sheets", XLSX_NS):
            rel_id = sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            target = rel_map[rel_id].lstrip("/") if rel_id else ""
            sheet_path = f"xl/{target}" if not target.startswith("xl/") else target
            sheets.append({"name": sheet.attrib["name"], "path": sheet_path})
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("a:si", XLSX_NS):
                shared_strings.append("".join(text.text or "" for text in item.findall(".//a:t", XLSX_NS)))
        sheet_rows = {sheet["name"]: read_sheet_rows(archive, sheet["path"], shared_strings) for sheet in sheets}
    return {"sheets": sheets, "rows": sheet_rows}


def read_sheet_rows(archive: ZipFile, sheet_path: str, shared_strings: list[str]) -> list[dict[str, str]]:
    sheet = ET.fromstring(archive.read(sheet_path))

    def column_name(cell_ref: str) -> str:
        return re.sub(r"\d+", "", cell_ref)

    def cell_value(cell: ET.Element) -> str:
        if cell.attrib.get("t") == "inlineStr":
            return "".join(text.text or "" for text in cell.findall(".//a:t", XLSX_NS))
        value = cell.find("a:v", XLSX_NS)
        if value is None or value.text is None:
            return ""
        if cell.attrib.get("t") == "s":
            return shared_strings[int(value.text)]
        return value.text

    return [
        {column_name(cell.attrib["r"]): cell_value(cell) for cell in row.findall("a:c", XLSX_NS)}
        for row in sheet.findall(".//a:sheetData/a:row", XLSX_NS)
    ]


def parse_word_master_preview(path: Path, workbook: dict) -> dict:
    rows = workbook["rows"].get("Sheet1", [])
    headers = [rows[0].get(column, "").strip() for column in ["A", "B", "C", "D", "E"]] if rows else []
    expected = ["\ub2e8\uc5b4\uc7a5", "Index", "\ud56d\ubaa9", "\ub2e8\uc5b4", "\ub73b"]
    if headers != expected:
        raise HTTPException(status_code=400, detail=f"Required Word Master headers do not match: {headers}")
    parsed_rows = [
        {"title": row.get("A", ""), "index": row.get("B", ""), "day": row.get("C", ""), "english": row.get("D", ""), "meaning": row.get("E", "")}
        for row in rows[1:]
    ]
    errors: list[str] = []
    warnings: list[str] = []
    words: list[dict] = []
    seen_indexes: set[int] = set()
    seen_english: set[str] = set()
    day_counts: dict[int, int] = {}
    title = ""
    for row_number, row in enumerate(parsed_rows, start=2):
        title = title or row["title"].strip()
        english = re.sub(r"\s+", " ", row["english"].strip())
        meaning = row["meaning"].strip()
        try:
            order_index = int(str(row["index"]).strip())
        except ValueError:
            errors.append(f"row {row_number}: invalid Index")
            continue
        day_match = re.fullmatch(r"Day\s*(\d{1,2})", row["day"].strip(), flags=re.IGNORECASE)
        if not day_match:
            errors.append(f"row {row_number}: invalid Day")
            continue
        day_no = int(day_match.group(1))
        normalized = normalize_text(english)
        if order_index in seen_indexes:
            errors.append(f"row {row_number}: duplicate Index {order_index}")
        seen_indexes.add(order_index)
        if not english:
            errors.append(f"row {row_number}: missing english")
        if not meaning:
            errors.append(f"row {row_number}: missing meaning")
        if normalized in seen_english:
            errors.append(f"row {row_number}: duplicate english {english}")
        seen_english.add(normalized)
        accepted, row_warnings = parse_meanings(meaning) if meaning else ([], [])
        warnings.extend(f"row {row_number}: {warning}" for warning in row_warnings)
        day_counts[day_no] = day_counts.get(day_no, 0) + 1
        words.append(
            {
                "day_no": day_no,
                "order_index": order_index,
                "day_order": day_counts[day_no],
                "english": english,
                "normalized_english": normalized,
                "accepted_meanings": accepted,
                "raw_meaning": meaning,
            }
        )
    expected_indexes = set(range(1, 2001))
    missing_indexes = sorted(expected_indexes - seen_indexes)
    extra_indexes = sorted(seen_indexes - expected_indexes)
    if len(words) != 2000:
        errors.append(f"expected 2,000 rows, got {len(words)}")
    if missing_indexes:
        errors.append(f"missing Index values: {missing_indexes[:10]}")
    if extra_indexes:
        errors.append(f"out-of-range Index values: {extra_indexes[:10]}")
    for day_no in range(1, 51):
        if day_counts.get(day_no, 0) != 40:
            errors.append(f"Day {day_no:02d} expected 40 words, got {day_counts.get(day_no, 0)}")
    unknown_days = sorted(day for day in day_counts if day < 1 or day > 50)
    if unknown_days:
        errors.append(f"out-of-range Day values: {unknown_days}")
    return {
        "title": title,
        "source_format": "word_master_flat_sheet",
        "source_filename": path.name,
        "total_words": len(words),
        "total_rows": len(words),
        "total_days": 50,
        "words_per_day": 40,
        "default_daily_test_question_count": 100,
        "used_sheet_count": 1,
        "ignored_sheet_count": max(0, len(workbook["sheets"]) - 1),
        "duplicate_words": [],
        "day_counts": day_counts,
        "errors": errors,
        "warnings": warnings,
        "sample_words": words[:5],
        "words": words,
    }


def parse_ebs_meanings(raw_meaning: str) -> tuple[list[str], list[str]]:
    warnings: list[str] = []
    cleaned = re.sub(r"\([^)]*\)", "", raw_meaning)
    cleaned = re.sub(r"\b(?:prep|conj|pron|ad|n|v|a)\.", ",", cleaned)
    parts = [re.sub(r"\s+", " ", part.strip()) for part in cleaned.split(",")]
    candidates = [part for part in parts if part]
    if not candidates:
        warnings.append(f"meaning parse produced no candidates: {raw_meaning}")
    return normalize_answers(candidates), warnings


def parse_ebs_preview(path: Path, workbook: dict) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    words: list[dict] = []
    day_counts: dict[int, int] = {}
    seen_english: set[str] = set()
    duplicates: list[str] = []
    used_sheets = []
    ignored_sheets = []
    for sheet in workbook["sheets"]:
        name = sheet["name"]
        match = EBS_EN_TO_KO_SHEET.fullmatch(name)
        if not match:
            if EBS_KO_TO_EN_SHEET.fullmatch(name):
                ignored_sheets.append(name)
            continue
        day_no = int(match.group(1))
        used_sheets.append(name)
        rows = workbook["rows"].get(name, [])
        day_order_seen: set[int] = set()
        for row_index, row in enumerate(rows[1:31], start=2):
            try:
                day_order = int(str(row.get("A", "")).strip())
            except ValueError:
                errors.append(f"{name} row {row_index}: invalid day_order")
                continue
            english = re.sub(r"\s+", " ", row.get("B", "").strip())
            meaning = row.get("D", "").strip()
            normalized = normalize_text(english)
            if not english:
                errors.append(f"{name} row {row_index}: missing english")
            if not meaning:
                errors.append(f"{name} row {row_index}: missing meaning")
            if day_order in day_order_seen:
                errors.append(f"{name}: duplicate day_order {day_order}")
            day_order_seen.add(day_order)
            if normalized in seen_english:
                duplicates.append(english)
                errors.append(f"{name} row {row_index}: duplicate english {english}")
            seen_english.add(normalized)
            accepted, row_warnings = parse_ebs_meanings(meaning) if meaning else ([], [])
            warnings.extend(f"{name} row {row_index}: {warning}" for warning in row_warnings)
            day_counts[day_no] = day_counts.get(day_no, 0) + 1
            words.append({
                "day_no": day_no,
                "order_index": (day_no - 1) * 30 + day_order,
                "day_order": day_order,
                "english": english,
                "normalized_english": normalized,
                "accepted_meanings": accepted,
                "raw_meaning": meaning,
            })
    if len(used_sheets) != 60:
        errors.append(f"expected 60 EBS 영→한 sheets, got {len(used_sheets)}")
    if len(ignored_sheets) != 60:
        errors.append(f"expected 60 EBS 한→영 sheets ignored, got {len(ignored_sheets)}")
    if len(words) != 1800:
        errors.append(f"expected 1,800 rows, got {len(words)}")
    for day_no in range(1, 61):
        if day_counts.get(day_no, 0) != 30:
            errors.append(f"Day {day_no:02d} expected 30 words, got {day_counts.get(day_no, 0)}")
    unknown_days = sorted(day for day in day_counts if day < 1 or day > 60)
    if unknown_days:
        errors.append(f"out-of-range Day values: {unknown_days}")
    return {
        "title": "EBS 2027학년도 수능연계교재의 VOCA 1800",
        "source_format": "ebs_day_sheets",
        "source_filename": path.name,
        "total_words": len(words),
        "total_rows": len(words),
        "total_days": 60,
        "words_per_day": 30,
        "default_daily_test_question_count": 100,
        "used_sheet_count": len(used_sheets),
        "ignored_sheet_count": len(ignored_sheets),
        "duplicate_words": duplicates,
        "day_counts": day_counts,
        "errors": errors,
        "warnings": warnings,
        "sample_words": words[:5],
        "words": words,
    }


def preview_bank_xlsx(path: Path) -> dict:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"XLSX file not found: {path}")
    workbook = xlsx_workbook(path)
    sheet_names = [sheet["name"] for sheet in workbook["sheets"]]
    if "Sheet1" in sheet_names:
        rows = workbook["rows"].get("Sheet1", [])
        headers = [rows[0].get(column, "").strip() for column in ["A", "B", "C", "D", "E"]] if rows else []
        if headers == ["\ub2e8\uc5b4\uc7a5", "Index", "\ud56d\ubaa9", "\ub2e8\uc5b4", "\ub73b"]:
            return parse_word_master_preview(path, workbook)
    if any(EBS_EN_TO_KO_SHEET.fullmatch(name) for name in sheet_names):
        return parse_ebs_preview(path, workbook)
    raise HTTPException(status_code=400, detail="Unsupported vocabulary bank source format.")


class ChallengeIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    student_id: int
    start_date: date
    end_date: date
    accumulation_type: Literal["new_only", "all_previous", "recent_days", "fixed_cumulative"] = "all_previous"
    recent_days: int | None = Field(default=None, ge=1, le=365)
    source_type: Literal["direct", "word_bank"] = "direct"
    word_bank_id: int | None = None
    daily_new_word_count: int = Field(default=40, ge=1, le=2000)
    daily_test_question_count: int = Field(default=100, ge=1, le=2000)
    bank_day_direction: Literal["ascending", "descending"] = "ascending"
    start_bank_day: int | None = Field(default=None, ge=1, le=365)
    bank_days_per_learning_day: int = Field(default=3, ge=1, le=30)
    max_question_count: int = Field(default=100, ge=1, le=2000)
    allow_student_answer_pdf: bool = False
    is_active: bool = True

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date cannot be earlier than start_date.")
        if self.accumulation_type == "recent_days" and not self.recent_days:
            raise ValueError("recent_days is required for recent_days accumulation.")
        if self.source_type == "word_bank" and self.word_bank_id is None:
            raise ValueError("word_bank_id is required for word_bank challenges.")
        if self.source_type == "word_bank":
            self.accumulation_type = "fixed_cumulative"
        return self


class ChallengeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    student_id: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    accumulation_type: Literal["new_only", "all_previous", "recent_days", "fixed_cumulative"] | None = None
    recent_days: int | None = Field(default=None, ge=1, le=365)
    source_type: Literal["direct", "word_bank"] | None = None
    word_bank_id: int | None = None
    daily_new_word_count: int | None = Field(default=None, ge=1, le=2000)
    daily_test_question_count: int | None = Field(default=None, ge=1, le=2000)
    bank_day_direction: Literal["ascending", "descending"] | None = None
    start_bank_day: int | None = Field(default=None, ge=1, le=365)
    bank_days_per_learning_day: int | None = Field(default=None, ge=1, le=30)
    max_question_count: int | None = Field(default=None, ge=1, le=2000)
    allow_student_answer_pdf: bool | None = None
    is_active: bool | None = None


class BankIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    total_words: int = Field(default=0, ge=0, le=100000)
    total_days: int = Field(default=50, ge=1, le=365)
    words_per_day: int = Field(default=40, ge=1, le=2000)
    default_daily_test_question_count: int = Field(default=100, ge=1, le=2000)
    source_filename: str | None = Field(default=None, max_length=255)
    source_format: str | None = Field(default=None, max_length=100)
    is_active: bool = True


class BankUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    total_words: int | None = Field(default=None, ge=0, le=100000)
    total_days: int | None = Field(default=None, ge=1, le=365)
    words_per_day: int | None = Field(default=None, ge=1, le=2000)
    default_daily_test_question_count: int | None = Field(default=None, ge=1, le=2000)
    source_filename: str | None = Field(default=None, max_length=255)
    source_format: str | None = Field(default=None, max_length=100)
    is_active: bool | None = None


class BankImportIn(BaseModel):
    storage_path: str = "storage/word_master_2000.xlsx"
    description: str | None = Field(default=None, max_length=500)


class BankWordUpdate(BaseModel):
    english: str | None = Field(default=None, min_length=1, max_length=200)
    accepted_meanings: list[str] | None = None
    raw_meaning: str | None = None
    memo: str | None = Field(default=None, max_length=300)


class WordIn(BaseModel):
    english: str = Field(min_length=1, max_length=200)
    accepted_answers: list[str]
    memo: str | None = Field(default=None, max_length=300)
    order_index: int = 0


class BulkWordsIn(BaseModel):
    words: list[WordIn] = Field(min_length=1)


class WordUpdate(BaseModel):
    english: str | None = Field(default=None, min_length=1, max_length=200)
    accepted_answers: list[str] | None = None
    memo: str | None = Field(default=None, max_length=300)
    order_index: int | None = None


class AssignmentIn(BaseModel):
    word_ids: list[int]


class SessionCreateIn(BaseModel):
    student_id: int
    study_date: date


class AnswerItemIn(BaseModel):
    question_id: int
    input_answer: str = Field(default="", max_length=1000)


class AnswersIn(BaseModel):
    student_id: int
    answers: list[AnswerItemIn]


class StudentActionIn(BaseModel):
    student_id: int


def storage_path_from_input(storage_path: str) -> Path:
    root = Path.cwd().resolve()
    candidate = (root / storage_path).resolve()
    storage_root = (root / "storage").resolve()
    if storage_root not in candidate.parents and candidate != storage_root:
        raise HTTPException(status_code=400, detail="Only files under storage are allowed.")
    return candidate


def get_challenge_or_404(db: Session, challenge_id: int) -> models.VocabularyChallenge:
    challenge = db.get(models.VocabularyChallenge, challenge_id)
    if challenge is None:
        raise HTTPException(status_code=404, detail="Vocabulary challenge not found.")
    return challenge


def get_student_or_404(db: Session, student_id: int) -> models.Student:
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found.")
    return student


def get_bank_or_404(db: Session, bank_id: int) -> models.VocabularyBank:
    bank = db.get(models.VocabularyBank, bank_id)
    if bank is None:
        raise HTTPException(status_code=404, detail="Vocabulary bank not found.")
    return bank


def ensure_no_active_overlap(
    db: Session,
    student_id: int,
    start_date: date,
    end_date: date,
    is_active: bool,
    exclude_id: int | None = None,
) -> None:
    if not is_active:
        return
    query = db.query(models.VocabularyChallenge).filter(
        models.VocabularyChallenge.student_id == student_id,
        models.VocabularyChallenge.is_active.is_(True),
        models.VocabularyChallenge.start_date <= end_date,
        models.VocabularyChallenge.end_date >= start_date,
    )
    if exclude_id is not None:
        query = query.filter(models.VocabularyChallenge.id != exclude_id)
    if query.first():
        raise HTTPException(status_code=400, detail="This student already has an overlapping active challenge.")


def bank_dict(db: Session, bank: models.VocabularyBank) -> dict:
    word_count = db.query(func.count(models.VocabularyBankWord.id)).filter_by(bank_id=bank.id).scalar() or 0
    return {
        "id": bank.id,
        "title": bank.title,
        "description": bank.description,
        "total_words": bank.total_words,
        "total_days": bank.total_days,
        "words_per_day": bank.words_per_day,
        "default_daily_test_question_count": bank.default_daily_test_question_count,
        "source_filename": bank.source_filename,
        "source_format": bank.source_format,
        "is_active": bank.is_active,
        "word_count": word_count,
        "created_at": bank.created_at,
        "updated_at": bank.updated_at,
    }


def bank_word_dict(word: models.VocabularyBankWord) -> dict:
    return {
        "id": word.id,
        "bank_id": word.bank_id,
        "day_no": word.day_no,
        "order_index": word.order_index,
        "day_order": word.day_order,
        "english": word.english,
        "accepted_meanings": word.accepted_meanings,
        "raw_meaning": word.raw_meaning,
        "part_of_speech": word.part_of_speech,
        "memo": word.memo,
    }


def challenge_dict(db: Session, challenge: models.VocabularyChallenge, include_words: bool = False) -> dict:
    student = db.get(models.Student, challenge.student_id)
    bank = db.get(models.VocabularyBank, challenge.word_bank_id) if challenge.word_bank_id else None
    payload = {
        "id": challenge.id,
        "name": challenge.name,
        "student_id": challenge.student_id,
        "student_name": student.name if student else "",
        "start_date": challenge.start_date,
        "end_date": challenge.end_date,
        "accumulation_type": challenge.accumulation_type,
        "recent_days": challenge.recent_days,
        "source_type": challenge.source_type,
        "word_bank_id": challenge.word_bank_id,
        "word_bank_title": bank.title if bank else None,
        "word_bank_total_days": bank.total_days if bank else None,
        "word_bank_words_per_day": bank.words_per_day if bank else None,
        "word_bank_default_daily_test_question_count": bank.default_daily_test_question_count if bank else None,
        "daily_new_word_count": challenge.daily_new_word_count,
        "daily_test_question_count": challenge.daily_test_question_count,
        "bank_day_direction": challenge.bank_day_direction,
        "start_bank_day": challenge.start_bank_day,
        "bank_days_per_learning_day": challenge.bank_days_per_learning_day,
        "max_question_count": challenge.max_question_count,
        "allow_student_answer_pdf": challenge.allow_student_answer_pdf,
        "is_active": challenge.is_active,
        "created_at": challenge.created_at,
    }
    if include_words:
        words = db.query(models.VocabularyWord).filter(
            models.VocabularyWord.challenge_id == challenge.id
        ).order_by(models.VocabularyWord.order_index, models.VocabularyWord.id).all()
        payload["words"] = [word_dict(word) for word in words]
    return payload


def word_dict(word: models.VocabularyWord) -> dict:
    return {
        "id": word.id,
        "challenge_id": word.challenge_id,
        "english": word.english,
        "accepted_answers": word.accepted_answers,
        "memo": word.memo,
        "order_index": word.order_index,
    }


def get_session_for_student(db: Session, session_id: int, student_id: int) -> models.VocabularyTestSession:
    session = db.get(models.VocabularyTestSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Vocabulary test session not found.")
    if session.student_id != student_id:
        raise HTTPException(status_code=403, detail="Cannot access another student's test.")
    return session


def assigned_word_ids(db: Session, challenge: models.VocabularyChallenge, study_date: date) -> set[int]:
    if challenge.accumulation_type == "new_only":
        range_start = study_date
    elif challenge.accumulation_type == "recent_days":
        range_start = max(challenge.start_date, study_date - timedelta(days=(challenge.recent_days or 1) - 1))
    else:
        range_start = challenge.start_date

    ids = {
        row[0]
        for row in db.query(models.VocabularyDailyAssignment.word_id).filter(
            models.VocabularyDailyAssignment.challenge_id == challenge.id,
            models.VocabularyDailyAssignment.assignment_date >= range_start,
            models.VocabularyDailyAssignment.assignment_date <= study_date,
        ).all()
    }
    unresolved = db.query(models.VocabularyWrongNote.word_id).join(
        models.VocabularyWord,
        models.VocabularyWrongNote.word_id == models.VocabularyWord.id,
    ).filter(
        models.VocabularyWrongNote.student_id == challenge.student_id,
        models.VocabularyWrongNote.status == "unresolved",
        models.VocabularyWrongNote.word_source_type == "direct",
        models.VocabularyWord.challenge_id == challenge.id,
    ).all()
    ids.update(row[0] for row in unresolved)
    return ids


def bank_day_no(challenge: models.VocabularyChallenge, study_date: date) -> int:
    return (study_date - challenge.start_date).days + 1


def challenge_learning_day(challenge: models.VocabularyChallenge, study_date: date) -> int:
    return (study_date - challenge.start_date).days + 1


def bank_day_sequence_for_learning_day(
    challenge: models.VocabularyChallenge,
    bank: models.VocabularyBank,
    study_date: date,
) -> list[int]:
    learning_day = challenge_learning_day(challenge, study_date)
    if learning_day < 1:
        return []
    per_day = challenge.bank_days_per_learning_day or 3
    start_day = challenge.start_bank_day or (bank.total_days if challenge.bank_day_direction == "descending" else 1)
    offset = (learning_day - 1) * per_day
    days: list[int] = []
    for index in range(per_day):
        day_no = start_day - offset - index if challenge.bank_day_direction == "descending" else start_day + offset + index
        if 1 <= day_no <= bank.total_days:
            days.append(day_no)
    return days


def cumulative_bank_day_sequence(
    challenge: models.VocabularyChallenge,
    bank: models.VocabularyBank,
    study_date: date,
) -> list[int]:
    learning_day = challenge_learning_day(challenge, study_date)
    if learning_day < 1:
        return []
    days: list[int] = []
    for day_index in range(learning_day):
        target_date = challenge.start_date + timedelta(days=day_index)
        days.extend(bank_day_sequence_for_learning_day(challenge, bank, target_date))
    return list(dict.fromkeys(days))


def bank_day_range_label(days: list[int]) -> str | None:
    if not days:
        return None
    if len(days) == 1:
        return f"DAY {days[0]}"
    return f"DAY {days[0]} ~ DAY {days[-1]}"


def vocabulary_day_info(db: Session, challenge: models.VocabularyChallenge, study_date: date) -> dict:
    bank = db.get(models.VocabularyBank, challenge.word_bank_id) if challenge.word_bank_id else None
    if challenge.source_type != "word_bank" or bank is None:
        return {
            "learning_day": challenge_learning_day(challenge, study_date),
            "new_bank_days": [],
            "cumulative_bank_days": [],
            "new_bank_day_label": None,
            "cumulative_bank_day_label": None,
            "cumulative_pool_count": question_count_for_date(db, challenge, study_date),
            "question_count": question_count_for_date(db, challenge, study_date),
        }
    new_days = bank_day_sequence_for_learning_day(challenge, bank, study_date)
    cumulative_days = cumulative_bank_day_sequence(challenge, bank, study_date)
    pool_count = db.query(func.count(models.VocabularyBankWord.id)).filter(
        models.VocabularyBankWord.bank_id == bank.id,
        models.VocabularyBankWord.day_no.in_(cumulative_days) if cumulative_days else False,
    ).scalar() or 0
    max_count = challenge.max_question_count or challenge.daily_test_question_count or bank.default_daily_test_question_count
    return {
        "learning_day": challenge_learning_day(challenge, study_date),
        "new_bank_days": new_days,
        "cumulative_bank_days": cumulative_days,
        "new_bank_day_label": bank_day_range_label(new_days),
        "cumulative_bank_day_label": bank_day_range_label(cumulative_days),
        "cumulative_pool_count": pool_count,
        "question_count": min(pool_count, max_count),
    }


def select_bank_words(db: Session, challenge: models.VocabularyChallenge, study_date: date) -> list[models.VocabularyBankWord]:
    if not challenge.word_bank_id:
        return []
    bank = db.get(models.VocabularyBank, challenge.word_bank_id)
    if bank is None:
        return []
    cumulative_days = cumulative_bank_day_sequence(challenge, bank, study_date)
    if not cumulative_days:
        return []
    limit = challenge.max_question_count or challenge.daily_test_question_count or bank.default_daily_test_question_count or 100
    words = db.query(models.VocabularyBankWord).filter(
        models.VocabularyBankWord.bank_id == challenge.word_bank_id,
        models.VocabularyBankWord.day_no.in_(cumulative_days),
    ).all()
    random.SystemRandom().shuffle(words)
    return words[:min(len(words), limit)]


def question_count_for_date(db: Session, challenge: models.VocabularyChallenge, study_date: date) -> int:
    if challenge.source_type == "word_bank":
        return len(select_bank_words(db, challenge, study_date))
    return len(assigned_word_ids(db, challenge, study_date))


def new_word_count_for_date(db: Session, challenge: models.VocabularyChallenge, study_date: date) -> int:
    if challenge.source_type != "word_bank" or not challenge.word_bank_id:
        return 0
    bank = db.get(models.VocabularyBank, challenge.word_bank_id)
    if bank is None:
        return 0
    days = bank_day_sequence_for_learning_day(challenge, bank, study_date)
    if not days:
        return 0
    return db.query(func.count(models.VocabularyBankWord.id)).filter(
        models.VocabularyBankWord.bank_id == bank.id,
        models.VocabularyBankWord.day_no.in_(days),
    ).scalar() or 0


def serialize_session(db: Session, session: models.VocabularyTestSession, include_result: bool = False) -> dict:
    questions = db.query(models.VocabularyTestQuestion).filter(
        models.VocabularyTestQuestion.session_id == session.id
    ).order_by(models.VocabularyTestQuestion.order_index).all()
    answer_rows = db.query(models.VocabularyTestAnswer).filter(
        models.VocabularyTestAnswer.session_id == session.id
    ).all()
    answers = {answer.question_id: answer for answer in answer_rows}
    items = []
    for question in questions:
        answer = answers.get(question.id)
        item = {
            "id": question.id,
            "order_index": question.order_index,
            "english": question.english_snapshot,
            "input_answer": answer.input_answer if answer else "",
        }
        if include_result and session.status == "submitted":
            item.update({
                "accepted_answers": question.accepted_answers_snapshot,
                "is_correct": bool(answer and answer.is_correct),
            })
        items.append(item)
    challenge = db.get(models.VocabularyChallenge, session.challenge_id)
    student = db.get(models.Student, session.student_id)
    bank = db.get(models.VocabularyBank, challenge.word_bank_id) if challenge and challenge.word_bank_id else None
    day_info = vocabulary_day_info(db, challenge, session.study_date) if challenge else {}
    return {
        "id": session.id,
        "challenge_id": session.challenge_id,
        "challenge_name": challenge.name if challenge else "",
        "student_name": student.name if student else "",
        "word_bank_title": bank.title if bank else None,
        "student_id": session.student_id,
        "study_date": session.study_date,
        "learning_day": day_info.get("learning_day"),
        "new_bank_day_label": day_info.get("new_bank_day_label"),
        "cumulative_bank_day_label": day_info.get("cumulative_bank_day_label"),
        "cumulative_pool_count": day_info.get("cumulative_pool_count"),
        "actual_question_count": len(questions),
        "session_type": session.session_type,
        "status": session.status,
        "score": session.score,
        "correct_count": session.correct_count,
        "total_count": session.total_count,
        "submitted_at": session.submitted_at,
        "questions": items,
    }


def unresolved_review_questions(db: Session, challenge: models.VocabularyChallenge):
    if challenge.source_type == "word_bank":
        ids = {
            row[0]
            for row in db.query(models.VocabularyWrongNote.bank_word_id).join(
                models.VocabularyBankWord,
                models.VocabularyWrongNote.bank_word_id == models.VocabularyBankWord.id,
            ).filter(
                models.VocabularyWrongNote.student_id == challenge.student_id,
                models.VocabularyWrongNote.status == "unresolved",
                models.VocabularyWrongNote.word_source_type == "word_bank",
                models.VocabularyBankWord.bank_id == challenge.word_bank_id,
            ).all()
        }
        return db.query(models.VocabularyBankWord).filter(models.VocabularyBankWord.id.in_(ids)).all(), "word_bank"
    ids = assigned_word_ids(db, challenge, challenge.end_date)
    ids = {
        row[0]
        for row in db.query(models.VocabularyWrongNote.word_id).join(
            models.VocabularyWord,
            models.VocabularyWrongNote.word_id == models.VocabularyWord.id,
        ).filter(
            models.VocabularyWrongNote.student_id == challenge.student_id,
            models.VocabularyWrongNote.status == "unresolved",
            models.VocabularyWrongNote.word_source_type == "direct",
            models.VocabularyWord.challenge_id == challenge.id,
            models.VocabularyWrongNote.word_id.in_(ids) if ids else False,
        ).all()
    }
    return db.query(models.VocabularyWord).filter(models.VocabularyWord.id.in_(ids)).all(), "direct"


def create_session(db: Session, challenge: models.VocabularyChallenge, study_date: date, session_type: str):
    existing = db.query(models.VocabularyTestSession).filter_by(
        challenge_id=challenge.id,
        student_id=challenge.student_id,
        study_date=study_date,
        session_type=session_type,
    ).first()
    if existing:
        return existing

    if session_type == "review":
        words, source_type = unresolved_review_questions(db, challenge)
    elif challenge.source_type == "word_bank":
        words, source_type = select_bank_words(db, challenge, study_date), "word_bank"
    else:
        word_ids = assigned_word_ids(db, challenge, study_date)
        words = db.query(models.VocabularyWord).filter(models.VocabularyWord.id.in_(word_ids)).all()
        source_type = "direct"
    if not words:
        raise HTTPException(status_code=400, detail="No vocabulary words are available for this test.")

    random.SystemRandom().shuffle(words)
    session = models.VocabularyTestSession(
        challenge_id=challenge.id,
        student_id=challenge.student_id,
        study_date=study_date,
        session_type=session_type,
        status="draft",
        total_count=len(words),
    )
    db.add(session)
    db.flush()
    for index, word in enumerate(words, start=1):
        is_bank_word = source_type == "word_bank"
        db.add(models.VocabularyTestQuestion(
            session_id=session.id,
            word_id=None if is_bank_word else word.id,
            bank_word_id=word.id if is_bank_word else None,
            word_source_type=source_type,
            order_index=index,
            english_snapshot=word.english,
            accepted_answers_snapshot=list(word.accepted_meanings if is_bank_word else word.accepted_answers),
        ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(models.VocabularyTestSession).filter_by(
            challenge_id=challenge.id,
            student_id=challenge.student_id,
            study_date=study_date,
            session_type=session_type,
        ).first()
        if existing:
            return existing
        raise
    db.refresh(session)
    return session


@router.get("/admin/vocabulary-banks")
def admin_list_banks(db: Session = Depends(get_db)):
    banks = db.query(models.VocabularyBank).order_by(models.VocabularyBank.id.desc()).all()
    return [bank_dict(db, bank) for bank in banks]


@router.post("/admin/vocabulary-banks", status_code=201)
def admin_create_bank(payload: BankIn, db: Session = Depends(get_db)):
    bank = models.VocabularyBank(**payload.model_dump())
    db.add(bank)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="A bank with this title already exists.")
    db.refresh(bank)
    return bank_dict(db, bank)


@router.post("/admin/vocabulary-banks/import-preview")
def admin_preview_bank_import(payload: BankImportIn):
    preview = preview_bank_xlsx(storage_path_from_input(payload.storage_path))
    return {key: value for key, value in preview.items() if key != "words"}


@router.post("/admin/vocabulary-banks/import", status_code=201)
def admin_import_bank(payload: BankImportIn, db: Session = Depends(get_db)):
    preview = preview_bank_xlsx(storage_path_from_input(payload.storage_path))
    if preview["errors"]:
        raise HTTPException(status_code=400, detail={"errors": preview["errors"], "warnings": preview["warnings"]})
    existing = db.query(models.VocabularyBank).filter_by(title=preview["title"]).first()
    if existing:
        raise HTTPException(status_code=400, detail="A bank with this title already exists.")
    bank = models.VocabularyBank(
        title=preview["title"],
        description=payload.description,
        total_words=preview["total_words"],
        total_days=preview["total_days"],
        words_per_day=preview["words_per_day"],
        default_daily_test_question_count=preview["default_daily_test_question_count"],
        source_filename=preview["source_filename"],
        source_format=preview["source_format"],
        is_active=True,
    )
    db.add(bank)
    db.flush()
    for item in preview["words"]:
        db.add(models.VocabularyBankWord(bank_id=bank.id, **item))
    db.commit()
    db.refresh(bank)
    return {"bank": bank_dict(db, bank), "warnings": preview["warnings"]}


@router.get("/admin/vocabulary-banks/{bank_id}")
def admin_get_bank(bank_id: int, day_no: int | None = Query(default=None, ge=1, le=365), db: Session = Depends(get_db)):
    bank = get_bank_or_404(db, bank_id)
    query = db.query(models.VocabularyBankWord).filter_by(bank_id=bank_id)
    if day_no is not None:
        query = query.filter(models.VocabularyBankWord.day_no == day_no)
    words = query.order_by(models.VocabularyBankWord.order_index).all()
    return {"bank": bank_dict(db, bank), "words": [bank_word_dict(word) for word in words]}


@router.patch("/admin/vocabulary-banks/{bank_id}")
def admin_update_bank(bank_id: int, payload: BankUpdate, db: Session = Depends(get_db)):
    bank = get_bank_or_404(db, bank_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(bank, key, value)
    db.commit()
    db.refresh(bank)
    return bank_dict(db, bank)


@router.patch("/admin/vocabulary-bank-words/{word_id}")
def admin_update_bank_word(word_id: int, payload: BankWordUpdate, db: Session = Depends(get_db)):
    word = db.get(models.VocabularyBankWord, word_id)
    if word is None:
        raise HTTPException(status_code=404, detail="Vocabulary bank word not found.")
    values = payload.model_dump(exclude_unset=True)
    if "english" in values:
        normalized = normalize_text(values["english"])
        duplicate = db.query(models.VocabularyBankWord).filter(
            models.VocabularyBankWord.bank_id == word.bank_id,
            models.VocabularyBankWord.normalized_english == normalized,
            models.VocabularyBankWord.id != word.id,
        ).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="A word with this spelling already exists in the bank.")
        word.english = re.sub(r"\s+", " ", values.pop("english").strip())
        word.normalized_english = normalized
    if "accepted_meanings" in values:
        word.accepted_meanings = normalize_answers(values.pop("accepted_meanings"))
    for key, value in values.items():
        setattr(word, key, value)
    db.commit()
    return bank_word_dict(word)


@router.get("/admin/vocabulary-challenges")
def admin_list_challenges(db: Session = Depends(get_db)):
    challenges = db.query(models.VocabularyChallenge).order_by(
        models.VocabularyChallenge.start_date.desc(), models.VocabularyChallenge.id.desc()
    ).all()
    return [challenge_dict(db, challenge) for challenge in challenges]


@router.post("/admin/vocabulary-challenges", status_code=201)
def admin_create_challenge(payload: ChallengeIn, db: Session = Depends(get_db)):
    get_student_or_404(db, payload.student_id)
    values = payload.model_dump()
    if payload.source_type == "word_bank":
        bank = get_bank_or_404(db, payload.word_bank_id or 0)
        values["accumulation_type"] = "fixed_cumulative"
        values["daily_new_word_count"] = bank.words_per_day
        values["daily_test_question_count"] = values.get("daily_test_question_count") or bank.default_daily_test_question_count
        values["max_question_count"] = values.get("max_question_count") or values["daily_test_question_count"]
        values["start_bank_day"] = values.get("start_bank_day") or (bank.total_days if values.get("bank_day_direction") == "descending" else 1)
        if values["start_bank_day"] < 1 or values["start_bank_day"] > bank.total_days:
            raise HTTPException(status_code=400, detail="start_bank_day is outside the selected bank.")
    ensure_no_active_overlap(db, payload.student_id, payload.start_date, payload.end_date, payload.is_active)
    challenge = models.VocabularyChallenge(**values)
    db.add(challenge)
    db.commit()
    db.refresh(challenge)
    return challenge_dict(db, challenge, include_words=True)


@router.get("/admin/vocabulary-challenges/{challenge_id}")
def admin_get_challenge(challenge_id: int, db: Session = Depends(get_db)):
    return challenge_dict(db, get_challenge_or_404(db, challenge_id), include_words=True)


@router.patch("/admin/vocabulary-challenges/{challenge_id}")
def admin_update_challenge(challenge_id: int, payload: ChallengeUpdate, db: Session = Depends(get_db)):
    challenge = get_challenge_or_404(db, challenge_id)
    values = payload.model_dump(exclude_unset=True)
    candidate = {
        "student_id": values.get("student_id", challenge.student_id),
        "start_date": values.get("start_date", challenge.start_date),
        "end_date": values.get("end_date", challenge.end_date),
        "accumulation_type": values.get("accumulation_type", challenge.accumulation_type),
        "recent_days": values.get("recent_days", challenge.recent_days),
        "source_type": values.get("source_type", challenge.source_type),
        "word_bank_id": values.get("word_bank_id", challenge.word_bank_id),
        "is_active": values.get("is_active", challenge.is_active),
    }
    if candidate["end_date"] < candidate["start_date"]:
        raise HTTPException(status_code=400, detail="end_date cannot be earlier than start_date.")
    if candidate["accumulation_type"] == "recent_days" and not candidate["recent_days"]:
        raise HTTPException(status_code=400, detail="recent_days is required.")
    if candidate["source_type"] == "word_bank":
        if not candidate["word_bank_id"]:
            raise HTTPException(status_code=400, detail="word_bank_id is required.")
        bank = get_bank_or_404(db, candidate["word_bank_id"])
        values["accumulation_type"] = "fixed_cumulative"
        values["daily_new_word_count"] = bank.words_per_day
        direction = values.get("bank_day_direction", challenge.bank_day_direction)
        start_bank_day = values.get("start_bank_day", challenge.start_bank_day) or (bank.total_days if direction == "descending" else 1)
        if start_bank_day < 1 or start_bank_day > bank.total_days:
            raise HTTPException(status_code=400, detail="start_bank_day is outside the selected bank.")
        values["start_bank_day"] = start_bank_day
        if "max_question_count" in values and "daily_test_question_count" not in values:
            values["daily_test_question_count"] = values["max_question_count"]
        if "daily_test_question_count" not in values:
            values["daily_test_question_count"] = challenge.daily_test_question_count or bank.default_daily_test_question_count
        if "max_question_count" not in values:
            values["max_question_count"] = challenge.max_question_count or values["daily_test_question_count"]
    get_student_or_404(db, candidate["student_id"])
    ensure_no_active_overlap(
        db,
        candidate["student_id"],
        candidate["start_date"],
        candidate["end_date"],
        candidate["is_active"],
        exclude_id=challenge.id,
    )
    for key, value in values.items():
        setattr(challenge, key, value)
    db.commit()
    db.refresh(challenge)
    return challenge_dict(db, challenge, include_words=True)


@router.post("/admin/vocabulary-challenges/{challenge_id}/words", status_code=201)
def admin_add_words(challenge_id: int, payload: BulkWordsIn, db: Session = Depends(get_db)):
    challenge = get_challenge_or_404(db, challenge_id)
    if challenge.source_type != "direct":
        raise HTTPException(status_code=400, detail="Direct words can only be added to direct challenges.")
    normalized = [normalize_text(item.english) for item in payload.words]
    if len(normalized) != len(set(normalized)):
        raise HTTPException(status_code=400, detail="Duplicate english words in request.")
    existing = db.query(models.VocabularyWord.normalized_english).filter(
        models.VocabularyWord.challenge_id == challenge_id,
        models.VocabularyWord.normalized_english.in_(normalized),
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Word already exists: {existing[0]}")
    words = []
    for item in payload.words:
        word = models.VocabularyWord(
            challenge_id=challenge_id,
            english=re.sub(r"\s+", " ", item.english.strip()),
            normalized_english=normalize_text(item.english),
            accepted_answers=normalize_answers(item.accepted_answers),
            memo=item.memo.strip() if item.memo else None,
            order_index=item.order_index,
        )
        db.add(word)
        words.append(word)
    db.commit()
    return [word_dict(word) for word in words]


@router.patch("/admin/vocabulary-words/{word_id}")
def admin_update_word(word_id: int, payload: WordUpdate, db: Session = Depends(get_db)):
    word = db.get(models.VocabularyWord, word_id)
    if word is None:
        raise HTTPException(status_code=404, detail="Vocabulary word not found.")
    values = payload.model_dump(exclude_unset=True)
    if "english" in values:
        normalized = normalize_text(values["english"])
        duplicate = db.query(models.VocabularyWord).filter(
            models.VocabularyWord.challenge_id == word.challenge_id,
            models.VocabularyWord.normalized_english == normalized,
            models.VocabularyWord.id != word.id,
        ).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="This word already exists in the challenge.")
        word.english = re.sub(r"\s+", " ", values.pop("english").strip())
        word.normalized_english = normalized
    if "accepted_answers" in values:
        word.accepted_answers = normalize_answers(values.pop("accepted_answers"))
    for key, value in values.items():
        setattr(word, key, value)
    db.commit()
    return word_dict(word)


@router.delete("/admin/vocabulary-words/{word_id}")
def admin_delete_word(word_id: int, db: Session = Depends(get_db)):
    word = db.get(models.VocabularyWord, word_id)
    if word is None:
        raise HTTPException(status_code=404, detail="Vocabulary word not found.")
    if db.query(models.VocabularyTestQuestion.id).filter(models.VocabularyTestQuestion.word_id == word_id).first():
        raise HTTPException(status_code=400, detail="Words already used in tests cannot be deleted.")
    db.delete(word)
    db.commit()
    return {"deleted": True}


@router.get("/admin/vocabulary-challenges/{challenge_id}/assignments")
def admin_get_assignments(challenge_id: int, db: Session = Depends(get_db)):
    challenge = get_challenge_or_404(db, challenge_id)
    if challenge.source_type == "word_bank":
        return []
    rows = db.query(models.VocabularyDailyAssignment).filter_by(challenge_id=challenge_id).order_by(
        models.VocabularyDailyAssignment.assignment_date, models.VocabularyDailyAssignment.id
    ).all()
    grouped: dict[date, list[int]] = {}
    for row in rows:
        grouped.setdefault(row.assignment_date, []).append(row.word_id)
    return [{"date": key, "word_ids": value, "count": len(value)} for key, value in grouped.items()]


@router.put("/admin/vocabulary-challenges/{challenge_id}/assignments/{assignment_date}")
def admin_save_assignment(challenge_id: int, assignment_date: date, payload: AssignmentIn, db: Session = Depends(get_db)):
    challenge = get_challenge_or_404(db, challenge_id)
    if challenge.source_type == "word_bank":
        raise HTTPException(status_code=400, detail="Word-bank challenges use automatic Day assignments.")
    if not challenge.start_date <= assignment_date <= challenge.end_date:
        raise HTTPException(status_code=400, detail="Assignment date is outside the challenge period.")
    submitted = db.query(models.VocabularyTestSession.id).filter_by(
        challenge_id=challenge_id, study_date=assignment_date, session_type="main", status="submitted"
    ).first()
    if submitted:
        raise HTTPException(status_code=400, detail="Submitted dates cannot be edited.")
    word_ids = list(dict.fromkeys(payload.word_ids))
    valid_count = db.query(func.count(models.VocabularyWord.id)).filter(
        models.VocabularyWord.challenge_id == challenge_id,
        models.VocabularyWord.id.in_(word_ids) if word_ids else False,
    ).scalar()
    if valid_count != len(word_ids):
        raise HTTPException(status_code=400, detail="Some words do not belong to this challenge.")
    db.query(models.VocabularyDailyAssignment).filter_by(
        challenge_id=challenge_id, assignment_date=assignment_date
    ).delete(synchronize_session=False)
    for word_id in word_ids:
        db.add(models.VocabularyDailyAssignment(
            challenge_id=challenge_id, assignment_date=assignment_date, word_id=word_id
        ))
    db.commit()
    return {"date": assignment_date, "word_ids": word_ids, "count": len(word_ids)}


@router.get("/admin/vocabulary-challenges/{challenge_id}/status")
def admin_challenge_status(challenge_id: int, db: Session = Depends(get_db)):
    challenge = get_challenge_or_404(db, challenge_id)
    assignment_counts = dict(db.query(
        models.VocabularyDailyAssignment.assignment_date,
        func.count(models.VocabularyDailyAssignment.id),
    ).filter_by(challenge_id=challenge_id).group_by(models.VocabularyDailyAssignment.assignment_date).all())
    sessions = db.query(models.VocabularyTestSession).filter_by(
        challenge_id=challenge_id, session_type="main"
    ).all()
    by_date = {session.study_date: session for session in sessions}
    days = []
    cursor = challenge.start_date
    while cursor <= challenge.end_date:
        session = by_date.get(cursor)
        day_no = bank_day_no(challenge, cursor)
        day_info = vocabulary_day_info(db, challenge, cursor)
        new_count = new_word_count_for_date(db, challenge, cursor) if challenge.source_type == "word_bank" else assignment_counts.get(cursor, 0)
        days.append({
            "date": cursor,
            "day_number": day_no,
            "learning_day": day_info["learning_day"],
            "new_bank_days": day_info["new_bank_days"],
            "cumulative_bank_days": day_info["cumulative_bank_days"],
            "new_bank_day_label": day_info["new_bank_day_label"],
            "cumulative_bank_day_label": day_info["cumulative_bank_day_label"],
            "cumulative_pool_count": day_info["cumulative_pool_count"],
            "new_word_count": new_count,
            "question_count": session.total_count if session else question_count_for_date(db, challenge, cursor),
            "status": session.status if session else "not_started",
            "score": session.score if session else None,
            "correct_count": session.correct_count if session else None,
            "total_count": session.total_count if session else None,
            "submitted_at": session.submitted_at if session else None,
            "session_id": session.id if session else None,
        })
        cursor += timedelta(days=1)
    return {"challenge": challenge_dict(db, challenge), "days": days}


@router.get("/admin/vocabulary-results/{session_id}")
def admin_result(session_id: int, db: Session = Depends(get_db)):
    session = db.get(models.VocabularyTestSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Vocabulary result not found.")
    return serialize_session(db, session, include_result=True)


def active_challenge(db: Session, student_id: int, study_date: date):
    get_student_or_404(db, student_id)
    return db.query(models.VocabularyChallenge).filter(
        models.VocabularyChallenge.student_id == student_id,
        models.VocabularyChallenge.is_active.is_(True),
        models.VocabularyChallenge.start_date <= study_date,
        models.VocabularyChallenge.end_date >= study_date,
    ).first()


@router.get("/student/vocabulary/current")
def student_current_vocabulary(
    student_id: int,
    study_date: date | None = None,
    db: Session = Depends(get_db),
):
    target_date = study_date or get_study_date()
    challenge = active_challenge(db, student_id, target_date)
    if challenge is None:
        return {"challenge": None, "today": target_date, "days": []}
    assignment_counts = dict(db.query(
        models.VocabularyDailyAssignment.assignment_date,
        func.count(models.VocabularyDailyAssignment.id),
    ).filter_by(challenge_id=challenge.id).group_by(models.VocabularyDailyAssignment.assignment_date).all())
    sessions = db.query(models.VocabularyTestSession).filter_by(
        challenge_id=challenge.id, student_id=student_id, session_type="main"
    ).all()
    by_date = {session.study_date: session for session in sessions}
    unresolved_count = db.query(func.count(models.VocabularyWrongNote.id)).filter(
        models.VocabularyWrongNote.student_id == student_id,
        models.VocabularyWrongNote.status == "unresolved",
    ).scalar() or 0
    days = []
    cursor = challenge.start_date
    while cursor <= challenge.end_date:
        session = by_date.get(cursor)
        if cursor > target_date:
            status = "scheduled"
        elif session and session.status == "submitted":
            status = "completed"
        elif session:
            status = "in_progress"
        else:
            status = "missed" if cursor < target_date else "not_started"
        day_no = bank_day_no(challenge, cursor)
        day_info = vocabulary_day_info(db, challenge, cursor)
        new_count = new_word_count_for_date(db, challenge, cursor) if challenge.source_type == "word_bank" else assignment_counts.get(cursor, 0)
        days.append({
            "date": cursor,
            "day_number": day_no,
            "learning_day": day_info["learning_day"],
            "new_bank_days": day_info["new_bank_days"],
            "cumulative_bank_days": day_info["cumulative_bank_days"],
            "new_bank_day_label": day_info["new_bank_day_label"],
            "cumulative_bank_day_label": day_info["cumulative_bank_day_label"],
            "cumulative_pool_count": day_info["cumulative_pool_count"],
            "new_word_count": new_count,
            "question_count": session.total_count if session else question_count_for_date(db, challenge, cursor),
            "status": status,
            "session_id": session.id if session else None,
            "score": session.score if session else None,
        })
        cursor += timedelta(days=1)
    today_item = next(item for item in days if item["date"] == target_date)
    return {
        "challenge": challenge_dict(db, challenge),
        "today": target_date,
        "today_progress": today_item,
        "unresolved_count": unresolved_count,
        "days": days,
    }


@router.post("/student/vocabulary/sessions")
def student_create_main_session(payload: SessionCreateIn, db: Session = Depends(get_db)):
    today = get_study_date()
    if payload.study_date > today:
        raise HTTPException(status_code=400, detail="Future tests cannot be started.")
    challenge = active_challenge(db, payload.student_id, payload.study_date)
    if challenge is None:
        raise HTTPException(status_code=404, detail="No active challenge for this study date.")
    session = create_session(db, challenge, payload.study_date, "main")
    return serialize_session(db, session, include_result=session.status == "submitted")


@router.get("/student/vocabulary/sessions/{session_id}")
def student_get_session(session_id: int, student_id: int, db: Session = Depends(get_db)):
    session = get_session_for_student(db, session_id, student_id)
    return serialize_session(db, session, include_result=session.status == "submitted")


@router.put("/student/vocabulary/sessions/{session_id}/answers")
def student_save_answers(session_id: int, payload: AnswersIn, db: Session = Depends(get_db)):
    session = get_session_for_student(db, session_id, payload.student_id)
    if session.status == "submitted":
        raise HTTPException(status_code=400, detail="Submitted answers cannot be changed.")
    question_ids = {
        row[0] for row in db.query(models.VocabularyTestQuestion.id).filter_by(session_id=session.id).all()
    }
    for item in payload.answers:
        if item.question_id not in question_ids:
            raise HTTPException(status_code=400, detail="Question does not belong to this test.")
        answer = db.query(models.VocabularyTestAnswer).filter_by(question_id=item.question_id).first()
        if answer:
            answer.input_answer = item.input_answer
        else:
            db.add(models.VocabularyTestAnswer(
                session_id=session.id, question_id=item.question_id, input_answer=item.input_answer
            ))
    db.commit()
    return {"saved": True}


def note_query(db: Session, session: models.VocabularyTestSession, question: models.VocabularyTestQuestion):
    query = db.query(models.VocabularyWrongNote).filter(
        models.VocabularyWrongNote.student_id == session.student_id,
        models.VocabularyWrongNote.word_source_type == question.word_source_type,
    )
    if question.word_source_type == "word_bank":
        return query.filter(models.VocabularyWrongNote.bank_word_id == question.bank_word_id)
    return query.filter(models.VocabularyWrongNote.word_id == question.word_id)


def submit_session(db: Session, session: models.VocabularyTestSession):
    if session.status == "submitted":
        raise HTTPException(status_code=400, detail="This test has already been submitted.")
    questions = db.query(models.VocabularyTestQuestion).filter_by(session_id=session.id).all()
    answers = {
        row.question_id: row for row in db.query(models.VocabularyTestAnswer).filter_by(session_id=session.id).all()
    }
    correct_count = 0
    submitted_at = datetime.now(timezone.utc)
    for question in questions:
        answer = answers.get(question.id)
        if answer is None:
            answer = models.VocabularyTestAnswer(
                session_id=session.id, question_id=question.id, input_answer=""
            )
            db.add(answer)
        accepted = {normalize_text(value) for value in question.accepted_answers_snapshot}
        answer.is_correct = normalize_text(answer.input_answer) in accepted
        if answer.is_correct:
            correct_count += 1
            if session.session_type == "review":
                note = note_query(db, session, question).first()
                if note:
                    note.status = "mastered"
                    note.resolved_at = submitted_at
        elif session.session_type == "main":
            note = note_query(db, session, question).first()
            if note:
                note.latest_wrong_answer = answer.input_answer
                note.latest_wrong_date = session.study_date
                note.wrong_count += 1
                note.status = "unresolved"
                note.resolved_at = None
            else:
                db.add(models.VocabularyWrongNote(
                    student_id=session.student_id,
                    word_id=question.word_id,
                    bank_word_id=question.bank_word_id,
                    word_source_type=question.word_source_type,
                    latest_wrong_answer=answer.input_answer,
                    first_wrong_date=session.study_date,
                    latest_wrong_date=session.study_date,
                    wrong_count=1,
                    status="unresolved",
                ))
    session.correct_count = correct_count
    session.total_count = len(questions)
    session.score = round(correct_count * 100 / len(questions)) if questions else 0
    session.status = "submitted"
    session.submitted_at = submitted_at
    db.commit()
    db.refresh(session)
    return session


@router.post("/student/vocabulary/sessions/{session_id}/submit")
def student_submit_session(session_id: int, payload: StudentActionIn, db: Session = Depends(get_db)):
    session = db.query(models.VocabularyTestSession).filter(
        models.VocabularyTestSession.id == session_id
    ).with_for_update().first()
    if session is None:
        raise HTTPException(status_code=404, detail="Vocabulary test session not found.")
    if session.student_id != payload.student_id:
        raise HTTPException(status_code=403, detail="Cannot access another student's test.")
    try:
        submitted = submit_session(db, session)
    except Exception:
        db.rollback()
        raise
    return serialize_session(db, submitted, include_result=True)


@router.get("/student/vocabulary/results/{session_id}")
def student_result(session_id: int, student_id: int, db: Session = Depends(get_db)):
    session = get_session_for_student(db, session_id, student_id)
    if session.status != "submitted":
        raise HTTPException(status_code=400, detail="This test has not been submitted yet.")
    return serialize_session(db, session, include_result=True)


def session_print_html(db: Session, session: models.VocabularyTestSession, *, include_answers: bool) -> str:
    payload = serialize_session(db, session, include_result=include_answers and session.status == "submitted")
    challenge = db.get(models.VocabularyChallenge, session.challenge_id)
    answers_title = "ANSWER KEY" if include_answers else "TEST PAPER"
    question_rows = db.query(models.VocabularyTestQuestion).filter_by(session_id=session.id).order_by(
        models.VocabularyTestQuestion.order_index
    ).all()
    rows = []
    for question in question_rows:
        if include_answers:
            answers = question.accepted_answers_snapshot or []
            answer_text = " / ".join(escape(str(value)) for value in answers)
            rows.append(
                f"<div class='answer-row'><span>{question.order_index:03d}</span>"
                f"<strong>{escape(question.english_snapshot)}</strong><em>{answer_text}</em></div>"
            )
        else:
            rows.append(
                f"<div class='question-row'><span>{question.order_index:03d}</span>"
                f"<strong>{escape(question.english_snapshot)}</strong><i></i></div>"
            )
    body_class = "answers" if include_answers else "questions"
    html = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>SPRINT VOCABULARY {answers_title}</title>
<style>
@page {{ size: A4 portrait; margin: 14mm 12mm; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; color: #0f172a; font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; background: #fff; }}
.page {{ width: 100%; }}
.header {{ border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }}
.kicker {{ font-size: 11px; font-weight: 900; letter-spacing: .12em; color: #2563eb; }}
h1 {{ margin: 4px 0 8px; font-size: 22px; letter-spacing: -.03em; }}
.meta {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 18px; font-size: 10px; color: #334155; }}
.score {{ margin-top: 8px; font-size: 12px; font-weight: 900; }}
.questions {{ column-count: 2; column-gap: 14px; }}
.question-row {{ break-inside: avoid; page-break-inside: avoid; display: grid; grid-template-columns: 30px 1fr; gap: 6px; align-items: center; min-height: 34px; border-bottom: 1px solid #dbe4ef; padding: 5px 0; }}
.question-row span, .answer-row span {{ font-size: 10px; font-weight: 900; color: #64748b; }}
.question-row strong {{ font-size: 15px; }}
.question-row i {{ grid-column: 2; height: 16px; border-bottom: 1px solid #94a3b8; }}
.answers {{ display: grid; grid-template-columns: 1fr; gap: 3px; }}
.answer-row {{ break-inside: avoid; page-break-inside: avoid; display: grid; grid-template-columns: 38px 160px 1fr; gap: 8px; align-items: baseline; border-bottom: 1px solid #e2e8f0; padding: 4px 0; font-size: 11px; }}
.answer-row strong {{ font-size: 12px; }}
.answer-row em {{ font-style: normal; color: #0f766e; }}
.footer {{ position: fixed; bottom: 7mm; left: 12mm; right: 12mm; color: #94a3b8; font-size: 9px; text-align: center; }}
@media screen {{ body {{ background: #eaf1f8; }} .page {{ max-width: 210mm; min-height: 297mm; margin: 20px auto; background: #fff; padding: 14mm 12mm; box-shadow: 0 20px 50px rgba(15,23,42,.12); }} .footer {{ position: static; margin-top: 16px; }} }}
</style>
</head>
<body>
<main class="page">
  <section class="header">
    <div class="kicker">SPRINT VOCABULARY TEST</div>
    <h1>{answers_title}</h1>
    <div class="meta">
      <div>Student: {escape(str(payload.get("student_name") or ""))}</div>
      <div>Date: {escape(str(payload["study_date"]))}</div>
      <div>Bank: {escape(str(payload.get("word_bank_title") or payload.get("challenge_name") or ""))}</div>
      <div>Learning Day: DAY {escape(str(payload.get("learning_day") or ""))}</div>
      <div>New Range: {escape(str(payload.get("new_bank_day_label") or "-"))}</div>
      <div>Cumulative Range: {escape(str(payload.get("cumulative_bank_day_label") or "-"))}</div>
      <div>Questions: {len(question_rows)}</div>
      <div>Pool: {escape(str(payload.get("cumulative_pool_count") or len(question_rows)))}</div>
    </div>
    <div class="score">Score: ____ / {len(question_rows)}</div>
  </section>
  <section class="{body_class}">{"".join(rows)}</section>
  <div class="footer">Generated from fixed session #{session.id}. Use browser print to save as PDF.</div>
</main>
<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),200));</script>
</body>
</html>"""
    return html


@router.get("/student/vocabulary/sessions/{session_id}/paper")
def student_vocabulary_paper(session_id: int, student_id: int, db: Session = Depends(get_db)):
    session = get_session_for_student(db, session_id, student_id)
    return HTMLResponse(session_print_html(db, session, include_answers=False))


@router.get("/student/vocabulary/sessions/{session_id}/answer-key")
def student_vocabulary_answer_key(session_id: int, student_id: int, db: Session = Depends(get_db)):
    session = get_session_for_student(db, session_id, student_id)
    challenge = get_challenge_or_404(db, session.challenge_id)
    if not challenge.allow_student_answer_pdf:
        raise HTTPException(status_code=403, detail="Answer key is not available to students.")
    return HTMLResponse(session_print_html(db, session, include_answers=True))


@router.get("/admin/vocabulary-sessions/{session_id}/paper")
def admin_vocabulary_paper(session_id: int, db: Session = Depends(get_db)):
    session = db.get(models.VocabularyTestSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Vocabulary test session not found.")
    return HTMLResponse(session_print_html(db, session, include_answers=False))


@router.get("/admin/vocabulary-sessions/{session_id}/answer-key")
def admin_vocabulary_answer_key(session_id: int, db: Session = Depends(get_db)):
    session = db.get(models.VocabularyTestSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Vocabulary test session not found.")
    return HTMLResponse(session_print_html(db, session, include_answers=True))


@router.get("/student/vocabulary/wrong-notes")
def student_wrong_notes(
    student_id: int,
    status: Literal["all", "unresolved", "mastered"] = Query(default="all"),
    db: Session = Depends(get_db),
):
    get_student_or_404(db, student_id)
    query = db.query(models.VocabularyWrongNote).filter(models.VocabularyWrongNote.student_id == student_id)
    if status != "all":
        query = query.filter(models.VocabularyWrongNote.status == status)
    notes = query.order_by(models.VocabularyWrongNote.latest_wrong_date.desc()).all()
    rows = []
    for note in notes:
        word = db.get(models.VocabularyBankWord, note.bank_word_id) if note.word_source_type == "word_bank" else db.get(models.VocabularyWord, note.word_id)
        if not word:
            continue
        rows.append({
            "id": note.id,
            "word_id": note.word_id,
            "bank_word_id": note.bank_word_id,
            "word_source_type": note.word_source_type,
            "challenge_id": getattr(word, "challenge_id", None),
            "english": word.english,
            "accepted_answers": getattr(word, "accepted_meanings", getattr(word, "accepted_answers", [])),
            "latest_wrong_answer": note.latest_wrong_answer,
            "first_wrong_date": note.first_wrong_date,
            "latest_wrong_date": note.latest_wrong_date,
            "wrong_count": note.wrong_count,
            "status": note.status,
            "resolved_at": note.resolved_at,
        })
    return rows


@router.post("/student/vocabulary/review-sessions")
def student_create_review_session(payload: StudentActionIn, db: Session = Depends(get_db)):
    today = get_study_date()
    challenge = active_challenge(db, payload.student_id, today)
    if challenge is None:
        raise HTTPException(status_code=404, detail="No active challenge.")
    session = create_session(db, challenge, today, "review")
    return serialize_session(db, session, include_result=session.status == "submitted")
