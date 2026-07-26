from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

import admin_auth
from database import get_db
from sprint_exam_v2_parser import parse_sprint_exam_v2_text
import sprint_exam_v2_service
from sprint_exam_v2_service import SprintExamV2ConflictError, SprintExamV2NotFoundError
from sprint_exam_v2_validation import SprintExamV2DomainError


router = APIRouter(tags=["Sprint Exam V2"])


class ParseIssue(BaseModel):
    line: int
    code: str
    message: str


class ParsedQuestion(BaseModel):
    question_no: int
    question_type: str
    correct_answers: list[str]
    score: int
    metadata: dict[str, Any] = Field(default_factory=dict)


class ParsedGradeCut(BaseModel):
    grade: int
    min_score: int
    cut_type: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class ParsedPaper(BaseModel):
    subject_code: str | None
    subject_name: str
    paper_role: str
    slot: str | None
    display_order: int
    metadata: dict[str, Any] = Field(default_factory=dict)
    listening_youtube_url: str | None = None
    questions: list[ParsedQuestion]
    question_count: int
    paper_max_score: int


class ParsedExam(BaseModel):
    title: str | None = None
    exam_date: str | None = None
    source_label: str | None = None
    description: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ParsedScoreGroup(BaseModel):
    score_group_code: str
    score_group_name: str
    subject_area: str
    aggregation_type: str
    display_order: int
    metadata: dict[str, Any] = Field(default_factory=dict)
    grade_cuts: list[ParsedGradeCut]
    papers: list[ParsedPaper]
    source_paper_score_sum: int
    assignment_max_score: int | None


class ParsedPreview(BaseModel):
    exam: ParsedExam | dict[str, Any]
    score_groups: list[ParsedScoreGroup]
    total_score_group_count: int
    total_paper_count: int
    total_question_count: int
    source_paper_score_sum: int


class SprintExamV2ParsePreviewRequest(BaseModel):
    text: str = Field(min_length=1)


class SprintExamV2ParsePreviewResponse(BaseModel):
    ok: bool
    errors: list[ParseIssue]
    warnings: list[ParseIssue]
    preview: ParsedPreview
    normalized_output: str | None


class SprintExamV2QuestionInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    question_no: int
    question_type: str
    correct_answers: list[str]
    score: int
    metadata: dict[str, Any] = Field(default_factory=dict)


class SprintExamV2GradeCutInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    grade: int
    min_score: int
    cut_type: str = "raw_score_min"
    metadata: dict[str, Any] = Field(default_factory=dict)


class SprintExamV2PaperInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    subject_code: str
    subject_name: str
    paper_role: str
    slot: str | None = None
    display_order: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)
    listening_youtube_url: str | None = None
    questions: list[SprintExamV2QuestionInput]
    question_count: int | None = None
    paper_max_score: int | None = None


class SprintExamV2ScoreGroupInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    score_group_code: str
    score_group_name: str
    subject_area: str
    aggregation_type: str
    display_order: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)
    grade_cuts: list[SprintExamV2GradeCutInput] = Field(default_factory=list)
    papers: list[SprintExamV2PaperInput]
    source_paper_score_sum: int | None = None
    assignment_max_score: int | None = None


class SprintExamV2ExamInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = None
    exam_date: date | str | None = None
    source_label: str | None = None
    description: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SprintExamV2CreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    exam: SprintExamV2ExamInput
    score_groups: list[SprintExamV2ScoreGroupInput]
    total_score_group_count: int | None = None
    total_paper_count: int | None = None
    total_question_count: int | None = None
    source_paper_score_sum: int | None = None


class SprintExamV2UpdateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    exam: SprintExamV2ExamInput | None = None
    score_groups: list[SprintExamV2ScoreGroupInput] | None = None


class SprintExamV2QuestionResponse(BaseModel):
    id: int
    question_no: int
    question_type: str
    correct_answers: list[str]
    score: int
    metadata: dict[str, Any]


class SprintExamV2GradeCutResponse(BaseModel):
    id: int
    grade: int
    min_score: int
    cut_type: str
    metadata: dict[str, Any]


class SprintExamV2PaperResponse(BaseModel):
    id: int
    subject_code: str
    subject_name: str
    paper_role: str
    slot: str | None
    display_order: int
    metadata: dict[str, Any]
    listening_youtube_url: str | None
    questions: list[SprintExamV2QuestionResponse]
    question_count: int
    paper_max_score: int


