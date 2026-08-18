ALTER TABLE vocabulary_test_answers
    ADD COLUMN IF NOT EXISTS gemini_reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS gemini_verdict VARCHAR(20),
    ADD COLUMN IF NOT EXISTS gemini_confidence INTEGER,
    ADD COLUMN IF NOT EXISTS gemini_reason TEXT,
    ADD COLUMN IF NOT EXISTS gemini_risk_flags JSONB,
    ADD COLUMN IF NOT EXISTS gemini_model VARCHAR(100),
    ADD COLUMN IF NOT EXISTS gemini_auto_applied BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS vocabulary_grading_rules (
    id SERIAL PRIMARY KEY,
    word_source_type VARCHAR(20) NOT NULL,
    word_id INTEGER REFERENCES vocabulary_words(id) ON DELETE CASCADE,
    bank_word_id INTEGER REFERENCES vocabulary_bank_words(id) ON DELETE CASCADE,
    english_snapshot VARCHAR(200) NOT NULL,
    canonical_meaning TEXT NOT NULL,
    normalized_student_answer TEXT NOT NULL,
    decision VARCHAR(10) NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'TEACHER',
    confirmed_by_teacher BOOLEAN NOT NULL DEFAULT TRUE,
    use_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_vocabulary_grading_rules_decision CHECK (decision IN ('ACCEPT', 'REJECT')),
    CONSTRAINT ck_vocabulary_grading_rules_source CHECK (source IN ('TEACHER', 'GEMINI'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vocabulary_grading_rule_direct_answer
    ON vocabulary_grading_rules(word_id, normalized_student_answer)
    WHERE word_source_type = 'direct' AND word_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vocabulary_grading_rule_bank_answer
    ON vocabulary_grading_rules(bank_word_id, normalized_student_answer)
    WHERE word_source_type = 'word_bank' AND bank_word_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_vocabulary_grading_rules_direct
    ON vocabulary_grading_rules(word_id, normalized_student_answer);

CREATE INDEX IF NOT EXISTS ix_vocabulary_grading_rules_bank
    ON vocabulary_grading_rules(bank_word_id, normalized_student_answer);
