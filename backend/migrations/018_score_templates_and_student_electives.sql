-- 10차: 배점 템플릿 + 학생 선택과목 프로필.
-- 비파괴적: 새 테이블 2개 + 기존 테이블에 nullable 컬럼 추가 + correct_answer NOT NULL 완화만 수행한다.
-- DROP / DELETE / 데이터 이전 없음.

-- 1) 학생 선택과목 프로필 (모의고사 세트 배정 시 기본값으로만 사용)
ALTER TABLE math_students ADD COLUMN IF NOT EXISTS korean_elective VARCHAR(30);
ALTER TABLE math_students ADD COLUMN IF NOT EXISTS math_elective VARCHAR(30);
ALTER TABLE math_students ADD COLUMN IF NOT EXISTS inquiry_subject_1 VARCHAR(30);
ALTER TABLE math_students ADD COLUMN IF NOT EXISTS inquiry_subject_2 VARCHAR(30);

-- 2) 배점 템플릿
CREATE TABLE IF NOT EXISTS sprint_mock_score_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    subject_category VARCHAR(50),
    question_count INTEGER NOT NULL,
    total_score INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sprint_mock_score_template_items (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES sprint_mock_score_templates(id) ON DELETE CASCADE,
    question_no INTEGER NOT NULL,
    score INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_sprint_mock_score_template_items_template_question UNIQUE (template_id, question_no)
);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_score_template_items_template_id ON sprint_mock_score_template_items(template_id);

-- 3) 시험지에 사용 템플릿 추적 컬럼 (채점은 항상 시험지에 복사된 배점 스냅샷 기준)
ALTER TABLE sprint_mock_exam_catalog
    ADD COLUMN IF NOT EXISTS score_template_id INTEGER REFERENCES sprint_mock_score_templates(id) ON DELETE SET NULL;

-- 4) 템플릿으로 배점만 먼저 채우고 정답은 나중에 입력할 수 있도록 NOT NULL 완화
ALTER TABLE sprint_mock_exam_catalog_questions ALTER COLUMN correct_answer DROP NOT NULL;
