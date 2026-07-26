BEGIN;

-- 영단어 챌린지 관리자 수동 채점 수정 (7차). 자동채점 원본(vocabulary_test_answers.is_correct)은
-- 절대 덮어쓰지 않고, 별도 nullable 컬럼으로 수동 판정을 얹는다.
-- 최종판정 = manual_is_correct가 NULL이 아니면 manual_is_correct, 아니면 is_correct.
ALTER TABLE vocabulary_test_answers
    ADD COLUMN IF NOT EXISTS manual_is_correct BOOLEAN,
    ADD COLUMN IF NOT EXISTS manual_reason TEXT,
    ADD COLUMN IF NOT EXISTS manual_graded_by INTEGER REFERENCES math_admins(id),
    ADD COLUMN IF NOT EXISTS manual_graded_at TIMESTAMPTZ;

-- 수동 채점 수정 감사 로그. append-only: 기존 행은 절대 수정/삭제하지 않는다.
CREATE TABLE IF NOT EXISTS vocabulary_manual_grading_logs (
    id SERIAL PRIMARY KEY,
    answer_id INTEGER NOT NULL REFERENCES vocabulary_test_answers(id) ON DELETE CASCADE,
    previous_final BOOLEAN,
    new_final BOOLEAN,
    auto_is_correct BOOLEAN,
    action VARCHAR(20) NOT NULL,
    reason TEXT,
    admin_id INTEGER NOT NULL REFERENCES math_admins(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_vocabulary_manual_grading_logs_answer_id
    ON vocabulary_manual_grading_logs(answer_id);

COMMIT;
