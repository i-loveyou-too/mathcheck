CREATE TABLE IF NOT EXISTS suteuk_challenge_rest_dates (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES suteuk_challenge_assignments(id) ON DELETE CASCADE,
    rest_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_suteuk_rest_date_assignment_date UNIQUE (assignment_id, rest_date)
);

CREATE INDEX IF NOT EXISTS ix_suteuk_rest_dates_assignment_date
    ON suteuk_challenge_rest_dates(assignment_id, rest_date);
