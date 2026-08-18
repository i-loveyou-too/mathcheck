from __future__ import annotations

import argparse
import json
from pathlib import Path

from sqlalchemy.exc import IntegrityError

import models
from database import SessionLocal
from vocabulary import preview_bank_xlsx


DEFAULT_SOURCE = Path(__file__).resolve().parents[1] / "블랙라벨 1등급 VOCA_전체 단어 및 연관어(파생어).xlsx"


def import_blacklabel_voca(source_path: Path, description: str | None = None) -> dict:
    preview = preview_bank_xlsx(source_path)
    if preview["errors"]:
        return {
            "ok": False,
            "errors": preview["errors"],
            "warnings": preview["warnings"],
        }

    db = SessionLocal()
    try:
        bank = db.query(models.VocabularyBank).filter_by(title=preview["title"]).first()
        created = bank is None
        if bank is None:
            bank = models.VocabularyBank(title=preview["title"], is_active=True)
            db.add(bank)
            db.flush()

        bank.description = description
        bank.total_words = preview["total_words"]
        bank.total_days = preview["total_days"]
        bank.words_per_day = preview["words_per_day"]
        bank.default_daily_test_question_count = preview["default_daily_test_question_count"]
        bank.source_filename = preview["source_filename"]
        bank.source_format = preview["source_format"]

        existing_words = {
            word.normalized_english: word
            for word in db.query(models.VocabularyBankWord).filter_by(bank_id=bank.id).all()
        }
        existing_word_ids = [word.id for word in existing_words.values()]
        if existing_word_ids:
            db.query(models.VocabularyBankWordRelation).filter(
                models.VocabularyBankWordRelation.parent_word_id.in_(existing_word_ids)
            ).delete(synchronize_session=False)
            db.query(models.VocabularyBankWordRelation).filter(
                models.VocabularyBankWordRelation.related_word_id.in_(existing_word_ids)
            ).delete(synchronize_session=False)
            db.flush()

        for word in existing_words.values():
            word.day_order = -word.id
            word.order_index = -word.id
        db.flush()

        preview_normalized = {item["normalized_english"] for item in preview["words"]}
        stale_words = [
            word for normalized, word in existing_words.items()
            if normalized not in preview_normalized
        ]
        for word in stale_words:
            db.delete(word)
        db.flush()
        existing_words = {
            normalized: word
            for normalized, word in existing_words.items()
            if normalized in preview_normalized
        }

        inserted_words = 0
        updated_words = 0
        for item in preview["words"]:
            normalized = item["normalized_english"]
            word = existing_words.get(normalized)
            if word is None:
                word = models.VocabularyBankWord(bank_id=bank.id, **item)
                db.add(word)
                existing_words[normalized] = word
                inserted_words += 1
            else:
                for key, value in item.items():
                    setattr(word, key, value)
                updated_words += 1
        db.flush()

        relation_keys: set[tuple[int, int, str]] = set()
        inserted_relations = 0
        for relation in preview.get("relations", []):
            parent = existing_words.get(relation["parent_normalized_english"])
            related = existing_words.get(relation["related_normalized_english"])
            relation_type = relation.get("relation_type", "related")
            if not parent or not related or parent.id == related.id:
                continue
            key = (parent.id, related.id, relation_type)
            if key in relation_keys:
                continue
            relation_keys.add(key)
            db.add(models.VocabularyBankWordRelation(
                parent_word_id=parent.id,
                related_word_id=related.id,
                relation_type=relation_type,
            ))
            inserted_relations += 1

        db.commit()
        word_count = db.query(models.VocabularyBankWord).filter_by(bank_id=bank.id).count()
        relation_count = db.query(models.VocabularyBankWordRelation).join(
            models.VocabularyBankWord,
            models.VocabularyBankWordRelation.parent_word_id == models.VocabularyBankWord.id,
        ).filter(models.VocabularyBankWord.bank_id == bank.id).count()
        return {
            "ok": True,
            "created": created,
            "bank_id": bank.id,
            "title": bank.title,
            "day_count": preview["total_days"],
            "main_word_count": preview.get("main_word_count", preview["total_rows"]),
            "related_word_count": preview.get("related_word_count", 0),
            "unique_testable_word_count": word_count,
            "relation_count": relation_count,
            "source_relation_count": preview.get("relation_count", len(preview.get("relations", []))),
            "inserted_words": inserted_words,
            "updated_words": updated_words,
            "inserted_relations": inserted_relations,
            "duplicate_relation_skipped": max(
                0,
                preview.get("relation_count", len(preview.get("relations", []))) - inserted_relations,
            ),
            "warnings": preview["warnings"],
            "duplicate_related_skipped": preview.get("duplicate_related_skipped", 0),
            "missing_meaning_count": 0,
        }
    except IntegrityError:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Blacklabel 1등급 VOCA into vocabulary banks.")
    parser.add_argument("source_path", nargs="?", default=str(DEFAULT_SOURCE))
    parser.add_argument("--description", default="블랙라벨 1등급 VOCA 워드뱅크")
    args = parser.parse_args()
    result = import_blacklabel_voca(Path(args.source_path).resolve(), args.description)
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    if not result.get("ok"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
