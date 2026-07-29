-- 학생-교재 단위 수동 마일스톤(1회독 완료 등). 문항별 자동 진도 집계와는 별개로
-- 관리자가 수동으로 켜고 끄는 표시라 별도 테이블로 분리한다.

CREATE TABLE IF NOT EXISTS math_student_textbook_milestones (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    textbook_id INTEGER NOT NULL REFERENCES math_textbooks(id),
    first_pass_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_math_student_textbook_milestones UNIQUE (student_id, textbook_id)
);

CREATE INDEX IF NOT EXISTS ix_math_student_textbook_milestones_student ON math_student_textbook_milestones(student_id);
CREATE INDEX IF NOT EXISTS ix_math_student_textbook_milestones_textbook ON math_student_textbook_milestones(textbook_id);
