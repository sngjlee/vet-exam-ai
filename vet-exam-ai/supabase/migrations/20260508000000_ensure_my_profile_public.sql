-- =============================================================================
-- ensure_my_profile_public: idempotent backfill RPC
--
-- Purpose: Safety net for handle_new_user trigger failures (see 2026-04-28
-- orphan incident). Any signed-in user can call this to guarantee their
-- profiles, user_profiles_public, and newbie badge rows exist. Used by
-- /profile/me server route + future error-recovery flows.
--
-- SECURITY DEFINER required: caller's auth.uid() is read but inserts run
-- as the function owner (postgres) so RLS does not block the writes.
-- search_path locked to public to prevent malicious schema substitution.
-- =============================================================================

create or replace function public.ensure_my_profile_public()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_nickname text;
begin
  if v_user_id is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  -- 1) profiles
  insert into public.profiles (id)
  values (v_user_id)
  on conflict (id) do nothing;

  -- 2) user_profiles_public — temporary nickname (matches handle_new_user format)
  v_nickname := 'user_' || substring(v_user_id::text from 1 for 8);
  insert into public.user_profiles_public (user_id, nickname)
  values (v_user_id, v_nickname)
  on conflict (user_id) do nothing;

  -- 3) newbie badge
  insert into public.badges (user_id, badge_type, reason)
  values (v_user_id, 'newbie', 'auto-granted (ensure_my_profile_public)')
  on conflict (user_id, badge_type) do nothing;

  -- 4) Return the actual nickname (may be user_xxx OR a previously-set custom one)
  select nickname into v_nickname
    from public.user_profiles_public
    where user_id = v_user_id;

  return v_nickname;
end;
$$;

grant execute on function public.ensure_my_profile_public() to authenticated;
