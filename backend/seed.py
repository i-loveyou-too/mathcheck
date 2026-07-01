from database import Base, SessionLocal, engine
import models  # noqa: F401


SAMPLE_STUDENTS = [
    {"name": "김수아", "phone": "01011112222", "grade": "고3"},
    {"name": "김주리", "phone": "01022223333", "grade": "재수"},
    {"name": "예림", "phone": "01033334444", "grade": "고2"},
]

SAMPLE_SUBJECTS = [
    {
        "name": "수학 I",
        "order_index": 1,
        "units": [
            {
                "name": "지수로그",
                "order_index": 1,
                "tasks": [
                    "지수법칙과 거듭제곱 계산 연습",
                    "로그의 성질 정리하기",
                    "상용로그 활용 문제 풀기",
                    "지수·로그 그래프 읽기",
                    "실전형 서술형 문항 풀기",
                ],
            },
            {
                "name": "삼각함수",
                "order_index": 2,
                "tasks": [
                    "일반각과 호도법 익히기",
                    "삼각비와 삼각함수 값 구하기",
                    "삼각함수 그래프 변환 연습",
                    "주기와 최대·최소 문제 풀이",
                    "모의고사형 응용 문제 풀기",
                ],
            },
            {
                "name": "수열",
                "order_index": 3,
                "tasks": [
                    "등차수열의 일반항 구하기",
                    "등비수열의 일반항 구하기",
                    "수열의 합 공식 적용하기",
                    "귀납적 정의와 점화식 이해하기",
                    "수열 종합 문제 풀기",
                ],
            },
        ],
    },
    {
        "name": "수학 II",
        "order_index": 2,
        "units": [
            {
                "name": "함수의 극한",
                "order_index": 1,
                "tasks": [
                    "극한의 기본 성질 복습하기",
                    "좌극한과 우극한 비교하기",
                    "무한대에서의 극한 계산하기",
                    "연속성과 극한의 관계 이해하기",
                    "그래프 해석 문제 풀기",
                ],
            },
            {
                "name": "미분",
                "order_index": 2,
                "tasks": [
                    "미분계수와 도함수 개념 익히기",
                    "합성함수 미분 연습하기",
                    "접선의 방정식 구하기",
                    "증가와 감소, 극값 판단하기",
                    "미분 활용 서술형 문제 풀기",
                ],
            },
            {
                "name": "적분",
                "order_index": 3,
                "tasks": [
                    "부정적분 기본 공식 익히기",
                    "정적분의 의미 이해하기",
                    "넓이 구하는 문제 풀기",
                    "속도와 거리 문제 연습하기",
                    "적분 활용 종합 문제 풀기",
                ],
            },
        ],
    },
    {
        "name": "확률과 통계",
        "order_index": 3,
        "units": [
            {
                "name": "경우의 수",
                "order_index": 1,
                "tasks": [
                    "순열과 조합 기본 문제 풀기",
                    "중복을 허용한 경우의 수 익히기",
                    "원순열과 분할 개념 정리하기",
                    "조건이 있는 경우의 수 계산하기",
                    "실전형 경우의 수 문제 풀기",
                ],
            },
            {
                "name": "확률",
                "order_index": 2,
                "tasks": [
                    "확률의 기본 정의 이해하기",
                    "여사건과 독립 사건 정리하기",
                    "조건부확률 문제 풀기",
                    "확률의 곱셈정리 연습하기",
                    "모의고사형 확률 문제 풀기",
                ],
            },
            {
                "name": "통계",
                "order_index": 3,
                "tasks": [
                    "평균과 분산 계산하기",
                    "표준편차와 해석 익히기",
                    "확률분포 표 읽기 연습하기",
                    "자료의 정리와 대표값 구하기",
                    "통계 종합 문제 풀기",
                ],
            },
        ],
    },
]

DEEP_SU1_EXP_LOG_SERIES = {
    "korean_name": "딥러닝",
    "english_name": "Deep Learning",
    "display_name": "딥러닝 Deep Learning",
    "type": "problem",
    "order_index": 2,
}

DEEP_SU1_EXP_LOG_TEXTBOOK = {
    "subject": "수1",
    "title": "지수로그",
    "full_title": "딥러닝 Deep Learning 수1 - 지수로그",
    "type": "problem",
    "is_checkable": True,
    "is_published": True,
    "is_active": True,
    "order_index": 1,
}

