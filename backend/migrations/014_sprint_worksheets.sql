CREATE TABLE IF NOT EXISTS sprint_worksheet_assignments (
    id SERIAL PRIMARY KEY,
    sprint_program_id INTEGER NOT NULL REFERENCES sprint_programs(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    title VARCHAR(200) NOT NULL,
    subject VARCHAR(50),
    assigned_date DATE NOT NULL,
    due_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    storage_key VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255),
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_by_admin_id INTEGER REFERENCES math_admins(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_sprint_worksheet_assignments_sprint_program_id ON sprint_worksheet_assignments(sprint_program_id);
CREATE INDEX IF NOT EXISTS ix_sprint_worksheet_assignments_student_id ON sprint_worksheet_assignments(student_id);
CREATE INDEX IF NOT EXISTS ix_sprint_worksheet_assignments_assigned_date ON sprint_worksheet_assignments(assigned_date);
CREATE INDEX IF NOT EXISTS ix_sprint_worksheet_assignments_is_active ON sprint_worksheet_assignments(is_active);
CREATE INDEX IF NOT EXISTS ix_sprint_worksheet_assignments_program_student ON sprint_worksheet_assignments(sprint_program_id, student_id);
CREATE INDEX IF NOT EXISTS ix_sprint_worksheet_assignments_student_active ON sprint_worksheet_assignments(student_id, is_active);

CREATE TABLE IF NOT EXISTS sprint_worksheet_submissions (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL UNIQUE REFERENCES sprint_worksheet_assignments(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    submission_method VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    submitted_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    reviewed_by INTEGER REFERENCES math_admins(id),
    review_note VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_sprint_worksheet_submissions_assignment_id ON sprint_worksheet_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS ix_sprint_worksheet_submissions_student_id ON sprint_worksheet_submissions(student_id);
CREATE INDEX IF NOT EXISTS ix_sprint_worksheet_submissions_status ON sprint_worksheet_submissions(status);
CREATE INDEX IF NOT EXISTS ix_sprint_worksheet_submissions_student_status ON sprint_worksheet_submissions(student_id, status);

CREATE TABLE IF NOT EXISTS sprint_worksheet_submission_files (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL REFERENCES sprint_worksheet_submissions(id) ON DELETE CASCADE,
    file_kind VARCHAR(10) NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255),
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_sprint_worksheet_submission_files_submission_id ON sprint_worksheet_submission_files(submission_id);
