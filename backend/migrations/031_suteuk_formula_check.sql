CREATE TABLE IF NOT EXISTS suteuk_challenge_formula_responses (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES suteuk_challenge_assignments(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    question_code VARCHAR(120) NOT NULL,
    concept_code VARCHAR(120),
    selected_answer VARCHAR(20) NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_suteuk_formula_response_assignment_question
    ON suteuk_challenge_formula_responses(assignment_id, question_code);

CREATE INDEX IF NOT EXISTS ix_suteuk_formula_responses_assignment_day
    ON suteuk_challenge_formula_responses(assignment_id, day_number);
