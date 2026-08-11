CREATE TABLE IF NOT EXISTS suteuk_challenge_assignments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES math_students(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_suteuk_challenge_assignments_student_status
    ON suteuk_challenge_assignments(student_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_suteuk_challenge_assignments_active_student
    ON suteuk_challenge_assignments(student_id)
    WHERE status = 'active';

CREATE TABLE IF NOT EXISTS suteuk_challenge_task_progress (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES suteuk_challenge_assignments(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    task_code VARCHAR(100) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_suteuk_challenge_task_progress_assignment_day_task
    ON suteuk_challenge_task_progress(assignment_id, day_number, task_code);

CREATE INDEX IF NOT EXISTS ix_suteuk_challenge_task_progress_assignment_day
    ON suteuk_challenge_task_progress(assignment_id, day_number);
