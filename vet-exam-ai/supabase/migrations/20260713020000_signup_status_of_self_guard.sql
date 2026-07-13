-- 20260713020000_signup_status_of_self_guard.sql
-- Phase 1 PII hardening — M3: signup_status_of(uuid) enumerates any user's status.
--
-- signup_status_of() is a SECURITY DEFINER helper (bypasses profiles RLS) that is
-- executable by PUBLIC. It was intended purely as an internal RLS-policy helper,
-- but nothing stopped a direct call with an arbitrary uid:
--   curl -X POST '.../rest/v1/rpc/signup_status_of' -d '{"p_uid":"<victim>"}'
-- returning that user's gate status (approved / pending_* / rejected).
--
-- We CANNOT simply revoke EXECUTE: the function is called directly inside plain
-- RLS policies (board_posts / board_post_comments SELECT+INSERT and the gated
-- write policies on comments/votes/reports), which are evaluated as the calling
-- authenticated user. Revoking EXECUTE would make every one of those policies
-- raise "permission denied for function signup_status_of" and break the board.
--
-- Instead: keep EXECUTE, but only reveal the CALLER's own status. Every policy
-- calls signup_status_of(auth.uid()), so p_uid = auth.uid() there and behaviour
-- is unchanged; a direct call with someone else's uid now returns NULL (never a
-- real status), defeating enumeration. search_path stays pinned.

begin;

create or replace function public.signup_status_of(p_uid uuid)
returns public.signup_status
language sql
stable
security definer
set search_path = public
as $$
  select signup_status
  from public.profiles
  where id = p_uid
    and p_uid = auth.uid();
$$;

commit;
