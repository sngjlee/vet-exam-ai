-- RLS / permission regression checks.
--
-- Run after applying migrations to a staging or production-like database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f vet-exam-ai/supabase/tests/rls-permission-regression.sql
--
-- The script is metadata-only: it reads pg_class/pg_policies and does not
-- create application data. It raises if a high-risk policy contract drifts.

begin;

create temp table rls_regression_failures (
  check_name text primary key
) on commit drop;

create or replace function pg_temp.assert_ok(check_name text, ok boolean)
returns void
language plpgsql
as $$
begin
  if not ok then
    insert into rls_regression_failures(check_name) values (check_name)
    on conflict do nothing;
  end if;
end;
$$;

create or replace function pg_temp.rls_enabled(schema_name text, table_name text)
returns boolean
language sql
stable
as $$
  select coalesce(c.relrowsecurity, false)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = schema_name
    and c.relname = table_name
$$;

create or replace function pg_temp.policy_exists(
  schema_name text,
  table_name text,
  policy_name text,
  policy_cmd text default null
) returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from pg_policies
    where schemaname = schema_name
      and tablename = table_name
      and policyname = policy_name
      and (policy_cmd is null or cmd = policy_cmd)
  )
$$;

create or replace function pg_temp.policy_mentions(
  schema_name text,
  table_name text,
  policy_name text,
  fragment text
) returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from pg_policies
    where schemaname = schema_name
      and tablename = table_name
      and policyname = policy_name
      and (
        coalesce(qual, '') ilike '%' || fragment || '%'
        or coalesce(with_check, '') ilike '%' || fragment || '%'
      )
  )
$$;

-- Core tables must keep RLS enabled.
select pg_temp.assert_ok('comments RLS enabled', pg_temp.rls_enabled('public', 'comments'));
select pg_temp.assert_ok('comment_reports RLS enabled', pg_temp.rls_enabled('public', 'comment_reports'));
select pg_temp.assert_ok('notifications RLS enabled', pg_temp.rls_enabled('public', 'notifications'));
select pg_temp.assert_ok('admin_audit_logs RLS enabled', pg_temp.rls_enabled('public', 'admin_audit_logs'));
select pg_temp.assert_ok('signup_applications RLS enabled', pg_temp.rls_enabled('public', 'signup_applications'));
select pg_temp.assert_ok('comment_pins RLS enabled', pg_temp.rls_enabled('public', 'comment_pins'));
select pg_temp.assert_ok('comment_image_upload_log RLS enabled', pg_temp.rls_enabled('public', 'comment_image_upload_log'));
select pg_temp.assert_ok('cron_run_logs RLS enabled', pg_temp.rls_enabled('public', 'cron_run_logs'));
select pg_temp.assert_ok('ip_bans RLS enabled', pg_temp.rls_enabled('public', 'ip_bans'));
select pg_temp.assert_ok('profiles RLS enabled', pg_temp.rls_enabled('public', 'profiles'));
select pg_temp.assert_ok('mock_exam_sessions RLS enabled', pg_temp.rls_enabled('public', 'mock_exam_sessions'));
select pg_temp.assert_ok('attempts RLS enabled', pg_temp.rls_enabled('public', 'attempts'));
select pg_temp.assert_ok('wrong_notes RLS enabled', pg_temp.rls_enabled('public', 'wrong_notes'));

