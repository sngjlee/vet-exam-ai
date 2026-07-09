-- =============================================================================
-- Phase 4 (robustness): Postgres-backed rate limiting
-- =============================================================================
-- Low-frequency, user-triggered actions (signup application, comment report,
-- comment vote, board post) are protected by a fixed-window counter stored in
-- Postgres. No external store (Upstash/Vercel KV) is introduced -- the actions
-- are far below any QPS where Redis would matter, and Supabase is already the
-- single backend.
--
-- check_rate_limit() does the whole window logic in ONE atomic upsert statement
-- (row lock on the (bucket, identifier) PK), so it is correct under concurrent
-- serverless invocations. SECURITY DEFINER + locked-down table means callers
-- never touch rate_limits directly.

create table if not exists public.rate_limits (
  bucket       text        not null,
  identifier   text        not null,
  window_start timestamptz not null default now(),
  count        integer     not null default 0,
  primary key (bucket, identifier)
);

-- RLS on with NO policies: direct table access from anon/authenticated is denied
-- outright. Only the SECURITY DEFINER RPC below may read/write it.
alter table public.rate_limits enable row level security;

comment on table public.rate_limits is
  'Fixed-window rate-limit counters. Written only by check_rate_limit() (SECURITY DEFINER). No direct RLS access.';

create or replace function public.check_rate_limit(
  p_bucket         text,
  p_identifier     text,
  p_max            integer,
  p_window_seconds integer
) returns table (
  allowed             boolean,
  current_count       integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count        integer;
  v_window_start timestamptz;
begin
  insert into public.rate_limits as rl (bucket, identifier, window_start, count)
  values (p_bucket, p_identifier, now(), 1)
  on conflict (bucket, identifier) do update
    set count = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds)
            then 1
          else rl.count + 1
        end,
        window_start = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds)
            then now()
          else rl.window_start
        end
  returning rl.count, rl.window_start into v_count, v_window_start;

  return query select
    v_count <= p_max,
    v_count,
    greatest(
      0,
      p_window_seconds - floor(extract(epoch from (now() - v_window_start)))::integer
    );
end;
$$;

revoke execute on function public.check_rate_limit(text, text, integer, integer) from public;
grant  execute on function public.check_rate_limit(text, text, integer, integer) to anon, authenticated;
