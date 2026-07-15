"""Optional demo data for the read-only student '진도표' (/student/curriculum) page.

Seeds one curriculum template per subject (수학/영어/국어) matching the design mockup,
enrolls student_id=1 in each, and marks a handful of node statuses so the page has
something to render. Idempotent — safe to re-run. Run backend/seed.py first if
student_id=1 doesn't exist yet.

This does NOT guess textbook/lecture links from titles: it only attaches a real
textbook_id/lecture_assignment_id when one already exists in the target DB (looked up
by textbook_key / an active LectureAssignment row), otherwise the node is created
without a link_url — exactly like the real admin flow would produce until an actual
curriculum editor exists.
"""
from datetime import datetime

from database import Base, SessionLocal, engine
import crud
import models  # noqa: F401
from models import (
    CurriculumEdge,
    CurriculumNode,
    CurriculumTemplate,
    LectureAssignment,
    StudentCurriculum,
    StudentCurriculumNode,
)


def get_or_create_curriculum(db, subject: str, title: str, description: str, order_index: int) -> CurriculumTemplate:
    existing = (
        db.query(CurriculumTemplate)
        .filter(CurriculumTemplate.subject == subject, CurriculumTemplate.title == title)
        .first()
    )
    if existing is not None:
        return existing

    curriculum = CurriculumTemplate(
        subject=subject, title=title, description=description, order_index=order_index
    )
    db.add(curriculum)
    db.commit()
    db.refresh(curriculum)
    return curriculum


def get_or_create_node(db, curriculum_id: int, **fields) -> CurriculumNode:
    existing = (
        db.query(CurriculumNode)
        .filter(CurriculumNode.curriculum_id == curriculum_id, CurriculumNode.title == fields["title"])
        .first()
    )
    if existing is not None:
        return existing

    node = CurriculumNode(curriculum_id=curriculum_id, **fields)
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


def get_or_create_edge(db, curriculum_id: int, from_node: CurriculumNode, to_node: CurriculumNode) -> None:
    existing = (
        db.query(CurriculumEdge)
        .filter(CurriculumEdge.from_node_id == from_node.id, CurriculumEdge.to_node_id == to_node.id)
        .first()
    )
    if existing is not None:
        return

    db.add(CurriculumEdge(curriculum_id=curriculum_id, from_node_id=from_node.id, to_node_id=to_node.id))
    db.commit()


def get_or_create_enrollment(db, student_id: int, curriculum_id: int) -> StudentCurriculum:
    existing = (
        db.query(StudentCurriculum)
        .filter(StudentCurriculum.student_id == student_id, StudentCurriculum.curriculum_id == curriculum_id)
        .first()
    )
    if existing is not None:
        return existing

    enrollment = StudentCurriculum(student_id=student_id, curriculum_id=curriculum_id)
    db.add(enrollment)
    db.commit()
    db.refresh(enrollment)
    return enrollment


def set_node_status(db, student_curriculum_id: int, node_id: int, status: str, **fields) -> None:
    existing = (
        db.query(StudentCurriculumNode)
        .filter(
            StudentCurriculumNode.student_curriculum_id == student_curriculum_id,
            StudentCurriculumNode.curriculum_node_id == node_id,
        )
        .first()
    )
    if existing is not None:
        existing.status = status
        for key, value in fields.items():
            setattr(existing, key, value)
        db.commit()
        return

    db.add(
        StudentCurriculumNode(
            student_curriculum_id=student_curriculum_id,
            curriculum_node_id=node_id,
            status=status,
            **fields,
        )
    )
    db.commit()


