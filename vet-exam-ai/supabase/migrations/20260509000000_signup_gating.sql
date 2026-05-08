-- =============================================================================
-- Action 2 — Signup Gating
-- =============================================================================
-- Adds:
--   1. signup_status enum + signup_proof_kind enum
--   2. profiles.signup_status column + grandfather backfill
--   3. signup_applications table (1 row per user, UPSERT semantics)
--   4. my_signup_application view (caller-self projection)
--   5. RLS policies on signup_applications
--   6. signup_status_of(uid) SECURITY DEFINER helper
--   7. Existing RLS edits: comments / votes / reports / pins / profile-update
--   8. notification_type enum extension
--   9. RPCs: submit / approve / reject / list / get (5 total)
--  10. Storage bucket signup-proofs + RLS on storage.objects
--  11. pg_cron job to purge 30-day-old rejected proofs
--  12. Grants
-- =============================================================================

-- 1. Enums ---------------------------------------------------------------------
create type public.signup_status as enum
  ('pending_proof', 'pending_review', 'approved', 'rejected');

create type public.signup_proof_kind as enum ('image', 'text');

-- 2. profiles.signup_status + backfill ----------------------------------------
alter table public.profiles
  add column signup_status public.signup_status not null default 'pending_proof';

comment on column public.profiles.signup_status is
  'Signup gating state. approved = full member; pending_proof/pending_review/rejected lock writes.';

-- Grandfather every existing row (approved before gating shipped).
update public.profiles set signup_status = 'approved';

-- 3. signup_applications table ------------------------------------------------
create table public.signup_applications (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  status             public.signup_status not null default 'pending_review',
  university         text not null check (char_length(university) between 1 and 100),
  target_round       smallint not null check (target_round between 1 and 200),
  real_name          text check (char_length(real_name) <= 50),
  student_number     text check (char_length(student_number) <= 30),
  free_note          text check (char_length(free_note) <= 1000),
  proof_kind         public.signup_proof_kind not null,
  proof_storage_path text,
  proof_text         text check (char_length(proof_text) <= 2000),
  submitted_at       timestamptz not null default now(),
  reviewed_at        timestamptz,
  reviewed_by        uuid references public.profiles(id) on delete set null,
  decision_reason    text check (char_length(decision_reason) <= 500),
  rejection_count    int  not null default 0,
  last_rejection_at  timestamptz,

  constraint proof_kind_payload_consistent check (
    (proof_kind = 'image' and proof_storage_path is not null and proof_text is null)
    or
    (proof_kind = 'text'  and proof_text is not null and proof_storage_path is null)
  )
);

comment on table public.signup_applications is
  'One row per user that has submitted student verification. UPSERT on resubmit.';
comment on column public.signup_applications.real_name is
  'Admin-only. World-blocked via RLS; surfaced only through admin-only RPCs.';
comment on column public.signup_applications.student_number is
  'Admin-only. Same RLS posture as real_name.';
comment on column public.signup_applications.free_note is
  'Admin-only free-form context from applicant.';

create index signup_applications_status_submitted_idx
  on public.signup_applications (status, submitted_at desc);

create index signup_applications_status_lastrejection_idx
  on public.signup_applications (status, last_rejection_at desc);

alter table public.signup_applications enable row level security;

-- 4. my_signup_application view -----------------------------------------------
-- Caller-self projection. Excludes admin-only fields (real_name, student_number,
-- free_note, proof_storage_path, proof_text, reviewed_by). Status + reason +
-- counters only.
create view public.my_signup_application
with (security_invoker = true) as
select
  user_id,
  status,
  rejection_count,
  decision_reason,
  submitted_at,
  reviewed_at,
  last_rejection_at,
  proof_kind
from public.signup_applications
where user_id = auth.uid();

comment on view public.my_signup_application is
  'Caller-self view. Excludes PII columns; safe for client read.';

-- 5. RLS on signup_applications -----------------------------------------------
-- World-blocked for INSERT/UPDATE/DELETE (RPCs only).
-- SELECT allowed for own row only (the view depends on this).
create policy "signup_applications: own select"
  on public.signup_applications for select
  using (user_id = auth.uid());

-- (No INSERT/UPDATE/DELETE policies → only SECURITY DEFINER functions write.)

-- 6. signup_status_of(uid) helper ---------------------------------------------
-- Returns the caller-or-target's signup_status. STABLE so the planner can
-- inline it into RLS USING/WITH CHECK clauses without re-querying per row.
create or replace function public.signup_status_of(p_uid uuid)
returns public.signup_status
language sql
stable
security definer
set search_path = public
as $$
  select signup_status from public.profiles where id = p_uid
$$;

comment on function public.signup_status_of(uuid) is
  'Returns signup_status for the given user. Used in RLS write policies.';

