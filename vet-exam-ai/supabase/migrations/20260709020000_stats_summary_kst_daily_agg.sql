-- =============================================================================
-- get_my_stats_summary: add server-side KST daily aggregation
-- =============================================================================
-- The dashboard computed streak / 7-day chart / today-vs-yesterday delta on the
-- client from the recentAttempts sample, which the RPC caps at `limit 20`. A user
-- who answers >20 questions in a day fills that sample with a single day, so the
-- streak collapsed to 1, the weekly chart under-counted earlier days, and the
-- delta was wrong. Aggregate over the FULL attempt history here, bucketed by day
-- in Asia/Seoul (KST), and return it so the client renders values directly.
--
-- Additive change: every existing output field is preserved (recentAttempts is
-- still returned for the my-stats recent-activity list). New fields: streak,
-- weekly, todayAttempts, deltaVsYesterday. The client falls back to the legacy
-- client-side aggregation when these are absent, so deploy order is not critical.
--
-- Live function — apply to prod DB to take effect (like any RPC change).
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
  ),
  -- --- KST daily aggregation over the full history --------------------------
  today_kst as (
    select (now() at time zone 'Asia/Seoul')::date as d
  ),
  day_counts as (
    select
      (answered_at at time zone 'Asia/Seoul')::date as day,
      count(*)::int as total,
      count(*) filter (where is_correct)::int as correct
    from my_attempts
    group by 1
  ),
  weekly as (
    -- last 7 KST days inclusive of today, ascending, zero-filled
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(gs.day, 'YYYY-MM-DD'),
          'total', coalesce(dc.total, 0),
          'correct', coalesce(dc.correct, 0)
        )
        order by gs.day
      ),
      '[]'::jsonb
    ) as items
    from (
      select (select d from today_kst) - offs as day
      from generate_series(0, 6) as offs
    ) gs
    left join day_counts dc on dc.day = gs.day
  ),
  streak as (
    -- consecutive KST days ending today that have >=1 attempt (0 if today idle),
    -- matching the prior client semantic but over the full history.
    select count(*)::int as value
    from (
      select bool_and(dc.day is not null) over (
        order by g.offs rows between unbounded preceding and current row
      ) as run
      from generate_series(0, 366) as g(offs)
      cross join today_kst t
      left join day_counts dc on dc.day = t.d - g.offs
    ) s
    where s.run
  ),
  deltas as (
    select
      coalesce((select total   from day_counts where day = (select d from today_kst)),     0) as today_total,
      coalesce((select correct from day_counts where day = (select d from today_kst)),     0) as today_correct,
      coalesce((select correct from day_counts where day = (select d from today_kst) - 1), 0) as yest_correct
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
    'recentAttempts', recent_attempts.items,
    'streak', streak.value,
    'weekly', weekly.items,
    'todayAttempts', deltas.today_total,
    'deltaVsYesterday', deltas.today_correct - deltas.yest_correct
  )
  from totals, by_category, recent_attempts, streak, weekly, deltas;
$$;

grant execute on function public.get_my_stats_summary() to authenticated;
