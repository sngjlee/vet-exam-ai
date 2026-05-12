-- 20260513010000_board_owner_soft_delete_fix.sql
-- Hotfix: 작성자 본인 소프트 삭제(board posts + board comments) 가 RLS 거부로 500을 던지던 버그.
--
-- 20260512000000_suggestion_board_mvp.sql 의 두 정책이 `with check`에서 새 행의
-- visibility/status 가 'visible' 이어야 한다고 요구해, owner 가
-- 'hidden_by_author' 로 전환하는 UPDATE 가 통과 못 했음. count=0 → server action
-- throw → Next.js 500 "Application error: server-side exception" + 사용자 보고된
-- digest. softDeletePost / softDeletePostComment 두 경로 모두 영향.
--
-- 수정: `with check` 의 visibility/status 제약을 ('visible', 'hidden_by_author') 로
-- 완화한다. `using` 은 그대로 유지 (소프트 삭제된 행을 다시 만지지 못하도록).

alter policy "board_posts: owner edit while open" on public.board_posts
  with check (
    auth.uid() = user_id
    and visibility in ('visible', 'hidden_by_author')
    and (
      kind = 'announcement'
      or (kind = 'suggestion' and suggestion_status in ('received', 'reviewing'))
    )
  );

alter policy "bpc: owner edit visible" on public.board_post_comments
  with check (
    auth.uid() = user_id
    and status in ('visible', 'hidden_by_author')
  );
