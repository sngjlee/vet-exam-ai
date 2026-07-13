-- 20260713030000_rate_limit_service_role_only.sql
-- Phase 1 PII hardening — M4: check_rate_limit() is caller-poisonable.
--
-- check_rate_limit(p_bucket, p_identifier, p_max, p_window_seconds) was granted
-- to anon + authenticated, and every parameter is caller-controlled. A client
-- can call it directly:
--   * cross-victim poisoning — pass another user's id / IP as p_identifier to
--     inflate THEIR counter and block their legitimate actions;
--   * self-bypass — pass p_window_seconds = 1 to force the reset branch
--     (window_start < now() - 1s → count reset to 1) and evade one's OWN limit,
--     enabling spam past the intended cap.
--
-- The RPC is never referenced inside an RLS policy — it is only invoked from
-- server code (lib/rate-limit). So we can safely remove it from the client roles
-- and let only the service-role (used by the server via the admin client) call
-- it. The app never trusts a client-supplied identifier again.
--
-- Deploy-gap safe: lib/rate-limit fails OPEN, so if this lands before the code
-- that switches to the admin client, authenticated calls just get denied and the
-- limiter no-ops (allows) rather than breaking any user action.

begin;

revoke execute on function public.check_rate_limit(text, text, integer, integer)
  from anon, authenticated;

grant execute on function public.check_rate_limit(text, text, integer, integer)
  to service_role;

commit;
