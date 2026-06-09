-- =============================================================================
-- Search questions v1 refinement
-- =============================================================================
-- Keep the same RPC signature, but make metadata matches explicit so the
-- product can prioritize question/explanation search before comment search.

create or replace function public.search_questions(
  q             text,
  category_filter text default null,
  recent_years    integer default null,
  page_size       integer default 30,
  page_offset     integer default 0
) returns table (
  id           text,
  public_id    text,
  question     text,
  category     text,
  year         integer,
  is_active    boolean,
  matched_in   text,
  headline     text,
  rank         real,
  total_count  bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tsq         tsquery;
  year_cutoff integer;
  safe_limit  integer;
  safe_offset integer;
begin
  if length(coalesce(q, '')) < 2 then
    return;
  end if;

  safe_limit := greatest(coalesce(page_size, 30), 1);
  safe_offset := greatest(coalesce(page_offset, 0), 0);
  tsq := websearch_to_tsquery('simple', q);

  if recent_years is not null then
    select max(year) - recent_years + 1
      into year_cutoff
      from public.questions
     where is_active = true
       and year is not null;
  end if;

  return query
  with matches as (
    select
      qs.id,
      qs.public_id,
      qs.question,
      qs.category,
      qs.year::integer as year,
      qs.is_active,
      qs.explanation,
      qs.choices,
      qs.subject,
      qs.tags,
      qs.topic,
      qs.community_notes,
      ts_rank_cd(qs.search_tsv, tsq) as rank,
      case
        when to_tsvector('simple', coalesce(qs.question, '')) @@ tsq
          then 'question'
        when to_tsvector('simple', coalesce(qs.explanation, '')) @@ tsq
          then 'explanation'
        when to_tsvector('simple', coalesce(array_to_string(qs.choices, ' '), '')) @@ tsq
          then 'choices'
        when to_tsvector('simple', coalesce(qs.subject, '')) @@ tsq
          then 'subject'
        when to_tsvector('simple', coalesce(qs.topic, '')) @@ tsq
          then 'topic'
        when to_tsvector('simple', coalesce(array_to_string(qs.tags, ' '), '')) @@ tsq
          then 'tags'
        when to_tsvector('simple', coalesce(qs.community_notes, '')) @@ tsq
          then 'community_notes'
        else 'question'
      end as matched_in
    from public.questions qs
    where qs.is_active = true
      and qs.search_tsv @@ tsq
      and (category_filter is null or qs.category = category_filter)
      and (year_cutoff is null or qs.year >= year_cutoff)
  ),
  counted as (
    select *, count(*) over () as total_count from matches
  )
  select
    counted.id,
    counted.public_id,
    counted.question,
    counted.category,
    counted.year,
    counted.is_active,
    counted.matched_in,
    ts_headline(
      'simple',
      case counted.matched_in
        when 'explanation'      then counted.explanation
        when 'choices'          then array_to_string(counted.choices, ' / ')
        when 'subject'          then counted.subject
        when 'topic'            then counted.topic
        when 'tags'             then array_to_string(counted.tags, ' / ')
        when 'community_notes'  then counted.community_notes
        else counted.question
      end,
      tsq,
      'StartSel=<mark>, StopSel=</mark>, MaxWords=20, MinWords=5, MaxFragments=1'
    ) as headline,
    counted.rank,
    counted.total_count
  from counted
  order by counted.rank desc, counted.year desc nulls last, counted.id
  limit safe_limit offset safe_offset;
end;
$$;

revoke execute on function public.search_questions(text, text, integer, integer, integer)
  from public, anon;
grant execute on function public.search_questions(text, text, integer, integer, integer)
  to authenticated;
