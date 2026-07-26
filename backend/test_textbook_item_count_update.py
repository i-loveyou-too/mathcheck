from __future__ import annotations

from pathlib import Path
import sys
from unittest import TestCase

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parent))

import crud
import models


class Payload:
    def __init__(self, **values):
        self.values = values

    def model_dump(self, exclude_unset: bool = False):
        return dict(self.values)


class SectionPayload:
    def __init__(self, section_title: str, start_problem: int, end_problem: int, order_index: int = 0):
        self.unit_title = None
        self.section_title = section_title
        self.start_problem = start_problem
        self.end_problem = end_problem
        self.start_page = None
        self.end_page = None
        self.order_index = order_index
        self.show_to_student = True
        self.use_for_homework = True


class TextbookItemCountUpdateTests(TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.tables = [
            models.Student.__table__,
            models.MathTextbookSeries.__table__,
            models.MathTextbook.__table__,
            models.MathTextbookSubject.__table__,
            models.MathTextbookItem.__table__,
            models.MathTextbookSection.__table__,
            models.MathStudentItemProgress.__table__,
        ]
        models.Base.metadata.create_all(self.engine, tables=self.tables)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.series = models.MathTextbookSeries(
            korean_name="Series",
            english_name="Series",
            display_name="Series",
            type="problem",
            order_index=0,
        )
        self.student = models.Student(name="Student", phone="010-0000-0000", grade="G1")
        self.db.add_all([self.series, self.student])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        models.Base.metadata.drop_all(self.engine, tables=list(reversed(self.tables)))
        self.engine.dispose()

    def create_textbook(self, count: int = 28, *, structure_type: str = "none") -> models.MathTextbook:
        textbook = models.MathTextbook(
            series_id=self.series.id,
            textbook_key=f"book-{count}-{structure_type}",
            subject="math",
            title="Book",
            full_title=f"Book {count} {structure_type}",
            type="problem",
            structure_type=structure_type,
            is_checkable=True,
            is_published=True,
            is_active=True,
            order_index=0,
        )
        self.db.add(textbook)
        self.db.flush()
        for number in range(1, count + 1):
            self.db.add(
                models.MathTextbookItem(
                    textbook_id=textbook.id,
                    item_number=number,
                    title=f"{number}번",
                    item_type="problem",
                    order_index=number,
                    is_active=True,
                )
            )
        self.db.commit()
        return textbook

    def active_items(self, textbook_id: int):
        return (
            self.db.query(models.MathTextbookItem)
            .filter(
                models.MathTextbookItem.textbook_id == textbook_id,
                models.MathTextbookItem.is_active.is_(True),
            )
            .order_by(models.MathTextbookItem.item_number)
            .all()
        )

    def test_update_28_to_29_adds_only_missing_tail_and_preserves_progress(self):
        textbook = self.create_textbook(28)
        item_1 = self.active_items(textbook.id)[0]
        self.db.add(models.MathStudentItemProgress(student_id=self.student.id, item_id=item_1.id, status="done"))
        self.db.commit()

        crud.update_textbook(self.db, textbook.id, Payload(item_count=29))

        items = self.active_items(textbook.id)
        self.assertEqual([item.item_number for item in items], list(range(1, 30)))
        self.assertEqual(len(items), 29)
        self.assertEqual(items[-1].item_number, 29)
        self.assertEqual(
            self.db.query(models.MathStudentItemProgress)
            .filter_by(student_id=self.student.id, item_id=item_1.id)
            .one()
            .status,
            "done",
        )

    def test_update_same_count_does_not_duplicate_items(self):
        textbook = self.create_textbook(29)

        crud.update_textbook(self.db, textbook.id, Payload(item_count=29))

        self.assertEqual(len(self.active_items(textbook.id)), 29)
        self.assertEqual(
            self.db.query(models.MathTextbookItem)
            .filter(models.MathTextbookItem.textbook_id == textbook.id, models.MathTextbookItem.item_number == 29)
            .count(),
            1,
        )

    def test_decrease_is_rejected_without_db_changes(self):
        textbook = self.create_textbook(29)
        before_ids = [item.id for item in self.active_items(textbook.id)]

        with self.assertRaises(crud.TextbookItemCountError):
            crud.update_textbook(self.db, textbook.id, Payload(item_count=28))

        self.db.rollback()
        self.assertEqual([item.id for item in self.active_items(textbook.id)], before_ids)

    def test_section_textbook_rejects_item_count_that_conflicts_with_section_union(self):
        textbook = self.create_textbook(28, structure_type="problems")
        self.db.add(
            models.MathTextbookSection(
                textbook_id=textbook.id,
                section_title="A",
                start_problem=1,
                end_problem=28,
                order_index=0,
            )
        )
        self.db.commit()

        with self.assertRaises(crud.TextbookItemCountError):
            crud.update_textbook(self.db, textbook.id, Payload(item_count=29))

        self.db.rollback()
        self.assertEqual([item.item_number for item in self.active_items(textbook.id)], list(range(1, 29)))

    def test_section_range_increase_adds_missing_item_only(self):
        textbook = self.create_textbook(28, structure_type="problems")
        item_1 = self.active_items(textbook.id)[0]
        self.db.add(models.MathStudentItemProgress(student_id=self.student.id, item_id=item_1.id, status="done"))
        self.db.add(
            models.MathTextbookSection(
                textbook_id=textbook.id,
                section_title="A",
                start_problem=1,
                end_problem=28,
                order_index=0,
            )
        )
        self.db.commit()

        crud.replace_textbook_sections(self.db, textbook.id, [SectionPayload("A", 1, 29)])

        self.assertEqual([item.item_number for item in self.active_items(textbook.id)], list(range(1, 30)))
        self.assertEqual(
            self.db.query(models.MathStudentItemProgress)
            .filter_by(student_id=self.student.id, item_id=item_1.id)
            .one()
            .status,
            "done",
        )

    def test_section_range_decrease_is_rejected_without_hiding_items(self):
        textbook = self.create_textbook(28, structure_type="problems")
        self.db.add(
            models.MathTextbookSection(
                textbook_id=textbook.id,
                section_title="A",
                start_problem=1,
                end_problem=28,
                order_index=0,
            )
        )
        self.db.commit()

        with self.assertRaises(crud.TextbookItemCountError):
            crud.replace_textbook_sections(self.db, textbook.id, [SectionPayload("A", 1, 27)])

        self.db.rollback()
        self.assertEqual([item.item_number for item in self.active_items(textbook.id)], list(range(1, 29)))


if __name__ == "__main__":
    import unittest

    unittest.main()
