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


class AdminStudentDailyTaskStatusRequest(BaseModel):
    status: str
    memo: Optional[str] = None


class AdminStudentItemProgressRequest(BaseModel):
    status: str
    memo: Optional[str] = None


class AdminStudentItemProgressBatchRequest(BaseModel):
    item_ids: list[int]
    status: str
    memo: Optional[str] = None


class AdminStudentLectureTaskItemProgressRequest(BaseModel):
    is_done: bool
    memo: Optional[str] = None


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


class LectureTaskItemResponse(BaseModel):
    lecture_number: int
    title: str
    is_done: bool
    updated_at: Optional[datetime] = None


class DailyTaskResponse(BaseModel):
    id: int
    title: str
    detail: Optional[str] = None
    # Additive: the weekly-view response nests tasks under a per-day bucket that already
    # carries the date, so this was never needed there. Flat list responses (lecture/homework
    # assignment detail) have no such bucket, so each task must carry its own date.
    task_date: Optional[date] = None
    textbook_id: Optional[int] = None
    textbook_key: Optional[str] = None
    start_item_number: Optional[int] = None
    end_item_number: Optional[int] = None
    range_type: Optional[str] = None
    completion_mode: str = "manual"
    progress_rate: int = 0
    due_date: Optional[date] = None
    status: str
    difficulty: Optional[str] = None
    category: Optional[str] = None
    order_index: int
    completed_at: Optional[datetime] = None
    textbook: Optional[DailyTaskTextbookInfo] = None
    lecture_items: list[LectureTaskItemResponse] = []
    # Added for the homework assignment engine (phase 2): lets clients tell homework-generated
    # tasks apart from manual ones without dropping/renaming any pre-existing field above.
    source_type: str = "manual"
    # Additive fields for the lecture assignment detail pages: lets clients link a task back to
    # its parent assignment and show its lecture range without parsing the title string.
    lecture_assignment_id: Optional[int] = None
    lecture_start_number: Optional[int] = None
    lecture_end_number: Optional[int] = None


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


class StudentLectureTaskItemProgressRequest(BaseModel):
    student_id: int
    is_done: bool


class DeleteResponse(BaseModel):
    ok: bool


class HomeworkAssignmentCreateRequest(BaseModel):
    student_id: int
    textbook_id: int
    title: Optional[str] = None
    range_type: str
    start_value: Optional[int] = None
    end_value: Optional[int] = None
    start_date: date
    due_date: date
    memo: Optional[str] = None


class LectureAssignmentPreviewRequest(BaseModel):
    total_lectures: int
    start_lecture_no: int
    lectures_per_day: int
    weekdays: list[str]
    start_date: date
    due_date: date


class LectureAssignmentPreviewItem(BaseModel):
    date: date
    start_lecture_no: int
    end_lecture_no: int
    count: int


class LectureAssignmentPreviewResponse(BaseModel):
    possible: bool
    total_lectures_to_assign: int
    available_days_count: int
    required_days_count: int
    max_assignable_lectures: int
    shortage_count: int
    recommended_lectures_per_day: int
    preview_items: list[LectureAssignmentPreviewItem]


class LectureAssignmentCreateRequest(BaseModel):
    student_id: int
    subject: str
    course_title: str
    total_lectures: int
    start_lecture_no: int
    lectures_per_day: int
    weekdays: list[str]
    start_date: date
    due_date: date
    memo: Optional[str] = None


class LectureAssignmentResponse(BaseModel):
    id: int
    student_id: int
    subject: str
    course_title: str
    total_lectures: int
    start_lecture_no: int
    lectures_per_day: int
    weekdays: list[str]
    start_date: date
    due_date: date
    memo: Optional[str] = None
    status: str
    created_at: datetime


class LectureAssignmentCreateResponse(BaseModel):
    assignment: LectureAssignmentResponse
    daily_tasks: list[DailyTaskResponse]


class HomeworkAssignmentResponse(BaseModel):
    id: int
    student_id: int
    textbook_id: int
    title: Optional[str] = None
    range_type: str
    start_value: Optional[int] = None
    end_value: Optional[int] = None
    start_date: date
    due_date: date
    memo: Optional[str] = None
    status: str
    created_at: datetime
    created_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class HomeworkAssignmentCreateResponse(BaseModel):
    assignment: HomeworkAssignmentResponse
    daily_tasks: list[DailyTaskResponse]


class HomeworkAssignmentListItem(HomeworkAssignmentResponse):
    student_name: Optional[str] = None
    textbook_title: Optional[str] = None


class HomeworkAssignmentUpdateRequest(BaseModel):
    textbook_id: Optional[int] = None
    range_type: Optional[str] = None
    start_value: Optional[int] = None
    end_value: Optional[int] = None
    due_date: Optional[date] = None
    memo: Optional[str] = None
    # The assignment's original start_date is kept as a historical record and is never
    # editable here. reschedule_start_date instead controls where *regenerated* (still
    # incomplete) tasks are placed — see crud.update_homework_assignment.
    reschedule_start_date: Optional[date] = None


