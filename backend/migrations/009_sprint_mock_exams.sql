BEGIN;

CREATE TABLE IF NOT EXISTS sprint_mock_exam_series (
    id SERIAL PRIMARY KEY,
    sprint_program_id INTEGER NOT NULL REFERENCES sprint_programs(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    recurrence_weekday INTEGER NOT NULL,
    first_exam_date DATE NOT NULL,
    start_time VARCHAR(5),
    submission_deadline_time VARCHAR(5) NOT NULL,
    generation_mode VARCHAR(20) NOT NULL DEFAULT 'until_sprint_end',
    total_rounds INTEGER,
    subject VARCHAR(50) NOT NULL DEFAULT '수학',
    default_question_count INTEGER NOT NULL DEFAULT 20,
    default_scoring_policy VARCHAR(20) NOT NULL DEFAULT 'equal_split',
    default_total_score INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_series_sprint_program_id
    ON sprint_mock_exam_series(sprint_program_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exams (
    id SERIAL PRIMARY KEY,
    series_id INTEGER NOT NULL REFERENCES sprint_mock_exam_series(id) ON DELETE CASCADE,
    sprint_program_id INTEGER NOT NULL REFERENCES sprint_programs(id) ON DELETE CASCADE,
    round_no INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    exam_date DATE NOT NULL,
    start_time VARCHAR(5),
    submission_deadline_at TIMESTAMPTZ NOT NULL,
    subject VARCHAR(50) NOT NULL,
    question_count INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    is_date_overridden BOOLEAN NOT NULL DEFAULT FALSE,
    original_exam_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sprint_mock_exams_series_round UNIQUE (series_id, round_no),
    CONSTRAINT uq_sprint_mock_exams_series_date UNIQUE (series_id, exam_date)
);
CREATE INDEX IF NOT EXISTS ix_sprint_mock_exams_series_id ON sprint_mock_exams(series_id);
CREATE INDEX IF NOT EXISTS ix_sprint_mock_exams_sprint_program_id ON sprint_mock_exams(sprint_program_id);
CREATE INDEX IF NOT EXISTS ix_sprint_mock_exams_program_date ON sprint_mock_exams(sprint_program_id, exam_date);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_answer_keys (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES sprint_mock_exams(id) ON DELETE CASCADE,
    question_no INTEGER NOT NULL,
    correct_answer INTEGER NOT NULL,
    score_points INTEGER NOT NULL,
    category VARCHAR(100),
    memo VARCHAR(300),
    CONSTRAINT uq_sprint_mock_exam_answer_keys_exam_question UNIQUE (exam_id, question_no)
);
CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_answer_keys_exam_id ON sprint_mock_exam_answer_keys(exam_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_submissions (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES sprint_mock_exams(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    submitted_at TIMESTAMPTZ,
    raw_score INTEGER,
    max_score INTEGER,
    correct_count INTEGER,
    confirmed_at TIMESTAMPTZ,
    grading_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sprint_mock_exam_submissions_exam_student UNIQUE (exam_id, student_id)
);
CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_submissions_exam_id ON sprint_mock_exam_submissions(exam_id);
CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_submissions_student_id ON sprint_mock_exam_submissions(student_id);
CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_submissions_status ON sprint_mock_exam_submissions(status);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_responses (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL REFERENCES sprint_mock_exam_submissions(id) ON DELETE CASCADE,
    question_no INTEGER NOT NULL,
    selected_answer INTEGER,
    is_correct BOOLEAN,
    awarded_points INTEGER,
    CONSTRAINT uq_sprint_mock_exam_responses_submission_question UNIQUE (submission_id, question_no)
);
CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_responses_submission_id ON sprint_mock_exam_responses(submission_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_score_logs (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL REFERENCES sprint_mock_exam_submissions(id) ON DELETE CASCADE,
    grading_version INTEGER NOT NULL,
    previous_raw_score INTEGER,
    new_raw_score INTEGER NOT NULL,
    previous_correct_count INTEGER,
    new_correct_count INTEGER NOT NULL,
    reason VARCHAR(200) NOT NULL DEFAULT '정답 수정 재채점',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_score_logs_submission_id ON sprint_mock_exam_score_logs(submission_id);

COMMIT;
