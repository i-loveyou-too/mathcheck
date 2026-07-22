BEGIN;

-- SPRINT 과목별 목표 (6차). 기존 sprint_goals(정량 target_value/current_value, "기간 목표"
-- 섹션에서 사용 중)와는 별개 테이블이다. 과목별로 묶인 단순 완료체크 목표이므로 이름을
-- sprint_subject_goals로 구분해 기존 기능과 충돌하지 않는다.
CREATE TABLE IF NOT EXISTS sprint_subject_goals (
    id SERIAL PRIMARY KEY,
    sprint_program_id INTEGER NOT NULL REFERENCES sprint_programs(id) ON DELETE CASCADE,
    subject VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description VARCHAR(500),
    target_date DATE,
    completed_at TIMESTAMPTZ,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    order_index INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_sprint_subject_goals_sprint_program_id ON sprint_subject_goals(sprint_program_id);
CREATE INDEX IF NOT EXISTS ix_sprint_subject_goals_program_subject ON sprint_subject_goals(sprint_program_id, subject);

COMMIT;