def seed_curriculum():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        student = crud.get_student_by_id(db, 1)
        if student is None:
            print("student_id=1 not found. Run backend/seed.py first.")
            return

        # --- 수학 커리큘럼 ---
        math_curriculum = get_or_create_curriculum(
            db, "수학", "수학 커리큘럼", "큰 흐름으로 학습 과정을 확인해요", 1
        )

        su1 = crud.get_textbook_by_key(db, "deep-su1-exp-log")
        su2 = crud.get_textbook_by_key(db, "deep-su1-trig-graph")

        n1 = get_or_create_node(
            db, math_curriculum.id, title="딥러닝 수학 I", node_type="textbook",
            group_name="기초 다지기", group_order=1, order_index=1,
            textbook_id=su1.id if su1 else None,
        )
        n2 = get_or_create_node(
            db, math_curriculum.id, title="딥러닝 수학 II", node_type="textbook",
            group_name="기초 다지기", group_order=1, order_index=2,
            textbook_id=su2.id if su2 else None,
        )
        n3 = get_or_create_node(
            db, math_curriculum.id, title="딥러닝 기하", node_type="textbook",
            group_name="기초 다지기", group_order=1, order_index=3,
        )
        calc = get_or_create_node(
            db, math_curriculum.id, title="딥러닝 미적분", node_type="textbook",
            group_name="심화 학습", group_order=2, order_index=1,
        )
        prob = get_or_create_node(
            db, math_curriculum.id, title="딥러닝 확률과 통계", node_type="textbook",
            group_name="심화 학습", group_order=2, order_index=2,
        )

        active_lecture = (
            db.query(LectureAssignment)
            .filter(LectureAssignment.student_id == student.id, LectureAssignment.status == "active")
            .order_by(LectureAssignment.id)
            .first()
        )
        query_node = get_or_create_node(
            db, math_curriculum.id, title="Query 확통 N제", node_type="lecture",
            group_name="심화 학습", group_order=2, order_index=3,
            lecture_assignment_id=active_lecture.id if active_lecture else None,
        )
        exam1 = get_or_create_node(
            db, math_curriculum.id, title="1차 모의고사", node_type="exam",
            group_name="실전 적용", group_order=3, order_index=1,
        )
        exam2 = get_or_create_node(
            db, math_curriculum.id, title="2차 모의고사", node_type="exam",
            group_name="실전 적용", group_order=3, order_index=2,
        )

        for from_node, to_node in [
            (n1, calc), (n2, calc), (n3, calc),
            (calc, prob), (calc, query_node),
            (prob, exam1), (query_node, exam2),
        ]:
            get_or_create_edge(db, math_curriculum.id, from_node, to_node)

        math_enrollment = get_or_create_enrollment(db, student.id, math_curriculum.id)
        set_node_status(db, math_enrollment.id, n1.id, "completed", completed_at=datetime(2026, 6, 1, 10, 0))
        set_node_status(db, math_enrollment.id, n2.id, "completed", completed_at=datetime(2026, 6, 8, 10, 0))
        set_node_status(db, math_enrollment.id, n3.id, "completed", completed_at=datetime(2026, 6, 15, 10, 0))
        set_node_status(db, math_enrollment.id, calc.id, "in_progress", started_at=datetime(2026, 7, 1, 9, 0))
        # prob / query / exam1 / exam2 left unset -> default "planned"

        # --- 영어 커리큘럼 ---
        english_curriculum = get_or_create_curriculum(db, "영어", "영어 커리큘럼", None, 2)
        e1 = get_or_create_node(
            db, english_curriculum.id, title="기초 문법", node_type="custom",
            group_name="1단계", group_order=1, order_index=1,
        )
        e2 = get_or_create_node(
            db, english_curriculum.id, title="독해 기본", node_type="custom",
            group_name="1단계", group_order=1, order_index=2,
        )
        e3 = get_or_create_node(
            db, english_curriculum.id, title="구문 독해", node_type="custom",
            group_name="1단계", group_order=1, order_index=3,
        )
        e4 = get_or_create_node(
            db, english_curriculum.id, title="어휘 심화", node_type="custom",
            group_name="1단계", group_order=1, order_index=4,
        )
        for from_node, to_node in [(e1, e2), (e2, e3), (e3, e4)]:
            get_or_create_edge(db, english_curriculum.id, from_node, to_node)

        english_enrollment = get_or_create_enrollment(db, student.id, english_curriculum.id)
        set_node_status(db, english_enrollment.id, e1.id, "completed", completed_at=datetime(2026, 7, 1, 10, 0))
        set_node_status(db, english_enrollment.id, e2.id, "in_progress", started_at=datetime(2026, 7, 10, 9, 0))

        # --- 국어 커리큘럼 (전부 예정) ---
        korean_curriculum = get_or_create_curriculum(db, "국어", "국어 커리큘럼", None, 3)
        k1 = get_or_create_node(
            db, korean_curriculum.id, title="문학 기초", node_type="custom",
            group_name="1단계", group_order=1, order_index=1,
        )
        k2 = get_or_create_node(
            db, korean_curriculum.id, title="비문학 기초", node_type="custom",
            group_name="1단계", group_order=1, order_index=2,
        )
        get_or_create_edge(db, korean_curriculum.id, k1, k2)
        get_or_create_enrollment(db, student.id, korean_curriculum.id)
        # both left unset -> default "planned"

        print(f"Seeded curriculum templates + enrollments for student_id={student.id}.")
    finally:
        db.close()


if __name__ == "__main__":
    seed_curriculum()
