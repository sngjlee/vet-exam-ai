-- =============================================================================
-- Hotfix: approve_signup_application now RETURNS the captured proof path
-- =============================================================================
-- Supabase added a `storage.protect_delete()` trigger that blocks direct
-- DELETE from `storage.objects` even for SECURITY DEFINER functions:
--   "Direct deletion from storage tables is not allowed. Use the Storage API
--    instead."
--
-- The previous design called signup_proof_delete() inside the RPC, wrapped
-- in a best-effort exception block. The trigger raised, the exception was
-- swallowed, and storage objects were never deleted (silent leak).
--
-- New design:
--   - RPC captures and RETURNS the path; no DELETE attempt inside.
--   - Server action (TypeScript, admin client) deletes via the Storage API
--     after the RPC succeeds.
--
-- Drop the now-unused signup_proof_delete helper.
--
-- The pg_cron 30-day purge job is also broken for the same reason; it is
-- left in place here as a noop (the inner DELETE silently fails) and tracked
-- as a separate backlog item — replace with Vercel Cron + Edge Function or
-- a Next API route that uses the Storage API.
-- =============================================================================

-- Old function returned void — must drop+create (cannot change return type).
drop function if exists public.approve_signup_application(uuid, text);

create or replace function public.approve_signup_application(
  p_user_id uuid,
  p_note    text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_status   public.signup_status;
  v_path     text;
begin
  if not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_user_id = v_admin_id then
    raise exception '본인 신청은 승인할 수 없습니다.' using errcode = 'P0001';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception '메모는 500자 이내로 입력해 주세요.' using errcode = 'P0001';
  end if;

  select status, proof_storage_path
    into v_status, v_path
  from public.signup_applications
  where user_id = p_user_id;

  if v_status is null then
    raise exception '신청 내역이 없습니다.' using errcode = 'P0001';
  end if;
  if v_status <> 'pending_review' then
    return v_path;  -- already decided; noop, return whatever path was last seen
  end if;

  update public.signup_applications set
    status             = 'approved',
    reviewed_at        = now(),
    reviewed_by        = v_admin_id,
    decision_reason    = p_note,
    proof_storage_path = null
  where user_id = p_user_id;

  update public.profiles set signup_status = 'approved' where id = p_user_id;

  insert into public.notifications (user_id, type, payload)
  values (
    p_user_id,
    'signup_approved',
    jsonb_build_object('note', p_note)
  );

  perform public.log_admin_action(
    'signup_approve',
    'user',
    p_user_id::text,
    null,
    jsonb_build_object('signup_status', 'approved'),
    p_note
  );

  return v_path;
end;
$$;

revoke execute on function public.approve_signup_application(uuid, text) from public, anon;
grant execute on function public.approve_signup_application(uuid, text) to authenticated;

-- Drop the now-unused helper (was only called from approve RPC).
drop function if exists public.signup_proof_delete(text);