-- 7. Existing RLS policy edits ------------------------------------------------
-- Add `signup_status_of(auth.uid()) = 'approved'` clause to every write policy
-- on user-generated content. Wrapper is SECURITY DEFINER to bypass profiles RLS.

-- comments insert (column: user_id; existing policy: "comments: authenticated insert own")
drop policy if exists "comments: authenticated insert own" on public.comments;
create policy "comments: authenticated insert own"
  on public.comments for insert
  with check (
    auth.uid() = user_id
    and public.signup_status_of(auth.uid()) = 'approved'
  );

-- comment_votes insert (column: user_id; existing policy: "comment_votes: owner insert")
drop policy if exists "comment_votes: owner insert" on public.comment_votes;
create policy "comment_votes: owner insert"
  on public.comment_votes for insert
  with check (
    auth.uid() = user_id
    and public.signup_status_of(auth.uid()) = 'approved'
  );

-- comment_reports insert (column: reporter_id; existing policy: "comment_reports: authenticated insert")
drop policy if exists "comment_reports: authenticated insert" on public.comment_reports;
create policy "comment_reports: authenticated insert"
  on public.comment_reports for insert
  with check (
    auth.uid() = reporter_id
    and public.signup_status_of(auth.uid()) = 'approved'
  );

-- comment_pins insert (column: user_id; existing policy: "comment_pins_insert_own")
drop policy if exists "comment_pins_insert_own" on public.comment_pins;
create policy "comment_pins_insert_own"
  on public.comment_pins for insert
  with check (
    auth.uid() = user_id
    and public.signup_status_of(auth.uid()) = 'approved'
  );

-- user_profiles_public update (self) — stay editable for nickname only after approve
drop policy if exists "user_profiles_public: owner update" on public.user_profiles_public;
create policy "user_profiles_public: owner update"
  on public.user_profiles_public for update
  using (
    auth.uid() = user_id
    and public.signup_status_of(auth.uid()) = 'approved'
  );

-- 7b. audit_action enum extension ---------------------------------------------
alter type public.audit_action add value if not exists 'signup_approve';
alter type public.audit_action add value if not exists 'signup_reject';

-- 8. notification_type enum extension -----------------------------------------
alter type public.notification_type add value if not exists 'signup_approved';
alter type public.notification_type add value if not exists 'signup_rejected';

-- 9. RPCs ---------------------------------------------------------------------

