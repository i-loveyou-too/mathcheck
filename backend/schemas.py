from datetime import datetime
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
