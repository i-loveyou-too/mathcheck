BEGIN;

ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS planner_deadline_time VARCHAR(5);
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS seat_check_deadline_time VARCHAR(5);
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS planner_strike_on_late BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS planner_strike_on_missing BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS seat_check_strike_on_late BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS seat_check_strike_on_missing BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS daily_auto_strike_limit INTEGER;

ALTER TABLE sprint_strikes ADD COLUMN IF NOT EXISTS source_type VARCHAR(40) NOT NULL DEFAULT 'manual';
ALTER TABLE sprint_strikes ADD COLUMN IF NOT EXISTS source_ref VARCHAR(100);
CREATE INDEX IF NOT EXISTS ix_sprint_strikes_source_ref ON sprint_strikes(source_ref);

CREATE TABLE IF NOT EXISTS sprint_daily_proof_submissions (
    id SERIAL PRIMARY KEY,
    sprint_program_id INTEGER NOT NULL REFERENCES sprint_programs(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    learning_date DATE NOT NULL,
    proof_type VARCHAR(20) NOT NULL,
    workflow_status VARCHAR(20) NOT NULL DEFAULT 'draft',
    timing_status VARCHAR(20) NOT NULL DEFAULT 'not_due',
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    reviewed_by INTEGER REFERENCES math_admins(id),
    review_note VARCHAR(500),
    memo VARCHAR(500),
    timing_override VARCHAR(20),
    timing_override_reason VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sprint_daily_proof_program_student_date_type
        UNIQUE(sprint_program_id, student_id, learning_date, proof_type)
);
CREATE INDEX IF NOT EXISTS ix_sprint_daily_proof_program_type_status
    ON sprint_daily_proof_submissions(sprint_program_id, proof_type, workflow_status);
CREATE INDEX IF NOT EXISTS ix_sprint_daily_proof_student_date
    ON sprint_daily_proof_submissions(student_id, learning_date);
CREATE INDEX IF NOT EXISTS ix_sprint_daily_proof_submissions_workflow_status
    ON sprint_daily_proof_submissions(workflow_status);
CREATE INDEX IF NOT EXISTS ix_sprint_daily_proof_submissions_timing_status
    ON sprint_daily_proof_submissions(timing_status);

CREATE TABLE IF NOT EXISTS sprint_daily_proof_attempts (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL REFERENCES sprint_daily_proof_submissions(id) ON DELETE CASCADE,
    attempt_no INTEGER NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL,
    timing_status VARCHAR(20) NOT NULL,
    memo VARCHAR(500),
    review_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reviewed_at TIMESTAMPTZ,
    review_note VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sprint_daily_proof_attempt_no UNIQUE(submission_id, attempt_no)
);

CREATE TABLE IF NOT EXISTS sprint_daily_proof_images (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL REFERENCES sprint_daily_proof_submissions(id) ON DELETE CASCADE,
    storage_key VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255),
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_sprint_daily_proof_images_submission
    ON sprint_daily_proof_images(submission_id);

COMMIT;