-- Comments: public can read visible rows; only approved owner inserts; owner/admin update; nobody hard-deletes.
select pg_temp.assert_ok(
  'comments visible read policy exists',
  pg_temp.policy_exists('public', 'comments', 'comments: world read visible', 'SELECT')
);
select pg_temp.assert_ok(
  'comments insert own policy exists',
  pg_temp.policy_exists('public', 'comments', 'comments: authenticated insert own', 'INSERT')
);
select pg_temp.assert_ok(
  'comments insert policy requires approved signup',
  pg_temp.policy_mentions('public', 'comments', 'comments: authenticated insert own', 'signup_status_of')
  and pg_temp.policy_mentions('public', 'comments', 'comments: authenticated insert own', 'approved')
);
select pg_temp.assert_ok(
  'comments owner update policy exists',
  pg_temp.policy_exists('public', 'comments', 'comments: owner update', 'UPDATE')
);
select pg_temp.assert_ok(
  'comments admin update policy exists',
  pg_temp.policy_exists('public', 'comments', 'comments: admin update', 'UPDATE')
);
-- Hardened 2026-07-08: authenticated may UPDATE only body/status columns; the
-- trigger-maintained counters (vote_score, *_count) are not client-writable, so
-- an author cannot inflate their own score via a direct PostgREST PATCH.
select pg_temp.assert_ok(
  'comments counter columns are not client-updatable',
  has_column_privilege('authenticated', 'public.comments', 'body_text', 'UPDATE')
  and has_column_privilege('authenticated', 'public.comments', 'status', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.comments', 'vote_score', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.comments', 'report_count', 'UPDATE')
);
select pg_temp.assert_ok(
  'comments has no hard-delete policy',
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'comments' and cmd in ('DELETE', 'ALL')
  )
);

-- Reports: reporters only see own reports, admin/reviewer can review, no direct deletes.
select pg_temp.assert_ok(
  'comment_reports own read policy exists',
  pg_temp.policy_exists('public', 'comment_reports', 'comment_reports: reporter read own', 'SELECT')
);
select pg_temp.assert_ok(
  'comment_reports admin read policy exists',
  pg_temp.policy_exists('public', 'comment_reports', 'comment_reports: admin/reviewer read all', 'SELECT')
);
select pg_temp.assert_ok(
  'comment_reports insert own approved policy exists',
  pg_temp.policy_exists('public', 'comment_reports', 'comment_reports: authenticated insert', 'INSERT')
  and pg_temp.policy_mentions('public', 'comment_reports', 'comment_reports: authenticated insert', 'signup_status_of')
  and pg_temp.policy_mentions('public', 'comment_reports', 'comment_reports: authenticated insert', 'approved')
);
select pg_temp.assert_ok(
  'comment_reports admin update policy exists',
  pg_temp.policy_exists('public', 'comment_reports', 'comment_reports: admin/reviewer update', 'UPDATE')
);
select pg_temp.assert_ok(
  'comment_reports has no delete policy',
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'comment_reports' and cmd in ('DELETE', 'ALL')
  )
);

-- Notifications: only the recipient reads/marks read; triggers/service role create rows.
select pg_temp.assert_ok(
  'notifications owner read policy exists',
  pg_temp.policy_exists('public', 'notifications', 'notifications: owner read', 'SELECT')
);
select pg_temp.assert_ok(
  'notifications owner update policy exists',
  pg_temp.policy_exists('public', 'notifications', 'notifications: owner update', 'UPDATE')
);
select pg_temp.assert_ok(
  'notifications has no insert/delete policy',
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and cmd in ('INSERT', 'DELETE', 'ALL')
  )
);

-- Admin audit and cron logs: admin-readable only; application/service-role writes.
select pg_temp.assert_ok(
  'admin_audit_logs admin read policy exists',
  pg_temp.policy_exists('public', 'admin_audit_logs', 'admin_audit_logs: admin read', 'SELECT')
);
select pg_temp.assert_ok(
  'admin_audit_logs has no write policies',
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_audit_logs'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  )
);
select pg_temp.assert_ok(
  'cron_run_logs admin read policy exists',
  pg_temp.policy_exists('public', 'cron_run_logs', 'cron_run_logs: admin read', 'SELECT')
);
select pg_temp.assert_ok(
  'cron_run_logs has no write policies',
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cron_run_logs'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  )
);

