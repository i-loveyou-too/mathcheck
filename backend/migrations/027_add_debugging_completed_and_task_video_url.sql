-- 디버그 모의고사: 학생이 직접 표시하는 "디버깅 완료" 마일스톤(회차=교재 단위).
-- 기존 1회독 완료 테이블을 재사용하고 컬럼만 추가한다(관리자 전용 first_pass_completed_at과 분리).
ALTER TABLE math_student_textbook_milestones
    ADD COLUMN IF NOT EXISTS debugging_completed_at TIMESTAMPTZ;

-- 할일(daily task) 등록 시 영상 링크를 걸 수 있도록 nullable 컬럼 추가.
ALTER TABLE math_daily_tasks
    ADD COLUMN IF NOT EXISTS video_url VARCHAR(500);
