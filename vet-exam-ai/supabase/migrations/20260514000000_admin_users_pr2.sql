-- =============================================================================
-- §18 admin PR-D PR-2 — IP 차단 + passer/candidate 뱃지
-- =============================================================================
-- Adds:
--   1. applicant_type enum (student / passer)
--   2. badge_type enum extension (passer, candidate)
--   3. audit_action enum extension (ip_ban_grant, ip_ban_revoke)
--   4. signup_applications.applicant_type column (default 'student' — backfills existing rows)
--   5. ip_bans table + RLS shell
--   6. RPC: submit_signup_application (param added)
--   7. RPC: approve_signup_application (auto-grants badge inline)
--   8. RPC: list_signup_applications (returns applicant_type)
--   9. RPC: get_signup_application (returns applicant_type)
--  10. RPC: add_ip_ban / revoke_ip_ban / is_ip_banned
-- =============================================================================

-- 1. applicant_type enum (idempotent guard) ----------------------------------
do $$ begin
  create type public.applicant_type as enum ('student', 'passer');
exception when duplicate_object then null;
end $$;

-- 2. badge_type enum extension ------------------------------------------------
alter type public.badge_type add value if not exists 'passer';
alter type public.badge_type add value if not exists 'candidate';

-- 3. audit_action enum extension ---------------------------------------------
alter type public.audit_action add value if not exists 'ip_ban_grant';
alter type public.audit_action add value if not exists 'ip_ban_revoke';

-- 4. signup_applications.applicant_type ---------------------------------------
alter table public.signup_applications
  add column if not exists applicant_type public.applicant_type
    not null default 'student';

comment on column public.signup_applications.applicant_type is
  '신청자 본인 신분 — student(수험생) 또는 passer(합격생). 승인 시 candidate/passer 뱃지 자동 부여.';

