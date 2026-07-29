-- 영단어 챌린지 시험지(session) 단위로 관리자가 "확인함"을 표시할 수 있게 한다.
-- 채점/제출 로직과는 완전히 무관한 순수 체크용 컬럼.
ALTER TABLE vocabulary_test_sessions
    ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMPTZ;
