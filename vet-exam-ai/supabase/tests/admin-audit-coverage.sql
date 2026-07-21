-- Admin audit coverage metadata checks.
-- Run after migrations in a staging database.

create or replace function pg_temp.assert_ok(label text, ok boolean)
returns text
language plpgsql
as $$
begin
  if not ok then
    raise exception 'admin audit coverage failed: %', label;
  end if;
  return 'ok - ' || label;
end;
$$;

create or replace function pg_temp.function_mentions(signature text, needle text)
returns boolean
language plpgsql
stable
as $$
declare
  v_def text;
begin
  select pg_get_functiondef(signature::regprocedure) into v_def;
  return position(lower(needle) in lower(v_def)) > 0;
exception
  when undefined_function then
    return false;
end;
$$;

-- Baseline: existing comment publication and audit posture must remain intact.
select pg_temp.assert_ok('comments retain approved-owner insert gating',
  exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'comments'
       and policyname = 'comments: authenticated insert own'
       and cmd = 'INSERT'
       and coalesce(with_check, '') ilike '%signup_status_of%'
       and coalesce(with_check, '') ilike '%approved%'
  )
);

select pg_temp.assert_ok('admin audit rows remain client immutable',
  not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'admin_audit_logs'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  )
);

-- Red-first contract: false until the candidate review RPC migration exists.
select pg_temp.assert_ok('AI comment review audits publish and reject',
  pg_temp.function_mentions(
    'public.review_ai_comment_candidate(uuid, text, text)',
    'ai_comment_publish'
  )
  and pg_temp.function_mentions(
    'public.review_ai_comment_candidate(uuid, text, text)',
    'ai_comment_reject'
  )
  and pg_temp.function_mentions(
    'public.review_ai_comment_candidate(uuid, text, text)',
    'for update'
  )
  and pg_temp.function_mentions(
    'public.review_ai_comment_candidate(uuid, text, text)',
    'p_resolution is null'
  )
);

select pg_temp.assert_ok('set_user_role audits role_change',
  pg_temp.function_mentions('public.set_user_role(uuid, public.user_role, text)', 'log_admin_action')
  and pg_temp.function_mentions('public.set_user_role(uuid, public.user_role, text)', 'role_change')
);

select pg_temp.assert_ok('set_user_active audits suspend changes',
  pg_temp.function_mentions('public.set_user_active(uuid, boolean, text)', 'log_admin_action')
  and pg_temp.function_mentions('public.set_user_active(uuid, boolean, text)', 'user_suspend')
);

select pg_temp.assert_ok('badge grant/revoke audit',
  pg_temp.function_mentions('public.grant_badge(uuid, public.badge_type, text)', 'badge_grant')
  and pg_temp.function_mentions('public.revoke_badge(uuid, public.badge_type, text)', 'badge_revoke')
);

select pg_temp.assert_ok('password reset issuance audit',
  pg_temp.function_mentions('public.log_password_reset_issued(uuid, text)', 'password_reset_issued')
);

select pg_temp.assert_ok('comment report resolution audit',
  pg_temp.function_mentions('public.resolve_comment_report(uuid, text, text)', 'admin_audit_logs')
  and pg_temp.function_mentions('public.resolve_comment_report(uuid, text, text)', 'report_uphold')
);

select pg_temp.assert_ok('question correction resolution audit',
  pg_temp.function_mentions('public.resolve_question_correction(uuid, text, text)', 'admin_audit_logs')
  and pg_temp.function_mentions('public.resolve_question_correction(uuid, text, text)', 'correction_accept')
);

select pg_temp.assert_ok('signup approval/rejection audit',
  pg_temp.function_mentions('public.approve_signup_application(uuid, text)', 'signup_approve')
  and pg_temp.function_mentions('public.reject_signup_application(uuid, text)', 'signup_reject')
);

select pg_temp.assert_ok('question update audit helper exists',
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'log_admin_action'
  )
);

select pg_temp.assert_ok('image triage decision/revert audit',
  pg_temp.function_mentions('public.triage_question_decide(text, public.image_triage_status, text)', 'image_triage_decide')
  and pg_temp.function_mentions('public.triage_question_revert(text)', 'image_triage_revert')
);

select pg_temp.assert_ok('image replacement activation audit',
  pg_temp.function_mentions('public.triage_question_replace_and_activate(text, text[], text[], text)', 'image_triage_decide')
);

select pg_temp.assert_ok('board suggestion state audit',
  pg_temp.function_mentions('public.update_suggestion_state(uuid, public.suggestion_status, text)', 'board_post_state_change')
);

select pg_temp.assert_ok('announcement pin audit',
  pg_temp.function_mentions('public.set_announcement_pinned(uuid, boolean)', 'announcement_pinned')
);

select pg_temp.assert_ok('board visibility audits',
  pg_temp.function_mentions('public.set_board_post_visibility(uuid, public.board_visibility, text)', 'board_post_visibility_change')
  and pg_temp.function_mentions('public.set_board_post_comment_visibility(uuid, public.comment_status, text)', 'board_post_comment_visibility_change')
);

select pg_temp.assert_ok('board report resolution audit',
  pg_temp.function_mentions('public.resolve_board_post_report(uuid, text, text)', 'admin_audit_logs')
  and pg_temp.function_mentions('public.resolve_board_post_report(uuid, text, text)', 'report_uphold')
  and pg_temp.function_mentions('public.resolve_board_post_comment_report(uuid, text, text)', 'admin_audit_logs')
  and pg_temp.function_mentions('public.resolve_board_post_comment_report(uuid, text, text)', 'report_dismiss')
);

select pg_temp.assert_ok('ip ban grant/revoke audit',
  pg_temp.function_mentions('public.add_ip_ban(cidr, text)', 'ip_ban_grant')
  and pg_temp.function_mentions('public.revoke_ip_ban(uuid, text)', 'ip_ban_revoke')
);
select pg_temp.assert_ok('AI comment generation reservation is serialized and bounded',
  pg_temp.function_mentions(
    'public.reserve_ai_comment_generation(text, text, text, text, integer, integer, integer)',
    'pg_advisory_xact_lock'
  )
  and pg_temp.function_mentions(
    'public.reserve_ai_comment_generation(text, text, text, text, integer, integer, integer)',
    'daily_limit'
  )
  and pg_temp.function_mentions(
    'public.reserve_ai_comment_generation(text, text, text, text, integer, integer, integer)',
    'monthly_limit'
  )
  and pg_temp.function_mentions(
    'public.reserve_ai_comment_generation(text, text, text, text, integer, integer, integer)',
    'pending_limit'
  )
  and pg_temp.function_mentions(
    'public.reserve_ai_comment_generation(text, text, text, text, integer, integer, integer)',
    'insert into public.ai_comment_candidates'
  )
  and pg_temp.function_mentions(
    'public.reserve_ai_comment_generation(text, text, text, text, integer, integer, integer)',
    '''failed'''
  )
);
