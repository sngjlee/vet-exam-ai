-- =============================================================================
-- Search v1 — questions FTS (문제/해설/선지/community_notes)
-- =============================================================================
-- Adds:
--   1. pg_trgm extension (idempotent)
--   2. questions.search_tsv generated column with setweight 가중치
--      (A=question, B=explanation+topic, C=choices+subject+tags, D=community_notes)
--   3. GIN index on search_tsv (FTS)
--   4. trigram GIN indexes on question + explanation (0건 fallback / suggestion)
--   5. search_questions(q, category_filter, recent_years, page_size, page_offset)
--   6. suggest_similar_queries(q)
--
-- 저작권 가드: round/session/year/created_at/source 컬럼은 인덱스 제외.
--             RPC 응답에도 직접 노출하지 않음 (year만 정렬 보조).
-- =============================================================================

create extension if not exists pg_trgm;

alter table public.questions
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(question, '')), 'A') ||
    setweight(to_tsvector('simple',
      coalesce(explanation, '') || ' ' || coalesce(topic, '')), 'B') ||
    setweight(to_tsvector('simple',
      coalesce(array_to_string(choices, ' '), '') || ' ' ||
      coalesce(subject, '') || ' ' ||
      coalesce(array_to_string(tags, ' '), '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(community_notes, '')), 'D')
  ) stored;

create index if not exists questions_search_tsv_idx
  on public.questions using gin (search_tsv);

create index if not exists questions_question_trgm_idx
  on public.questions using gin (question gin_trgm_ops);

create index if not exists questions_explanation_trgm_idx
  on public.questions using gin (explanation gin_trgm_ops);

-- ------------------------------------------------------------
-- search_questions: paginated FTS with ts_headline + matched_in
-- ------------------------------------------------------------
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
begin
  if length(coalesce(q, '')) < 2 then
    return;
  end if;

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
      qs.year,
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
        when to_tsvector('simple',
              coalesce(qs.explanation, '') || ' ' || coalesce(qs.topic, '')) @@ tsq
          then 'explanation'
        when to_tsvector('simple',
              coalesce(array_to_string(qs.choices, ' '), '') || ' ' ||
              coalesce(qs.subject, '') || ' ' ||
              coalesce(array_to_string(qs.tags, ' '), '')) @@ tsq
          then 'choices'
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
  limit page_size offset page_offset;
end;
$$;

revoke execute on function public.search_questions(text, text, integer, integer, integer)
  from public, anon;
grant execute on function public.search_questions(text, text, integer, integer, integer)
  to authenticated;

-- ------------------------------------------------------------
-- suggest_similar_queries: trigram fallback for 0건 case
-- ------------------------------------------------------------
create or replace function public.suggest_similar_queries(q text)
returns table (suggestion text, similarity real)
language sql
stable
security invoker
set search_path = public
as $$
  select word, similarity(word, q) as sim
    from (
      select unnest(string_to_array(question, ' ')) as word
        from public.questions where is_active = true
      union all
      select unnest(string_to_array(explanation, ' ')) as word
        from public.questions where is_active = true
    ) w
   where length(word) >= 2
     and similarity(word, q) > 0.3
   group by word, sim
   order by sim desc
   limit 5;
$$;

revoke execute on function public.suggest_similar_queries(text)
  from public, anon;
grant execute on function public.suggest_similar_queries(text)
  to authenticated;
