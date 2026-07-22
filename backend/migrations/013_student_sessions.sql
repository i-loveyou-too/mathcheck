CREATE TABLE IF NOT EXISTS student_sessions (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES math_students(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_student_sessions_student_id ON student_sessions(student_id);
CREATE INDEX IF NOT EXISTS ix_student_sessions_token_hash ON student_sessions(token_hash);
CREATE INDEX IF NOT EXISTS ix_student_sessions_active
    ON student_sessions(student_id, expires_at)
    WHERE revoked_at IS NULL;
