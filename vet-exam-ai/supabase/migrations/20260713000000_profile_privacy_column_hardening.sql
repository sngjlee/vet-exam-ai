-- 20260713000000_profile_privacy_column_hardening.sql
-- Phase 1 PII hardening — H2: privacy toggles bypassed via direct PostgREST.
--
-- public.user_profiles_public is world-readable by design (RLS `using (true)`),
-- but it also stores `university` and `target_round`, which are meant to be
-- hideable via the `*_visible` flags. That masking lived ONLY in the app layer
-- (lib/profile/maskPrivacy.ts). A client holding just the anon key can bypass
-- the app and read the raw hidden values directly:
--   curl '.../rest/v1/user_profiles_public?select=university,target_round'
--
-- Root cause: the two sensitive columns are in a world-readable table with only
-- app-layer masking. Fix at the DB layer:
--   1. Stop exposing university / target_round to the anon + authenticated roles.
--      NOTE: Supabase grants table-level SELECT to these roles, and a column-level
--      REVOKE against a table-level grant is a no-op in Postgres. So we revoke the
--      whole-table SELECT and re-grant SELECT on every column EXCEPT the two
--      sensitive ones. Rows stay world-readable (RLS unchanged); only the two
--      columns become unreadable to client roles.
--   2. Serve the two columns through SECURITY DEFINER RPCs that apply the
--      visibility rule in the database (owner always sees their own raw values):
--        - get_public_profile(nickname) — for the public /profile/[nickname] page
--        - get_my_profile()             — for the owner's own edit/prefill reads
--
-- Reads that only select user_id / nickname / bio (community, board, admin lists,
-- OG, comments) are unaffected — those columns are still granted.

begin;

-- =============================================================================
-- 1. Hide university / target_round from the client roles.
-- Revoke the table-wide SELECT (which implicitly covered all columns) and
-- re-grant SELECT only on the non-sensitive columns.
-- =============================================================================
revoke select on public.user_profiles_public from anon, authenticated;

grant select (
  user_id,
  nickname,
  bio,
  target_round_visible,
  university_visible,
  nickname_changed_at,
  created_at,
  updated_at
) on public.user_profiles_public to anon, authenticated;

-- =============================================================================
-- 2a. get_public_profile — public profile page read.
-- Returns the row for a nickname with university / target_round projected by the
-- visibility flags. The owner (auth.uid() = user_id) always sees their own raw
-- values so they can view/edit their own profile. Anon callers (auth.uid() null)
-- only ever see visibility-approved values.
-- =============================================================================
create or replace function public.get_public_profile(p_nickname text)
returns table (
  user_id              uuid,
  nickname             text,
  bio                  text,
  target_round         smallint,
  university           text,
  target_round_visible boolean,
  university_visible   boolean,
  nickname_changed_at  timestamptz,
  created_at           timestamptz,
  updated_at           timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.user_id,
    u.nickname,
    u.bio,
    case when u.target_round_visible or u.user_id = auth.uid()
         then u.target_round end,
    case when u.university_visible   or u.user_id = auth.uid()
         then u.university   end,
    u.target_round_visible,
    u.university_visible,
    u.nickname_changed_at,
    u.created_at,
    u.updated_at
  from public.user_profiles_public u
  where u.nickname = p_nickname;
$$;

revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to anon, authenticated;

-- =============================================================================
-- 2b. get_my_profile — owner's own full row (raw values).
-- Used by the profile edit API and signup-flow prefill screens, which need the
-- caller's own university / target_round even when hidden. Scoped to auth.uid();
-- returns zero rows for anon.
-- =============================================================================
create or replace function public.get_my_profile()
returns table (
  user_id              uuid,
  nickname             text,
  bio                  text,
  target_round         smallint,
  university           text,
  target_round_visible boolean,
  university_visible   boolean,
  nickname_changed_at  timestamptz,
  created_at           timestamptz,
  updated_at           timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.user_id,
    u.nickname,
    u.bio,
    u.target_round,
    u.university,
    u.target_round_visible,
    u.university_visible,
    u.nickname_changed_at,
    u.created_at,
    u.updated_at
  from public.user_profiles_public u
  where u.user_id = auth.uid();
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;

commit;
