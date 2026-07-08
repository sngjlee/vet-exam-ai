-- 20260708000000_security_rls_hardening.sql
-- Phase 0 security hotfix. Closes three USING-only UPDATE-policy gaps on tables
-- that later grew privileged / moderation / counter columns.
--
--   C1 (Critical) profiles  — self-promotion to admin via direct PostgREST PATCH
--   H1 (High)     comments  — moderation bypass (un-blind) + counter tampering
--   L1 (Low)      notifications — user_id / payload rewrite on own rows
--
-- Root cause: the original policies (initial_schema / community_comments /
-- community_notifications, all in the legacy migration tree) were `for update
-- using (auth.uid() = <owner>)` with no `with check`, so the NEW row was never
-- validated. This migration lives in the canonical tree with the newest
-- timestamp, so it is applied last and overrides the legacy definitions.

begin;

-- =============================================================================
-- C1 — profiles: remove the self-service UPDATE policy entirely.
-- The application NEVER updates public.profiles through an authenticated user
-- client (verified: every app-reachable `from("profiles")` is a SELECT for role
-- checks; the only write is lib/cron/comment-seeding.ts via the service-role
-- admin client). User-facing profile edits go to public.user_profiles_public.
-- Privileged columns role / is_active / signup_status are written only by
-- SECURITY DEFINER RPCs (which bypass RLS) and service_role.
--
-- With RLS enabled and no permissive UPDATE policy, every authenticated UPDATE
-- on profiles is denied — fully closing the role='admin' escalation vector.
-- =============================================================================
drop policy if exists "profiles: owner update" on public.profiles;

-- Defense in depth: even if a future permissive UPDATE policy is added by
-- mistake, keep the privileged columns unreachable from the authenticated role.
revoke update on public.profiles from authenticated;

-- =============================================================================
-- H1 — comments: constrain owner UPDATE to legitimate author transitions.
--   USING      status = 'visible'  → author can only act on a currently-visible
--                                    own comment; blocks "un-blinding" a comment
--                                    that moderation set to hidden_by_votes /
--                                    blinded_by_report / removed_by_admin.
--   WITH CHECK status in (visible, hidden_by_author)
--                                  → result must stay visible (edit) or become
--                                    author-hidden (soft-delete); blocks setting
--                                    any moderated status.
-- The separate "comments: admin update" policy (using is_admin()) is unchanged,
-- so moderators keep full status control via their own permissive policy.
-- =============================================================================
drop policy if exists "comments: owner update" on public.comments;
create policy "comments: owner update"
  on public.comments for update
  using (auth.uid() = user_id and status = 'visible')
  with check (auth.uid() = user_id and status in ('visible', 'hidden_by_author'));

-- Counter columns (vote_score / *_count) are maintained exclusively by the
-- SECURITY DEFINER vote/report/reply triggers, which run as the function owner
-- and are unaffected by the authenticated role's column privileges. Restrict the
-- authenticated role's direct UPDATE to the only columns the app writes:
--   edit  → body_text, body_html, image_urls   (app/api/comments/[id] PATCH)
--   soft-delete / admin remove → status         (app/api/comments/[id] DELETE)
-- (BEFORE-trigger writes to NEW.updated_at do not require a column grant.)
revoke update on public.comments from authenticated;
grant update (body_text, body_html, image_urls, status)
  on public.comments to authenticated;

-- =============================================================================
-- L1 — notifications: add WITH CHECK so a user cannot reassign a notification's
-- user_id (or otherwise rewrite it) to a row they would not own. The only
-- legitimate authenticated write is marking read_at on one's own rows.
-- =============================================================================
drop policy if exists "notifications: owner update" on public.notifications;
create policy "notifications: owner update"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

commit;
