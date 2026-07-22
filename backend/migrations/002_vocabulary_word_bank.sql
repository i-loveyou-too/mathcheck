BEGIN;

CREATE TABLE IF NOT EXISTS vocabulary_banks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description VARCHAR(500),
    total_days INTEGER NOT NULL DEFAULT 50,
    words_per_day INTEGER NOT NULL DEFAULT 40,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vocabulary_banks_title UNIQUE(title)
);
CREATE INDEX IF NOT EXISTS ix_vocabulary_banks_active ON vocabulary_banks(is_active);

CREATE TABLE IF NOT EXISTS vocabulary_bank_words (
    id SERIAL PRIMARY KEY,
    bank_id INTEGER NOT NULL REFERENCES vocabulary_banks(id) ON DELETE CASCADE,
    day_no INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    day_order INTEGER NOT NULL,
    english VARCHAR(200) NOT NULL,
    normalized_english VARCHAR(200) NOT NULL,
    accepted_meanings JSON NOT NULL,
    raw_meaning TEXT NOT NULL,
    part_of_speech VARCHAR(100),
    memo VARCHAR(300),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vocabulary_bank_word_english UNIQUE(bank_id, normalized_english),
    CONSTRAINT uq_vocabulary_bank_word_day_order UNIQUE(bank_id, day_no, day_order)
);
CREATE INDEX IF NOT EXISTS ix_vocabulary_bank_words_bank_day ON vocabulary_bank_words(bank_id, day_no);

ALTER TABLE vocabulary_challenges ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'direct';
ALTER TABLE vocabulary_challenges ADD COLUMN IF NOT EXISTS word_bank_id INTEGER REFERENCES vocabulary_banks(id);
ALTER TABLE vocabulary_challenges ADD COLUMN IF NOT EXISTS daily_new_word_count INTEGER NOT NULL DEFAULT 40;
ALTER TABLE vocabulary_challenges ADD COLUMN IF NOT EXISTS daily_test_question_count INTEGER NOT NULL DEFAULT 100;
CREATE INDEX IF NOT EXISTS ix_vocabulary_challenges_word_bank_id ON vocabulary_challenges(word_bank_id);

ALTER TABLE vocabulary_test_questions ALTER COLUMN word_id DROP NOT NULL;
ALTER TABLE vocabulary_test_questions ADD COLUMN IF NOT EXISTS bank_word_id INTEGER REFERENCES vocabulary_bank_words(id);
ALTER TABLE vocabulary_test_questions ADD COLUMN IF NOT EXISTS word_source_type VARCHAR(20) NOT NULL DEFAULT 'direct';
ALTER TABLE vocabulary_test_questions DROP CONSTRAINT IF EXISTS uq_vocabulary_question_session_word;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vocabulary_question_session_direct_word
    ON vocabulary_test_questions(session_id, word_id)
    WHERE word_source_type = 'direct' AND word_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vocabulary_question_session_bank_word
    ON vocabulary_test_questions(session_id, bank_word_id)
    WHERE word_source_type = 'word_bank' AND bank_word_id IS NOT NULL;

ALTER TABLE vocabulary_wrong_notes ALTER COLUMN word_id DROP NOT NULL;
ALTER TABLE vocabulary_wrong_notes ADD COLUMN IF NOT EXISTS bank_word_id INTEGER REFERENCES vocabulary_bank_words(id) ON DELETE CASCADE;
ALTER TABLE vocabulary_wrong_notes ADD COLUMN IF NOT EXISTS word_source_type VARCHAR(20) NOT NULL DEFAULT 'direct';
ALTER TABLE vocabulary_wrong_notes DROP CONSTRAINT IF EXISTS uq_vocabulary_wrong_note_student_word;
ALTER TABLE vocabulary_wrong_notes DROP CONSTRAINT IF EXISTS vocabulary_wrong_notes_bank_word_id_fkey;
ALTER TABLE vocabulary_wrong_notes
    ADD CONSTRAINT vocabulary_wrong_notes_bank_word_id_fkey
    FOREIGN KEY (bank_word_id) REFERENCES vocabulary_bank_words(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vocabulary_wrong_note_student_direct_word
    ON vocabulary_wrong_notes(student_id, word_id)
    WHERE word_source_type = 'direct' AND word_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vocabulary_wrong_note_student_bank_word
    ON vocabulary_wrong_notes(student_id, bank_word_id)
    WHERE word_source_type = 'word_bank' AND bank_word_id IS NOT NULL;

COMMIT;
