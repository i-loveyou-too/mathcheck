from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
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
    item_progress = relationship(
        "MathStudentItemProgress",
        back_populates="student",
        cascade="all, delete-orphan",
    )
    daily_tasks = relationship(
        "MathDailyTask",
        back_populates="student",
        cascade="all, delete-orphan",
    )


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


class MathTextbookSeries(Base):
    __tablename__ = "math_textbook_series"
    __table_args__ = (
        UniqueConstraint("display_name", "type", name="uq_math_textbook_series_display_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    korean_name = Column(String(100), nullable=False)
    english_name = Column(String(100), nullable=False)
    display_name = Column(String(200), nullable=False)
    type = Column(String(50), nullable=False)
    order_index = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    textbooks = relationship(
        "MathTextbook",
        back_populates="series",
        cascade="all, delete-orphan",
        order_by="MathTextbook.order_index, MathTextbook.id",
    )


class MathTextbook(Base):
    __tablename__ = "math_textbooks"
    __table_args__ = (UniqueConstraint("full_title", name="uq_math_textbooks_full_title"),)

    id = Column(Integer, primary_key=True, index=True)
    series_id = Column(Integer, ForeignKey("math_textbook_series.id"), nullable=False)
    subject = Column(String(50), nullable=True)
    title = Column(String(200), nullable=False)
    full_title = Column(String(300), nullable=False)
    type = Column(String(50), nullable=False)
    is_checkable = Column(Boolean, nullable=False, default=True)
    is_published = Column(Boolean, nullable=False, default=True)
    order_index = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    series = relationship("MathTextbookSeries", back_populates="textbooks")
    items = relationship(
        "MathTextbookItem",
        back_populates="textbook",
        cascade="all, delete-orphan",
        order_by="MathTextbookItem.order_index, MathTextbookItem.id",
    )
    daily_tasks = relationship("MathDailyTask", back_populates="textbook")


class MathTextbookItem(Base):
    __tablename__ = "math_textbook_items"
    __table_args__ = (
        UniqueConstraint("textbook_id", "item_number", name="uq_math_textbook_items_textbook_number"),
    )

    id = Column(Integer, primary_key=True, index=True)
    textbook_id = Column(Integer, ForeignKey("math_textbooks.id"), nullable=False)
    item_number = Column(Integer, nullable=False)
    title = Column(String(100), nullable=False)
    item_type = Column(String(50), nullable=False)
    order_index = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    textbook = relationship("MathTextbook", back_populates="items")
    progress_entries = relationship(
        "MathStudentItemProgress",
        back_populates="item",
        cascade="all, delete-orphan",
    )


class MathStudentItemProgress(Base):
    __tablename__ = "math_student_item_progress"
    __table_args__ = (
        UniqueConstraint("student_id", "item_id", name="uq_math_student_item_progress_student_item"),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("math_textbook_items.id"), nullable=False)
    status = Column(String(50), nullable=False, default="not_started")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    student = relationship("Student", back_populates="item_progress")
    item = relationship("MathTextbookItem", back_populates="progress_entries")


class MathDailyTask(Base):
    __tablename__ = "math_daily_tasks"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    task_date = Column(Date, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    detail = Column(String(300), nullable=True)
    textbook_id = Column(Integer, ForeignKey("math_textbooks.id"), nullable=True)
    textbook_key = Column(String(100), nullable=True)
    start_item_number = Column(Integer, nullable=True)
    end_item_number = Column(Integer, nullable=True)
    status = Column(String(50), nullable=False, default="todo")
    difficulty = Column(String(50), nullable=True)
    category = Column(String(100), nullable=True)
    order_index = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=True)

    student = relationship("Student", back_populates="daily_tasks")
    textbook = relationship("MathTextbook", back_populates="daily_tasks")
