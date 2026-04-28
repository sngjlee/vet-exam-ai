-- =============================================================================
-- M3 §18 admin PR-B: questions edit + audit RPC
-- =============================================================================
-- 0. extend audit_action enum
-- 1. questions admin-only UPDATE policy
-- 2. log_admin_action RPC (security definer + admin gate)
-- =============================================================================

-- 0. enum extension (auto-commit before subsequent DDL in PG 12+)
alter type public.audit_action add value if not exists 'question_update';

-- 1. questions admin-only UPDATE policy
create policy "questions: admin update"
  on public.questions for update
  using (public.is_admin())
  with check (public.is_admin());

-- 2. log_admin_action RPC
create or replace function public.log_admin_action(
  p_action      public.audit_action,
  p_target_type text,
  p_target_id   text,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_note        text  default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_id       uuid;
begin
  v_admin_id := auth.uid();

  if v_admin_id is null
     or not exists (
       select 1 from public.profiles
       where id = v_admin_id and role = 'admin' and is_active
     ) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, before_state, after_state, note)
  values
    (v_admin_id, p_action, p_target_type, p_target_id, p_before, p_after, p_note)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.log_admin_action(
  public.audit_action, text, text, jsonb, jsonb, text
) from public, anon;
grant execute on function public.log_admin_action(
  public.audit_action, text, text, jsonb, jsonb, text
) to authenticated;
