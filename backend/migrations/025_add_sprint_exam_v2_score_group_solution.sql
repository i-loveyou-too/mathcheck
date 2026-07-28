-- Add optional 해설지(solution) Google Drive link storage for Sprint Exam V2 score groups.
-- Only the Drive file ID is stored (not the full share URL); the preview URL is built at read time.
-- Nullable/default so existing exams and score groups keep working with no solution attached.

ALTER TABLE sprint_exam_v2_score_groups
    ADD COLUMN IF NOT EXISTS solution_drive_file_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS solution_is_published BOOLEAN NOT NULL DEFAULT FALSE;
