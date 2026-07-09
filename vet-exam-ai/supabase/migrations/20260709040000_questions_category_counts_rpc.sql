-- =============================================================================
-- Phase 3 (perf): questions_category_counts() RPC
-- =============================================================================
-- Replaces the client-of-DB full pagination scan in /api/questions?meta=1
-- (loadQuestionMeta looped every row selecting `category` and counted in JS).
-- A single GROUP BY does the aggregation in Postgres. SECURITY INVOKER keeps
-- questions RLS in force (questions already has an anon read policy), matching
-- the search_questions RPC pattern.
create or replace function public.questions_category_counts()
returns table (category text, count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select q.category, count(*)::bigint
  from public.questions q
  where q.is_active = true
  group by q.category;
$$;

revoke execute on function public.questions_category_counts() from public;
grant execute on function public.questions_category_counts() to anon, authenticated;
