BEGIN;

CREATE TABLE IF NOT EXISTS sprint_compliance_runs (
    id SERIAL PRIMARY KEY,
    program_id INTEGER REFERENCES sprint_programs(id) ON DELETE SET NULL,
    target_date_from DATE NOT NULL,
    target_date_to DATE NOT NULL,
    run_type VARCHAR(40) NOT NULL,
    dry_run BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMPTZ,
    evaluated_students INTEGER NOT NULL DEFAULT 0,
    created_strikes INTEGER NOT NULL DEFAULT 0,
    cancelled_strikes INTEGER NOT NULL DEFAULT 0,
    pending_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    error_message VARCHAR(1000)
);
CREATE INDEX IF NOT EXISTS ix_sprint_compliance_runs_program_id
    ON sprint_compliance_runs(program_id);
CREATE INDEX IF NOT EXISTS ix_sprint_compliance_runs_program_date
    ON sprint_compliance_runs(program_id, target_date_from);
CREATE INDEX IF NOT EXISTS ix_sprint_compliance_runs_status
    ON sprint_compliance_runs(status);

-- 자동 판정 스트라이크는 동일 source_ref로 재실행/재시작해도 중복 생성되지 않아야 한다.
-- (source_ref는 수동 스트라이크의 경우 NULL이므로 부분 유니크 인덱스로 제한한다.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sprint_strikes_source_ref_not_null
    ON sprint_strikes(source_ref) WHERE source_ref IS NOT NULL;

COMMIT;
