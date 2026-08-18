BEGIN;

ALTER TABLE vocabulary_bank_words
    ADD COLUMN IF NOT EXISTS word_type VARCHAR(20) NOT NULL DEFAULT 'main';

CREATE TABLE IF NOT EXISTS vocabulary_bank_word_relations (
    id SERIAL PRIMARY KEY,
    parent_word_id INTEGER NOT NULL REFERENCES vocabulary_bank_words(id) ON DELETE CASCADE,
    related_word_id INTEGER NOT NULL REFERENCES vocabulary_bank_words(id) ON DELETE CASCADE,
    relation_type VARCHAR(30) NOT NULL DEFAULT 'related',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vocabulary_bank_word_relation UNIQUE(parent_word_id, related_word_id, relation_type)
);
CREATE INDEX IF NOT EXISTS ix_vocabulary_bank_word_relations_parent
    ON vocabulary_bank_word_relations(parent_word_id);
CREATE INDEX IF NOT EXISTS ix_vocabulary_bank_word_relations_related
    ON vocabulary_bank_word_relations(related_word_id);

ALTER TABLE vocabulary_challenges
    ADD COLUMN IF NOT EXISTS include_related_words BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
