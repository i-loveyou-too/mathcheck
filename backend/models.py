from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import relationship

from database import Base


class MathStudentTextbook(Base):
    __tablename__ = "math_student_textbooks"
    __table_args__ = (
        UniqueConstraint("student_id", "textbook_id", name="uq_math_student_textbooks"),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    textbook_id = Column(Integer, ForeignKey("math_textbooks.id"), nullable=False, index=True)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)

    student = relationship("Student", back_populates="student_textbooks")
    textbook = relationship("MathTextbook", back_populates="student_assignments")


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
    student_textbooks = relationship(
        "MathStudentTextbook",
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
    __table_args__ = (
        UniqueConstraint("full_title", name="uq_math_textbooks_full_title"),
        UniqueConstraint("textbook_key", name="uq_math_textbooks_textbook_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    series_id = Column(Integer, ForeignKey("math_textbook_series.id"), nullable=False)
    textbook_key = Column(String(100), nullable=True)
    subject = Column(String(50), nullable=True)
    title = Column(String(200), nullable=False)
    full_title = Column(String(300), nullable=False)
    type = Column(String(50), nullable=False)
    structure_type = Column(String(50), nullable=False, server_default="none")
    is_checkable = Column(Boolean, nullable=False, default=True)
    is_published = Column(Boolean, nullable=False, default=True)
    is_student_only = Column(Boolean, nullable=False, default=False)
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
    sections = relationship(
        "MathTextbookSection",
        back_populates="textbook",
        cascade="all, delete-orphan",
        order_by="MathTextbookSection.order_index, MathTextbookSection.id",
    )
    daily_tasks = relationship("MathDailyTask", back_populates="textbook")
    student_assignments = relationship(
        "MathStudentTextbook",
        back_populates="textbook",
        cascade="all, delete-orphan",
    )
    subject_tags = relationship(
        "MathTextbookSubject",
        back_populates="textbook",
        cascade="all, delete-orphan",
    )


class MathTextbookSubject(Base):
    __tablename__ = "math_textbook_subjects"
    __table_args__ = (
        UniqueConstraint("textbook_id", "subject", name="uq_math_textbook_subjects_textbook_subject"),
    )

    id = Column(Integer, primary_key=True, index=True)
    textbook_id = Column(Integer, ForeignKey("math_textbooks.id"), nullable=False, index=True)
    subject = Column(String(50), nullable=False)

    textbook = relationship("MathTextbook", back_populates="subject_tags")


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


class MathTextbookSection(Base):
    __tablename__ = "math_textbook_sections"

    id = Column(Integer, primary_key=True, index=True)
    textbook_id = Column(Integer, ForeignKey("math_textbooks.id"), nullable=False, index=True)
    unit_title = Column(String(200), nullable=True)
    section_title = Column(String(200), nullable=False)
    start_problem = Column(Integer, nullable=True)
    end_problem = Column(Integer, nullable=True)
    start_page = Column(Integer, nullable=True)
    end_page = Column(Integer, nullable=True)
    order_index = Column(Integer, nullable=False, default=0)
    show_to_student = Column(Boolean, nullable=False, default=True)
    use_for_homework = Column(Boolean, nullable=False, default=True)

    textbook = relationship("MathTextbook", back_populates="sections")


class HomeworkAssignment(Base):
    __tablename__ = "math_homework_assignments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    textbook_id = Column(Integer, ForeignKey("math_textbooks.id"), nullable=False, index=True)
    title = Column(String(200), nullable=True)
    range_type = Column(String(20), nullable=False)
    start_value = Column(Integer, nullable=True)
    end_value = Column(Integer, nullable=True)
    start_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    memo = Column(String(300), nullable=True)
    status = Column(String(20), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_by = Column(String(100), nullable=True)

    student = relationship("Student")
    textbook = relationship("MathTextbook")


class LectureAssignment(Base):
    __tablename__ = "math_lecture_assignments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    subject = Column(String(100), nullable=False)
    course_title = Column(String(200), nullable=False)
    total_lectures = Column(Integer, nullable=False)
    start_lecture_no = Column(Integer, nullable=False)
    lectures_per_day = Column(Integer, nullable=False)
    weekdays = Column(String(100), nullable=False)
    start_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    memo = Column(String(300), nullable=True)
    status = Column(String(20), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    student = relationship("Student")


class MathStudentLectureProgress(Base):
    __tablename__ = "math_student_lecture_progress"
    __table_args__ = (
        UniqueConstraint(
            "student_id",
            "daily_task_id",
            "lecture_number",
            name="uq_math_student_lecture_progress_student_task_lecture",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    daily_task_id = Column(Integer, ForeignKey("math_daily_tasks.id"), nullable=False, index=True)
    lecture_number = Column(Integer, nullable=False)
    is_done = Column(Boolean, nullable=False, default=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    student = relationship("Student")
    daily_task = relationship("MathDailyTask")


class AdminProgressChangeLog(Base):
    __tablename__ = "admin_progress_change_logs"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    target_type = Column(String(50), nullable=False)
    target_id = Column(Integer, nullable=False, index=True)
    old_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=True)
    changed_by = Column(String(50), nullable=False, default="admin")
    changed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    memo = Column(String(300), nullable=True)
    target_detail = Column(String(100), nullable=True)

    student = relationship("Student")


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
    completed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)

    # Homework assignment engine (added alongside HomeworkAssignment): all nullable/defaulted
    # so existing manual daily tasks (source_type="manual", completion_mode="manual") are
    # untouched and every pre-existing row/API response stays valid.
    source_type = Column(String(20), nullable=False, default="manual")
    homework_assignment_id = Column(
        Integer, ForeignKey("math_homework_assignments.id"), nullable=True, index=True
    )
    lecture_assignment_id = Column(
        Integer, ForeignKey("math_lecture_assignments.id"), nullable=True, index=True
    )
    range_type = Column(String(20), nullable=True)
    start_value = Column(Integer, nullable=True)
    end_value = Column(Integer, nullable=True)
    lecture_start_number = Column(Integer, nullable=True)
    lecture_end_number = Column(Integer, nullable=True)
    start_page = Column(Integer, nullable=True)
    end_page = Column(Integer, nullable=True)
    textbook_section_id = Column(
        Integer, ForeignKey("math_textbook_sections.id"), nullable=True
    )
    completion_mode = Column(String(20), nullable=False, default="manual")

    student = relationship("Student", back_populates="daily_tasks")
    textbook = relationship("MathTextbook", back_populates="daily_tasks")
    homework_assignment = relationship("HomeworkAssignment")
    lecture_assignment = relationship("LectureAssignment")
    textbook_section = relationship("MathTextbookSection")


class CurriculumTemplate(Base):
    __tablename__ = "curriculum_templates"

    id = Column(Integer, primary_key=True, index=True)
    subject = Column(String(50), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(String(300), nullable=True)
    order_index = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    nodes = relationship(
        "CurriculumNode",
        back_populates="curriculum",
        cascade="all, delete-orphan",
    )


class CurriculumNode(Base):
    __tablename__ = "curriculum_nodes"

    id = Column(Integer, primary_key=True, index=True)
    curriculum_id = Column(Integer, ForeignKey("curriculum_templates.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    node_type = Column(String(20), nullable=False)
    group_name = Column(String(100), nullable=False)
    group_order = Column(Integer, nullable=False, default=0)
    textbook_id = Column(Integer, ForeignKey("math_textbooks.id"), nullable=True)
    lecture_assignment_id = Column(Integer, ForeignKey("math_lecture_assignments.id"), nullable=True)
    description = Column(String(300), nullable=True)
    position_x = Column(Integer, nullable=False, default=0)
    position_y = Column(Integer, nullable=False, default=0)
    order_index = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    curriculum = relationship("CurriculumTemplate", back_populates="nodes")
    textbook = relationship("MathTextbook")
    lecture_assignment = relationship("LectureAssignment")


class CurriculumEdge(Base):
    __tablename__ = "curriculum_edges"

    id = Column(Integer, primary_key=True, index=True)
    curriculum_id = Column(Integer, ForeignKey("curriculum_templates.id"), nullable=False, index=True)
    from_node_id = Column(Integer, ForeignKey("curriculum_nodes.id"), nullable=False)
    to_node_id = Column(Integer, ForeignKey("curriculum_nodes.id"), nullable=False)
    edge_type = Column(String(20), nullable=False, default="sequence")


class StudentCurriculum(Base):
    __tablename__ = "student_curriculums"
    __table_args__ = (
        UniqueConstraint("student_id", "curriculum_id", name="uq_student_curriculums_student_curriculum"),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    curriculum_id = Column(Integer, ForeignKey("curriculum_templates.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    student = relationship("Student")
    curriculum = relationship("CurriculumTemplate")


class StudentCurriculumNode(Base):
    __tablename__ = "student_curriculum_nodes"
    __table_args__ = (
        UniqueConstraint(
            "student_curriculum_id", "curriculum_node_id", name="uq_student_curriculum_nodes_unique"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_curriculum_id = Column(Integer, ForeignKey("student_curriculums.id"), nullable=False, index=True)
    curriculum_node_id = Column(Integer, ForeignKey("curriculum_nodes.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="planned")
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    memo = Column(String(300), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    student_curriculum = relationship("StudentCurriculum")
    curriculum_node = relationship("CurriculumNode")
