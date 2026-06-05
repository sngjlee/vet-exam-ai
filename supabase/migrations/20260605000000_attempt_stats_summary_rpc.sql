-- Summarize the signed-in user's attempt history in the database.
-- This keeps dashboard payloads small as attempt history grows.

create index if not exists attempts_user_answered_at
  on public.attempts (user_id, answered_at desc);

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
        question_id,
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
