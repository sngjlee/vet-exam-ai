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
select pg_temp.assert_ok(
  'profiles owner read/update policies exist',
  pg_temp.policy_exists('public', 'profiles', 'profiles: owner read', 'SELECT')
  and pg_temp.policy_exists('public', 'profiles', 'profiles: owner update', 'UPDATE')
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
