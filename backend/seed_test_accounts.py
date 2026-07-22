from __future__ import annotations

import models  # noqa: F401
from database import SessionLocal
from student_auth import normalize_phone


TEST_ADMIN = {"username": "testadmin", "password": "testadmin"}
TEST_STUDENTS = [
    {"name": "teststudent1", "phone": "01011111111", "grade": "고3"},
    {"name": "teststudent2", "phone": "01022222222", "grade": "고3"},
]


def find_student_by_normalized_phone(db, phone: str) -> models.Student | None:
    normalized = normalize_phone(phone)
    for student in db.query(models.Student).all():
        if normalize_phone(student.phone) == normalized:
            return student
    return None


def upsert_test_admin(db) -> str:
    admin = db.query(models.Admin).filter(models.Admin.username == TEST_ADMIN["username"]).first()
    if admin is None:
        db.add(models.Admin(username=TEST_ADMIN["username"], password=TEST_ADMIN["password"]))
        return "관리자 생성: testadmin"
    changed = False
    if admin.password != TEST_ADMIN["password"]:
        admin.password = TEST_ADMIN["password"]
        changed = True
    return "관리자 이미 존재: testadmin" if not changed else "관리자 비밀번호 갱신: testadmin"


def upsert_test_student(db, data: dict) -> str:
    phone = normalize_phone(data["phone"])
    student = find_student_by_normalized_phone(db, phone)
    if student is None:
        db.add(models.Student(name=data["name"], phone=phone, grade=data["grade"]))
        return f"학생 생성: {data['name']} ({phone})"

    changed_fields: list[str] = []
    if student.name != data["name"]:
        student.name = data["name"]
        changed_fields.append("name")
    if student.phone != phone:
        student.phone = phone
        changed_fields.append("phone")
    if not student.grade:
        student.grade = data["grade"]
        changed_fields.append("grade")

    if changed_fields:
        return f"학생 필드 갱신: {data['name']} ({phone}) - {', '.join(changed_fields)}"
    return f"학생 이미 존재: {data['name']} ({phone})"


def run() -> None:
    db = SessionLocal()
    try:
        messages = [upsert_test_admin(db)]
        for student in TEST_STUDENTS:
            messages.append(upsert_test_student(db, student))

        db.commit()

        messages.append("관리자-학생 연결: 별도 연결 테이블 없음, 현재 /admin/students는 전체 학생 조회 구조")
        for message in messages:
            print(message)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
