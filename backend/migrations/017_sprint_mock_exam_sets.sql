-- 9차: 모의고사를 "세트(SPRINT 1회) > 과목별 시험" 구조로 묶는다.
-- 비파괴적: 새 테이블 1개 + 기존 sprint_mock_exam_catalog에 nullable 컬럼 2개만 추가한다.
-- exam_set_id가 NULL인 기존 카탈로그 행도 그대로 유효하므로 기존 데이터/API가 깨지지 않는다.
-- DROP / DELETE / 데이터 이전 없음.

CREATE TABLE IF NOT EXISTS sprint_mock_exam_sets (
    id SERIAL PRIMARY KEY,
    round_no INTEGER,
    title VARCHAR(200) NOT NULL,
    scheduled_at DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    archived_at TIMESTAMPTZ,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sprint_mock_exam_catalog
    ADD COLUMN IF NOT EXISTS exam_set_id INTEGER REFERENCES sprint_mock_exam_sets(id) ON DELETE SET NULL;

ALTER TABLE sprint_mock_exam_catalog
    ADD COLUMN IF NOT EXISTS elective_name VARCHAR(50);

CREATE INDEX IF NOT EXISTS ix_sprint_mock_exam_catalog_exam_set_id ON sprint_mock_exam_catalog(exam_set_id);
