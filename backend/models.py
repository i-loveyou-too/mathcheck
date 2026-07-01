from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import relationship

from database import Base


class Student(Base):
    __tablename__ = "math_students"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(20), unique=True, index=True, nullable=False)
    grade = Column(String(20), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    progress = relationship("Progress", back_populates="student", cascade="all, delete-orphan")


class Admin(Base):
    __tablename__ = "math_admins"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Subject(Base):
    __tablename__ = "math_subjects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    order_index = Column(Integer, nullable=False, default=0)

    units = relationship(
        "Unit",
        back_populates="subject",
        cascade="all, delete-orphan",
        order_by="Unit.order_index, Unit.id",
    )


class Unit(Base):
    __tablename__ = "math_units"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("math_subjects.id"), nullable=False)
    name = Column(String(100), nullable=False)
    order_index = Column(Integer, nullable=False, default=0)

    subject = relationship("Subject", back_populates="units")
    tasks = relationship(
        "Task",
        back_populates="unit",
        cascade="all, delete-orphan",
        order_by="Task.order_index, Task.id",
    )


class Task(Base):
    __tablename__ = "math_tasks"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("math_units.id"), nullable=False)
    title = Column(String(200), nullable=False)
    order_index = Column(Integer, nullable=False, default=0)

    unit = relationship("Unit", back_populates="tasks")
    progress_entries = relationship("Progress", back_populates="task", cascade="all, delete-orphan")


class Progress(Base):
    __tablename__ = "math_progress"
    __table_args__ = (UniqueConstraint("student_id", "task_id", name="uq_math_progress_student_task"),)

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False)
    task_id = Column(Integer, ForeignKey("math_tasks.id"), nullable=False)
    is_done = Column(Boolean, nullable=False, default=False)
    done_at = Column(DateTime(timezone=True), nullable=True)

    student = relationship("Student", back_populates="progress")
    task = relationship("Task", back_populates="progress_entries")
