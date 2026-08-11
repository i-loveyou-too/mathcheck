CREATE TABLE IF NOT EXISTS suteuk_challenge_concept_progress (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES suteuk_challenge_assignments(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    concept_code VARCHAR(120) NOT NULL,
    response VARCHAR(20),
    final_status VARCHAR(40),
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_suteuk_concept_progress_assignment_code
    ON suteuk_challenge_concept_progress(assignment_id, concept_code);

CREATE INDEX IF NOT EXISTS ix_suteuk_concept_progress_assignment_day
    ON suteuk_challenge_concept_progress(assignment_id, day_number);