class HomeworkRangePreviewItem(BaseModel):
    date: date
    start_value: int
    end_value: int
    count: int


class HomeworkRangePreviewResponse(BaseModel):
    possible: bool
    total_to_assign: int
    available_days_count: int
    preview_items: list[HomeworkRangePreviewItem]


class HomeworkAssignmentUpdateResponse(BaseModel):
    assignment: HomeworkAssignmentResponse
    daily_tasks: list[DailyTaskResponse]


class HomeworkAssignmentDeleteResponse(BaseModel):
    ok: bool
    deleted_task_count: int
    preserved_completed_count: int


class LectureAssignmentListItem(LectureAssignmentResponse):
    student_name: Optional[str] = None


class LectureAssignmentUpdateRequest(BaseModel):
    subject: Optional[str] = None
    course_title: Optional[str] = None
    total_lectures: Optional[int] = None
    start_lecture_no: Optional[int] = None
    lectures_per_day: Optional[int] = None
    weekdays: Optional[list[str]] = None
    due_date: Optional[date] = None
    memo: Optional[str] = None
    # The assignment's original start_date is kept as a historical record and is never
    # editable here. reschedule_start_date instead controls where *regenerated* (still
    # incomplete) tasks are placed — see crud.update_lecture_assignment.
    reschedule_start_date: Optional[date] = None


class LectureAssignmentUpdateResponse(BaseModel):
    assignment: LectureAssignmentResponse
    daily_tasks: list[DailyTaskResponse]


class LectureAssignmentDeleteResponse(BaseModel):
    ok: bool
    deleted_task_count: int
    preserved_completed_count: int


class LectureAssignmentDetail(LectureAssignmentResponse):
    student_name: Optional[str] = None
    student_grade: Optional[str] = None


class LectureAssignmentDetailResponse(BaseModel):
    assignment: LectureAssignmentDetail
    daily_tasks: list[DailyTaskResponse]
    total_lectures_to_assign: int
    completed_lecture_count: int
    remaining_lecture_count: int
    progress_rate: int


class StudentHomeworkTaskCard(BaseModel):
    id: int
    title: str
    detail: Optional[str] = None
    task_date: date
    due_date: Optional[date] = None
    textbook_id: Optional[int] = None
    textbook_key: Optional[str] = None
    textbook_title: Optional[str] = None
    range_type: Optional[str] = None
    range_label: Optional[str] = None
    source_type: str
    completion_mode: str
    status: str
    progress_rate: int
    is_overdue: bool


class StudentTodayTasksResponse(BaseModel):
    student_id: int
    today: date
    week_end: date
    overdue_tasks: list[StudentHomeworkTaskCard]
    today_tasks: list[StudentHomeworkTaskCard]
    week_tasks: list[StudentHomeworkTaskCard]


class AdminHomeworkDashboardStudent(BaseModel):
    student_id: int
    name: str
    today_total: int
    today_completed: int
    today_completion_rate: int
    overdue_count: int
    week_total: int
    week_completed: int


class AdminHomeworkDashboardResponse(BaseModel):
    date: date
    students: list[AdminHomeworkDashboardStudent]


class AdminHomeworkTaskDetail(BaseModel):
    id: int
    title: str
    textbook_title: Optional[str] = None
    range_label: Optional[str] = None
    task_date: date
    due_date: Optional[date] = None
    progress_rate: int
    status: str
    memo: Optional[str] = None


class AdminStudentHomeworkResponse(BaseModel):
    student_id: int
    date: date
    overdue_tasks: list[AdminHomeworkTaskDetail]
    today_tasks: list[AdminHomeworkTaskDetail]
    week_tasks: list[AdminHomeworkTaskDetail]


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


class CurriculumListItem(BaseModel):
    student_curriculum_id: int
    curriculum_id: int
    subject: str
    title: str
    description: Optional[str] = None
    in_progress_count: int
    completed_count: int
    planned_count: int


class CurriculumNodeResponse(BaseModel):
    id: int
    title: str
    node_type: str
    group_name: str
    group_order: int
    description: Optional[str] = None
    position_x: int
    position_y: int
    order_index: int
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    memo: Optional[str] = None
    link_url: Optional[str] = None


class CurriculumGroupResponse(BaseModel):
    name: str
    order: int
    group_number: int
    nodes: list[CurriculumNodeResponse]


class CurriculumEdgeResponse(BaseModel):
    from_node_id: int
    to_node_id: int
    edge_type: str


class CurriculumNodesResponse(BaseModel):
    groups: list[CurriculumGroupResponse]
    edges: list[CurriculumEdgeResponse]