class SprintExamV2ScoreGroupResponse(BaseModel):
    id: int
    score_group_code: str
    score_group_name: str
    subject_area: str
    aggregation_type: str
    display_order: int
    metadata: dict[str, Any]
    grade_cuts: list[SprintExamV2GradeCutResponse]
    papers: list[SprintExamV2PaperResponse]
    source_paper_score_sum: int
    assignment_max_score: int | None


class SprintExamV2ExamResponse(BaseModel):
    id: int
    title: str
    exam_date: str | None
    source_label: str | None
    description: str | None
    metadata: dict[str, Any]
    status: str
    created_at: str | None
    updated_at: str | None


class SprintExamV2DetailResponse(BaseModel):
    exam: SprintExamV2ExamResponse
    score_groups: list[SprintExamV2ScoreGroupResponse]
    total_score_group_count: int
    total_paper_count: int
    total_question_count: int
    source_paper_score_sum: int


class SprintExamV2ListItem(BaseModel):
    id: int
    title: str
    exam_date: str | None
    source_label: str | None
    score_group_count: int
    paper_count: int
    question_count: int
    created_at: str | None
    updated_at: str | None


class SprintExamV2ListResponse(BaseModel):
    items: list[SprintExamV2ListItem]
    total: int
    limit: int
    offset: int


class SprintExamV2DeleteResponse(BaseModel):
    ok: bool
    deleted_exam_id: int


def _payload_dict(payload: BaseModel) -> dict[str, Any]:
    return payload.model_dump(mode="json", exclude_none=False)


def _raise_http_error(exc: Exception) -> None:
    if isinstance(exc, SprintExamV2DomainError):
        raise HTTPException(status_code=400, detail=exc.detail()) from exc
    if isinstance(exc, SprintExamV2ConflictError):
        raise HTTPException(status_code=409, detail=exc.detail()) from exc
    if isinstance(exc, SprintExamV2NotFoundError):
        raise HTTPException(status_code=404, detail="Sprint Exam V2 exam not found.") from exc
    raise exc


@router.post(
    "/admin/sprint-exam-v2/exams/parse-preview",
    response_model=SprintExamV2ParsePreviewResponse,
)
def admin_parse_sprint_exam_v2_preview(
    payload: SprintExamV2ParsePreviewRequest,
    _admin=Depends(admin_auth.require_admin),
):
    return parse_sprint_exam_v2_text(payload.text).to_dict()


@router.post(
    "/admin/sprint-exam-v2/exams",
    response_model=SprintExamV2DetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def admin_create_sprint_exam_v2_exam(
    payload: SprintExamV2CreateRequest,
    db: Session = Depends(get_db),
    _admin=Depends(admin_auth.require_admin),
):
    try:
        return sprint_exam_v2_service.create_exam(db, _payload_dict(payload))
    except Exception as exc:
        _raise_http_error(exc)


@router.get("/admin/sprint-exam-v2/exams", response_model=SprintExamV2ListResponse)
def admin_list_sprint_exam_v2_exams(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _admin=Depends(admin_auth.require_admin),
):
    return sprint_exam_v2_service.list_exams(
        db,
        limit=limit,
        offset=offset,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/admin/sprint-exam-v2/exams/{exam_id}", response_model=SprintExamV2DetailResponse)
def admin_get_sprint_exam_v2_exam(exam_id: int, db: Session = Depends(get_db), _admin=Depends(admin_auth.require_admin)):
    try:
        return sprint_exam_v2_service.get_exam(db, exam_id)
    except Exception as exc:
        _raise_http_error(exc)


@router.patch("/admin/sprint-exam-v2/exams/{exam_id}", response_model=SprintExamV2DetailResponse)
def admin_update_sprint_exam_v2_exam(exam_id: int, payload: SprintExamV2UpdateRequest, db: Session = Depends(get_db), _admin=Depends(admin_auth.require_admin)):
    try:
        return sprint_exam_v2_service.update_exam(db, exam_id, _payload_dict(payload))
    except Exception as exc:
        _raise_http_error(exc)


@router.delete("/admin/sprint-exam-v2/exams/{exam_id}", response_model=SprintExamV2DeleteResponse)
def admin_delete_sprint_exam_v2_exam(exam_id: int, db: Session = Depends(get_db), _admin=Depends(admin_auth.require_admin)):
    try:
        return sprint_exam_v2_service.delete_exam(db, exam_id)
    except Exception as exc:
        _raise_http_error(exc)
