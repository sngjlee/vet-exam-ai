-- 20260513000000_unschedule_signup_proof_purge.sql
-- Disable the pg_cron job registered in 20260509000000_signup_gating.sql:590-619.
-- That job runs `delete from storage.objects ...` which Supabase's
-- storage.protect_delete() trigger silently blocks for every role, so the
-- rejected proof files were never being purged.
--
-- Replacement = Vercel Cron + /api/cron/signup-proof-purge route using the
-- Storage API (admin.storage.from('signup-proofs').remove([...])), which the
-- protect_delete trigger does NOT intercept. After the Storage delete the
-- route calls purge_signup_proof_paths() to clear the DB pointer.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'signup-proof-purge') then
      perform cron.unschedule('signup-proof-purge');
    end if;
  end if;
end $$;

-- RPC called by the cron route to NULL proof_storage_path on rejected rows
-- whose Storage object has already been removed. SECURITY DEFINER because the
-- typed app-layer Update for signup_applications is `never` (mutations go
-- through RPCs only). Grants restricted to service_role only — there is no
-- authenticated/anon use case.
create or replace function public.purge_signup_proof_paths(p_paths text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_paths is null or array_length(p_paths, 1) is null then
    return 0;
  end if;

  with cleared as (
    update public.signup_applications
       set proof_storage_path = null
     where status = 'rejected'
       and proof_storage_path = any(p_paths)
    returning user_id
  )
  select count(*) into v_count from cleared;

  return v_count;
end $$;

revoke all on function public.purge_signup_proof_paths(text[]) from public;
revoke all on function public.purge_signup_proof_paths(text[]) from anon, authenticated;
grant execute on function public.purge_signup_proof_paths(text[]) to service_role;

comment on function public.purge_signup_proof_paths(text[]) is
  'Cron-internal: clears proof_storage_path for rejected applications whose '
  'Storage object has been purged. service_role only.';
