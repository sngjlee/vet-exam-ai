-- =============================================================================
-- B1 — Phase 1b (EXPAND, cutover 준비): 구 question_id 의 NOT NULL 해제
-- =============================================================================
-- 왜: Phase 2 배포 후 클라이언트는 내부 id 를 더 이상 받지 않으므로, 새 행은
--   question_public_id 만 채우고 question_id 는 비운다. 그런데 기존 스키마에서
--   question_id 가 NOT NULL 이라 그대로면 INSERT 가 실패한다.
--   → cutover 를 가능하게 하려면 NOT NULL 을 먼저 풀어야 한다 (제약 완화 = 안전/가역).
--
-- 기존 행: question_id 값 유지(그대로). Phase 3 에서 컬럼 자체를 drop 한다.
-- 트리거/함수 본문에서 question_id 를 참조하는 곳 없음(2026-07-03 grep 확인) → 안전.
--
-- 적용: Phase 2 코드 배포와 같은 시점(또는 직전)에 SQL Editor 로 실행.
--   Phase 1(20260703000000) 이 먼저 적용돼 있어야 한다.
-- =============================================================================

alter table public.attempts             alter column question_id drop not null;
alter table public.comments             alter column question_id drop not null;
alter table public.wrong_notes          alter column question_id drop not null;
alter table public.comment_pins         alter column question_id drop not null;
alter table public.question_corrections alter column question_id drop not null;

-- 롤백(참고): 새 행이 생기기 전이라면 다시 NOT NULL 로 되돌릴 수 있다.
--   단 이미 question_id=null 인 행이 있으면 되돌리기 전 백필 필요.
-- alter table public.attempts alter column question_id set not null;  -- (주의)
