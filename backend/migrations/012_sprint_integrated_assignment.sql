ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS seat_check_open_time VARCHAR(5);
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS planner_mode VARCHAR(20) NOT NULL DEFAULT 'paper';
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS study_time_deadline_time VARCHAR(5);
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS study_time_strike_on_missing BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS study_time_strike_on_shortage BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS mock_exam_weekday INTEGER;
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS mock_exam_start_time VARCHAR(5);
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS mock_exam_submission_deadline_time VARCHAR(5);
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS first_mock_exam_date DATE;
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS vocabulary_bank_id INTEGER REFERENCES vocabulary_banks(id);
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS vocabulary_start_bank_day INTEGER;
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS vocabulary_bank_day_direction VARCHAR(20) NOT NULL DEFAULT 'ascending';
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS vocabulary_bank_days_per_learning_day INTEGER NOT NULL DEFAULT 3;
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS vocabulary_max_question_count INTEGER NOT NULL DEFAULT 100;
ALTER TABLE sprint_programs ADD COLUMN IF NOT EXISTS vocabulary_allow_student_answer_pdf BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE sprint_programs
SET planner_mode = CASE
    WHEN enable_planner_submission IS TRUE THEN 'paper'
    ELSE COALESCE(planner_mode, 'disabled')
END
WHERE planner_mode IS NULL OR planner_mode = 'paper';

ALTER TABLE sprint_programs DROP CONSTRAINT IF EXISTS ck_sprint_programs_planner_mode;
ALTER TABLE sprint_programs
    ADD CONSTRAINT ck_sprint_programs_planner_mode
    CHECK (planner_mode IN ('paper', 'today_system', 'disabled'));

ALTER TABLE sprint_programs DROP CONSTRAINT IF EXISTS ck_sprint_programs_vocabulary_direction;
ALTER TABLE sprint_programs
    ADD CONSTRAINT ck_sprint_programs_vocabulary_direction
    CHECK (vocabulary_bank_day_direction IN ('ascending', 'descending'));

ALTER TABLE sprint_programs DROP CONSTRAINT IF EXISTS ck_sprint_programs_mock_weekday;
ALTER TABLE sprint_programs
    ADD CONSTRAINT ck_sprint_programs_mock_weekday
    CHECK (mock_exam_weekday IS NULL OR (mock_exam_weekday >= 0 AND mock_exam_weekday <= 6));

ALTER TABLE sprint_subject_goals ADD COLUMN IF NOT EXISTS created_by_type VARCHAR(20) NOT NULL DEFAULT 'admin';
ALTER TABLE sprint_subject_goals ADD COLUMN IF NOT EXISTS created_by_id INTEGER;

ALTER TABLE sprint_subject_goals DROP CONSTRAINT IF EXISTS ck_sprint_subject_goals_created_by_type;
ALTER TABLE sprint_subject_goals
    ADD CONSTRAINT ck_sprint_subject_goals_created_by_type
    CHECK (created_by_type IN ('admin', 'student'));