-- Signup proof/applications: applicants read their own projection; writes go through RPCs.
select pg_temp.assert_ok(
  'signup_applications own select policy exists',
  pg_temp.policy_exists('public', 'signup_applications', 'signup_applications: own select', 'SELECT')
);
select pg_temp.assert_ok(
  'signup_applications has no direct write policies',
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'signup_applications'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  )
);
select pg_temp.assert_ok(
  'submit signup RPC granted to authenticated only',
  has_function_privilege('authenticated', 'public.submit_signup_application(text, smallint, public.signup_proof_kind, public.applicant_type, text, text, text, text, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.submit_signup_application(text, smallint, public.signup_proof_kind, public.applicant_type, text, text, text, text, text)', 'EXECUTE')
);
select pg_temp.assert_ok(
  'admin signup RPCs not granted to anon',
  not has_function_privilege('anon', 'public.approve_signup_application(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reject_signup_application(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.list_signup_applications(public.signup_status, int, int)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_signup_application(uuid)', 'EXECUTE')
);

-- Comment image upload/delete: users may touch only their own prefix; upload logs are not client-writable.
select pg_temp.assert_ok(
  'comment image own insert policy exists',
  pg_temp.policy_exists('storage', 'objects', 'comment-images own insert', 'INSERT')
);
select pg_temp.assert_ok(
  'comment image own delete policy exists',
  pg_temp.policy_exists('storage', 'objects', 'comment-images own delete', 'DELETE')
);
select pg_temp.assert_ok(
  'comment image public read policy exists',
  pg_temp.policy_exists('storage', 'objects', 'comment-images public read', 'SELECT')
);
-- Note: pg_get_functiondef never emits "SECURITY INVOKER" (it is the default and
-- is omitted; only SECURITY DEFINER is printed). Check prosecdef from the catalog
-- instead — prosecdef = false means the function runs SECURITY INVOKER, keeping
-- RLS in force for the caller.
select pg_temp.assert_ok(
  'search_comments filters visible top-level comments',
  position('c.status = ''visible''' in pg_get_functiondef('public.search_comments(text, text, integer, integer, integer)'::regprocedure)) > 0
  and position('c.parent_id is null' in pg_get_functiondef('public.search_comments(text, text, integer, integer, integer)'::regprocedure)) > 0
  and not (
    select p.prosecdef
    from pg_proc p
    where p.oid = 'public.search_comments(text, text, integer, integer, integer)'::regprocedure
  )
);
select pg_temp.assert_ok(
  'comment_image_upload_log own select only',
  pg_temp.policy_exists('public', 'comment_image_upload_log', 'comment_image_upload_log own select', 'SELECT')
  and not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'comment_image_upload_log'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  )
);

-- Signup proof files: applicant uploads own prefix, admins can select, no direct client delete.
select pg_temp.assert_ok(
  'signup proof own upload policy exists',
  pg_temp.policy_exists('storage', 'objects', 'signup-proofs: own upload', 'INSERT')
);
select pg_temp.assert_ok(
  'signup proof admin select policy exists',
  pg_temp.policy_exists('storage', 'objects', 'signup-proofs: admin signed url access', 'SELECT')
);
select pg_temp.assert_ok(
  'signup proof has no direct delete policy',
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'signup-proofs:%'
      and cmd in ('DELETE', 'ALL')
  )
);

