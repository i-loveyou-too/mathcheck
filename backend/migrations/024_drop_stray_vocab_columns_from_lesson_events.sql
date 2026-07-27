BEGIN;

-- student_lesson_events 테이블에 vocabulary_wrong_notes용 컬럼이 잘못 추가되어
-- (word_id 등 NOT NULL) 수업 일정 등록 INSERT가 전부 실패하던 문제를 수정한다.
-- 이 컬럼들은 models.py의 StudentLessonEvent에서 전혀 사용하지 않는다.
ALTER TABLE student_lesson_events
    DROP COLUMN IF EXISTS word_id,
    DROP COLUMN IF EXISTS latest_wrong_answer,
    DROP COLUMN IF EXISTS first_wrong_date,
    DROP COLUMN IF EXISTS latest_wrong_date,
    DROP COLUMN IF EXISTS wrong_count,
    DROP COLUMN IF EXISTS resolved_at;

COMMIT;
