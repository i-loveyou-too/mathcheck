ALTER TABLE vocabulary_challenges ADD COLUMN IF NOT EXISTS bank_day_direction VARCHAR(20) NOT NULL DEFAULT 'ascending';
ALTER TABLE vocabulary_challenges ADD COLUMN IF NOT EXISTS start_bank_day INTEGER;
ALTER TABLE vocabulary_challenges ADD COLUMN IF NOT EXISTS bank_days_per_learning_day INTEGER NOT NULL DEFAULT 3;
ALTER TABLE vocabulary_challenges ADD COLUMN IF NOT EXISTS max_question_count INTEGER NOT NULL DEFAULT 100;
ALTER TABLE vocabulary_challenges ADD COLUMN IF NOT EXISTS allow_student_answer_pdf BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE vocabulary_challenges
SET
    start_bank_day = COALESCE(start_bank_day, 1),
    bank_days_per_learning_day = COALESCE(bank_days_per_learning_day, 3),
    max_question_count = COALESCE(max_question_count, daily_test_question_count, 100)
WHERE source_type = 'word_bank';

ALTER TABLE vocabulary_challenges DROP CONSTRAINT IF EXISTS ck_vocabulary_challenges_bank_day_direction;
ALTER TABLE vocabulary_challenges
    ADD CONSTRAINT ck_vocabulary_challenges_bank_day_direction
    CHECK (bank_day_direction IN ('ascending', 'descending'));

ALTER TABLE vocabulary_challenges DROP CONSTRAINT IF EXISTS ck_vocabulary_challenges_bank_days_per_learning_day;
ALTER TABLE vocabulary_challenges
    ADD CONSTRAINT ck_vocabulary_challenges_bank_days_per_learning_day
    CHECK (bank_days_per_learning_day >= 1);

ALTER TABLE vocabulary_challenges DROP CONSTRAINT IF EXISTS ck_vocabulary_challenges_max_question_count;
ALTER TABLE vocabulary_challenges
    ADD CONSTRAINT ck_vocabulary_challenges_max_question_count
    CHECK (max_question_count >= 1);