-- Profiles and IP bans: account status is not public-writable; IP bans are admin read/RPC-write.
-- Hardened 2026-07-08 (20260708000000_security_rls_hardening): the owner UPDATE
-- policy was removed and UPDATE revoked from authenticated. profiles is written
-- only by SECURITY DEFINER RPCs / service_role; user edits go to
-- user_profiles_public. This closes the role='admin' self-promotion vector, so
-- the regression now asserts the ABSENCE of any client UPDATE path.
select pg_temp.assert_ok(
  'profiles owner read policy exists',
  pg_temp.policy_exists('public', 'profiles', 'profiles: owner read', 'SELECT')
);
select pg_temp.assert_ok(
  'profiles has no client UPDATE policy and no authenticated UPDATE grant',
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd in ('UPDATE', 'ALL')
  )
  and not has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
);
select pg_temp.assert_ok(
  'profiles admin read policy exists',
  pg_temp.policy_exists('public', 'profiles', 'admins can read all profiles', 'SELECT')
);
select pg_temp.assert_ok(
  'profiles has no delete policy',
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and cmd in ('DELETE', 'ALL')
  )
);
select pg_temp.assert_ok(
  'ip_bans admin select only',
  pg_temp.policy_exists('public', 'ip_bans', 'ip_bans: admin select', 'SELECT')
  and not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ip_bans'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  )
);

-- Mini mock exam sessions: users can append/read only their own summaries.
select pg_temp.assert_ok(
  'mock_exam_sessions owner read policy exists',
  pg_temp.policy_exists('public', 'mock_exam_sessions', 'mock_exam_sessions: owner read', 'SELECT')
  and pg_temp.policy_mentions('public', 'mock_exam_sessions', 'mock_exam_sessions: owner read', 'auth.uid()')
  and pg_temp.policy_mentions('public', 'mock_exam_sessions', 'mock_exam_sessions: owner read', 'user_id')
);
select pg_temp.assert_ok(
  'mock_exam_sessions owner insert policy exists',
  pg_temp.policy_exists('public', 'mock_exam_sessions', 'mock_exam_sessions: owner insert', 'INSERT')
  and pg_temp.policy_mentions('public', 'mock_exam_sessions', 'mock_exam_sessions: owner insert', 'auth.uid()')
  and pg_temp.policy_mentions('public', 'mock_exam_sessions', 'mock_exam_sessions: owner insert', 'user_id')
);
select pg_temp.assert_ok(
  'mock_exam_sessions has no update/delete policies',
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mock_exam_sessions'
      and cmd in ('UPDATE', 'DELETE', 'ALL')
  )
);

-- Attempts: immutable per-user answer log. Owner may read and insert own rows only;
-- no update/delete policy must exist (the log must never be rewritten or purged by users).
select pg_temp.assert_ok(
  'attempts owner read policy exists',
  pg_temp.policy_exists('public', 'attempts', 'attempts: owner read', 'SELECT')
  and pg_temp.policy_mentions('public', 'attempts', 'attempts: owner read', 'auth.uid()')
  and pg_temp.policy_mentions('public', 'attempts', 'attempts: owner read', 'user_id')
);
select pg_temp.assert_ok(
  'attempts owner insert policy exists',
  pg_temp.policy_exists('public', 'attempts', 'attempts: owner insert', 'INSERT')
  and pg_temp.policy_mentions('public', 'attempts', 'attempts: owner insert', 'auth.uid()')
  and pg_temp.policy_mentions('public', 'attempts', 'attempts: owner insert', 'user_id')
);
select pg_temp.assert_ok(
  'attempts is immutable (no update/delete policy)',
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'attempts'
      and cmd in ('UPDATE', 'DELETE', 'ALL')
  )
);

