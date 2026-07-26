-- Add optional YouTube listening URL for Sprint Exam V2 English papers.
-- This migration only touches Sprint Exam V2 tables.

ALTER TABLE sprint_exam_v2_papers
    ADD COLUMN IF NOT EXISTS listening_youtube_url VARCHAR(500);
