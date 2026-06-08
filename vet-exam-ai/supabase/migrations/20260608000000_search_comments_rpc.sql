-- Search comments via indexed RPC instead of app-layer comment scans.
-- Keeps RLS in force through SECURITY INVOKER.

create extension if not exists pg_trgm;

create index if not exists comments_visible_top_body_text_trgm_idx
  on public.comments using gin (body_text gin_trgm_ops)
  where status = 'visible' and parent_id is null;

create index if not exists comments_visible_top_popular_idx
  on public.comments (vote_score desc, created_at desc, id)
  where status = 'visible' and parent_id is null;

create index if not exists questions_active_category_year_id_idx
  on public.questions (category, year desc, id)
  where is_active = true;

create or replace function public.search_comments(
  q               text,
  category_filter text default null,
  recent_years    integer default null,
  page_size       integer default 30,
  page_offset     integer default 0
) returns table (
  id                 uuid,
  question_id        text,
  type               public.comment_type,
  body_text          text,
  vote_score         integer,
  created_at         timestamptz,
  question_public_id text,
  question           text,
  category           text,
  year               integer,
  total_count        bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  year_cutoff integer;
  safe_limit  integer;
  safe_offset integer;
begin
  if length(coalesce(q, '')) < 2 then
    return;
  end if;

  safe_limit := greatest(coalesce(page_size, 30), 1);
  safe_offset := greatest(coalesce(page_offset, 0), 0);

  if recent_years is not null then
    select max(qs.year) - recent_years + 1
      into year_cutoff
      from public.questions qs
     where qs.is_active = true
       and qs.year is not null;
  end if;

  return query
  with matches as (
    select
      c.id,
      c.question_id,
      c.type,
      c.body_text,
      c.vote_score,
      c.created_at,
      qs.public_id as question_public_id,
      qs.question,
      qs.category,
      qs.year::integer as year
    from public.comments c
    join public.questions qs
      on qs.id = c.question_id
     and qs.is_active = true
    where c.status = 'visible'
      and c.parent_id is null
      and c.body_text ilike ('%' || q || '%')
      and (category_filter is null or qs.category = category_filter)
      and (year_cutoff is null or qs.year >= year_cutoff)
  ),
  counted as (
    select *, count(*) over () as total_count
    from matches
  )
  select
    counted.id,
    counted.question_id,
    counted.type,
    counted.body_text,
    counted.vote_score,
    counted.created_at,
    counted.question_public_id,
    counted.question,
    counted.category,
    counted.year,
    counted.total_count
  from counted
  order by counted.vote_score desc, counted.created_at desc, counted.id
  limit safe_limit offset safe_offset;
end;
$$;

revoke execute on function public.search_comments(text, text, integer, integer, integer)
  from public;
grant execute on function public.search_comments(text, text, integer, integer, integer)
  to anon, authenticated;
