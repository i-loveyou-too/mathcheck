from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class StudentLoginRequest(BaseModel):
    phone: str


class StudentLoginResponse(BaseModel):
    id: int
    name: str
    grade: str

    model_config = ConfigDict(from_attributes=True)


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    id: int
    username: str

    model_config = ConfigDict(from_attributes=True)


class UnitBrief(BaseModel):
    id: int
    name: str
    order_index: int

    model_config = ConfigDict(from_attributes=True)


class SubjectWithUnits(BaseModel):
    id: int
    name: str
    order_index: int
    units: list[UnitBrief]

    model_config = ConfigDict(from_attributes=True)


class TaskWithProgress(BaseModel):
    id: int
    title: str
    order_index: int
    is_done: bool
    done_at: Optional[datetime] = None


class ProgressCheckRequest(BaseModel):
    student_id: int
    task_id: int
    is_done: bool


class ProgressCheckResponse(BaseModel):
    id: int
    student_id: int
    task_id: int
    is_done: bool
    done_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TaskStatus(BaseModel):
    id: int
    title: str
    order_index: int
    is_done: bool
    done_at: Optional[datetime] = None


class UnitStatus(BaseModel):
    id: int
    name: str
    order_index: int
    total_tasks: int
    completed_tasks: int
    progress_percentage: float
    tasks: list[TaskStatus]


class SubjectStatus(BaseModel):
    id: int
    name: str
    order_index: int
    total_tasks: int
    completed_tasks: int
    progress_percentage: float
    units: list[UnitStatus]


class StudentSummaryResponse(BaseModel):
    student_id: int
    name: str
    grade: str
    total_tasks: int
    completed_tasks: int
    progress_percentage: float
    subjects: list[SubjectStatus]


class AdminStudentSummary(BaseModel):
    id: int
    name: str
    phone: str
    grade: str
    total_tasks: int
    completed_tasks: int
    progress_percentage: float


class StudentProgressDetailResponse(BaseModel):
    student_id: int
    name: str
    grade: str
    total_tasks: int
    completed_tasks: int
    progress_percentage: float
    subjects: list[SubjectStatus]


class TextbookProgressInfo(BaseModel):
    id: int
    key: str
    subject: Optional[str] = None
    title: str
    full_title: str
    problem_count: int


class TextbookProgressSummary(BaseModel):
    total: int
    done: int
    partial: int
    not_started: int


class TextbookProgressItem(BaseModel):
    id: int
    item_number: int
    title: str
    status: str


class TextbookProgressResponse(BaseModel):
    textbook: TextbookProgressInfo
    summary: TextbookProgressSummary
    items: list[TextbookProgressItem]


class StudentItemProgressRequest(BaseModel):
    student_id: int
    item_id: int
    status: str


class StudentItemProgressResponse(BaseModel):
    student_id: int
    item_id: int
    status: str
    updated_at: datetime


class StudentDashboardProgressBucket(BaseModel):
    total: int
    done: int
    partial: int
    not_started: int
    progress_rate: int


class StudentDashboardSubjectProgress(StudentDashboardProgressBucket):
    subject: str


class StudentDashboardProgressSummaryResponse(BaseModel):
    student_id: int
    overall: StudentDashboardProgressBucket
    subjects: list[StudentDashboardSubjectProgress]


class DailyTaskTextbookInfo(BaseModel):
    id: int
    subject: Optional[str] = None
    title: str
    full_title: str

    model_config = ConfigDict(from_attributes=True)


class DailyTaskResponse(BaseModel):
    id: int
    title: str
    detail: Optional[str] = None
    textbook_id: Optional[int] = None
    textbook_key: Optional[str] = None
    start_item_number: Optional[int] = None
    end_item_number: Optional[int] = None
    status: str
    difficulty: Optional[str] = None
    category: Optional[str] = None
    order_index: int
    completed_at: Optional[datetime] = None
    textbook: Optional[DailyTaskTextbookInfo] = None


class DailyTaskSummary(BaseModel):
    total: int
    done: int
    todo: int
    completion_rate: int


class StudentDailyTasksResponse(BaseModel):
    student_id: int
    date: date
    summary: DailyTaskSummary
    tasks: list[DailyTaskResponse]


class StudentWeeklyTaskDay(BaseModel):
    date: date
    summary: DailyTaskSummary
    tasks: list[DailyTaskResponse]


class StudentWeeklyTasksResponse(BaseModel):
    student_id: int
    week_start: date
    days: list[StudentWeeklyTaskDay]


class AdminDailyTaskCreateRequest(BaseModel):
    student_id: int
    task_date: date
    title: str
    detail: Optional[str] = None
    textbook_key: Optional[str] = None
    start_item_number: Optional[int] = None
    end_item_number: Optional[int] = None
    status: str = "todo"
    difficulty: Optional[str] = None
    category: Optional[str] = None
    order_index: int = 0


class AdminDailyTaskUpdateRequest(BaseModel):
    task_date: Optional[date] = None
    title: Optional[str] = None
    detail: Optional[str] = None
    textbook_key: Optional[str] = None
    start_item_number: Optional[int] = None
    end_item_number: Optional[int] = None
    status: Optional[str] = None
    difficulty: Optional[str] = None
    category: Optional[str] = None
    order_index: Optional[int] = None


