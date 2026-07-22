BEGIN;

CREATE TABLE IF NOT EXISTS vocabulary_challenges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    accumulation_type VARCHAR(20) NOT NULL DEFAULT 'all_previous',
    recent_days INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_vocabulary_challenges_student_id ON vocabulary_challenges(student_id);
CREATE INDEX IF NOT EXISTS ix_vocabulary_challenges_dates ON vocabulary_challenges(start_date, end_date);

CREATE TABLE IF NOT EXISTS vocabulary_words (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER NOT NULL REFERENCES vocabulary_challenges(id) ON DELETE CASCADE,
    english VARCHAR(200) NOT NULL,
    normalized_english VARCHAR(200) NOT NULL,
    accepted_answers JSON NOT NULL,
    memo VARCHAR(300),
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vocabulary_word_challenge_english UNIQUE(challenge_id, normalized_english)
);
CREATE INDEX IF NOT EXISTS ix_vocabulary_words_challenge_id ON vocabulary_words(challenge_id);

CREATE TABLE IF NOT EXISTS vocabulary_daily_assignments (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER NOT NULL REFERENCES vocabulary_challenges(id) ON DELETE CASCADE,
    assignment_date DATE NOT NULL,
    word_id INTEGER NOT NULL REFERENCES vocabulary_words(id) ON DELETE CASCADE,
    CONSTRAINT uq_vocabulary_daily_assignment UNIQUE(challenge_id, assignment_date, word_id)
);
CREATE INDEX IF NOT EXISTS ix_vocabulary_daily_assignments_date ON vocabulary_daily_assignments(assignment_date);

CREATE TABLE IF NOT EXISTS vocabulary_test_sessions (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER NOT NULL REFERENCES vocabulary_challenges(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    study_date DATE NOT NULL,
    session_type VARCHAR(20) NOT NULL DEFAULT 'main',
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    score INTEGER,
    correct_count INTEGER,
    total_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMPTZ,
    CONSTRAINT uq_vocabulary_test_session_student_date_type
        UNIQUE(challenge_id, student_id, study_date, session_type)
);
CREATE INDEX IF NOT EXISTS ix_vocabulary_test_sessions_student_date ON vocabulary_test_sessions(student_id, study_date);

CREATE TABLE IF NOT EXISTS vocabulary_test_questions (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES vocabulary_test_sessions(id) ON DELETE CASCADE,
    word_id INTEGER NOT NULL REFERENCES vocabulary_words(id),
    order_index INTEGER NOT NULL,
    english_snapshot VARCHAR(200) NOT NULL,
    accepted_answers_snapshot JSON NOT NULL,
    CONSTRAINT uq_vocabulary_question_session_order UNIQUE(session_id, order_index),
    CONSTRAINT uq_vocabulary_question_session_word UNIQUE(session_id, word_id)
);

CREATE TABLE IF NOT EXISTS vocabulary_test_answers (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES vocabulary_test_sessions(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES vocabulary_test_questions(id) ON DELETE CASCADE,
    input_answer TEXT NOT NULL DEFAULT '',
    is_correct BOOLEAN,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vocabulary_answer_question UNIQUE(question_id)
);

CREATE TABLE IF NOT EXISTS vocabulary_wrong_notes (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    word_id INTEGER NOT NULL REFERENCES vocabulary_words(id) ON DELETE CASCADE,
    latest_wrong_answer TEXT NOT NULL DEFAULT '',
    first_wrong_date DATE NOT NULL,
    latest_wrong_date DATE NOT NULL,
    wrong_count INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'unresolved',
    resolved_at TIMESTAMPTZ,
    CONSTRAINT uq_vocabulary_wrong_note_student_word UNIQUE(student_id, word_id)
);
CREATE INDEX IF NOT EXISTS ix_vocabulary_wrong_notes_student_status ON vocabulary_wrong_notes(student_id, status);

COMMIT;
