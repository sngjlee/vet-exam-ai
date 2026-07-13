-- 20260713040000_comment_edit_history_authenticated.sql
-- PII hardening follow-up: comment_edit_history anon read → authenticated only.
--
-- After 20260713010000 the policy correctly inherited the parent comment's
-- visibility, but it still applied to anon: any logged-out visitor could read
-- the PRE-EDIT body of a visible comment. That defeats the user's mental model
-- of "I edited my comment, the old text is gone" — if someone accidentally
-- posts personal info and edits it out, the original kept leaking to the
-- anonymous surface forever. Reachable directly:
--   curl '.../rest/v1/comment_edit_history?select=body_html&limit=1' \
--     -H "apikey: $ANON_KEY"
--
-- Fix: same parent-visibility rule, but `to authenticated`. anon is left with
-- no SELECT policy on this table → silently empty (RLS enabled + no policy).
-- App impact: none for signed-in users; logged-out users lose the edit-history
-- modal, which ships in the same PR (CommentItem hides the trigger, the
-- /api/comments/[id]/history route now requires a user).

begin;

drop policy if exists "comment_edit_history: read when parent comment visible"
  on public.comment_edit_history;

-- Re-runnable: drop the new policy too, in case a prior partial apply created it.
drop policy if exists "comment_edit_history: authenticated read when parent visible"
  on public.comment_edit_history;

create policy "comment_edit_history: authenticated read when parent visible"
  on public.comment_edit_history for select
  to authenticated
  using (
    exists (
      select 1
      from public.comments c
      where c.id = comment_edit_history.comment_id
    )
  );

commit;

-- ── 적용 후 확인용 조회 ───────────────────────────────────────────────────────
-- 1) 정책 상태 (roles가 {authenticated}인 정책 1개만 있어야 함):
--   select policyname, roles, cmd, qual
--   from pg_policies
--   where schemaname = 'public' and tablename = 'comment_edit_history';
--
-- 2) anon 실검증 (빈 배열 []이어야 함 — 401이 아니라 silently empty):
--   curl "$SUPABASE_URL/rest/v1/comment_edit_history?select=comment_id&limit=1" \
--     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
--
-- 3) 로그인 세션 실검증 (visible 댓글의 이력이 반환되어야 함):
--   curl "$SUPABASE_URL/rest/v1/comment_edit_history?select=comment_id&limit=1" \
--     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_ACCESS_TOKEN"
