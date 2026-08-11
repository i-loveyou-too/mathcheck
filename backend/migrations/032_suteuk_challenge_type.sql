ALTER TABLE suteuk_challenge_assignments
    ADD COLUMN IF NOT EXISTS challenge_type VARCHAR(50) NOT NULL DEFAULT 'suteuk_10day';

DROP INDEX IF EXISTS uq_suteuk_challenge_assignments_active_student;

CREATE UNIQUE INDEX IF NOT EXISTS uq_suteuk_challenge_assignments_active_student_type
    ON suteuk_challenge_assignments(student_id, challenge_type)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS ix_suteuk_challenge_assignments_student_type_status
    ON suteuk_challenge_assignments(student_id, challenge_type, status);
