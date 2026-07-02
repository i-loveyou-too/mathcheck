"""
Seed: 딥러닝 수1 삼각함수 도형 (15문항)

Run: python seed_textbook.py
"""

from database import SessionLocal
from models import MathTextbook, MathTextbookItem, MathTextbookSeries
from sqlalchemy import inspect, text
from database import engine

SERIES = {
    "korean_name": "딥러닝",
    "english_name": "Deep Learning",
    "display_name": "딥러닝 Deep Learning",
    "type": "problem",
    "order_index": 0,
}

TEXTBOOK = {
    "textbook_key": "deep-su1-trig-shape",
    "subject": "수1",
    "title": "삼각함수 도형",
    "full_title": "딥러닝 Deep Learning 수1 - 삼각함수 도형",
    "type": "problem",
    "is_checkable": True,
    "is_published": True,
    "is_active": True,
    "order_index": 0,
}

ITEM_COUNT = 15


def ensure_textbook_key_column():
    inspector = inspect(engine)
    if not inspector.has_table("math_textbooks"):
        return

    column_names = {column["name"] for column in inspector.get_columns("math_textbooks")}
    with engine.begin() as connection:
        if "textbook_key" not in column_names:
            connection.execute(
                text("ALTER TABLE math_textbooks ADD COLUMN textbook_key VARCHAR(100)")
            )
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_math_textbooks_textbook_key "
                "ON math_textbooks (textbook_key) WHERE textbook_key IS NOT NULL"
            )
        )


def seed():
    ensure_textbook_key_column()
    db = SessionLocal()
    try:
        series = (
            db.query(MathTextbookSeries)
            .filter(
                MathTextbookSeries.display_name == SERIES["display_name"],
                MathTextbookSeries.type == SERIES["type"],
            )
            .first()
        )
        if series is None:
            series = MathTextbookSeries(**SERIES)
            db.add(series)
            db.flush()
            print(f"시리즈 생성: {series.display_name} (id={series.id})")
        else:
            print(f"시리즈 기존 사용: {series.display_name} (id={series.id})")

        textbook = (
            db.query(MathTextbook)
            .filter(MathTextbook.full_title == TEXTBOOK["full_title"])
            .first()
        )
        if textbook is not None:
            print(f"이미 존재하는 교재: {textbook.full_title} (id={textbook.id})")
            return

        textbook = MathTextbook(series_id=series.id, **TEXTBOOK)
        db.add(textbook)
        db.flush()
        print(f"교재 생성: {textbook.full_title} (id={textbook.id})")

        for i in range(1, ITEM_COUNT + 1):
            item = MathTextbookItem(
                textbook_id=textbook.id,
                item_number=i,
                title=f"{i}번",
                item_type="problem",
                order_index=i,
                is_active=True,
            )
            db.add(item)

        db.commit()
        print(f"문항 {ITEM_COUNT}개 생성 완료")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
