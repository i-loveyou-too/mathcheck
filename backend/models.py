from sqlalchemy import Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from database import Base


JSONB_TYPE = JSON().with_variant(JSONB, "postgresql")


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


class MathStudentTextbookMilestone(Base):
    """학생-교재 단위 수동 마일스톤(예: 1회독 완료). 문항별 자동 집계와는 별개로
    관리자가 수동으로 확정하는 표시라 math_student_item_progress와 분리한다."""

    __tablename__ = "math_student_textbook_milestones"
    __table_args__ = (
        UniqueConstraint("student_id", "textbook_id", name="uq_math_student_textbook_milestones"),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    textbook_id = Column(Integer, ForeignKey("math_textbooks.id"), nullable=False, index=True)
    first_pass_completed_at = Column(DateTime(timezone=True), nullable=True)
    # 디버그 모의고사 등 학생이 직접 표시하는 마일스톤. first_pass_completed_at(관리자 전용)과
    # 별개 컬럼으로 두어 누가 토글 가능한지 헷갈리지 않게 한다.
    debugging_completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    student = relationship("Student")
    textbook = relationship("MathTextbook")


class Student(Base):
    __tablename__ = "math_students"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(20), unique=True, index=True, nullable=False)
    grade = Column(String(20), nullable=False)
    # 수능 선택과목 프로필. 모의고사 세트 배정 시 "기본값"으로만 쓰이며, 실제 배정은 배정 시점에
    # assignment(=특정 과목 시험)로 확정 저장되므로 이후 프로필이 바뀌어도 기존 배정은 유지된다.
    korean_elective = Column(String(30), nullable=True)   # 화법과 작문 / 언어와 매체
    math_elective = Column(String(30), nullable=True)     # 확률과 통계 / 미적분 / 기하
    inquiry_subject_1 = Column(String(30), nullable=True)  # 생활과 윤리 / 윤리와 사상 / 사회문화 / 동아시아사
    inquiry_subject_2 = Column(String(30), nullable=True)
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