-- 5. ip_bans table -----------------------------------------------------------
create table if not exists public.ip_bans (
  id          uuid        primary key default gen_random_uuid(),
  cidr        cidr        not null unique,
  reason      text        not null check (char_length(reason) between 1 and 500),
  created_by  uuid        not null references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index if not exists ip_bans_cidr_gist on public.ip_bans using gist (cidr inet_ops);

alter table public.ip_bans enable row level security;

-- Admins may SELECT (the /admin/ip-bans page reads directly).
-- INSERT/UPDATE/DELETE remain RPC-only (no policies) — add_ip_ban / revoke_ip_ban are SECURITY DEFINER.
drop policy if exists "ip_bans: admin select" on public.ip_bans;
create policy "ip_bans: admin select"
  on public.ip_bans for select
  to authenticated
  using (public.is_admin());

comment on table public.ip_bans is
  '운영자 등록 IP 차단 목록. /auth/login|callback|pending-proof 진입 시 proxy.ts 에서 검사.';

-- 6. submit_signup_application — param added ---------------------------------
-- drop old signature first (return type and param list both change).
drop function if exists public.submit_signup_application(
  text, smallint, public.signup_proof_kind, text, text, text, text, text
);

create or replace function public.submit_signup_application(
  p_university         text,
  p_target_round       smallint,
  p_proof_kind         public.signup_proof_kind,
  p_applicant_type     public.applicant_type default 'student',
  p_real_name          text default null,
  p_student_number     text default null,
  p_free_note          text default null,
  p_proof_storage_path text default null,
  p_proof_text         text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_cur_status   public.signup_status;
  v_path_prefix  text;
begin
  if v_user_id is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  select signup_status into v_cur_status from public.profiles where id = v_user_id;
  if v_cur_status is null then
    raise exception '프로필이 존재하지 않습니다.' using errcode = 'P0001';
  end if;
  if v_cur_status not in ('pending_proof', 'rejected') then
    return;
  end if;

  if char_length(coalesce(p_university, '')) = 0 then
    raise exception '소속 대학을 입력해 주세요.' using errcode = 'P0001';
  end if;
  if p_target_round is null or p_target_round not between 1 and 200 then
    raise exception '목표 회차를 1~200 사이로 입력해 주세요.' using errcode = 'P0001';
  end if;

  if p_proof_kind = 'image' then
    if p_proof_storage_path is null or p_proof_text is not null then
      raise exception '이미지 증빙은 storage path만 허용됩니다.' using errcode = 'P0001';
    end if;
    v_path_prefix := v_user_id::text || '/';
    if position(v_path_prefix in p_proof_storage_path) <> 1 then
      raise exception '잘못된 storage 경로입니다.' using errcode = 'P0001';
    end if;
  else
    if p_proof_text is null or char_length(p_proof_text) = 0 or p_proof_storage_path is not null then
      raise exception '텍스트 증빙은 텍스트만 허용됩니다.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.signup_applications (
    user_id, status, university, target_round,
    real_name, student_number, free_note,
    proof_kind, proof_storage_path, proof_text,
    applicant_type,
    submitted_at, reviewed_at, reviewed_by, decision_reason
  ) values (
    v_user_id, 'pending_review', p_university, p_target_round,
    p_real_name, p_student_number, p_free_note,
    p_proof_kind, p_proof_storage_path, p_proof_text,
    p_applicant_type,
    now(), null, null, null
  )
  on conflict (user_id) do update set
    status              = 'pending_review',
    university          = excluded.university,
    target_round        = excluded.target_round,
    real_name           = excluded.real_name,
    student_number      = excluded.student_number,
    free_note           = excluded.free_note,
    proof_kind          = excluded.proof_kind,
    proof_storage_path  = excluded.proof_storage_path,
    proof_text          = excluded.proof_text,
    applicant_type      = excluded.applicant_type,
    submitted_at        = excluded.submitted_at,
    reviewed_at         = null,
    reviewed_by         = null,
    decision_reason     = null;

  update public.profiles set signup_status = 'pending_review' where id = v_user_id;
end;
$$;

revoke execute on function public.submit_signup_application(
  text, smallint, public.signup_proof_kind, public.applicant_type, text, text, text, text, text
) from public, anon;
grant execute on function public.submit_signup_application(
  text, smallint, public.signup_proof_kind, public.applicant_type, text, text, text, text, text
) to authenticated;

-- 7. approve_signup_application — auto-grant badge ---------------------------
-- Return type stays `text` (proof_storage_path), per 20260509000002 contract.
create or replace function public.approve_signup_application(
  p_user_id uuid,
  p_note    text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id  uuid := auth.uid();
  v_status    public.signup_status;
  v_path      text;
  v_app_type  public.applicant_type;
  v_badge     public.badge_type;
  v_inserted  bigint;
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

  select status, proof_storage_path, applicant_type
    into v_status, v_path, v_app_type
  from public.signup_applications
  where user_id = p_user_id;

  if v_status is null then
    raise exception '신청 내역이 없습니다.' using errcode = 'P0001';
  end if;
  if v_status <> 'pending_review' then
    return v_path;
  end if;

  update public.signup_applications set
    status             = 'approved',
    reviewed_at        = now(),
    reviewed_by        = v_admin_id,
    decision_reason    = p_note,
    proof_storage_path = null
  where user_id = p_user_id;

  update public.profiles set signup_status = 'approved' where id = p_user_id;

  -- Auto-grant role badge based on applicant_type.
  v_badge := case v_app_type when 'passer' then 'passer' else 'candidate' end;

  insert into public.badges (user_id, badge_type, reason, awarded_by)
  values (p_user_id, v_badge, '가입 승인 시 자동 부여', v_admin_id)
  on conflict (user_id, badge_type) do nothing;
  get diagnostics v_inserted = row_count;

  insert into public.notifications (user_id, type, payload)
  values (
    p_user_id,
    'signup_approved',
    jsonb_build_object('note', p_note, 'badge', v_badge)
  );

  perform public.log_admin_action(
    'signup_approve',
    'user',
    p_user_id::text,
    null,
    jsonb_build_object('signup_status', 'approved', 'applicant_type', v_app_type),
    p_note
  );

  if v_inserted::int = 1 then
    perform public.log_admin_action(
      'badge_grant',
      'user',
      p_user_id::text,
      null,
      jsonb_build_object('badge_type', v_badge, 'auto', true),
      null
    );
  end if;

  return v_path;
end;
$$;

revoke execute on function public.approve_signup_application(uuid, text) from public, anon;
grant execute on function public.approve_signup_application(uuid, text) to authenticated;

-- 8. list_signup_applications — include applicant_type ----------------------
drop function if exists public.list_signup_applications(public.signup_status, int, int);

create or replace function public.list_signup_applications(
  p_status    public.signup_status default 'pending_review',
  p_page      int default 1,
  p_page_size int default 50
) returns table (
  user_id            uuid,
  email              text,
  nickname           text,
  status             public.signup_status,
  university         text,
  target_round       smallint,
  real_name          text,
  student_number     text,
  free_note          text,
  proof_kind         public.signup_proof_kind,
  proof_storage_path text,
  proof_text         text,
  applicant_type     public.applicant_type,
  submitted_at       timestamptz,
  reviewed_at        timestamptz,
  reviewed_by        uuid,
  decision_reason    text,
  rejection_count    int,
  last_rejection_at  timestamptz,
  total_count        bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offset int;
  v_total  bigint;
begin
  if not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_page < 1 then p_page := 1; end if;
  if p_page_size not between 1 and 200 then p_page_size := 50; end if;
  v_offset := (p_page - 1) * p_page_size;

  select count(*) into v_total
  from public.signup_applications a
  where a.status = p_status;

  return query
  select
    a.user_id, u.email::text, upp.nickname,
    a.status, a.university, a.target_round,
    a.real_name, a.student_number, a.free_note,
    a.proof_kind, a.proof_storage_path, a.proof_text,
    a.applicant_type,
    a.submitted_at, a.reviewed_at, a.reviewed_by,
    a.decision_reason, a.rejection_count, a.last_rejection_at,
    v_total
  from public.signup_applications a
  left join auth.users u on u.id = a.user_id
  left join public.user_profiles_public upp on upp.user_id = a.user_id
  where a.status = p_status
  order by case
    when p_status = 'rejected' then a.last_rejection_at
    else a.submitted_at
  end desc
  limit p_page_size offset v_offset;
end;
$$;

revoke execute on function public.list_signup_applications(public.signup_status, int, int)
  from public, anon;
grant execute on function public.list_signup_applications(public.signup_status, int, int)
  to authenticated;

-- 9. get_signup_application — include applicant_type ------------------------
drop function if exists public.get_signup_application(uuid);

create or replace function public.get_signup_application(
  p_user_id uuid
) returns table (
  user_id            uuid,
  email              text,
  nickname           text,
  status             public.signup_status,
  university         text,
  target_round       smallint,
  real_name          text,
  student_number     text,
  free_note          text,
  proof_kind         public.signup_proof_kind,
  proof_storage_path text,
  proof_text         text,
  applicant_type     public.applicant_type,
  submitted_at       timestamptz,
  reviewed_at        timestamptz,
  reviewed_by        uuid,
  decision_reason    text,
  rejection_count    int,
  last_rejection_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  return query
  select
    a.user_id, u.email::text, upp.nickname,
    a.status, a.university, a.target_round,
    a.real_name, a.student_number, a.free_note,
    a.proof_kind, a.proof_storage_path, a.proof_text,
    a.applicant_type,
    a.submitted_at, a.reviewed_at, a.reviewed_by,
    a.decision_reason, a.rejection_count, a.last_rejection_at
  from public.signup_applications a
  left join auth.users u on u.id = a.user_id
  left join public.user_profiles_public upp on upp.user_id = a.user_id
  where a.user_id = p_user_id;
end;
$$;

revoke execute on function public.get_signup_application(uuid) from public, anon;
grant execute on function public.get_signup_application(uuid) to authenticated;

-- 10a. add_ip_ban -------------------------------------------------------------
create or replace function public.add_ip_ban(
  p_cidr   cidr,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_id       uuid;
begin
  if not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_cidr is null then
    raise exception 'IP/대역을 입력해 주세요.' using errcode = 'P0001';
  end if;
  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception '사유는 비워둘 수 없습니다.' using errcode = 'P0001';
  end if;
  if char_length(p_reason) > 500 then
    raise exception '사유는 500자 이내로 입력해 주세요.' using errcode = 'P0001';
  end if;

  begin
    insert into public.ip_bans (cidr, reason, created_by)
    values (p_cidr, p_reason, v_admin_id)
    returning id into v_id;
  exception when unique_violation then
    raise exception '이미 등록된 IP/대역입니다.' using errcode = 'P0001';
  end;

  perform public.log_admin_action(
    'ip_ban_grant',
    'ip_ban',
    v_id::text,
    null,
    jsonb_build_object('cidr', p_cidr::text, 'reason', p_reason),
    p_reason
  );

  return v_id;
end;
$$;

revoke execute on function public.add_ip_ban(cidr, text) from public, anon;
grant execute on function public.add_ip_ban(cidr, text) to authenticated;

-- 10b. revoke_ip_ban ---------------------------------------------------------
create or replace function public.revoke_ip_ban(
  p_id   uuid,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_cidr     cidr;
begin
  if not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  delete from public.ip_bans where id = p_id returning cidr into v_cidr;
  if v_cidr is null then
    raise exception '대상 차단을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  perform public.log_admin_action(
    'ip_ban_revoke',
    'ip_ban',
    p_id::text,
    jsonb_build_object('cidr', v_cidr::text),
    null,
    p_note
  );
end;
$$;

revoke execute on function public.revoke_ip_ban(uuid, text) from public, anon;
grant execute on function public.revoke_ip_ban(uuid, text) to authenticated;

-- 10c. is_ip_banned (anon-callable) -------------------------------------------
create or replace function public.is_ip_banned(p_ip inet)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ip_bans
    where cidr >>= p_ip
    limit 1
  );
$$;

revoke execute on function public.is_ip_banned(inet) from public;
grant execute on function public.is_ip_banned(inet) to anon, authenticated;

comment on function public.is_ip_banned(inet) is
  'Anon-callable. proxy.ts uses anon JWT and must read ip_bans before any auth.';
