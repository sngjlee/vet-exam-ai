-- =============================================================================
-- M3 §18 admin PR-D: user management RPCs
-- =============================================================================
-- 1. set_user_role          — admin-only role change with self + last-admin guards
-- 2. set_user_active        — admin-only suspend/unsuspend with same guards
-- 3. grant_badge            — admin-only badge grant (operator / reviewer)
-- 4. revoke_badge           — admin-only badge revoke (auto-badges protected)
-- 5. list_admin_user_emails — admin-only email lookup from auth.users
--
-- All mutation RPCs call log_admin_action in the same transaction.
-- No new RLS policies — SECURITY DEFINER bypasses, profiles stays admin-only-write.
-- =============================================================================

-- 1. set_user_role
create or replace function public.set_user_role(
  p_user_id  uuid,
  p_new_role public.user_role,
  p_note     text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_old_role public.user_role;
  v_active   boolean;
begin
  if not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_user_id = v_admin_id then
    raise exception '본인 역할은 변경할 수 없습니다.' using errcode = 'P0001';
  end if;

  select role, is_active into v_old_role, v_active
  from public.profiles where id = p_user_id;

  if v_old_role is null then
    raise exception '대상 회원을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  if v_old_role = p_new_role then
    return;
  end if;

  if v_old_role = 'admin' and p_new_role <> 'admin'
     and (select count(*) from public.profiles
          where role = 'admin' and is_active) <= 1 then
    raise exception '마지막 운영자는 강등할 수 없습니다.' using errcode = 'P0001';
  end if;

  update public.profiles set role = p_new_role where id = p_user_id;

  perform public.log_admin_action(
    'role_change',
    'user',
    p_user_id::text,
    jsonb_build_object('role', v_old_role),
    jsonb_build_object('role', p_new_role),
    p_note
  );
end;
$$;

revoke execute on function public.set_user_role(uuid, public.user_role, text)
  from public, anon;
grant execute on function public.set_user_role(uuid, public.user_role, text)
  to authenticated;

-- 2. set_user_active
create or replace function public.set_user_active(
  p_user_id     uuid,
  p_new_active  boolean,
  p_note        text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_old_active boolean;
  v_role     public.user_role;
begin
  if not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_user_id = v_admin_id then
    raise exception '본인 계정은 정지할 수 없습니다.' using errcode = 'P0001';
  end if;

  select is_active, role into v_old_active, v_role
  from public.profiles where id = p_user_id;

  if v_old_active is null then
    raise exception '대상 회원을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  if v_old_active = p_new_active then
    return;
  end if;

  if v_role = 'admin' and v_old_active = true and p_new_active = false
     and (select count(*) from public.profiles
          where role = 'admin' and is_active) <= 1 then
    raise exception '마지막 운영자는 정지할 수 없습니다.' using errcode = 'P0001';
  end if;

  update public.profiles set is_active = p_new_active where id = p_user_id;

  perform public.log_admin_action(
    case when p_new_active then 'user_unsuspend' else 'user_suspend' end,
    'user',
    p_user_id::text,
    jsonb_build_object('is_active', v_old_active),
    jsonb_build_object('is_active', p_new_active),
    p_note
  );
end;
$$;

revoke execute on function public.set_user_active(uuid, boolean, text)
  from public, anon;
grant execute on function public.set_user_active(uuid, boolean, text)
  to authenticated;

-- 3. grant_badge
create or replace function public.grant_badge(
  p_user_id    uuid,
  p_badge_type public.badge_type,
  p_reason     text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_inserted boolean;
begin
  if not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception '대상 회원을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  insert into public.badges (user_id, badge_type, reason, awarded_by)
  values (p_user_id, p_badge_type, p_reason, v_admin_id)
  on conflict (user_id, badge_type) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted::int = 0 then
    return;  -- already had this badge, noop
  end if;

  perform public.log_admin_action(
    'badge_grant',
    'user',
    p_user_id::text,
    null,
    jsonb_build_object('badge_type', p_badge_type),
    p_reason
  );
end;
$$;

revoke execute on function public.grant_badge(uuid, public.badge_type, text)
  from public, anon;
grant execute on function public.grant_badge(uuid, public.badge_type, text)
  to authenticated;

-- 4. revoke_badge
create or replace function public.revoke_badge(
  p_user_id    uuid,
  p_badge_type public.badge_type,
  p_note       text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_badge_type in ('newbie', 'first_contrib', 'popular_comment') then
    raise exception '자동 부여 뱃지는 회수할 수 없습니다.' using errcode = 'P0001';
  end if;

  delete from public.badges
  where user_id = p_user_id and badge_type = p_badge_type;

  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    return;  -- nothing to revoke, noop
  end if;

  perform public.log_admin_action(
    'badge_revoke',
    'user',
    p_user_id::text,
    jsonb_build_object('badge_type', p_badge_type),
    null,
    p_note
  );
end;
$$;

revoke execute on function public.revoke_badge(uuid, public.badge_type, text)
  from public, anon;
grant execute on function public.revoke_badge(uuid, public.badge_type, text)
  to authenticated;

-- 5. list_admin_user_emails
create or replace function public.list_admin_user_emails(
  p_user_ids uuid[]
) returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  return query
  select u.id, u.email::text
  from auth.users u
  where u.id = any (p_user_ids);
end;
$$;

revoke execute on function public.list_admin_user_emails(uuid[])
  from public, anon;
grant execute on function public.list_admin_user_emails(uuid[])
  to authenticated;
