BEGIN;

ALTER TABLE sprint_programs
    ADD COLUMN IF NOT EXISTS enable_study_time_submission BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS sprint_study_submissions (
    id SERIAL PRIMARY KEY,
    sprint_program_id INTEGER NOT NULL REFERENCES sprint_programs(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    learning_date DATE NOT NULL,
    total_minutes INTEGER NOT NULL,
    subject_breakdown JSON,
    memo VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    submitted_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    reviewed_by INTEGER REFERENCES math_admins(id),
    review_note VARCHAR(500),
    approved_minutes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sprint_study_submission_program_student_date
        UNIQUE(sprint_program_id, student_id, learning_date)
);
CREATE INDEX IF NOT EXISTS ix_sprint_study_submissions_program_status
    ON sprint_study_submissions(sprint_program_id, status);
CREATE INDEX IF NOT EXISTS ix_sprint_study_submissions_student_date
    ON sprint_study_submissions(student_id, learning_date);
CREATE INDEX IF NOT EXISTS ix_sprint_study_submissions_status
    ON sprint_study_submissions(status);
CREATE INDEX IF NOT EXISTS ix_sprint_study_submissions_learning_date
    ON sprint_study_submissions(learning_date);

CREATE TABLE IF NOT EXISTS sprint_study_submission_images (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL REFERENCES sprint_study_submissions(id) ON DELETE CASCADE,
    storage_key VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255),
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_sprint_study_submission_images_submission
    ON sprint_study_submission_images(submission_id);

COMMIT;
