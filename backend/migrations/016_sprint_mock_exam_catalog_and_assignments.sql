-- 8차: 모의고사 "공통 시험 원본 + 학생별 배정" 구조.
-- 시험지/정답/배점/등급컷/파일은 과목당 한 번만 저장하고 학생마다 복제하지 않는다.
-- 학생마다 달라지는 것은 배정 일정(exam_date/available_from/deadline/공개시각)과 제출/답안/점수뿐이다.
-- 기존 7차(sprint_mock_exam_rounds/papers/...) 테이블과 데이터는 그대로 둔다 (실제 배정/응시
-- 기록이 있어 삭제하거나 변환하지 않는다). 기존 5차(sprint_mock_exam_series/...)도 그대로 둔다.

CREATE TABLE IF NOT EXISTS sprint_mock_exam_catalog (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    subject VARCHAR(50) NOT NULL,
    question_count INTEGER NOT NULL,
    total_score INTEGER NOT NULL DEFAULT 100,
    duration_minutes INTEGER,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_catalog_questions (
    id SERIAL PRIMARY KEY,
    catalog_id INTEGER NOT NULL REFERENCES sprint_mock_exam_catalog(id) ON DELETE CASCADE,
    question_no INTEGER NOT NULL,
    correct_answer INTEGER NOT NULL,
    score_points INTEGER NOT NULL,
    category VARCHAR(100),
    is_scored BOOLEAN NOT NULL DEFAULT TRUE,
    memo VARCHAR(300),
    CONSTRAINT uq_sprint_mock_exam_catalog_questions_catalog_question UNIQUE (catalog_id, question_no)
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_catalog_questions_catalog_id ON sprint_mock_exam_catalog_questions(catalog_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_catalog_grade_cuts (
    id SERIAL PRIMARY KEY,
    catalog_id INTEGER NOT NULL REFERENCES sprint_mock_exam_catalog(id) ON DELETE CASCADE,
    grade INTEGER NOT NULL,
    minimum_score INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_mock_exam_catalog_grade_cuts_catalog_grade UNIQUE (catalog_id, grade)
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_catalog_grade_cuts_catalog_id ON sprint_mock_exam_catalog_grade_cuts(catalog_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_catalog_media (
    id SERIAL PRIMARY KEY,
    catalog_id INTEGER NOT NULL REFERENCES sprint_mock_exam_catalog(id) ON DELETE CASCADE,
    media_type VARCHAR(20) NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255),
    mime_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_mock_exam_catalog_media_catalog_type UNIQUE (catalog_id, media_type)
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_catalog_media_catalog_id ON sprint_mock_exam_catalog_media(catalog_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_assignments (
    id SERIAL PRIMARY KEY,
    catalog_id INTEGER NOT NULL REFERENCES sprint_mock_exam_catalog(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    exam_date DATE NOT NULL,
    available_from TIMESTAMPTZ NOT NULL,
    submission_deadline_at TIMESTAMPTZ NOT NULL,
    result_open_at TIMESTAMPTZ,
    solution_open_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'not_started',
    submitted_at TIMESTAMPTZ,
    raw_score INTEGER,
    max_score INTEGER,
    correct_count INTEGER,
    grading_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sprint_mock_exam_assignments_catalog_student UNIQUE (catalog_id, student_id)
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_assignments_catalog_id ON sprint_mock_exam_assignments(catalog_id);
CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_assignments_student_id ON sprint_mock_exam_assignments(student_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_assignment_responses (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES sprint_mock_exam_assignments(id) ON DELETE CASCADE,
    question_no INTEGER NOT NULL,
    selected_answer INTEGER,
    is_correct BOOLEAN,
    awarded_points INTEGER,
    CONSTRAINT uq_sprint_mock_exam_assignment_responses_assignment_question UNIQUE (assignment_id, question_no)
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_assignment_responses_assignment_id ON sprint_mock_exam_assignment_responses(assignment_id);

CREATE TABLE IF NOT EXISTS sprint_mock_exam_assignment_score_logs (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES sprint_mock_exam_assignments(id) ON DELETE CASCADE,
    grading_version INTEGER NOT NULL,
    previous_raw_score INTEGER,
    new_raw_score INTEGER NOT NULL,
    previous_correct_count INTEGER,
    new_correct_count INTEGER NOT NULL,
    reason VARCHAR(200) NOT NULL DEFAULT '재채점',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_assignment_score_logs_assignment_id ON sprint_mock_exam_assignment_score_logs(assignment_id);
