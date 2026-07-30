export type ExamV2Question = {
  id?: number;
  question_no: number;
  question_type: "choice" | "short_answer";
  correct_answers: string[];
  score: number;
  metadata: Record<string, unknown>;
};

export type ExamV2GradeCut = {
  id?: number;
  grade: number;
  min_score: number;
  cut_type: "raw_score_min" | "absolute_band";
  metadata: Record<string, unknown>;
};

export type ExamV2Paper = {
  id?: number;
  subject_code: string;
  subject_name: string;
  paper_role: "common" | "elective" | "inquiry_slot" | "standalone";
  slot: "inquiry_1" | "inquiry_2" | null;
  display_order: number;
  metadata: Record<string, unknown>;
  listening_youtube_url?: string | null;
  questions: ExamV2Question[];
  question_count: number;
  paper_max_score: number;
};

export type ExamV2ScoreGroup = {
  id?: number;
  score_group_code: string;
  score_group_name: string;
  subject_area: string;
  aggregation_type: "sum" | "standalone";
  display_order: number;
  metadata: Record<string, unknown>;
  grade_cuts: ExamV2GradeCut[];
  papers: ExamV2Paper[];
  source_paper_score_sum: number;
  assignment_max_score: number | null;
  solution_drive_file_id: string | null;
  solution_is_published: boolean;
};

export type ExamV2Detail = {
  exam: {
    id: number;
    title: string;
    exam_date: string | null;
    source_label: string | null;
    description: string | null;
    metadata: Record<string, unknown>;
    status: string;
    created_at: string | null;
    updated_at: string | null;
  };
  score_groups: ExamV2ScoreGroup[];
  total_score_group_count: number;
  total_paper_count: number;
  total_question_count: number;
  source_paper_score_sum: number;
};

export type ExamV2ListItem = {
  id: number;
  title: string;
  exam_date: string | null;
  source_label: string | null;
  score_group_count: number;
  paper_count: number;
  question_count: number;
  created_at: string | null;
  updated_at: string | null;
};

export type ExamV2ListResponse = {
  items: ExamV2ListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type AttemptSummary = {
  id: number;
  attempt_no: number;
  status: "started" | "submitted" | "scored" | "voided";
  retake_approval_id: number | null;
  started_at: string | null;
  submitted_at: string | null;
  scored_at: string | null;
};

export type AssignmentListItem = {
  id: number;
  student_id: number;
  student_name: string | null;
  exam_id: number;
  exam_title: string | null;
  status: string;
  computed_status: string;
  paper_count: number;
  attempt_count: number;
  base_attempt_count: number;
  available_retake_approval_count: number;
  available_retake_approval_id: number | null;
  has_started_attempt: boolean;
  can_start: boolean;
  attempt_limit: number;
  paper_selection_mode: string;
  memo: string | null;
  available_from: string | null;
  due_at: string | null;
  created_at: string | null;
  latest_attempt: AttemptSummary | null;
};

export type AssignmentListResponse = {
  items: AssignmentListItem[];
  total?: number;
  limit?: number;
  offset?: number;
};

export type AssignmentDetail = {
  assignment: {
    id: number;
    exam_id: number;
    student_id: number;
    sprint_program_id: number;
    status: string;
    computed_status: string;
    available_from: string | null;
    due_at: string | null;
    assigned_at: string | null;
    attempt_count: number;
    base_attempt_count: number;
    approval_attempt_count: number;
    attempt_limit: number;
    paper_selection_mode: string;
    memo: string | null;
    can_start: boolean;
    has_started_attempt: boolean;
    needs_retake_approval: boolean;
    available_retake_approval_count: number;
    available_retake_approval_id: number | null;
    cannot_start_reason: string | null;
  };
  student: {
    id: number;
    name: string;
    grade: string;
    korean_elective: string | null;
    math_elective: string | null;
    inquiry_subject_1: string | null;
    inquiry_subject_2: string | null;
  };
  exam: { id: number; title: string; exam_date: string | null };
  papers: Array<{
    assignment_paper_id: number;
    paper_id: number;
    score_group_id: number;
    subject_code: string;
    subject_name: string;
    paper_role: string;
    slot: string | null;
    display_order: number;
    score_group_code: string;
    score_group_name: string;
  }>;
  active_attempt: AttemptSummary | null;
  latest_attempt: AttemptSummary | null;
  attempts: AttemptSummary[];
};

export type SprintProgram = {
  id: number;
  student_id: number;
  student_name: string;
  title: string;
  start_date: string;
  end_date: string;
  status: string;
  mock_exam_weekday: number | null;
  mock_exam_start_time: string | null;
  mock_exam_submission_deadline_time: string | null;
  first_mock_exam_date: string | null;
};

export type ElectiveProfile = {
  student_id: number;
  student_name: string;
  korean_elective: string | null;
  math_elective: string | null;
  inquiry_subject_1: string | null;
  inquiry_subject_2: string | null;
  options: {
    korean: string[];
    math: string[];
    inquiry: string[];
  };
};

export type ParseIssue = { line: number; code: string; message: string };

export type ParsePreviewResponse = {
  ok: boolean;
  errors: ParseIssue[];
  warnings: ParseIssue[];
  preview: Omit<ExamV2Detail, "exam"> & {
    exam: {
      title?: string | null;
      exam_date?: string | null;
      source_label?: string | null;
      description?: string | null;
      metadata?: Record<string, unknown>;
    };
  };
  normalized_output: string | null;
};

export type AdminAttemptDetail = {
  attempt: AttemptSummary & { assignment_id: number };
  student: { id: number; name: string; grade: string };
  assignment: { id: number; student_id: number; status: string; due_at: string | null };
  exam: { id: number; title: string; exam_date: string | null };
  questions: Array<{
    question_id: number;
    paper_id: number;
    question_no: number;
    subject_code: string;
    subject_name: string;
    score_group_id: number;
    score_group_code: string;
    submitted_answer: unknown[];
    correct_answers: string[];
    is_correct: boolean | null;
    awarded_points: number | null;
    max_points: number;
  }>;
  scores: Array<{
    score_group_id: number;
    score_group_code: string;
    score_group_name: string;
    raw_score: number;
    max_score: number;
    grade: number | null;
    scoring_version: number;
    correct_count: number;
    blank_count: number;
  }>;
  summary: {
    total_question_count: number;
    answered_count: number;
    correct_count: number;
    incorrect_count: number;
    unanswered_count: number;
    raw_score: number;
    max_score: number;
  };
  publication: {
    status: string;
    computed_status: string;
    published_at: string | null;
    can_publish: boolean;
    can_unpublish: boolean;
  };
};
