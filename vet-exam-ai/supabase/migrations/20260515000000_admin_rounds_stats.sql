-- Per-round aggregate for /admin/exams (admin-only).
-- Copyright guard: round + year are sensitive, so the function is gated and
-- never exposed to anon/authenticated callers that aren't admins.

create or replace function public.list_rounds_with_stats()
returns table (
  round           smallint,
  total_count     bigint,
  active_count    bigint,
  category_count  bigint,
  latest_year     smallint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  select role::text into caller_role
    from public.profiles
    where id = auth.uid() and is_active;

  if caller_role is null or caller_role <> 'admin' then
    raise exception 'access denied' using errcode = '42501';
  end if;

  return query
    select
      q.round,
      count(*)::bigint                                    as total_count,
      count(*) filter (where q.is_active)::bigint         as active_count,
      count(distinct q.category)::bigint                  as category_count,
      max(q.year)::smallint                               as latest_year
    from public.questions q
    where q.round is not null
    group by q.round
    order by q.round desc;
end;
$$;

revoke execute on function public.list_rounds_with_stats() from public, anon;
grant  execute on function public.list_rounds_with_stats() to authenticated;