def get_or_create_student(db, name: str, phone: str, grade: str):
    student = db.query(models.Student).filter(models.Student.phone == phone).first()
    if student is not None:
        return student
    student = models.Student(name=name, phone=phone, grade=grade)
    db.add(student)
    db.flush()
    return student


def get_or_create_admin(db, username: str, password: str):
    admin = db.query(models.Admin).filter(models.Admin.username == username).first()
    if admin is not None:
        return admin
    admin = models.Admin(username=username, password=password)
    db.add(admin)
    db.flush()
    return admin


def get_or_create_subject(db, name: str, order_index: int):
    subject = db.query(models.Subject).filter(models.Subject.name == name).first()
    if subject is not None:
        return subject
    subject = models.Subject(name=name, order_index=order_index)
    db.add(subject)
    db.flush()
    return subject


def get_or_create_unit(db, subject_id: int, name: str, order_index: int):
    unit = (
        db.query(models.Unit)
        .filter(models.Unit.subject_id == subject_id, models.Unit.name == name)
        .first()
    )
    if unit is not None:
        return unit
    unit = models.Unit(subject_id=subject_id, name=name, order_index=order_index)
    db.add(unit)
    db.flush()
    return unit


def get_or_create_task(db, unit_id: int, title: str, order_index: int):
    task = (
        db.query(models.Task)
        .filter(models.Task.unit_id == unit_id, models.Task.title == title)
        .first()
    )
    if task is not None:
        return task
    task = models.Task(unit_id=unit_id, title=title, order_index=order_index)
    db.add(task)
    db.flush()
    return task


def get_or_create_textbook_series(db, series_data: dict):
    series = (
        db.query(models.MathTextbookSeries)
        .filter(
            models.MathTextbookSeries.display_name == series_data["display_name"],
            models.MathTextbookSeries.type == series_data["type"],
        )
        .first()
    )
    if series is None:
        series = models.MathTextbookSeries(**series_data)
        db.add(series)
    else:
        for key, value in series_data.items():
            setattr(series, key, value)
    db.flush()
    return series


def get_or_create_textbook(db, series_id: int, textbook_data: dict):
    textbook = (
        db.query(models.MathTextbook)
        .filter(models.MathTextbook.full_title == textbook_data["full_title"])
        .first()
    )
    values = {**textbook_data, "series_id": series_id}
    if textbook is None:
        textbook = models.MathTextbook(**values)
        db.add(textbook)
    else:
        for key, value in values.items():
            setattr(textbook, key, value)
    db.flush()
    return textbook


def get_or_create_textbook_item(
    db,
    textbook_id: int,
    item_number: int,
    title: str,
    item_type: str,
    order_index: int,
):
    item = (
        db.query(models.MathTextbookItem)
        .filter(
            models.MathTextbookItem.textbook_id == textbook_id,
            models.MathTextbookItem.item_number == item_number,
        )
        .first()
    )
    values = {
        "textbook_id": textbook_id,
        "item_number": item_number,
        "title": title,
        "item_type": item_type,
        "order_index": order_index,
        "is_active": True,
    }
    if item is None:
        item = models.MathTextbookItem(**values)
        db.add(item)
    else:
        for key, value in values.items():
            setattr(item, key, value)
    db.flush()
    return item


def seed_deep_su1_exp_log(db):
    series = get_or_create_textbook_series(db, DEEP_SU1_EXP_LOG_SERIES)
    textbook = get_or_create_textbook(db, series.id, DEEP_SU1_EXP_LOG_TEXTBOOK)

    for item_number in range(1, 21):
        get_or_create_textbook_item(
            db,
            textbook_id=textbook.id,
            item_number=item_number,
            title=f"{item_number}번",
            item_type="problem",
            order_index=item_number,
        )


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        get_or_create_admin(db, "admin", "1234")

        for student in SAMPLE_STUDENTS:
            get_or_create_student(db, student["name"], student["phone"], student["grade"])

        for subject_data in SAMPLE_SUBJECTS:
            subject = get_or_create_subject(db, subject_data["name"], subject_data["order_index"])
            for unit_data in subject_data["units"]:
                unit = get_or_create_unit(db, subject.id, unit_data["name"], unit_data["order_index"])
                for index, task_title in enumerate(unit_data["tasks"], start=1):
                    get_or_create_task(db, unit.id, task_title, index)

        seed_deep_su1_exp_log(db)

        db.commit()
        print("Seed data is ready.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
