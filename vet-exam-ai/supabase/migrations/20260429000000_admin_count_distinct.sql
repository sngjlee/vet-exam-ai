-- 1. count distinct values for a single questions column (dashboard cards 3,4)
create or replace function public.count_questions_distinct(col text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result integer;
begin
  if col not in ('round', 'category', 'subject', 'session', 'year') then
    raise exception 'invalid column: %', col;
  end if;
  execute format('select count(distinct %I) from public.questions where %I is not null', col, col)
    into result;
  return result;
end;
$$;

revoke execute on function public.count_questions_distinct(text) from public, anon;
grant execute on function public.count_questions_distinct(text) to authenticated;

-- 2. consolidated filter options (admin questions list dropdowns) — admin-only
-- copyright guard: round/year values themselves are sensitive; gate inside the function
create or replace function public.get_questions_filter_options()
returns jsonb
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

  return (
    select jsonb_build_object(
      'rounds',     coalesce((select jsonb_agg(r order by r desc) from (select distinct round    as r from public.questions where round    is not null) s), '[]'::jsonb),
      'years',      coalesce((select jsonb_agg(r order by r desc) from (select distinct year     as r from public.questions where year     is not null) s), '[]'::jsonb),
      'sessions',   coalesce((select jsonb_agg(r order by r asc ) from (select distinct session  as r from public.questions where session  is not null) s), '[]'::jsonb),
      'subjects',   coalesce((select jsonb_agg(r order by r asc ) from (select distinct subject  as r from public.questions where subject  is not null) s), '[]'::jsonb),
      'categories', coalesce((select jsonb_agg(r order by r asc ) from (select distinct category as r from public.questions where category is not null) s), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.get_questions_filter_options() from public, anon;
grant execute on function public.get_questions_filter_options() to authenticated;
