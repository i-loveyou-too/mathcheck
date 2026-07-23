-- 7차: SPRINT 모의고사를 "회차 하나 = 과목별 시험지 여러 개" 구조로 재설계.
-- 기존 sprint_mock_exam_series/sprint_mock_exams/... 테이블과 데이터는 그대로 둔다
-- (DROP/DELETE 없음). 기존 데이터는 0건으로 확인되어 변환 로직은 불필요하다.

ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS inquiry_subject_1 VARCHAR(30);
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS inquiry_subject_2 VARCHAR(30);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_rounds (
    id SERIAL PRIMARY KEY,
    sprint_program_id INTEGER NOT NULL REFERENCES sprint_programs(id) ON DELETE CASCADE,
    round_no INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    exam_date DATE NOT NULL,
    start_time VARCHAR(5),
    submission_deadline_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_mock_exam_rounds_program_round UNIQUE (sprint_program_id, round_no)
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_rounds_program_id ON sprint_mock_exam_rounds(sprint_program_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_papers (
    id SERIAL PRIMARY KEY,
    mock_exam_round_id INTEGER NOT NULL REFERENCES sprint_mock_exam_rounds(id) ON DELETE CASCADE,
    subject_group VARCHAR(20) NOT NULL,
    subject_code VARCHAR(30) NOT NULL,
    title VARCHAR(200) NOT NULL,
    question_count INTEGER NOT NULL,
    total_score INTEGER NOT NULL DEFAULT 100,
    scoring_policy VARCHAR(20) NOT NULL DEFAULT 'equal_split',
    order_index INTEGER NOT NULL DEFAULT 0,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_mock_exam_papers_round_subject UNIQUE (mock_exam_round_id, subject_code)
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_papers_round_id ON sprint_mock_exam_papers(mock_exam_round_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_paper_questions (
    id SERIAL PRIMARY KEY,
    paper_id INTEGER NOT NULL REFERENCES sprint_mock_exam_papers(id) ON DELETE CASCADE,
    question_no INTEGER NOT NULL,
    correct_answer INTEGER NOT NULL,
    score_points INTEGER NOT NULL,
    category VARCHAR(100),
    is_scored BOOLEAN NOT NULL DEFAULT TRUE,
    memo VARCHAR(300),
    CONSTRAINT uq_sprint_mock_exam_paper_questions_paper_question UNIQUE (paper_id, question_no)
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_paper_questions_paper_id ON sprint_mock_exam_paper_questions(paper_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_paper_grade_cuts (
    id SERIAL PRIMARY KEY,
    paper_id INTEGER NOT NULL REFERENCES sprint_mock_exam_papers(id) ON DELETE CASCADE,
    grade INTEGER NOT NULL,
    minimum_score INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_mock_exam_paper_grade_cuts_paper_grade UNIQUE (paper_id, grade)
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_paper_grade_cuts_paper_id ON sprint_mock_exam_paper_grade_cuts(paper_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_paper_media (
    id SERIAL PRIMARY KEY,
    paper_id INTEGER NOT NULL REFERENCES sprint_mock_exam_papers(id) ON DELETE CASCADE,
    media_type VARCHAR(20) NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255),
    mime_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_mock_exam_paper_media_paper_type UNIQUE (paper_id, media_type)
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_paper_media_paper_id ON sprint_mock_exam_paper_media(paper_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_participants (
    id SERIAL PRIMARY KEY,
    mock_exam_round_id INTEGER NOT NULL REFERENCES sprint_mock_exam_rounds(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    status VARCHAR(20) NOT NULL DEFAULT 'not_started',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_mock_exam_participants_round_student UNIQUE (mock_exam_round_id, student_id)
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_participants_round_id ON sprint_mock_exam_participants(mock_exam_round_id);
CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_participants_student_id ON sprint_mock_exam_participants(student_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_participant_papers (
    id SERIAL PRIMARY KEY,
    participant_id INTEGER NOT NULL REFERENCES sprint_mock_exam_participants(id) ON DELETE CASCADE,
    paper_id INTEGER REFERENCES sprint_mock_exam_papers(id) ON DELETE CASCADE,
    subject_slot VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'needs_selection',
    submitted_at TIMESTAMPTZ,
    raw_score INTEGER,
    max_score INTEGER,
    correct_count INTEGER,
    grading_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_mock_exam_participant_papers_participant_slot UNIQUE (participant_id, subject_slot)
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_participant_papers_participant_id ON sprint_mock_exam_participant_papers(participant_id);
CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_participant_papers_paper_id ON sprint_mock_exam_participant_papers(paper_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_participant_responses (
    id SERIAL PRIMARY KEY,
    participant_paper_id INTEGER NOT NULL REFERENCES sprint_mock_exam_participant_papers(id) ON DELETE CASCADE,
    question_no INTEGER NOT NULL,
    selected_answer INTEGER,
    is_correct BOOLEAN,
    awarded_points INTEGER,
    CONSTRAINT uq_sprint_mock_exam_participant_responses_paper_question UNIQUE (participant_paper_id, question_no)
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_participant_responses_participant_paper_id ON sprint_mock_exam_participant_responses(participant_paper_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_participant_score_logs (
    id SERIAL PRIMARY KEY,
    participant_paper_id INTEGER NOT NULL REFERENCES sprint_mock_exam_participant_papers(id) ON DELETE CASCADE,
    grading_version INTEGER NOT NULL,
    previous_raw_score INTEGER,
    new_raw_score INTEGER NOT NULL,
    previous_correct_count INTEGER,
    new_correct_count INTEGER NOT NULL,
    reason VARCHAR(200) NOT NULL DEFAULT '재채점',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_participant_score_logs_participant_paper_id ON sprint_mock_exam_participant_score_logs(participant_paper_id);