class StudentDailyTaskStatusRequest(BaseModel):
    student_id: int
    status: str


class DeleteResponse(BaseModel):
    ok: bool


class AchievementTrackerDay(BaseModel):
    date: date
    total: int
    done: int
    todo: int
    is_completed: bool
    has_tasks: bool


class AchievementTrackerResponse(BaseModel):
    student_id: int
    year: int
    month: int
    current_streak: int
    monthly_done_days: int
    monthly_total_task_days: int
    monthly_completion_rate: int
    days: list[AchievementTrackerDay]


class AdminTextbookCatalogItem(BaseModel):
    id: int
    textbook_key: str
    title: str
    short_title: str
    category: Optional[str] = None
    subject: Optional[str] = None
    min_item_number: int
    max_item_number: int
    total_items: int
    is_active: bool
    is_checkable: bool
    is_student_only: bool = False


class AdminTextbookCatalogResponse(BaseModel):
    textbooks: list[AdminTextbookCatalogItem]


class StudentTextbookResponse(BaseModel):
    id: int
    textbook_key: str
    subject: Optional[str] = None
    title: str
    full_title: str
    type: str
    is_checkable: bool
    is_published: bool
    is_active: bool
    item_count: int


class StudentTextbookListResponse(BaseModel):
    textbooks: list[StudentTextbookResponse]


# Textbook management schemas

class TextbookSeriesResponse(BaseModel):
    id: int
    korean_name: str
    english_name: str
    display_name: str
    type: str
    order_index: int

    model_config = ConfigDict(from_attributes=True)


class TextbookSeriesCreateRequest(BaseModel):
    korean_name: str
    english_name: str
    display_name: str
    type: str = "problem"
    order_index: int = 0


class TextbookSectionIn(BaseModel):
    unit_title: Optional[str] = None
    section_title: str
    start_problem: Optional[int] = None
    end_problem: Optional[int] = None
    start_page: Optional[int] = None
    end_page: Optional[int] = None
    order_index: int = 0
    show_to_student: bool = True
    use_for_homework: bool = True


class TextbookSectionOut(BaseModel):
    id: int
    textbook_id: int
    unit_title: Optional[str] = None
    section_title: str
    start_problem: Optional[int] = None
    end_problem: Optional[int] = None
    start_page: Optional[int] = None
    end_page: Optional[int] = None
    order_index: int
    show_to_student: bool
    use_for_homework: bool

    model_config = ConfigDict(from_attributes=True)


class TextbookSectionsResponse(BaseModel):
    textbook_id: int
    textbook_key: str
    structure_type: str
    sections: list[TextbookSectionOut]


class TextbookSectionsReplaceRequest(BaseModel):
    structure_type: Optional[str] = None
    sections: list[TextbookSectionIn] = []


class TextbookCreateRequest(BaseModel):
    series_id: int
    textbook_key: Optional[str] = None
    subject: Optional[str] = None
    subjects: list[str] = []
    title: str
    full_title: str
    type: str = "problem"
    structure_type: str = "none"
    is_checkable: bool = True
    is_published: bool = True
    is_active: bool = True
    order_index: int = 0
    item_count: int
    sections: list[TextbookSectionIn] = []


class TextbookUpdateRequest(BaseModel):
    subject: Optional[str] = None
    subjects: Optional[list[str]] = None
    title: Optional[str] = None
    full_title: Optional[str] = None
    textbook_key: Optional[str] = None
    type: Optional[str] = None
    is_checkable: Optional[bool] = None
    is_published: Optional[bool] = None
    is_active: Optional[bool] = None
    order_index: Optional[int] = None


class TextbookListItem(BaseModel):
    id: int
    series_id: int
    series_name: str
    subject: Optional[str] = None
    subjects: list[str] = []
    title: str
    full_title: str
    type: str
    is_checkable: bool
    is_published: bool
    is_active: bool
    is_student_only: bool = False
    item_count: int
    order_index: int
    created_at: datetime


class TextbookListResponse(BaseModel):
    textbooks: list[TextbookListItem]


class TextbookDetailItem(BaseModel):
    id: int
    item_number: int
    title: str
    item_type: str
    is_active: bool


class TextbookDetailResponse(BaseModel):
    id: int
    series_id: int
    series_name: str
    textbook_key: Optional[str] = None
    subject: Optional[str] = None
    subjects: list[str] = []
    title: str
    full_title: str
    type: str
    structure_type: str = "none"
    is_checkable: bool
    is_published: bool
    is_active: bool
    is_student_only: bool = False
    order_index: int
    item_count: int
    items: list[TextbookDetailItem]
    sections: list[TextbookSectionOut] = []


class StudentTextbookAssignment(BaseModel):
    student_id: int
    student_name: str
    student_grade: str
    is_active: bool
    assigned_at: datetime


class TextbookAssignmentsResponse(BaseModel):
    textbook_id: int
    is_student_only: bool
    assignments: list[StudentTextbookAssignment]


class TextbookStudentOnlyRequest(BaseModel):
    is_student_only: bool


class StudentTextbookIdsResponse(BaseModel):
    textbook_ids: list[int]
