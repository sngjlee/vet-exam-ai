-- 20260713010000_comment_edit_history_visibility.sql
-- Phase 1 PII hardening — M1: comment_edit_history world-read.
--
-- The original policy (community_comments) was:
--   create policy "comment_edit_history: world read" ... using (true);
-- Its comment claimed "visible if comment is visible at app layer", but RLS did
-- no such join, so anon could read the pre-edit body_text/body_html of comments
-- that moderation had blinded (blinded_by_report / blinded_until, i.e. the
-- 정보통신망법 임시조치) or removed (removed_by_admin) — partially defeating the
-- moderation/legal blind. Reachable directly:
--   curl '.../rest/v1/comment_edit_history?select=comment_id,body_html,edited_at'
--
-- Fix: an edit-history row is visible only when its parent comment is visible to
-- the caller. The EXISTS subquery reads public.comments, which is itself
-- RLS-protected — so it returns a row ONLY when the caller can already see that
-- comment (public-and-not-blinded, or own, or admin). This keeps a single source
-- of truth (the comments SELECT policy) instead of duplicating the status rule.

begin;

drop policy if exists "comment_edit_history: world read"
  on public.comment_edit_history;

create policy "comment_edit_history: read when parent comment visible"
  on public.comment_edit_history for select
  using (
    exists (
      select 1
      from public.comments c
      where c.id = comment_edit_history.comment_id
    )
  );

commit;
