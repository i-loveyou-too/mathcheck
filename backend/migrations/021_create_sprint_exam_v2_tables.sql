-- Sprint Exam V2 schema.
-- This migration creates only the new Sprint-owned exam tables.
-- It does not touch textbook/mock_exam tables or legacy SprintMock tables.

CREATE TABLE IF NOT EXISTS sprint_exam_v2_exams (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    exam_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    source_label VARCHAR(100),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_text TEXT,
    parse_summary JSONB,
    created_by_admin_id INTEGER REFERENCES math_admins(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_sprint_exam_v2_exams_status CHECK (status IN ('draft', 'published', 'closed'))
);

CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_exams_status ON sprint_exam_v2_exams(status);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_exams_exam_date ON sprint_exam_v2_exams(exam_date);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_exams_created_by_admin_id ON sprint_exam_v2_exams(created_by_admin_id);

CREATE TABLE IF NOT EXISTS sprint_exam_v2_score_groups (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES sprint_exam_v2_exams(id) ON DELETE CASCADE,
    score_group_code VARCHAR(40) NOT NULL,
    score_group_name VARCHAR(100) NOT NULL,
    subject_area VARCHAR(40) NOT NULL,
    aggregation_type VARCHAR(20) NOT NULL DEFAULT 'standalone',
    display_order INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_exam_v2_score_groups_exam_code UNIQUE (exam_id, score_group_code),
    CONSTRAINT ck_sprint_exam_v2_score_groups_code CHECK (score_group_code ~ '^[a-z0-9_]+$'),
    CONSTRAINT ck_sprint_exam_v2_score_groups_aggregation CHECK (aggregation_type IN ('sum', 'standalone'))
);

CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_score_groups_exam_id ON sprint_exam_v2_score_groups(exam_id);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_score_groups_subject_area ON sprint_exam_v2_score_groups(subject_area);

CREATE TABLE IF NOT EXISTS sprint_exam_v2_papers (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES sprint_exam_v2_exams(id) ON DELETE CASCADE,
    score_group_id INTEGER NOT NULL REFERENCES sprint_exam_v2_score_groups(id) ON DELETE CASCADE,
    subject_code VARCHAR(40) NOT NULL,
    subject_name VARCHAR(100) NOT NULL,
    paper_role VARCHAR(20) NOT NULL,
    slot VARCHAR(20),
    elective_code VARCHAR(40),
    elective_name VARCHAR(100),
    total_points INTEGER NOT NULL DEFAULT 0,
    question_count INTEGER NOT NULL DEFAULT 0,
    omr_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_sprint_exam_v2_papers_role CHECK (paper_role IN ('common', 'elective', 'inquiry_slot', 'standalone')),
    CONSTRAINT ck_sprint_exam_v2_papers_slot CHECK (slot IS NULL OR slot IN ('inquiry_1', 'inquiry_2'))
);

CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_papers_exam_id ON sprint_exam_v2_papers(exam_id);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_papers_score_group_id ON sprint_exam_v2_papers(score_group_id);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_papers_subject_code ON sprint_exam_v2_papers(subject_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sprint_exam_v2_papers_exam_subject_no_slot
    ON sprint_exam_v2_papers(exam_id, subject_code)
    WHERE slot IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sprint_exam_v2_papers_exam_subject_slot
    ON sprint_exam_v2_papers(exam_id, subject_code, slot)
    WHERE slot IS NOT NULL;

CREATE TABLE IF NOT EXISTS sprint_exam_v2_questions (
    id SERIAL PRIMARY KEY,
    paper_id INTEGER NOT NULL REFERENCES sprint_exam_v2_papers(id) ON DELETE CASCADE,
    question_no INTEGER NOT NULL,
    answer_type VARCHAR(20) NOT NULL DEFAULT 'choice',
    correct_answers JSONB NOT NULL,
    points INTEGER NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    explanation TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_exam_v2_questions_paper_no UNIQUE (paper_id, question_no),
    CONSTRAINT ck_sprint_exam_v2_questions_answer_type CHECK (answer_type IN ('choice', 'short_answer')),
    CONSTRAINT ck_sprint_exam_v2_questions_points CHECK (points > 0)
);

CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_questions_paper_id ON sprint_exam_v2_questions(paper_id);

CREATE TABLE IF NOT EXISTS sprint_exam_v2_grade_cuts (
    id SERIAL PRIMARY KEY,
    score_group_id INTEGER NOT NULL REFERENCES sprint_exam_v2_score_groups(id) ON DELETE CASCADE,
    grade INTEGER NOT NULL,
    min_score INTEGER NOT NULL,
    cut_type VARCHAR(20) NOT NULL DEFAULT 'raw_score_min',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_exam_v2_grade_cuts_group_grade_type UNIQUE (score_group_id, grade, cut_type),
    CONSTRAINT ck_sprint_exam_v2_grade_cuts_grade CHECK (grade > 0),
    CONSTRAINT ck_sprint_exam_v2_grade_cuts_min_score CHECK (min_score >= 0),
    CONSTRAINT ck_sprint_exam_v2_grade_cuts_type CHECK (cut_type IN ('raw_score_min', 'absolute_band'))
);

CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_grade_cuts_score_group_id ON sprint_exam_v2_grade_cuts(score_group_id);

CREATE TABLE IF NOT EXISTS sprint_exam_v2_assignments (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES sprint_exam_v2_exams(id) ON DELETE CASCADE,
    sprint_program_id INTEGER NOT NULL REFERENCES sprint_programs(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    status VARCHAR(20) NOT NULL DEFAULT 'assigned',
    korean_elective_snapshot VARCHAR(30),
    math_elective_snapshot VARCHAR(30),
    inquiry_subject_1_snapshot VARCHAR(30),
    inquiry_subject_2_snapshot VARCHAR(30),
    available_from TIMESTAMPTZ,
    submission_deadline_at TIMESTAMPTZ,
    attempt_limit INTEGER NOT NULL DEFAULT 1,
    memo TEXT,
    paper_selection_mode VARCHAR(20) NOT NULL DEFAULT 'student_profile',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_admin_id INTEGER REFERENCES math_admins(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_exam_v2_assignments_exam_student UNIQUE (exam_id, student_id),
    CONSTRAINT ck_sprint_exam_v2_assignments_status CHECK (status IN ('assigned', 'in_progress', 'submitted', 'closed')),
    CONSTRAINT ck_sprint_exam_v2_assignments_attempt_limit CHECK (attempt_limit >= 1),
    CONSTRAINT ck_sprint_exam_v2_assignments_paper_selection_mode CHECK (paper_selection_mode IN ('student_profile', 'override'))
);

CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_assignments_exam_id ON sprint_exam_v2_assignments(exam_id);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_assignments_program_student ON sprint_exam_v2_assignments(sprint_program_id, student_id);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_assignments_student_status ON sprint_exam_v2_assignments(student_id, status);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_assignments_created_by_admin_id ON sprint_exam_v2_assignments(created_by_admin_id);

CREATE TABLE IF NOT EXISTS sprint_exam_v2_assignment_papers (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES sprint_exam_v2_assignments(id) ON DELETE CASCADE,
    paper_id INTEGER NOT NULL REFERENCES sprint_exam_v2_papers(id) ON DELETE CASCADE,
    score_group_id INTEGER NOT NULL REFERENCES sprint_exam_v2_score_groups(id) ON DELETE CASCADE,
    subject_code_snapshot VARCHAR(40) NOT NULL,
    subject_name_snapshot VARCHAR(100) NOT NULL,
    paper_role_snapshot VARCHAR(20) NOT NULL,
    slot_snapshot VARCHAR(20),
    display_order_snapshot INTEGER NOT NULL DEFAULT 0,
    score_group_code_snapshot VARCHAR(40) NOT NULL,
    score_group_name_snapshot VARCHAR(100) NOT NULL,
    matched_by VARCHAR(40),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_exam_v2_assignment_papers_assignment_paper UNIQUE (assignment_id, paper_id)
);

CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_assignment_papers_assignment_id ON sprint_exam_v2_assignment_papers(assignment_id);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_assignment_papers_paper_id ON sprint_exam_v2_assignment_papers(paper_id);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_assignment_papers_score_group_id ON sprint_exam_v2_assignment_papers(score_group_id);

CREATE TABLE IF NOT EXISTS sprint_exam_v2_retake_approvals (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES sprint_exam_v2_assignments(id) ON DELETE CASCADE,
    source_attempt_id INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'requested',
    requested_reason TEXT,
    admin_note TEXT,
    approved_by_admin_id INTEGER REFERENCES math_admins(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_sprint_exam_v2_retake_approvals_status CHECK (status IN ('requested', 'approved', 'rejected', 'used', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_retake_approvals_assignment_status ON sprint_exam_v2_retake_approvals(assignment_id, status);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_retake_approvals_source_attempt_id ON sprint_exam_v2_retake_approvals(source_attempt_id);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_retake_approvals_approved_by_admin_id ON sprint_exam_v2_retake_approvals(approved_by_admin_id);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_retake_approvals_expires_at ON sprint_exam_v2_retake_approvals(expires_at);

CREATE TABLE IF NOT EXISTS sprint_exam_v2_attempts (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES sprint_exam_v2_assignments(id) ON DELETE CASCADE,
    attempt_no INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'started',
    is_latest_submitted BOOLEAN NOT NULL DEFAULT FALSE,
    retake_approval_id INTEGER REFERENCES sprint_exam_v2_retake_approvals(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    scored_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    submit_warning_snapshot JSONB,
    client_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_exam_v2_attempts_assignment_attempt_no UNIQUE (assignment_id, attempt_no),
    CONSTRAINT ck_sprint_exam_v2_attempts_status CHECK (status IN ('started', 'submitted', 'scored', 'voided'))
);

CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_attempts_assignment_status ON sprint_exam_v2_attempts(assignment_id, status);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_attempts_submitted_at ON sprint_exam_v2_attempts(submitted_at);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_attempts_retake_approval_id ON sprint_exam_v2_attempts(retake_approval_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sprint_exam_v2_attempts_retake_approval_id
    ON sprint_exam_v2_attempts(retake_approval_id)
    WHERE retake_approval_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sprint_exam_v2_attempts_assignment_latest_submitted
    ON sprint_exam_v2_attempts(assignment_id)
    WHERE is_latest_submitted = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sprint_exam_v2_attempts_assignment_started
    ON sprint_exam_v2_attempts(assignment_id)
    WHERE status = 'started';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_sprint_exam_v2_retake_approvals_source_attempt'
    ) THEN
        ALTER TABLE sprint_exam_v2_retake_approvals
            ADD CONSTRAINT fk_sprint_exam_v2_retake_approvals_source_attempt
            FOREIGN KEY (source_attempt_id)
            REFERENCES sprint_exam_v2_attempts(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS sprint_exam_v2_responses (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER NOT NULL REFERENCES sprint_exam_v2_attempts(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES sprint_exam_v2_questions(id) ON DELETE CASCADE,
    answer_value VARCHAR(200),
    answer_values JSONB,
    is_blank BOOLEAN NOT NULL DEFAULT FALSE,
    is_correct BOOLEAN,
    awarded_points INTEGER,
    graded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_exam_v2_responses_attempt_question UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_responses_attempt_id ON sprint_exam_v2_responses(attempt_id);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_responses_question_id ON sprint_exam_v2_responses(question_id);

CREATE TABLE IF NOT EXISTS sprint_exam_v2_scores (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER NOT NULL REFERENCES sprint_exam_v2_attempts(id) ON DELETE CASCADE,
    score_group_id INTEGER NOT NULL REFERENCES sprint_exam_v2_score_groups(id) ON DELETE CASCADE,
    raw_score INTEGER NOT NULL DEFAULT 0,
    max_score INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    blank_count INTEGER NOT NULL DEFAULT 0,
    grade INTEGER,
    scoring_version INTEGER NOT NULL DEFAULT 1,
    scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_exam_v2_scores_attempt_group UNIQUE (attempt_id, score_group_id),
    CONSTRAINT ck_sprint_exam_v2_scores_raw_score CHECK (raw_score >= 0),
    CONSTRAINT ck_sprint_exam_v2_scores_max_score CHECK (max_score >= 0),
    CONSTRAINT ck_sprint_exam_v2_scores_correct_count CHECK (correct_count >= 0),
    CONSTRAINT ck_sprint_exam_v2_scores_blank_count CHECK (blank_count >= 0)
);

CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_scores_attempt_id ON sprint_exam_v2_scores(attempt_id);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_scores_score_group_id ON sprint_exam_v2_scores(score_group_id);

CREATE TABLE IF NOT EXISTS sprint_exam_v2_score_logs (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER NOT NULL REFERENCES sprint_exam_v2_attempts(id) ON DELETE CASCADE,
    trigger_type VARCHAR(40) NOT NULL,
    triggered_by_admin_id INTEGER REFERENCES math_admins(id) ON DELETE SET NULL,
    answer_key_version INTEGER,
    previous_score_snapshot JSONB,
    new_score_snapshot JSONB,
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_sprint_exam_v2_score_logs_trigger_type CHECK (trigger_type IN ('submit', 'answer_key_update', 'admin_rescore', 'manual_single_rescore'))
);

CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_score_logs_attempt_id ON sprint_exam_v2_score_logs(attempt_id);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_score_logs_created_at ON sprint_exam_v2_score_logs(created_at);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_score_logs_triggered_by_admin_id ON sprint_exam_v2_score_logs(triggered_by_admin_id);

CREATE TABLE IF NOT EXISTS sprint_exam_v2_result_publications (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER NOT NULL REFERENCES sprint_exam_v2_attempts(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'unpublished',
    show_total_score BOOLEAN NOT NULL DEFAULT TRUE,
    show_grade BOOLEAN NOT NULL DEFAULT TRUE,
    show_score_groups BOOLEAN NOT NULL DEFAULT TRUE,
    show_question_results BOOLEAN NOT NULL DEFAULT TRUE,
    show_correct_answers BOOLEAN NOT NULL DEFAULT FALSE,
    show_explanations BOOLEAN NOT NULL DEFAULT FALSE,
    published_by_admin_id INTEGER REFERENCES math_admins(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    unpublished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_exam_v2_result_publications_attempt UNIQUE (attempt_id),
    CONSTRAINT ck_sprint_exam_v2_result_publications_status CHECK (status IN ('unpublished', 'published'))
);

CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_result_publications_attempt_id ON sprint_exam_v2_result_publications(attempt_id);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_result_publications_status ON sprint_exam_v2_result_publications(status);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_result_publications_published_by ON sprint_exam_v2_result_publications(published_by_admin_id);

CREATE TABLE IF NOT EXISTS sprint_exam_v2_result_publication_logs (
    id SERIAL PRIMARY KEY,
    publication_id INTEGER NOT NULL REFERENCES sprint_exam_v2_result_publications(id) ON DELETE CASCADE,
    attempt_id INTEGER NOT NULL REFERENCES sprint_exam_v2_attempts(id) ON DELETE CASCADE,
    action VARCHAR(40) NOT NULL,
    actor_admin_id INTEGER REFERENCES math_admins(id) ON DELETE SET NULL,
    previous_snapshot JSONB,
    new_snapshot JSONB,
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_sprint_exam_v2_result_publication_logs_action CHECK (action IN ('published', 'unpublished', 'settings_updated'))
);

CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_result_publication_logs_publication_id ON sprint_exam_v2_result_publication_logs(publication_id);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_result_publication_logs_attempt_id ON sprint_exam_v2_result_publication_logs(attempt_id);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_result_publication_logs_created_at ON sprint_exam_v2_result_publication_logs(created_at);
CREATE INDEX IF NOT EXISTS ix_sprint_exam_v2_result_publication_logs_actor_admin_id ON sprint_exam_v2_result_publication_logs(actor_admin_id);
