-- =============================================================================
-- Profile §16: nickname_changed_at + helpers (M3 §16 PR-A)
-- =============================================================================
-- Adds:
--   1. user_profiles_public.nickname_changed_at — for 30-day rate-limit
--   2. is_temp_nickname(text) — checks "user_<8 hex>" pattern
--   3. get_user_total_vote_score(uuid) — sum(vote_score) over visible comments
--
-- nickname_changed_at semantics:
--   NULL  = never changed (still on auto-generated temp nickname OR migrated)
--   set   = timestamp of last successful change (incl. first temp→real change)
-- 30-day check: enforced in PATCH /api/profile, NOT in DB (allows admin override).
-- =============================================================================

alter table public.user_profiles_public
  add column nickname_changed_at timestamptz;

comment on column public.user_profiles_public.nickname_changed_at is
  'NULL = 최초 임시 닉네임 상태 또는 미변경. 본 닉네임 첫 설정 시 set, 이후 매 변경마다 갱신. 30일 1회 제한 enforce용 (앱 계층).';

create or replace function public.is_temp_nickname(n text)
returns boolean
language sql
immutable
as $$
  select n ~ '^user_[0-9a-f]{8}$';
$$;

comment on function public.is_temp_nickname(text) is
  'True if nickname matches the auto-generated temp pattern from handle_new_user().';

create or replace function public.get_user_total_vote_score(uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(vote_score), 0)::integer
    from public.comments
   where user_id = uid and status = 'visible';
$$;

comment on function public.get_user_total_vote_score(uuid) is
  'Sum of vote_score over visible comments authored by uid. Used by /profile/[nickname].';
