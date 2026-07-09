-- =============================================================================
-- Phase 5 (maintenance): remove duplicate report_resolved notification
-- =============================================================================
-- A reporter received TWO report_resolved notifications on resolution:
--   1. handle_report_resolution() trigger, fired on comment_reports.status
--      transitioning to upheld/dismissed (payload: { resolution }).
--   2. resolve_comment_report() RPC, which explicitly inserts a richer
--      notification (payload: { resolution, note } + actor_id) for every
--      affected reporter.
--
-- resolve_comment_report() is the sole application path that resolves reports
-- (comment_reports UPDATE is admin/reviewer-only and the app always goes through
-- the RPC), and its notification carries the richer payload the RPC already
-- computes. Drop the trigger so exactly one notification is emitted.
--
-- Rendering is unaffected: lib/notifications/format.ts reads only payload.resolution
-- for report_resolved, which the RPC populates identically.

drop trigger if exists comment_reports_after_resolve on public.comment_reports;
drop function if exists public.handle_report_resolution();