-- 9a. submit_signup_application
create or replace function public.submit_signup_application(
  p_university         text,
  p_target_round       smallint,
  p_proof_kind         public.signup_proof_kind,
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
    -- already in review or approved; submit is a noop
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
    -- Path must be prefixed with caller user_id/ to prevent cross-user write.
    v_path_prefix := v_user_id::text || '/';
    if position(v_path_prefix in p_proof_storage_path) <> 1 then
      raise exception '잘못된 storage 경로입니다.' using errcode = 'P0001';
    end if;
  else
    -- text kind
    if p_proof_text is null or char_length(p_proof_text) = 0 or p_proof_storage_path is not null then
      raise exception '텍스트 증빙은 텍스트만 허용됩니다.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.signup_applications (
    user_id, status, university, target_round,
    real_name, student_number, free_note,
    proof_kind, proof_storage_path, proof_text,
    submitted_at, reviewed_at, reviewed_by, decision_reason
    -- rejection_count and last_rejection_at preserved across upsert
  ) values (
    v_user_id, 'pending_review', p_university, p_target_round,
    p_real_name, p_student_number, p_free_note,
    p_proof_kind, p_proof_storage_path, p_proof_text,
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
    submitted_at        = excluded.submitted_at,
    reviewed_at         = null,
    reviewed_by         = null,
    decision_reason     = null;
    -- rejection_count untouched (only reject increments)

  update public.profiles set signup_status = 'pending_review' where id = v_user_id;
end;
$$;

revoke execute on function public.submit_signup_application(
  text, smallint, public.signup_proof_kind, text, text, text, text, text
) from public, anon;
grant execute on function public.submit_signup_application(
  text, smallint, public.signup_proof_kind, text, text, text, text, text
) to authenticated;

-- 9b. approve_signup_application
create or replace function public.approve_signup_application(
  p_user_id uuid,
  p_note    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id   uuid := auth.uid();
  v_status     public.signup_status;
  v_path       text;
begin
  if not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_user_id = v_admin_id then
    raise exception '본인 신청은 승인할 수 없습니다.' using errcode = 'P0001';
  end if;

  select status, proof_storage_path
    into v_status, v_path
  from public.signup_applications
  where user_id = p_user_id;

  if v_status is null then
    raise exception '신청 내역이 없습니다.' using errcode = 'P0001';
  end if;
  if v_status <> 'pending_review' then
    -- already decided; noop
    return;
  end if;

  update public.signup_applications set
    status             = 'approved',
    reviewed_at        = now(),
    reviewed_by        = v_admin_id,
    decision_reason    = p_note,
    proof_storage_path = null   -- path blanked; object delete attempted next
  where user_id = p_user_id;

  update public.profiles set signup_status = 'approved' where id = p_user_id;

  -- Storage delete (best-effort; if object missing the function noops)
  if v_path is not null then
    begin
      perform public.signup_proof_delete(v_path);
    exception when others then
      -- best-effort: object may already be gone or storage briefly unreachable
      null;
    end;
  end if;

  insert into public.notifications (recipient_id, type, payload)
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
end;
$$;

revoke execute on function public.approve_signup_application(uuid, text) from public, anon;
grant execute on function public.approve_signup_application(uuid, text) to authenticated;

-- 9c. reject_signup_application
create or replace function public.reject_signup_application(
  p_user_id uuid,
  p_reason  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id  uuid := auth.uid();
  v_status    public.signup_status;
  v_count     int;
begin
  if not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_user_id = v_admin_id then
    raise exception '본인 신청은 거부할 수 없습니다.' using errcode = 'P0001';
  end if;
  if p_reason is null or char_length(p_reason) < 3 or char_length(p_reason) > 500 then
    raise exception '거부 사유는 3~500자로 입력해 주세요.' using errcode = 'P0001';
  end if;

  select status, rejection_count
    into v_status, v_count
  from public.signup_applications
  where user_id = p_user_id;

  if v_status is null then
    raise exception '신청 내역이 없습니다.' using errcode = 'P0001';
  end if;
  if v_status <> 'pending_review' then
    return;
  end if;

  update public.signup_applications set
    status            = 'rejected',
    reviewed_at       = now(),
    reviewed_by       = v_admin_id,
    decision_reason   = p_reason,
    rejection_count   = v_count + 1,
    last_rejection_at = now()
  where user_id = p_user_id;

  update public.profiles set signup_status = 'rejected' where id = p_user_id;

  insert into public.notifications (recipient_id, type, payload)
  values (
    p_user_id,
    'signup_rejected',
    jsonb_build_object('reason', p_reason, 'rejection_count', v_count + 1)
  );

  perform public.log_admin_action(
    'signup_reject',
    'user',
    p_user_id::text,
    null,
    jsonb_build_object('signup_status', 'rejected'),
    p_reason
  );
end;
$$;

revoke execute on function public.reject_signup_application(uuid, text) from public, anon;
grant execute on function public.reject_signup_application(uuid, text) to authenticated;

-- 9d. list_signup_applications  (admin pagination)
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
    a.user_id,
    u.email::text,
    upp.nickname,
    a.status, a.university, a.target_round,
    a.real_name, a.student_number, a.free_note,
    a.proof_kind, a.proof_storage_path, a.proof_text,
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

-- 9e. get_signup_application (admin single)
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

-- 9f. signup_proof_delete (internal helper, used by approve + cron)
create or replace function public.signup_proof_delete(p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_path is null then return; end if;
  delete from storage.objects
  where bucket_id = 'signup-proofs' and name = p_path;
end;
$$;
revoke execute on function public.signup_proof_delete(text) from public, anon;
-- not granted to authenticated; only internal SECURITY DEFINER callers use it.

-- 10. Storage bucket + RLS ----------------------------------------------------
insert into storage.buckets (id, name, public)
values ('signup-proofs', 'signup-proofs', false)
on conflict (id) do nothing;

-- Caller may INSERT into their own prefix only.
drop policy if exists "signup-proofs: own upload"
  on storage.objects;
create policy "signup-proofs: own upload"
  on storage.objects for insert
  with check (
    bucket_id = 'signup-proofs'
    and (auth.role() = 'authenticated')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No SELECT / UPDATE / DELETE policies on signup-proofs:
--  - admin reads via service-role signed URL
--  - approve/cron deletes via SECURITY DEFINER signup_proof_delete()

-- 11. pg_cron job — purge 30-day-old rejected proofs --------------------------
-- Runs daily at 04:00 UTC. Deletes storage objects whose owning row was
-- rejected > 30 days ago, then NULLs the path so the row keeps an audit trail.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'signup-proof-purge',
      '0 4 * * *',
      $cron$
        with expired as (
          select user_id, proof_storage_path
          from public.signup_applications
          where status = 'rejected'
            and last_rejection_at < now() - interval '30 days'
            and proof_storage_path is not null
        ),
        deleted as (
          delete from storage.objects
          where bucket_id = 'signup-proofs'
            and name in (select proof_storage_path from expired)
          returning name
        )
        update public.signup_applications a
        set proof_storage_path = null
        where a.proof_storage_path in (select name from deleted);
      $cron$
    );
  end if;
end $$;

-- 12. Final grants ------------------------------------------------------------
grant select on public.my_signup_application to authenticated;
