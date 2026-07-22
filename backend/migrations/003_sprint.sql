BEGIN;

CREATE TABLE IF NOT EXISTS sprint_programs (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    title VARCHAR(200) NOT NULL,
    description VARCHAR(500),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    daily_study_goal_minutes INTEGER,
    enable_seat_check BOOLEAN NOT NULL DEFAULT FALSE,
    enable_planner_submission BOOLEAN NOT NULL DEFAULT FALSE,
    enable_study_timer BOOLEAN NOT NULL DEFAULT FALSE,
    enable_vocabulary BOOLEAN NOT NULL DEFAULT FALSE,
    enable_mock_exam BOOLEAN NOT NULL DEFAULT FALSE,
    enable_goals BOOLEAN NOT NULL DEFAULT TRUE,
    enable_three_strikes BOOLEAN NOT NULL DEFAULT TRUE,
    enable_penalty_assignment BOOLEAN NOT NULL DEFAULT FALSE,
    strike_threshold INTEGER NOT NULL DEFAULT 3,
    penalty_word_count INTEGER NOT NULL DEFAULT 20,
    penalty_repetition_count INTEGER NOT NULL DEFAULT 5,
    penalty_due_hours INTEGER NOT NULL DEFAULT 24,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_sprint_programs_student_id ON sprint_programs(student_id);
CREATE INDEX IF NOT EXISTS ix_sprint_programs_is_active ON sprint_programs(is_active);
CREATE INDEX IF NOT EXISTS ix_sprint_programs_student_dates ON sprint_programs(student_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS sprint_goals (
    id SERIAL PRIMARY KEY,
    sprint_program_id INTEGER NOT NULL REFERENCES sprint_programs(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description VARCHAR(500),
    target_value INTEGER,
    current_value INTEGER NOT NULL DEFAULT 0,
    unit VARCHAR(50),
    order_index INTEGER NOT NULL DEFAULT 0,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_sprint_goals_program ON sprint_goals(sprint_program_id);

CREATE TABLE IF NOT EXISTS sprint_strikes (
    id SERIAL PRIMARY KEY,
    sprint_program_id INTEGER NOT NULL REFERENCES sprint_programs(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    strike_type VARCHAR(40) NOT NULL DEFAULT 'manual',
    reason VARCHAR(500),
    learning_date DATE NOT NULL,
    related_entity_type VARCHAR(40),
    related_entity_id INTEGER,
    created_by_admin_id INTEGER REFERENCES math_admins(id),
    is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled_reason VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_sprint_strikes_program ON sprint_strikes(sprint_program_id);
CREATE INDEX IF NOT EXISTS ix_sprint_strikes_student ON sprint_strikes(student_id);
CREATE INDEX IF NOT EXISTS ix_sprint_strikes_program_active ON sprint_strikes(sprint_program_id, is_cancelled);

CREATE TABLE IF NOT EXISTS sprint_penalty_assignments (
    id SERIAL PRIMARY KEY,
    sprint_program_id INTEGER NOT NULL REFERENCES sprint_programs(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    penalty_type VARCHAR(40) NOT NULL DEFAULT 'vocabulary_kkamji',
    status VARCHAR(20) NOT NULL DEFAULT 'assigned',
    triggered_strike_count INTEGER NOT NULL DEFAULT 0,
    instructions VARCHAR(500),
    word_count INTEGER,
    repetition_count INTEGER,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    due_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    attachment_url VARCHAR(500)
);
CREATE INDEX IF NOT EXISTS ix_sprint_penalty_program ON sprint_penalty_assignments(sprint_program_id);
CREATE INDEX IF NOT EXISTS ix_sprint_penalty_student ON sprint_penalty_assignments(student_id);
CREATE INDEX IF NOT EXISTS ix_sprint_penalty_status ON sprint_penalty_assignments(status);

COMMIT;
