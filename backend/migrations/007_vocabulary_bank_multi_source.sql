BEGIN;

ALTER TABLE vocabulary_banks ADD COLUMN IF NOT EXISTS total_words INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vocabulary_banks ADD COLUMN IF NOT EXISTS default_daily_test_question_count INTEGER NOT NULL DEFAULT 100;
ALTER TABLE vocabulary_banks ADD COLUMN IF NOT EXISTS source_filename VARCHAR(255);
ALTER TABLE vocabulary_banks ADD COLUMN IF NOT EXISTS source_format VARCHAR(100);

UPDATE vocabulary_banks
SET total_words = COALESCE(NULLIF(total_words, 0), total_days * words_per_day)
WHERE total_words = 0;

COMMIT;
