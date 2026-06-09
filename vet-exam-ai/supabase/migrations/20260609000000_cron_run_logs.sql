-- Cron run log for Vercel Cron-backed maintenance tasks.
-- Service-role cron routes insert rows; active admins can read the timeline.

create table if not exists public.cron_run_logs (
  id           uuid        primary key default gen_random_uuid(),
  job_name     text        not null,
  status       text        not null check (status in ('success', 'failure')),
  duration_ms  integer     not null check (duration_ms >= 0),
  detail       jsonb,
  error        text,
  started_at   timestamptz not null,
  finished_at  timestamptz not null default now(),

  constraint cron_run_logs_job_name_length check (char_length(job_name) between 1 and 120),
  constraint cron_run_logs_failure_has_error check (
    status = 'success' or error is not null
  )
);

comment on table public.cron_run_logs is
  'Best-effort run history for app-level Vercel Cron jobs. Details must not contain raw personal data or secrets.';
comment on column public.cron_run_logs.detail is
  'Small aggregate counters only, e.g. scanned/deleted/commentSeeding summary.';

create index if not exists cron_run_logs_job_finished
  on public.cron_run_logs (job_name, finished_at desc);
create index if not exists cron_run_logs_status_finished
  on public.cron_run_logs (status, finished_at desc);

alter table public.cron_run_logs enable row level security;

drop policy if exists "cron_run_logs: admin read" on public.cron_run_logs;
create policy "cron_run_logs: admin read"
  on public.cron_run_logs for select
  using (public.is_admin());

-- No insert/update/delete policies. Inserts are made with service_role only.