-- Wrong notes: owner-scoped review list. Owner may read/insert/update/delete own rows;
-- every policy must be scoped to the owner and no table-wide ALL policy may exist.
select pg_temp.assert_ok(
  'wrong_notes owner read policy exists',
  pg_temp.policy_exists('public', 'wrong_notes', 'wrong_notes: owner read', 'SELECT')
  and pg_temp.policy_mentions('public', 'wrong_notes', 'wrong_notes: owner read', 'auth.uid()')
  and pg_temp.policy_mentions('public', 'wrong_notes', 'wrong_notes: owner read', 'user_id')
);
select pg_temp.assert_ok(
  'wrong_notes owner insert policy exists',
  pg_temp.policy_exists('public', 'wrong_notes', 'wrong_notes: owner insert', 'INSERT')
  and pg_temp.policy_mentions('public', 'wrong_notes', 'wrong_notes: owner insert', 'auth.uid()')
  and pg_temp.policy_mentions('public', 'wrong_notes', 'wrong_notes: owner insert', 'user_id')
);
select pg_temp.assert_ok(
  'wrong_notes owner update policy exists',
  pg_temp.policy_exists('public', 'wrong_notes', 'wrong_notes: owner update', 'UPDATE')
  and pg_temp.policy_mentions('public', 'wrong_notes', 'wrong_notes: owner update', 'auth.uid()')
  and pg_temp.policy_mentions('public', 'wrong_notes', 'wrong_notes: owner update', 'user_id')
);
select pg_temp.assert_ok(
  'wrong_notes owner delete policy exists',
  pg_temp.policy_exists('public', 'wrong_notes', 'wrong_notes: owner delete', 'DELETE')
  and pg_temp.policy_mentions('public', 'wrong_notes', 'wrong_notes: owner delete', 'auth.uid()')
  and pg_temp.policy_mentions('public', 'wrong_notes', 'wrong_notes: owner delete', 'user_id')
);
select pg_temp.assert_ok(
  'wrong_notes has no table-wide ALL policy',
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'wrong_notes'
      and cmd = 'ALL'
  )
);

select pg_temp.assert_ok(
  'client roles cannot create objects in public schema',
  not has_schema_privilege('anon', 'public', 'CREATE')
  and not has_schema_privilege('authenticated', 'public', 'CREATE')
);
-- AI comment candidates: private admin queue, with all writes reserved for
-- service-role generation and the administrator-only SECURITY DEFINER RPC.
select pg_temp.assert_ok(
  'AI comment candidates RLS enabled',
  pg_temp.rls_enabled('public', 'ai_comment_candidates')
);
select pg_temp.assert_ok(
  'AI comment candidates admin read policy exists',
  pg_temp.policy_exists(
    'public', 'ai_comment_candidates', 'ai_comment_candidates: admin read', 'SELECT'
  )
  and pg_temp.policy_mentions(
    'public', 'ai_comment_candidates', 'ai_comment_candidates: admin read', 'is_admin'
  )
);
select pg_temp.assert_ok(
  'AI comment candidates have no client write policy',
  not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'ai_comment_candidates'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  )
  and not has_table_privilege('anon', 'public.ai_comment_candidates', 'INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.ai_comment_candidates', 'INSERT, UPDATE, DELETE')
);
select pg_temp.assert_ok(
  'AI comment candidates are hidden from anon',
  not has_table_privilege('anon', 'public.ai_comment_candidates', 'SELECT')
);
select pg_temp.assert_ok(
  'AI comment reservation RPC is service-role only',
  exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'reserve_ai_comment_generation'
       and p.prosecdef
       and p.proconfig @> array['search_path=pg_catalog']
  )
  and has_function_privilege(
    'service_role',
    'public.reserve_ai_comment_generation(text, text, text, text, integer, integer, integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.reserve_ai_comment_generation(text, text, text, text, integer, integer, integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.reserve_ai_comment_generation(text, text, text, text, integer, integer, integer)',
    'EXECUTE'
  )
);
select pg_temp.assert_ok(
  'AI comment review RPC is locked down',
  exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'review_ai_comment_candidate'
       and p.prosecdef
       and p.proconfig @> array['search_path=pg_catalog']
  )
  and has_function_privilege(
    'authenticated',
    'public.review_ai_comment_candidate(uuid, text, text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.review_ai_comment_candidate(uuid, text, text)',
    'EXECUTE'
  )
);
do $$
declare
  failures text;
begin
  select string_agg(check_name, E'\n- ' order by check_name)
    into failures
  from rls_regression_failures;

  if failures is not null then
    raise exception 'RLS permission regression failed:%', E'\n- ' || failures;
  end if;

  raise notice 'RLS permission regression: ok';
end;
$$;

rollback;
