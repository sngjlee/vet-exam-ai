-- =============================================================================
-- B1 — Phase 2 (RPC cutover): get_my_stats_summary stops leaking internal id
-- =============================================================================
-- recentAttempts 가 내부 question_id 를 반환하던 것을 question_public_id 로 교체한다.
-- 출력 필드명은 그대로 "question_id" 로 유지(alias)하여 클라이언트 타입/소비부는
-- 변경 불필요 — 값만 KVLE 공개 id 로 바뀐다.
--
-- 적용: Phase 2 코드 배포와 함께 SQL Editor 로 실행.
-- 원본: supabase/migrations/20260605000000_attempt_stats_summary_rpc.sql
-- =============================================================================

create or replace function public.get_my_stats_summary()
returns jsonb
language sql
stable
set search_path = public
as $$
  with my_attempts as (
    select *
    from public.attempts
    where user_id = auth.uid()
  ),
  totals as (
    select
      count(*)::int as total_attempts,
      count(*) filter (where is_correct)::int as total_correct,
      count(*) filter (
        where answered_at >= now() - interval '7 days'
      )::int as last_7_days_attempts
    from my_attempts
  ),
  by_category as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'category', category,
          'attempts', attempts,
          'correct', correct,
          'accuracy', case
            when attempts > 0 then round((correct::numeric / attempts) * 100)::int
            else 0
          end
        )
        order by attempts desc, category asc
      ),
      '[]'::jsonb
    ) as items
    from (
      select
        category,
        count(*)::int as attempts,
        count(*) filter (where is_correct)::int as correct
      from my_attempts
      group by category
    ) grouped
  ),
  recent_attempts as (
    select coalesce(
      jsonb_agg(to_jsonb(recent) order by recent.answered_at desc),
      '[]'::jsonb
    ) as items
    from (
      select
        id,
        user_id,
        session_id,
        -- B1: expose the public KVLE id under the same output field name.
        question_public_id as question_id,
        category,
        selected_answer,
        correct_answer,
        is_correct,
        answered_at
      from my_attempts
      order by answered_at desc
      limit 20
    ) recent
  )
  select jsonb_build_object(
    'totalAttempts', totals.total_attempts,
    'totalCorrect', totals.total_correct,
    'accuracy', case
      when totals.total_attempts > 0
        then round((totals.total_correct::numeric / totals.total_attempts) * 100)::int
      else 0
    end,
    'last7DaysAttempts', totals.last_7_days_attempts,
    'byCategory', by_category.items,
    'recentAttempts', recent_attempts.items
  )
  from totals, by_category, recent_attempts;
$$;

grant execute on function public.get_my_stats_summary() to authenticated;
