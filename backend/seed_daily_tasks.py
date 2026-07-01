from datetime import date

from database import Base, SessionLocal, engine
import crud
import models  # noqa: F401


DAILY_TASK_SEED_DATA = [
    {
        "title": "딥러닝 수1 지수로그 1번 ~ 10번",
        "detail": "1번 ~ 10번",
        "textbook_key": "deep-su1-exp-log",
        "start_item_number": 1,
        "end_item_number": 10,
        "status": "todo",
        "difficulty": "보통",
        "category": "수1",
        "order_index": 1,
    },
    {
        "title": "오답노트 2개 복습",
        "detail": "△ 표시한 문제 다시 보기",
        "textbook_key": None,
        "start_item_number": None,
        "end_item_number": None,
        "status": "todo",
        "difficulty": "보통",
        "category": "오답",
        "order_index": 2,
    },
    {
        "title": "주간계획표 체크",
        "detail": "이번 주 계획 확인하기",
        "textbook_key": None,
        "start_item_number": None,
        "end_item_number": None,
        "status": "done",
        "difficulty": "쉬움",
        "category": "계획",
        "order_index": 3,
    },
]


class DailyTaskSeedPayload:
    def __init__(self, student_id: int, task_date: date, task_data: dict):
        self.student_id = student_id
        self.task_date = task_date
        for key, value in task_data.items():
            setattr(self, key, value)


def seed_daily_tasks():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    task_date = date.today()

    try:
        student = crud.get_student_by_id(db, 1)
        if student is None:
            print("student_id=1 not found. Run backend/seed.py first.")
            return

        for task_data in DAILY_TASK_SEED_DATA:
            existing = (
                db.query(models.MathDailyTask)
                .filter(
                    models.MathDailyTask.student_id == student.id,
                    models.MathDailyTask.task_date == task_date,
                    models.MathDailyTask.title == task_data["title"],
                )
                .first()
            )
            if existing is not None:
                continue

            payload = DailyTaskSeedPayload(student.id, task_date, task_data)
            crud.create_daily_task(db, payload)

        print(f"Seeded daily tasks for student_id=1 on {task_date.isoformat()}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_daily_tasks()