class StudentSession(Base):
    __tablename__ = "student_sessions"
    __table_args__ = (
        Index("ix_student_sessions_student_id", "student_id"),
        Index("ix_student_sessions_token_hash", "token_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(64), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    student = relationship("Student")


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
    video_url = Column(String(500), nullable=True)
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
    is_active = Column(Boolean, nullable=False, default=True)
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


class VocabularyBank(Base):
    __tablename__ = "vocabulary_banks"
    __table_args__ = (
        UniqueConstraint("title", name="uq_vocabulary_banks_title"),
        Index("ix_vocabulary_banks_active", "is_active"),
    )

    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    total_words = Column(Integer, nullable=False, default=0, server_default=text("0"))
    total_days = Column(Integer, nullable=False, default=50)
    words_per_day = Column(Integer, nullable=False, default=40)
    default_daily_test_question_count = Column(Integer, nullable=False, default=100, server_default=text("100"))
    source_filename = Column(String(255), nullable=True)
    source_format = Column(String(100), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class VocabularyBankWord(Base):
    __tablename__ = "vocabulary_bank_words"
    __table_args__ = (
        UniqueConstraint("bank_id", "normalized_english", name="uq_vocabulary_bank_word_english"),
        UniqueConstraint("bank_id", "day_no", "day_order", name="uq_vocabulary_bank_word_day_order"),
        Index("ix_vocabulary_bank_words_bank_day", "bank_id", "day_no"),
    )

    id = Column(Integer, primary_key=True)
    bank_id = Column(Integer, ForeignKey("vocabulary_banks.id", ondelete="CASCADE"), nullable=False)
    day_no = Column(Integer, nullable=False)
    order_index = Column(Integer, nullable=False)
    day_order = Column(Integer, nullable=False)
    english = Column(String(200), nullable=False)
    normalized_english = Column(String(200), nullable=False)
    accepted_meanings = Column(JSON, nullable=False)
    raw_meaning = Column(Text, nullable=False)
    part_of_speech = Column(String(100), nullable=True)
    memo = Column(String(300), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class VocabularyChallenge(Base):
    __tablename__ = "vocabulary_challenges"
    __table_args__ = (
        Index("ix_vocabulary_challenges_student_id", "student_id"),
        Index("ix_vocabulary_challenges_dates", "start_date", "end_date"),
        Index("ix_vocabulary_challenges_word_bank_id", "word_bank_id"),
    )

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    accumulation_type = Column(String(20), nullable=False, default="all_previous")
    recent_days = Column(Integer, nullable=True)
    source_type = Column(String(20), nullable=False, default="direct")
    word_bank_id = Column(Integer, ForeignKey("vocabulary_banks.id"), nullable=True)
    daily_new_word_count = Column(Integer, nullable=False, default=40)
    daily_test_question_count = Column(Integer, nullable=False, default=100)
    bank_day_direction = Column(String(20), nullable=False, default="ascending", server_default=text("'ascending'"))
    start_bank_day = Column(Integer, nullable=True)
    bank_days_per_learning_day = Column(Integer, nullable=False, default=3, server_default=text("3"))
    max_question_count = Column(Integer, nullable=False, default=100, server_default=text("100"))
    allow_student_answer_pdf = Column(Boolean, nullable=False, default=False, server_default=text("FALSE"))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class VocabularyWord(Base):
    __tablename__ = "vocabulary_words"
    __table_args__ = (
        UniqueConstraint("challenge_id", "normalized_english", name="uq_vocabulary_word_challenge_english"),
        Index("ix_vocabulary_words_challenge_id", "challenge_id"),
    )

    id = Column(Integer, primary_key=True)
    challenge_id = Column(Integer, ForeignKey("vocabulary_challenges.id", ondelete="CASCADE"), nullable=False)
    english = Column(String(200), nullable=False)
    normalized_english = Column(String(200), nullable=False)
    accepted_answers = Column(JSON, nullable=False)
    memo = Column(String(300), nullable=True)
    order_index = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class VocabularyDailyAssignment(Base):
    __tablename__ = "vocabulary_daily_assignments"
    __table_args__ = (
        UniqueConstraint("challenge_id", "assignment_date", "word_id", name="uq_vocabulary_daily_assignment"),
        Index("ix_vocabulary_daily_assignments_date", "assignment_date"),
    )

    id = Column(Integer, primary_key=True)
    challenge_id = Column(Integer, ForeignKey("vocabulary_challenges.id", ondelete="CASCADE"), nullable=False)
    assignment_date = Column(Date, nullable=False)
    word_id = Column(Integer, ForeignKey("vocabulary_words.id", ondelete="CASCADE"), nullable=False)


class VocabularyTestSession(Base):
    __tablename__ = "vocabulary_test_sessions"
    __table_args__ = (
        UniqueConstraint(
            "challenge_id", "student_id", "study_date", "session_type",
            name="uq_vocabulary_test_session_student_date_type",
        ),
        Index("ix_vocabulary_test_sessions_student_date", "student_id", "study_date"),
    )

    id = Column(Integer, primary_key=True)
    challenge_id = Column(Integer, ForeignKey("vocabulary_challenges.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False)
    study_date = Column(Date, nullable=False)
    session_type = Column(String(20), nullable=False, default="main")
    status = Column(String(20), nullable=False, default="draft")
    score = Column(Integer, nullable=True)
    correct_count = Column(Integer, nullable=True)
    total_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    # 관리자가 이 시험지(session)를 확인했다는 표시. 채점/제출 로직과는 무관한 순수 체크용.
    admin_reviewed_at = Column(DateTime(timezone=True), nullable=True)


class VocabularyTestQuestion(Base):
    __tablename__ = "vocabulary_test_questions"
    __table_args__ = (
        UniqueConstraint("session_id", "order_index", name="uq_vocabulary_question_session_order"),
        Index(
            "uq_vocabulary_question_session_direct_word",
            "session_id",
            "word_id",
            unique=True,
            postgresql_where=text("word_source_type = 'direct' AND word_id IS NOT NULL"),
            sqlite_where=text("word_source_type = 'direct' AND word_id IS NOT NULL"),
        ),
        Index(
            "uq_vocabulary_question_session_bank_word",
            "session_id",
            "bank_word_id",
            unique=True,
            postgresql_where=text("word_source_type = 'word_bank' AND bank_word_id IS NOT NULL"),
            sqlite_where=text("word_source_type = 'word_bank' AND bank_word_id IS NOT NULL"),
        ),
    )

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("vocabulary_test_sessions.id", ondelete="CASCADE"), nullable=False)
    word_id = Column(Integer, ForeignKey("vocabulary_words.id"), nullable=True)
    bank_word_id = Column(Integer, ForeignKey("vocabulary_bank_words.id"), nullable=True)
    word_source_type = Column(String(20), nullable=False, default="direct")
    order_index = Column(Integer, nullable=False)
    english_snapshot = Column(String(200), nullable=False)
    accepted_answers_snapshot = Column(JSON, nullable=False)


class VocabularyTestAnswer(Base):
    __tablename__ = "vocabulary_test_answers"
    __table_args__ = (UniqueConstraint("question_id", name="uq_vocabulary_answer_question"),)

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("vocabulary_test_sessions.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("vocabulary_test_questions.id", ondelete="CASCADE"), nullable=False)
    input_answer = Column(Text, nullable=False, default="")
    is_correct = Column(Boolean, nullable=True)
    # 관리자 수동 채점 수정 (7차). is_correct(자동채점 원본)는 절대 덮어쓰지 않는다.
    # 최종판정 = manual_is_correct가 not None이면 manual_is_correct, 아니면 is_correct.
    manual_is_correct = Column(Boolean, nullable=True)
    manual_reason = Column(Text, nullable=True)
    manual_graded_by = Column(Integer, ForeignKey("math_admins.id"), nullable=True)
    manual_graded_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class VocabularyManualGradingLog(Base):
    """영단어 수동 채점 수정 감사 로그. append-only: 기존 행은 수정/삭제하지 않는다."""

    __tablename__ = "vocabulary_manual_grading_logs"
    __table_args__ = (
        Index("ix_vocabulary_manual_grading_logs_answer_id", "answer_id"),
    )

    id = Column(Integer, primary_key=True)
    answer_id = Column(Integer, ForeignKey("vocabulary_test_answers.id", ondelete="CASCADE"), nullable=False)
    previous_final = Column(Boolean, nullable=True)
    new_final = Column(Boolean, nullable=True)
    auto_is_correct = Column(Boolean, nullable=True)
    action = Column(String(20), nullable=False)
    reason = Column(Text, nullable=True)
    admin_id = Column(Integer, ForeignKey("math_admins.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class VocabularyWrongNote(Base):
    __tablename__ = "vocabulary_wrong_notes"
    __table_args__ = (
        Index("ix_vocabulary_wrong_notes_student_status", "student_id", "status"),
        Index(
            "uq_vocabulary_wrong_note_student_direct_word",
            "student_id",
            "word_id",
            unique=True,
            postgresql_where=text("word_source_type = 'direct' AND word_id IS NOT NULL"),
            sqlite_where=text("word_source_type = 'direct' AND word_id IS NOT NULL"),
        ),
        Index(
            "uq_vocabulary_wrong_note_student_bank_word",
            "student_id",
            "bank_word_id",
            unique=True,
            postgresql_where=text("word_source_type = 'word_bank' AND bank_word_id IS NOT NULL"),
            sqlite_where=text("word_source_type = 'word_bank' AND bank_word_id IS NOT NULL"),
        ),
    )

    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False)
    word_id = Column(Integer, ForeignKey("vocabulary_words.id", ondelete="CASCADE"), nullable=True)
    bank_word_id = Column(Integer, ForeignKey("vocabulary_bank_words.id", ondelete="CASCADE"), nullable=True)
    word_source_type = Column(String(20), nullable=False, default="direct")
    latest_wrong_answer = Column(Text, nullable=False, default="")
    first_wrong_date = Column(Date, nullable=False)
    latest_wrong_date = Column(Date, nullable=False)
    wrong_count = Column(Integer, nullable=False, default=1)
    status = Column(String(20), nullable=False, default="unresolved")
    resolved_at = Column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# SPRINT: 지정 기간 집중 학습관리 (오늘도 해냄과 별개인 두 번째 메인 서비스)
# ---------------------------------------------------------------------------


class SprintProgram(Base):
    __tablename__ = "sprint_programs"
    __table_args__ = (
        Index("ix_sprint_programs_student_dates", "student_id", "start_date", "end_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    daily_study_goal_minutes = Column(Integer, nullable=True)

    # 기능 사용 여부 (관리자가 SPRINT별로 켜고 끔)
    enable_seat_check = Column(Boolean, nullable=False, default=False)
    enable_planner_submission = Column(Boolean, nullable=False, default=False)
    enable_study_timer = Column(Boolean, nullable=False, default=False)
    enable_study_time_submission = Column(Boolean, nullable=False, default=False)
    enable_vocabulary = Column(Boolean, nullable=False, default=False)
    enable_mock_exam = Column(Boolean, nullable=False, default=False)
    enable_goals = Column(Boolean, nullable=False, default=True)
    enable_three_strikes = Column(Boolean, nullable=False, default=True)
    enable_penalty_assignment = Column(Boolean, nullable=False, default=False)

    # 삼진아웃 / 깜지 설정
    strike_threshold = Column(Integer, nullable=False, default=3)
    penalty_word_count = Column(Integer, nullable=False, default=20)
    penalty_repetition_count = Column(Integer, nullable=False, default=5)
    penalty_due_hours = Column(Integer, nullable=False, default=24)
    planner_deadline_time = Column(String(5), nullable=True)
    seat_check_deadline_time = Column(String(5), nullable=True)
    seat_check_open_time = Column(String(5), nullable=True)
    planner_mode = Column(String(20), nullable=False, default="paper", server_default=text("'paper'"))
    study_time_deadline_time = Column(String(5), nullable=True)
    study_time_strike_on_missing = Column(Boolean, nullable=False, default=False, server_default=text("FALSE"))
    study_time_strike_on_shortage = Column(Boolean, nullable=False, default=False, server_default=text("FALSE"))
    # 컬럼과 기존 시리즈 API는 그대로 남기고, 새 회차 자동 생성 시 기본값 후보로만 쓴다.
    mock_exam_weekday = Column(Integer, nullable=True)
    mock_exam_start_time = Column(String(5), nullable=True)
    mock_exam_submission_deadline_time = Column(String(5), nullable=True)
    first_mock_exam_date = Column(Date, nullable=True)
    # 학생의 탐구 선택과목 2개 (7차 회차·시험지 모델에서 참가자 paper 자동 연결에 사용).
    inquiry_subject_1 = Column(String(30), nullable=True)
    inquiry_subject_2 = Column(String(30), nullable=True)
    vocabulary_bank_id = Column(Integer, ForeignKey("vocabulary_banks.id"), nullable=True)
    vocabulary_start_bank_day = Column(Integer, nullable=True)
    vocabulary_bank_day_direction = Column(String(20), nullable=False, default="ascending", server_default=text("'ascending'"))
    vocabulary_bank_days_per_learning_day = Column(Integer, nullable=False, default=3, server_default=text("3"))
    vocabulary_max_question_count = Column(Integer, nullable=False, default=100, server_default=text("100"))
    vocabulary_allow_student_answer_pdf = Column(Boolean, nullable=False, default=False, server_default=text("FALSE"))
    planner_strike_on_late = Column(Boolean, nullable=False, default=True)
    planner_strike_on_missing = Column(Boolean, nullable=False, default=True)
    seat_check_strike_on_late = Column(Boolean, nullable=False, default=True)
    seat_check_strike_on_missing = Column(Boolean, nullable=False, default=True)
    daily_auto_strike_limit = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    student = relationship("Student")
    goals = relationship(
        "SprintGoal",
        back_populates="program",
        cascade="all, delete-orphan",
        order_by="SprintGoal.order_index, SprintGoal.id",
    )
    strikes = relationship(
        "SprintStrike",
        back_populates="program",
        cascade="all, delete-orphan",
        order_by="SprintStrike.created_at.desc()",
    )
    penalties = relationship(
        "SprintPenaltyAssignment",
        back_populates="program",
        cascade="all, delete-orphan",
    )
    study_submissions = relationship(
        "SprintStudySubmission",
        back_populates="program",
        cascade="all, delete-orphan",
    )
    daily_proof_submissions = relationship(
        "SprintDailyProofSubmission",
        back_populates="program",
        cascade="all, delete-orphan",
    )
    worksheet_assignments = relationship(
        "SprintWorksheetAssignment",
        back_populates="program",
        cascade="all, delete-orphan",
    )


class SprintGoal(Base):
    __tablename__ = "sprint_goals"

    id = Column(Integer, primary_key=True, index=True)
    sprint_program_id = Column(
        Integer, ForeignKey("sprint_programs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    target_value = Column(Integer, nullable=True)
    current_value = Column(Integer, nullable=False, default=0)
    unit = Column(String(50), nullable=True)
    order_index = Column(Integer, nullable=False, default=0)
    is_completed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    program = relationship("SprintProgram", back_populates="goals")


class SprintStrike(Base):
    __tablename__ = "sprint_strikes"
    __table_args__ = (
        Index("ix_sprint_strikes_program_active", "sprint_program_id", "is_cancelled"),
        # 자동 판정 스트라이크는 source_ref 기준으로 재실행해도 중복 생성되지 않아야 한다.
        Index(
            "uq_sprint_strikes_source_ref_not_null",
            "source_ref",
            unique=True,
            postgresql_where=text("source_ref IS NOT NULL"),
            sqlite_where=text("source_ref IS NOT NULL"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    sprint_program_id = Column(
        Integer, ForeignKey("sprint_programs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    strike_type = Column(String(40), nullable=False, default="manual")
    reason = Column(String(500), nullable=True)
    learning_date = Column(Date, nullable=False)
    related_entity_type = Column(String(40), nullable=True)
    related_entity_id = Column(Integer, nullable=True)
    source_type = Column(String(40), nullable=False, default="manual")
    source_ref = Column(String(100), nullable=True, index=True)
    created_by_admin_id = Column(Integer, ForeignKey("math_admins.id"), nullable=True)
    is_cancelled = Column(Boolean, nullable=False, default=False)
    cancelled_reason = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)

    program = relationship("SprintProgram", back_populates="strikes")


class SprintPenaltyAssignment(Base):
    """깜지(패널티) 기반 구조. 1차에서는 제출/승인 UI는 만들지 않고,
    학생 대시보드가 유효 스트라이크/진행 중 패널티 요약을 수용할 수 있도록 테이블만 마련한다."""

    __tablename__ = "sprint_penalty_assignments"

    id = Column(Integer, primary_key=True, index=True)
    sprint_program_id = Column(
        Integer, ForeignKey("sprint_programs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    penalty_type = Column(String(40), nullable=False, default="vocabulary_kkamji")
    status = Column(String(20), nullable=False, default="assigned", index=True)
    triggered_strike_count = Column(Integer, nullable=False, default=0)
    instructions = Column(String(500), nullable=True)
    word_count = Column(Integer, nullable=True)
    repetition_count = Column(Integer, nullable=True)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    due_at = Column(DateTime(timezone=True), nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    attachment_url = Column(String(500), nullable=True)

    program = relationship("SprintProgram", back_populates="penalties")


class SprintStudySubmission(Base):
    __tablename__ = "sprint_study_submissions"
    __table_args__ = (
        UniqueConstraint(
            "sprint_program_id",
            "student_id",
            "learning_date",
            name="uq_sprint_study_submission_program_student_date",
        ),
        Index("ix_sprint_study_submissions_program_status", "sprint_program_id", "status"),
        Index("ix_sprint_study_submissions_student_date", "student_id", "learning_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    sprint_program_id = Column(
        Integer, ForeignKey("sprint_programs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    learning_date = Column(Date, nullable=False, index=True)
    total_minutes = Column(Integer, nullable=False)
    subject_breakdown = Column(JSON, nullable=True)
    memo = Column(String(500), nullable=True)
    status = Column(String(20), nullable=False, default="draft", index=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(Integer, ForeignKey("math_admins.id"), nullable=True)
    review_note = Column(String(500), nullable=True)
    approved_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    program = relationship("SprintProgram", back_populates="study_submissions")
    student = relationship("Student")
    images = relationship(
        "SprintStudySubmissionImage",
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="SprintStudySubmissionImage.order_index, SprintStudySubmissionImage.id",
    )


class SprintStudySubmissionImage(Base):
    __tablename__ = "sprint_study_submission_images"
    __table_args__ = (
        Index("ix_sprint_study_submission_images_submission", "submission_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(
        Integer, ForeignKey("sprint_study_submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    storage_key = Column(String(500), nullable=False)
    original_filename = Column(String(255), nullable=True)
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    order_index = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    submission = relationship("SprintStudySubmission", back_populates="images")


class SprintDailyProofSubmission(Base):
    __tablename__ = "sprint_daily_proof_submissions"
    __table_args__ = (
        UniqueConstraint(
            "sprint_program_id",
            "student_id",
            "learning_date",
            "proof_type",
            name="uq_sprint_daily_proof_program_student_date_type",
        ),
        Index("ix_sprint_daily_proof_program_type_status", "sprint_program_id", "proof_type", "workflow_status"),
        Index("ix_sprint_daily_proof_student_date", "student_id", "learning_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    sprint_program_id = Column(Integer, ForeignKey("sprint_programs.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    learning_date = Column(Date, nullable=False, index=True)
    proof_type = Column(String(20), nullable=False)
    workflow_status = Column(String(20), nullable=False, default="draft", index=True)
    timing_status = Column(String(20), nullable=False, default="not_due", index=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejected_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(Integer, ForeignKey("math_admins.id"), nullable=True)
    review_note = Column(String(500), nullable=True)
    memo = Column(String(500), nullable=True)
    timing_override = Column(String(20), nullable=True)
    timing_override_reason = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    program = relationship("SprintProgram", back_populates="daily_proof_submissions")
    student = relationship("Student")
    images = relationship(
        "SprintDailyProofImage",
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="SprintDailyProofImage.order_index, SprintDailyProofImage.id",
    )
    attempts = relationship(
        "SprintDailyProofAttempt",
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="SprintDailyProofAttempt.attempt_no",
    )


class SprintDailyProofAttempt(Base):
    __tablename__ = "sprint_daily_proof_attempts"
    __table_args__ = (
        UniqueConstraint("submission_id", "attempt_no", name="uq_sprint_daily_proof_attempt_no"),
    )

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("sprint_daily_proof_submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    attempt_no = Column(Integer, nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=False)
    timing_status = Column(String(20), nullable=False)
    memo = Column(String(500), nullable=True)
    review_status = Column(String(20), nullable=False, default="pending")
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_note = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    submission = relationship("SprintDailyProofSubmission", back_populates="attempts")


class SprintDailyProofImage(Base):
    __tablename__ = "sprint_daily_proof_images"
    __table_args__ = (
        Index("ix_sprint_daily_proof_images_submission", "submission_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("sprint_daily_proof_submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    storage_key = Column(String(500), nullable=False)
    original_filename = Column(String(255), nullable=True)
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    order_index = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    submission = relationship("SprintDailyProofSubmission", back_populates="images")


class SprintWorksheetAssignment(Base):
    """관리자가 배정하는 문제지(PDF). 학생은 다운로드 후 풀이를 제출한다."""

    __tablename__ = "sprint_worksheet_assignments"
    __table_args__ = (
        Index("ix_sprint_worksheet_assignments_program_student", "sprint_program_id", "student_id"),
        Index("ix_sprint_worksheet_assignments_student_active", "student_id", "is_active"),
    )

    id = Column(Integer, primary_key=True, index=True)
    sprint_program_id = Column(Integer, ForeignKey("sprint_programs.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    subject = Column(String(50), nullable=True)
    assigned_date = Column(Date, nullable=False, index=True)
    due_date = Column(Date, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    storage_key = Column(String(500), nullable=False)
    original_filename = Column(String(255), nullable=True)
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    created_by_admin_id = Column(Integer, ForeignKey("math_admins.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    program = relationship("SprintProgram", back_populates="worksheet_assignments")
    student = relationship("Student")
    submission = relationship(
        "SprintWorksheetSubmission",
        back_populates="assignment",
        uselist=False,
        cascade="all, delete-orphan",
    )


class SprintWorksheetSubmission(Base):
    """학생이 제출하는 풀이(PDF 1개 또는 사진 여러 장). 배정당 1건, 반려 시 같은 건을 재작성한다."""

    __tablename__ = "sprint_worksheet_submissions"
    __table_args__ = (
        UniqueConstraint("assignment_id", name="uq_sprint_worksheet_submission_assignment"),
        Index("ix_sprint_worksheet_submissions_student_status", "student_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("sprint_worksheet_assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    submission_method = Column(String(20), nullable=True)
    status = Column(String(20), nullable=False, default="draft", index=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(Integer, ForeignKey("math_admins.id"), nullable=True)
    review_note = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    assignment = relationship("SprintWorksheetAssignment", back_populates="submission")
    student = relationship("Student")
    files = relationship(
        "SprintWorksheetSubmissionFile",
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="SprintWorksheetSubmissionFile.order_index, SprintWorksheetSubmissionFile.id",
    )


class SprintWorksheetSubmissionFile(Base):
    __tablename__ = "sprint_worksheet_submission_files"
    __table_args__ = (
        Index("ix_sprint_worksheet_submission_files_submission", "submission_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("sprint_worksheet_submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    file_kind = Column(String(10), nullable=False)
    storage_key = Column(String(500), nullable=False)
    original_filename = Column(String(255), nullable=True)
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    order_index = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    submission = relationship("SprintWorksheetSubmission", back_populates="files")


# ---------------------------------------------------------------------------
# 전역 수업 일정 관리 (SPRINT와 무관, 모든 학생 상시 적용)
# ---------------------------------------------------------------------------


class StudentLessonSchedule(Base):
    """정규 반복 수업 규칙 (Asia/Seoul 기준). 요일 하나당 한 레코드."""

    __tablename__ = "student_lesson_schedules"
    __table_args__ = (
        Index("ix_student_lesson_schedules_student_active", "student_id", "is_active"),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    title = Column(String(200), nullable=True)
    weekday = Column(Integer, nullable=False)  # 0=월 ... 6=일 (Python date.weekday())
    start_time = Column(String(5), nullable=False)  # "HH:MM"
    end_time = Column(String(5), nullable=False)  # "HH:MM"
    timezone = Column(String(50), nullable=False, default="Asia/Seoul")
    effective_start_date = Column(Date, nullable=False)
    effective_end_date = Column(Date, nullable=True)
    location = Column(String(200), nullable=True)
    memo = Column(String(500), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    student = relationship("Student")


class StudentLessonEvent(Base):
    """실제 날짜별 수업 및 예외(일회성/보강/취소/변경). 정규 규칙에서 파생된 날짜는
    이 테이블에 override 레코드가 없으면 조회 시 합성된다."""

    __tablename__ = "student_lesson_events"
    __table_args__ = (
        Index("ix_student_lesson_events_student_date", "student_id", "event_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    schedule_id = Column(
        Integer, ForeignKey("student_lesson_schedules.id", ondelete="SET NULL"), nullable=True, index=True
    )
    event_date = Column(Date, nullable=False, index=True)
    start_time = Column(String(5), nullable=False)  # "HH:MM" Asia/Seoul
    end_time = Column(String(5), nullable=False)
    timezone = Column(String(50), nullable=False, default="Asia/Seoul")
    event_type = Column(String(20), nullable=False, default="regular")  # regular/extra/makeup/trial/other
    status = Column(String(20), nullable=False, default="scheduled")  # scheduled/completed/cancelled/rescheduled
    title = Column(String(200), nullable=True)
    location = Column(String(200), nullable=True)
    memo = Column(String(500), nullable=True)
    original_event_id = Column(Integer, ForeignKey("student_lesson_events.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    student = relationship("Student")
    schedule = relationship("StudentLessonSchedule")


# ---------------------------------------------------------------------------
# SPRINT 자동 판정 실행 로그 (4차: 자동 판정 및 자동 스트라이크)
# ---------------------------------------------------------------------------


class SprintComplianceRun(Base):
    """관리자 API 또는 CLI가 evaluate_sprint_compliance를 실행한 단위 로그.
    program_id는 시스템 전체(여러 프로그램) 실행일 경우 null일 수 있다."""

    __tablename__ = "sprint_compliance_runs"
    __table_args__ = (
        Index("ix_sprint_compliance_runs_program_date", "program_id", "target_date_from"),
        Index("ix_sprint_compliance_runs_status", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    program_id = Column(Integer, ForeignKey("sprint_programs.id", ondelete="SET NULL"), nullable=True, index=True)
    target_date_from = Column(Date, nullable=False)
    target_date_to = Column(Date, nullable=False)
    run_type = Column(String(40), nullable=False)
    dry_run = Column(Boolean, nullable=False, default=False)
    status = Column(String(20), nullable=False, default="running")
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    evaluated_students = Column(Integer, nullable=False, default=0)
    created_strikes = Column(Integer, nullable=False, default=0)
    cancelled_strikes = Column(Integer, nullable=False, default=0)
    pending_count = Column(Integer, nullable=False, default=0)
    skipped_count = Column(Integer, nullable=False, default=0)
    error_message = Column(String(1000), nullable=True)

    program = relationship("SprintProgram")


# ---------------------------------------------------------------------------
# SPRINT 주간 반복 모의고사 (5차: OMR 제출 + 자동 채점 + 성적 기록)
# ---------------------------------------------------------------------------


class SprintSubjectGoal(Base):
    __tablename__ = "sprint_subject_goals"
    __table_args__ = (
        Index("ix_sprint_subject_goals_program_subject", "sprint_program_id", "subject"),
    )

    id = Column(Integer, primary_key=True, index=True)
    sprint_program_id = Column(Integer, ForeignKey("sprint_programs.id", ondelete="CASCADE"), nullable=False, index=True)
    subject = Column(String(20), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    target_date = Column(Date, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    is_completed = Column(Boolean, nullable=False, default=False)
    created_by_type = Column(String(20), nullable=False, default="admin", server_default=text("'admin'"))
    created_by_id = Column(Integer, nullable=True)
    order_index = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    program = relationship("SprintProgram")


# ---------------------------------------------------------------------------
# SPRINT EXAM V2: independent Sprint exam system.
# ---------------------------------------------------------------------------


class SprintExamV2(Base):
    __tablename__ = "sprint_exam_v2_exams"
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'published', 'closed')", name="ck_sprint_exam_v2_exams_status"),
        Index("ix_sprint_exam_v2_exams_status", "status"),
        Index("ix_sprint_exam_v2_exams_exam_date", "exam_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    exam_date = Column(Date, nullable=True)
    status = Column(String(20), nullable=False, default="draft", server_default=text("'draft'"))
    source_label = Column(String(100), nullable=True)
    metadata_json = Column("metadata", JSONB_TYPE, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    source_text = Column(Text, nullable=True)
    parse_summary = Column(JSONB_TYPE, nullable=True)
    created_by_admin_id = Column(Integer, ForeignKey("math_admins.id", ondelete="SET NULL"), nullable=True, index=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    created_by_admin = relationship("Admin")
    score_groups = relationship("SprintExamV2ScoreGroup", back_populates="exam", cascade="all, delete-orphan")
    papers = relationship("SprintExamV2Paper", back_populates="exam", cascade="all, delete-orphan")
    assignments = relationship("SprintExamV2Assignment", back_populates="exam", cascade="all, delete-orphan")


class SprintExamV2ScoreGroup(Base):
    __tablename__ = "sprint_exam_v2_score_groups"
    __table_args__ = (
        UniqueConstraint("exam_id", "score_group_code", name="uq_sprint_exam_v2_score_groups_exam_code"),
        CheckConstraint("score_group_code ~ '^[a-z0-9_]+$'", name="ck_sprint_exam_v2_score_groups_code"),
        CheckConstraint("aggregation_type IN ('sum', 'standalone')", name="ck_sprint_exam_v2_score_groups_aggregation"),
        Index("ix_sprint_exam_v2_score_groups_exam_id", "exam_id"),
        Index("ix_sprint_exam_v2_score_groups_subject_area", "subject_area"),
    )

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("sprint_exam_v2_exams.id", ondelete="CASCADE"), nullable=False, index=True)
    score_group_code = Column(String(40), nullable=False)
    score_group_name = Column(String(100), nullable=False)
    subject_area = Column(String(40), nullable=False)
    aggregation_type = Column(String(20), nullable=False, default="standalone", server_default=text("'standalone'"))
    display_order = Column(Integer, nullable=False, default=0, server_default=text("0"))
    group_metadata = Column("metadata", JSONB_TYPE, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    solution_drive_file_id = Column(String(100), nullable=True)
    solution_is_published = Column(Boolean, nullable=False, default=False, server_default=text("FALSE"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    exam = relationship("SprintExamV2", back_populates="score_groups")
    papers = relationship("SprintExamV2Paper", back_populates="score_group", cascade="all, delete-orphan")
    grade_cuts = relationship("SprintExamV2GradeCut", back_populates="score_group", cascade="all, delete-orphan")
    scores = relationship("SprintExamV2Score", back_populates="score_group", cascade="all, delete-orphan")


class SprintExamV2Paper(Base):
    __tablename__ = "sprint_exam_v2_papers"
    __table_args__ = (
        CheckConstraint("paper_role IN ('common', 'elective', 'inquiry_slot', 'standalone')", name="ck_sprint_exam_v2_papers_role"),
        CheckConstraint("slot IS NULL OR slot IN ('inquiry_1', 'inquiry_2')", name="ck_sprint_exam_v2_papers_slot"),
        Index(
            "uq_sprint_exam_v2_papers_exam_subject_no_slot",
            "exam_id",
            "subject_code",
            unique=True,
            postgresql_where=text("slot IS NULL"),
            sqlite_where=text("slot IS NULL"),
        ),
        Index(
            "uq_sprint_exam_v2_papers_exam_subject_slot",
            "exam_id",
            "subject_code",
            "slot",
            unique=True,
            postgresql_where=text("slot IS NOT NULL"),
            sqlite_where=text("slot IS NOT NULL"),
        ),
        Index("ix_sprint_exam_v2_papers_exam_id", "exam_id"),
        Index("ix_sprint_exam_v2_papers_subject_code", "subject_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("sprint_exam_v2_exams.id", ondelete="CASCADE"), nullable=False, index=True)
    score_group_id = Column(Integer, ForeignKey("sprint_exam_v2_score_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_code = Column(String(40), nullable=False)
    subject_name = Column(String(100), nullable=False)
    paper_role = Column(String(20), nullable=False)
    slot = Column(String(20), nullable=True)
    elective_code = Column(String(40), nullable=True)
    elective_name = Column(String(100), nullable=True)
    total_points = Column(Integer, nullable=False, default=0, server_default=text("0"))
    question_count = Column(Integer, nullable=False, default=0, server_default=text("0"))
    omr_metadata = Column(JSONB_TYPE, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    listening_youtube_url = Column(String(500), nullable=True)
    source_order = Column(Integer, nullable=False, default=0, server_default=text("0"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    exam = relationship("SprintExamV2", back_populates="papers")
    score_group = relationship("SprintExamV2ScoreGroup", back_populates="papers")
    questions = relationship("SprintExamV2Question", back_populates="paper", cascade="all, delete-orphan")
    assignment_papers = relationship("SprintExamV2AssignmentPaper", back_populates="paper", cascade="all, delete-orphan")


class SprintExamV2Question(Base):
    __tablename__ = "sprint_exam_v2_questions"
    __table_args__ = (
        UniqueConstraint("paper_id", "question_no", name="uq_sprint_exam_v2_questions_paper_no"),
        CheckConstraint("answer_type IN ('choice', 'short_answer')", name="ck_sprint_exam_v2_questions_answer_type"),
        CheckConstraint("points > 0", name="ck_sprint_exam_v2_questions_points"),
        Index("ix_sprint_exam_v2_questions_paper_id", "paper_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("sprint_exam_v2_papers.id", ondelete="CASCADE"), nullable=False, index=True)
    question_no = Column(Integer, nullable=False)
    answer_type = Column(String(20), nullable=False, default="choice", server_default=text("'choice'"))
    correct_answers = Column(JSONB_TYPE, nullable=False)
    points = Column(Integer, nullable=False)
    question_metadata = Column("metadata", JSONB_TYPE, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    explanation = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    paper = relationship("SprintExamV2Paper", back_populates="questions")
    responses = relationship("SprintExamV2Response", back_populates="question", cascade="all, delete-orphan")


class SprintExamV2GradeCut(Base):
    __tablename__ = "sprint_exam_v2_grade_cuts"
    __table_args__ = (
        UniqueConstraint("score_group_id", "grade", "cut_type", name="uq_sprint_exam_v2_grade_cuts_group_grade_type"),
        CheckConstraint("grade > 0", name="ck_sprint_exam_v2_grade_cuts_grade"),
        CheckConstraint("min_score >= 0", name="ck_sprint_exam_v2_grade_cuts_min_score"),
        CheckConstraint("cut_type IN ('raw_score_min', 'absolute_band')", name="ck_sprint_exam_v2_grade_cuts_type"),
        Index("ix_sprint_exam_v2_grade_cuts_score_group_id", "score_group_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    score_group_id = Column(Integer, ForeignKey("sprint_exam_v2_score_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    grade = Column(Integer, nullable=False)
    min_score = Column(Integer, nullable=False)
    cut_type = Column(String(20), nullable=False, default="raw_score_min", server_default=text("'raw_score_min'"))
    cut_metadata = Column("metadata", JSONB_TYPE, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    score_group = relationship("SprintExamV2ScoreGroup", back_populates="grade_cuts")


class SprintExamV2Assignment(Base):
    __tablename__ = "sprint_exam_v2_assignments"
    __table_args__ = (
        UniqueConstraint("exam_id", "student_id", name="uq_sprint_exam_v2_assignments_exam_student"),
        CheckConstraint("status IN ('assigned', 'in_progress', 'submitted', 'closed')", name="ck_sprint_exam_v2_assignments_status"),
        CheckConstraint("attempt_limit >= 1", name="ck_sprint_exam_v2_assignments_attempt_limit"),
        CheckConstraint("paper_selection_mode IN ('student_profile', 'override')", name="ck_sprint_exam_v2_assignments_paper_selection_mode"),
        Index("ix_sprint_exam_v2_assignments_exam_id", "exam_id"),
        Index("ix_sprint_exam_v2_assignments_program_student", "sprint_program_id", "student_id"),
        Index("ix_sprint_exam_v2_assignments_student_status", "student_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("sprint_exam_v2_exams.id", ondelete="CASCADE"), nullable=False, index=True)
    sprint_program_id = Column(Integer, ForeignKey("sprint_programs.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("math_students.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="assigned", server_default=text("'assigned'"))
    korean_elective_snapshot = Column(String(30), nullable=True)
    math_elective_snapshot = Column(String(30), nullable=True)
    inquiry_subject_1_snapshot = Column(String(30), nullable=True)
    inquiry_subject_2_snapshot = Column(String(30), nullable=True)
    available_from = Column(DateTime(timezone=True), nullable=True)
    submission_deadline_at = Column(DateTime(timezone=True), nullable=True)
    attempt_limit = Column(Integer, nullable=False, default=1, server_default=text("1"))
    memo = Column(Text, nullable=True)
    paper_selection_mode = Column(String(20), nullable=False, default="student_profile", server_default=text("'student_profile'"))
    assigned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_by_admin_id = Column(Integer, ForeignKey("math_admins.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    exam = relationship("SprintExamV2", back_populates="assignments")
    program = relationship("SprintProgram")
    student = relationship("Student")
    created_by_admin = relationship("Admin")
    papers = relationship("SprintExamV2AssignmentPaper", back_populates="assignment", cascade="all, delete-orphan")
    attempts = relationship("SprintExamV2Attempt", back_populates="assignment", cascade="all, delete-orphan")
    retake_approvals = relationship("SprintExamV2RetakeApproval", back_populates="assignment", cascade="all, delete-orphan")


class SprintExamV2AssignmentPaper(Base):
    __tablename__ = "sprint_exam_v2_assignment_papers"
    __table_args__ = (
        UniqueConstraint("assignment_id", "paper_id", name="uq_sprint_exam_v2_assignment_papers_assignment_paper"),
        Index("ix_sprint_exam_v2_assignment_papers_assignment_id", "assignment_id"),
        Index("ix_sprint_exam_v2_assignment_papers_paper_id", "paper_id"),
        Index("ix_sprint_exam_v2_assignment_papers_score_group_id", "score_group_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("sprint_exam_v2_assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    paper_id = Column(Integer, ForeignKey("sprint_exam_v2_papers.id", ondelete="CASCADE"), nullable=False, index=True)
    score_group_id = Column(Integer, ForeignKey("sprint_exam_v2_score_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_code_snapshot = Column(String(40), nullable=False)
    subject_name_snapshot = Column(String(100), nullable=False)
    paper_role_snapshot = Column(String(20), nullable=False)
    slot_snapshot = Column(String(20), nullable=True)
    display_order_snapshot = Column(Integer, nullable=False, default=0, server_default=text("0"))
    score_group_code_snapshot = Column(String(40), nullable=False)
    score_group_name_snapshot = Column(String(100), nullable=False)
    matched_by = Column(String(40), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    assignment = relationship("SprintExamV2Assignment", back_populates="papers")
    paper = relationship("SprintExamV2Paper", back_populates="assignment_papers")
    score_group = relationship("SprintExamV2ScoreGroup")


class SprintExamV2RetakeApproval(Base):
    __tablename__ = "sprint_exam_v2_retake_approvals"
    __table_args__ = (
        CheckConstraint("status IN ('requested', 'approved', 'rejected', 'used', 'cancelled')", name="ck_sprint_exam_v2_retake_approvals_status"),
        Index("ix_sprint_exam_v2_retake_approvals_assignment_status", "assignment_id", "status"),
        Index("ix_sprint_exam_v2_retake_approvals_source_attempt_id", "source_attempt_id"),
        Index("ix_sprint_exam_v2_retake_approvals_expires_at", "expires_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("sprint_exam_v2_assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    source_attempt_id = Column(Integer, ForeignKey("sprint_exam_v2_attempts.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(20), nullable=False, default="requested", server_default=text("'requested'"))
    requested_reason = Column(Text, nullable=True)
    admin_note = Column(Text, nullable=True)
    approved_by_admin_id = Column(Integer, ForeignKey("math_admins.id", ondelete="SET NULL"), nullable=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    approval_metadata = Column("metadata", JSONB_TYPE, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    assignment = relationship("SprintExamV2Assignment", back_populates="retake_approvals")
    source_attempt = relationship("SprintExamV2Attempt", foreign_keys=[source_attempt_id])
    approved_by_admin = relationship("Admin")


class SprintExamV2Attempt(Base):
    __tablename__ = "sprint_exam_v2_attempts"
    __table_args__ = (
        UniqueConstraint("assignment_id", "attempt_no", name="uq_sprint_exam_v2_attempts_assignment_attempt_no"),
        CheckConstraint("status IN ('started', 'submitted', 'scored', 'voided')", name="ck_sprint_exam_v2_attempts_status"),
        Index("ix_sprint_exam_v2_attempts_assignment_status", "assignment_id", "status"),
        Index("ix_sprint_exam_v2_attempts_submitted_at", "submitted_at"),
        Index(
            "uq_sprint_exam_v2_attempts_assignment_latest_submitted",
            "assignment_id",
            unique=True,
            postgresql_where=text("is_latest_submitted = TRUE"),
            sqlite_where=text("is_latest_submitted = 1"),
        ),
        Index(
            "uq_sprint_exam_v2_attempts_assignment_started",
            "assignment_id",
            unique=True,
            postgresql_where=text("status = 'started'"),
            sqlite_where=text("status = 'started'"),
        ),
        Index(
            "uq_sprint_exam_v2_attempts_retake_approval_id",
            "retake_approval_id",
            unique=True,
            postgresql_where=text("retake_approval_id IS NOT NULL"),
            sqlite_where=text("retake_approval_id IS NOT NULL"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("sprint_exam_v2_assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    attempt_no = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="started", server_default=text("'started'"))
    is_latest_submitted = Column(Boolean, nullable=False, default=False, server_default=text("FALSE"))
    retake_approval_id = Column(Integer, ForeignKey("sprint_exam_v2_retake_approvals.id", ondelete="SET NULL"), nullable=True, index=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    scored_at = Column(DateTime(timezone=True), nullable=True)
    voided_at = Column(DateTime(timezone=True), nullable=True)
    submit_warning_snapshot = Column(JSONB_TYPE, nullable=True)
    client_metadata = Column(JSONB_TYPE, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    assignment = relationship("SprintExamV2Assignment", back_populates="attempts")
    retake_approval = relationship("SprintExamV2RetakeApproval", foreign_keys=[retake_approval_id])
    responses = relationship("SprintExamV2Response", back_populates="attempt", cascade="all, delete-orphan")
    scores = relationship("SprintExamV2Score", back_populates="attempt", cascade="all, delete-orphan")
    score_logs = relationship("SprintExamV2ScoreLog", back_populates="attempt", cascade="all, delete-orphan")
    result_publication = relationship(
        "SprintExamV2ResultPublication",
        back_populates="attempt",
        cascade="all, delete-orphan",
        uselist=False,
    )


class SprintExamV2Response(Base):
    __tablename__ = "sprint_exam_v2_responses"
    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_sprint_exam_v2_responses_attempt_question"),
        Index("ix_sprint_exam_v2_responses_attempt_id", "attempt_id"),
        Index("ix_sprint_exam_v2_responses_question_id", "question_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("sprint_exam_v2_attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("sprint_exam_v2_questions.id", ondelete="CASCADE"), nullable=False, index=True)
    answer_value = Column(String(200), nullable=True)
    answer_values = Column(JSONB_TYPE, nullable=True)
    is_blank = Column(Boolean, nullable=False, default=False, server_default=text("FALSE"))
    is_correct = Column(Boolean, nullable=True)
    awarded_points = Column(Integer, nullable=True)
    graded_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    attempt = relationship("SprintExamV2Attempt", back_populates="responses")
    question = relationship("SprintExamV2Question", back_populates="responses")


class SprintExamV2Score(Base):
    __tablename__ = "sprint_exam_v2_scores"
    __table_args__ = (
        UniqueConstraint("attempt_id", "score_group_id", name="uq_sprint_exam_v2_scores_attempt_group"),
        CheckConstraint("raw_score >= 0", name="ck_sprint_exam_v2_scores_raw_score"),
        CheckConstraint("max_score >= 0", name="ck_sprint_exam_v2_scores_max_score"),
        CheckConstraint("correct_count >= 0", name="ck_sprint_exam_v2_scores_correct_count"),
        CheckConstraint("blank_count >= 0", name="ck_sprint_exam_v2_scores_blank_count"),
        Index("ix_sprint_exam_v2_scores_attempt_id", "attempt_id"),
        Index("ix_sprint_exam_v2_scores_score_group_id", "score_group_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("sprint_exam_v2_attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    score_group_id = Column(Integer, ForeignKey("sprint_exam_v2_score_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    raw_score = Column(Integer, nullable=False, default=0, server_default=text("0"))
    max_score = Column(Integer, nullable=False, default=0, server_default=text("0"))
    correct_count = Column(Integer, nullable=False, default=0, server_default=text("0"))
    blank_count = Column(Integer, nullable=False, default=0, server_default=text("0"))
    grade = Column(Integer, nullable=True)
    scoring_version = Column(Integer, nullable=False, default=1, server_default=text("1"))
    scored_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    attempt = relationship("SprintExamV2Attempt", back_populates="scores")
    score_group = relationship("SprintExamV2ScoreGroup", back_populates="scores")


class SprintExamV2ScoreLog(Base):
    __tablename__ = "sprint_exam_v2_score_logs"
    __table_args__ = (
        CheckConstraint("trigger_type IN ('submit', 'answer_key_update', 'admin_rescore', 'manual_single_rescore')", name="ck_sprint_exam_v2_score_logs_trigger_type"),
        Index("ix_sprint_exam_v2_score_logs_attempt_id", "attempt_id"),
        Index("ix_sprint_exam_v2_score_logs_created_at", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("sprint_exam_v2_attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    trigger_type = Column(String(40), nullable=False)
    triggered_by_admin_id = Column(Integer, ForeignKey("math_admins.id", ondelete="SET NULL"), nullable=True, index=True)
    answer_key_version = Column(Integer, nullable=True)
    previous_score_snapshot = Column(JSONB_TYPE, nullable=True)
    new_score_snapshot = Column(JSONB_TYPE, nullable=True)
    message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    attempt = relationship("SprintExamV2Attempt", back_populates="score_logs")
    triggered_by_admin = relationship("Admin")


class SprintExamV2ResultPublication(Base):
    __tablename__ = "sprint_exam_v2_result_publications"
    __table_args__ = (
        UniqueConstraint("attempt_id", name="uq_sprint_exam_v2_result_publications_attempt"),
        CheckConstraint("status IN ('unpublished', 'published')", name="ck_sprint_exam_v2_result_publications_status"),
        Index("ix_sprint_exam_v2_result_publications_status", "status"),
        Index("ix_sprint_exam_v2_result_publications_published_by", "published_by_admin_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("sprint_exam_v2_attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="unpublished", server_default=text("'unpublished'"))
    show_total_score = Column(Boolean, nullable=False, default=True, server_default=text("TRUE"))
    show_grade = Column(Boolean, nullable=False, default=True, server_default=text("TRUE"))
    show_score_groups = Column(Boolean, nullable=False, default=True, server_default=text("TRUE"))
    show_question_results = Column(Boolean, nullable=False, default=True, server_default=text("TRUE"))
    show_correct_answers = Column(Boolean, nullable=False, default=False, server_default=text("FALSE"))
    show_explanations = Column(Boolean, nullable=False, default=False, server_default=text("FALSE"))
    published_by_admin_id = Column(Integer, ForeignKey("math_admins.id", ondelete="SET NULL"), nullable=True, index=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    unpublished_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    attempt = relationship("SprintExamV2Attempt", back_populates="result_publication")
    published_by_admin = relationship("Admin")
    logs = relationship("SprintExamV2ResultPublicationLog", back_populates="publication", cascade="all, delete-orphan")


class SprintExamV2ResultPublicationLog(Base):
    __tablename__ = "sprint_exam_v2_result_publication_logs"
    __table_args__ = (
        CheckConstraint(
            "action IN ('published', 'unpublished', 'settings_updated')",
            name="ck_sprint_exam_v2_result_publication_logs_action",
        ),
        Index("ix_sprint_exam_v2_result_publication_logs_publication_id", "publication_id"),
        Index("ix_sprint_exam_v2_result_publication_logs_attempt_id", "attempt_id"),
        Index("ix_sprint_exam_v2_result_publication_logs_created_at", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    publication_id = Column(Integer, ForeignKey("sprint_exam_v2_result_publications.id", ondelete="CASCADE"), nullable=False, index=True)
    attempt_id = Column(Integer, ForeignKey("sprint_exam_v2_attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(40), nullable=False)
    actor_admin_id = Column(Integer, ForeignKey("math_admins.id", ondelete="SET NULL"), nullable=True, index=True)
    previous_snapshot = Column(JSONB_TYPE, nullable=True)
    new_snapshot = Column(JSONB_TYPE, nullable=True)
    message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    publication = relationship("SprintExamV2ResultPublication", back_populates="logs")
    attempt = relationship("SprintExamV2Attempt")
    actor_admin = relationship("Admin")


# ---------------------------------------------------------------------------
# SPRINT 모의고사 회차/시험지 (7차): 회차 하나에 과목별 시험지(paper)가 여러 개
# 5차)은 데이터가 없고 API 호환을 위해 그대로 남겨두며, 이 모델들이 새 등록/응시
# 흐름의 실제 중심 데이터가 된다. 시험지·정답·등급컷은 회차/과목 단위로 한 번만
# 저장하고, 학생마다 복제하지 않는다.
