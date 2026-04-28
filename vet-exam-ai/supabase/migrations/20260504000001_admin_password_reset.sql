-- =============================================================================
-- /admin/users PR-E — password reset link issuance
-- =============================================================================
-- Adds:
--   1. audit_action enum value 'password_reset_issued'
--   2. log_password_reset_issued RPC — admin-only guard + audit insert.
--      Actual link generation happens in Server Action via service role.
-- =============================================================================

alter type public.audit_action add value if not exists 'password_reset_issued';

create or replace function public.log_password_reset_issued(
  p_user_id uuid,
  p_note    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_user_id = v_admin_id then
    raise exception '본인 비밀번호는 이 화면에서 재설정할 수 없습니다.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception '대상 회원을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  perform public.log_admin_action(
    'password_reset_issued',
    'user',
    p_user_id::text,
    null,
    null,
    p_note
  );
end;
$$;

revoke execute on function public.log_password_reset_issued(uuid, text)
  from public, anon;
grant execute on function public.log_password_reset_issued(uuid, text)
  to authenticated;
