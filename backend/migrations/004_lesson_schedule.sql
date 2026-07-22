BEGIN;

CREATE TABLE IF NOT EXISTS student_lesson_schedules (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    title VARCHAR(200),
    weekday INTEGER NOT NULL,            -- 0=월 ... 6=일 (Python date.weekday())
    start_time VARCHAR(5) NOT NULL,      -- "HH:MM" Asia/Seoul
    end_time VARCHAR(5) NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Seoul',
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    location VARCHAR(200),
    memo VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_student_lesson_schedules_student ON student_lesson_schedules(student_id);
CREATE INDEX IF NOT EXISTS ix_student_lesson_schedules_student_active ON student_lesson_schedules(student_id, is_active);

CREATE TABLE IF NOT EXISTS student_lesson_events (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES math_students(id),
    schedule_id INTEGER REFERENCES student_lesson_schedules(id) ON DELETE SET NULL,
    event_date DATE NOT NULL,
    start_time VARCHAR(5) NOT NULL,      -- "HH:MM" Asia/Seoul
    end_time VARCHAR(5) NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Seoul',
    event_type VARCHAR(20) NOT NULL DEFAULT 'regular',   -- regular/extra/makeup/trial/other
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',     -- scheduled/completed/cancelled/rescheduled
    title VARCHAR(200),
    location VARCHAR(200),
    memo VARCHAR(500),
    original_event_id INTEGER REFERENCES student_lesson_events(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_student_lesson_events_student ON student_lesson_events(student_id);
CREATE INDEX IF NOT EXISTS ix_student_lesson_events_schedule ON student_lesson_events(schedule_id);
CREATE INDEX IF NOT EXISTS ix_student_lesson_events_date ON student_lesson_events(event_date);
CREATE INDEX IF NOT EXISTS ix_student_lesson_events_student_date ON student_lesson_events(student_id, event_date);

COMMIT;
