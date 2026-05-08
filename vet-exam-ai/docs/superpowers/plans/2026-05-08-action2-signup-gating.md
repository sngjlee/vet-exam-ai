# Action 2 — Signup Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate new signups behind admin approval (image OR text proof) so only verified vet students can post/vote/report. pending users get read-only access; existing users grandfather to `approved`. Admin queue at `/admin/signup-applications` for review.

**Architecture:** New `signup_status` enum on `profiles` (state machine: `pending_proof` → `pending_review` → `approved`/`rejected` → `pending_review` on resubmit). Single `signup_applications` table (1 row per user, mutable, UPSERT semantics). 5 SECURITY DEFINER RPCs (submit / approve / reject / list / get). Private Storage bucket `signup-proofs` (auto-deleted on approve, 30-day cron on reject). RLS gates added to existing comments / votes / reports / pins / profile-update policies via shared `signup_status_of(uid)` helper. Middleware redirects non-approved users to status pages while leaving read-only routes open.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Auth + RPC + Storage + pg_cron, Postgres SECURITY DEFINER functions, Server Actions.

**Spec:** `vet-exam-ai/docs/superpowers/specs/2026-05-08-action2-signup-gating-design.md`

---

## File Structure

**New SQL:**
- `vet-exam-ai/supabase/migrations/20260509000000_signup_gating.sql` — single migration with 12 sections

**New libs:**
- `vet-exam-ai/lib/auth/signup-status.ts` — server helper (`getSignupStatus`, status display labels)
- `vet-exam-ai/lib/storage/signup-proofs.ts` — client/server Storage helpers (path build, upload, signed-url)

**New routes (user-facing):**
- `vet-exam-ai/app/auth/pending-proof/page.tsx`
- `vet-exam-ai/app/auth/pending-proof/_components/SignupApplicationForm.tsx`
- `vet-exam-ai/app/auth/pending-proof/_actions.ts`
- `vet-exam-ai/app/auth/pending-review/page.tsx`
- `vet-exam-ai/app/auth/rejected/page.tsx`

**New routes (admin queue):**
- `vet-exam-ai/app/admin/signup-applications/page.tsx`
- `vet-exam-ai/app/admin/signup-applications/_lib/parse-search-params.ts`
- `vet-exam-ai/app/admin/signup-applications/_lib/format-application.ts`
- `vet-exam-ai/app/admin/signup-applications/_components/queue-filters.tsx`
- `vet-exam-ai/app/admin/signup-applications/_components/queue-table.tsx`
- `vet-exam-ai/app/admin/signup-applications/_components/queue-pager.tsx`
- `vet-exam-ai/app/admin/signup-applications/_components/application-detail-drawer.tsx`
- `vet-exam-ai/app/admin/signup-applications/_components/approve-form.tsx`
- `vet-exam-ai/app/admin/signup-applications/_components/reject-form.tsx`
- `vet-exam-ai/app/admin/signup-applications/_actions.ts`

**New middleware:**
- `vet-exam-ai/middleware.ts`

**Modified:**
- `vet-exam-ai/lib/supabase/types.ts` — add Database types for new enums/table/view/RPCs
- `vet-exam-ai/lib/notifications/format.ts` — add `signup_approved` / `signup_rejected` cases
- `vet-exam-ai/app/admin/_components/admin-nav-items.ts` — add "가입 신청" link
- `vet-exam-ai/app/admin/page.tsx` — add pending-applications count widget

---

## Notes for Subagents

- **Repo nesting trap**: write files INSIDE `vet-exam-ai/` (not the legacy root). Memory: `feedback_subagent_repo_root_path_confusion.md`.
- **Migration timestamp**: `20260509000000` (one day after 5/8 spec; keeps ordering after PR #45/#46 migrations).
- **Apply migration**: end-of-Task-1 calls for SQL Editor apply by the operator. CLI `db push` is unreliable on this project (memory: `community_tables_done.md`). Subagent should NOT attempt to run any psql / supabase CLI command — produce SQL only.
- **TypeScript check command**: `npx tsc --noEmit` (no `npm run typecheck` script, memory: `vote_sort_done.md`).
- **TipTap / sanitize-html / tailwind-v4 traps**: not relevant to this work.
- **Inline styles vs tailwind**: project mixes both; copy nearby file's pattern for the page being added.

---

## Task 1: Migration SQL

**Files:**
- Create: `vet-exam-ai/supabase/migrations/20260509000000_signup_gating.sql`

This is one large file with 12 numbered sections. Write the file as a whole, then run a final verification pass.

- [ ] **Step 1: Write the migration file**

```sql
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
    perform public.signup_proof_delete(v_path);
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
        from expired e
        where a.user_id = e.user_id;
      $cron$
    );
  end if;
end $$;

-- 12. Final grants ------------------------------------------------------------
grant select on public.my_signup_application to authenticated;
```

- [ ] **Step 2: Verify file contents end-to-end**

Run: `Read vet-exam-ai/supabase/migrations/20260509000000_signup_gating.sql`
Verify:
- 12 numbered sections present
- 5 RPCs (`submit_signup_application`, `approve_signup_application`, `reject_signup_application`, `list_signup_applications`, `get_signup_application`) plus internal `signup_proof_delete` and helper `signup_status_of`
- All `SECURITY DEFINER` functions have `set search_path = public`
- `update public.profiles set signup_status = 'approved'` grandfather statement present
- `proof_kind_payload_consistent` CHECK constraint present
- 5 existing RLS policies dropped+recreated:
  - `comments: authenticated insert own` (column `user_id`)
  - `comment_votes: owner insert` (column `user_id`)
  - `comment_reports: authenticated insert` (column `reporter_id`)
  - `comment_pins_insert_own` (column `user_id`)
  - `user_profiles_public: owner update` (column `user_id`)

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/supabase/migrations/20260509000000_signup_gating.sql
git commit -m "signup-gating: migration — enums + table + view + RLS + 5 RPCs + cron"
```

- [ ] **Step 4: Operator applies via Supabase SQL Editor**

⚠️ **Operator-only step. Do NOT attempt programmatically.**

User instructions (paste into chat for human):
1. Open Supabase Dashboard → SQL Editor
2. Paste contents of `vet-exam-ai/supabase/migrations/20260509000000_signup_gating.sql` and run
3. Run verification queries:

```sql
-- Should return all existing users with signup_status='approved'
select count(*) filter (where signup_status='approved') as approved,
       count(*) filter (where signup_status='pending_proof') as pending_proof
from public.profiles;

-- Should return 5 RPCs (plus signup_status_of and signup_proof_delete)
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname like '%signup%';

-- Should show 'signup-proofs' bucket
select id, public from storage.buckets where id = 'signup-proofs';

-- Should show signup-proof-purge cron job (if pg_cron extension active)
select jobname, schedule from cron.job where jobname = 'signup-proof-purge';
```

4. Report results to subagent. If any verification fails, halt.

---

## Task 2: Update typed schema

**Files:**
- Modify: `vet-exam-ai/lib/supabase/types.ts`

This file is the manually-curated subset of Supabase types. Add table/view/enum/RPC entries for the migration. **Read the file first** to find the right insertion points and follow the existing pattern.

- [ ] **Step 1: Read existing types.ts**

Run: `Read vet-exam-ai/lib/supabase/types.ts`
Identify these sections:
- `Database['public']['Tables']`
- `Database['public']['Views']`
- `Database['public']['Functions']`
- `Database['public']['Enums']`

- [ ] **Step 2: Add `signup_status` and `signup_proof_kind` to Enums section**

Add inside `Database['public']['Enums']`:

```ts
      signup_status: "pending_proof" | "pending_review" | "approved" | "rejected";
      signup_proof_kind: "image" | "text";
```

- [ ] **Step 3: Add `signup_approved` and `signup_rejected` to existing `notification_type` enum union**

Find the existing `notification_type:` line and append the two values to the union.

- [ ] **Step 4: Add `signup_applications` table to Tables section**

```ts
      signup_applications: {
        Row: {
          user_id:            string;
          status:             Database["public"]["Enums"]["signup_status"];
          university:         string;
          target_round:       number;
          real_name:          string | null;
          student_number:     string | null;
          free_note:          string | null;
          proof_kind:         Database["public"]["Enums"]["signup_proof_kind"];
          proof_storage_path: string | null;
          proof_text:         string | null;
          submitted_at:       string;
          reviewed_at:        string | null;
          reviewed_by:        string | null;
          decision_reason:    string | null;
          rejection_count:    number;
          last_rejection_at:  string | null;
        };
        Insert: never;  // RPC-only writes
        Update: never;
      };
```

- [ ] **Step 5: Add `signup_status` to existing `profiles` table Row type**

Find `profiles: { Row: { ... } }` and add:

```ts
          signup_status: Database["public"]["Enums"]["signup_status"];
```

- [ ] **Step 6: Add `my_signup_application` view to Views section**

```ts
      my_signup_application: {
        Row: {
          user_id:           string;
          status:            Database["public"]["Enums"]["signup_status"];
          rejection_count:   number;
          decision_reason:   string | null;
          submitted_at:      string;
          reviewed_at:       string | null;
          last_rejection_at: string | null;
          proof_kind:        Database["public"]["Enums"]["signup_proof_kind"];
        };
      };
```

- [ ] **Step 7: Add 5 RPCs to Functions section**

```ts
      submit_signup_application: {
        Args: {
          p_university:         string;
          p_target_round:       number;
          p_proof_kind:         Database["public"]["Enums"]["signup_proof_kind"];
          p_real_name?:         string | null;
          p_student_number?:    string | null;
          p_free_note?:         string | null;
          p_proof_storage_path?: string | null;
          p_proof_text?:        string | null;
        };
        Returns: void;
      };
      approve_signup_application: {
        Args: { p_user_id: string; p_note?: string | null };
        Returns: void;
      };
      reject_signup_application: {
        Args: { p_user_id: string; p_reason: string };
        Returns: void;
      };
      list_signup_applications: {
        Args: {
          p_status?: Database["public"]["Enums"]["signup_status"];
          p_page?: number;
          p_page_size?: number;
        };
        Returns: Array<{
          user_id:            string;
          email:              string | null;
          nickname:           string | null;
          status:             Database["public"]["Enums"]["signup_status"];
          university:         string;
          target_round:       number;
          real_name:          string | null;
          student_number:     string | null;
          free_note:          string | null;
          proof_kind:         Database["public"]["Enums"]["signup_proof_kind"];
          proof_storage_path: string | null;
          proof_text:         string | null;
          submitted_at:       string;
          reviewed_at:        string | null;
          reviewed_by:        string | null;
          decision_reason:    string | null;
          rejection_count:    number;
          last_rejection_at:  string | null;
          total_count:        number;
        }>;
      };
      get_signup_application: {
        Args: { p_user_id: string };
        Returns: Array<{
          user_id:            string;
          email:              string | null;
          nickname:           string | null;
          status:             Database["public"]["Enums"]["signup_status"];
          university:         string;
          target_round:       number;
          real_name:          string | null;
          student_number:     string | null;
          free_note:          string | null;
          proof_kind:         Database["public"]["Enums"]["signup_proof_kind"];
          proof_storage_path: string | null;
          proof_text:         string | null;
          submitted_at:       string;
          reviewed_at:        string | null;
          reviewed_by:        string | null;
          decision_reason:    string | null;
          rejection_count:    number;
          last_rejection_at:  string | null;
        }>;
      };
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: project compiles. If failures appear, they are likely existing files using `notification_type` exhaustively (see `lib/notifications/format.ts`) — that is fixed in Task 9. For now, narrow the failure to those files only.

If unrelated failures: stop and surface.

- [ ] **Step 9: Commit**

```bash
git add vet-exam-ai/lib/supabase/types.ts
git commit -m "signup-gating: typed schema for new enums + table + view + RPCs"
```

---

## Task 3: Server helper `signup-status.ts`

**Files:**
- Create: `vet-exam-ai/lib/auth/signup-status.ts`

- [ ] **Step 1: Write the helper**

```ts
import { createClient } from "../supabase/server";
import type { Database } from "../supabase/types";

export type SignupStatus = Database["public"]["Enums"]["signup_status"];

export const SIGNUP_STATUS_LABEL: Record<SignupStatus, string> = {
  pending_proof:  "증빙 제출 필요",
  pending_review: "운영자 검토 중",
  approved:       "승인 완료",
  rejected:       "거부됨",
};

/**
 * Server-only. Returns the caller's signup_status, or null if not signed in
 * or profile row missing (orphan case from 4/28 incident).
 */
export async function getMySignupStatus(): Promise<{
  userId: string;
  status: SignupStatus;
} | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("signup_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;
  return { userId: user.id, status: data.signup_status };
}

/**
 * Returns where to redirect a non-approved user. Null if approved or signed out.
 * Caller decides redirect target based on the layout it lives in.
 */
export function pendingRedirectTarget(status: SignupStatus): string | null {
  switch (status) {
    case "pending_proof":  return "/auth/pending-proof";
    case "pending_review": return "/auth/pending-review";
    case "rejected":       return "/auth/rejected";
    case "approved":       return null;
    default: {
      const _exh: never = status;
      void _exh;
      return null;
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (still expect notification format.ts errors from Task 2 enum extension).

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/auth/signup-status.ts
git commit -m "signup-gating: getMySignupStatus + redirect target helpers"
```

---

## Task 4: Storage helper `signup-proofs.ts`

**Files:**
- Create: `vet-exam-ai/lib/storage/signup-proofs.ts`

- [ ] **Step 1: Write the helper**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

const BUCKET = "signup-proofs";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export type ProofUploadResult =
  | { ok: true;  path: string }
  | { ok: false; error: "auth_required" | "bad_type" | "too_large" | "upload_failed"; message?: string };

function safeExt(file: File): "jpg" | "png" | "webp" | null {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png")  return "png";
  if (file.type === "image/webp") return "webp";
  return null;
}

function uuidish(): string {
  // Browser `crypto.randomUUID()` exists in modern envs; server should not call this.
  return (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2));
}

/**
 * Client-side proof upload. Returns the storage path on success.
 * Path format: `{userId}/{uuid}.{ext}` — RLS requires the userId prefix.
 */
export async function uploadSignupProof(
  supabase: SupabaseClient<Database>,
  userId: string,
  file: File,
): Promise<ProofUploadResult> {
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: "bad_type", message: "JPG, PNG, WEBP만 업로드 가능합니다." };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: "too_large", message: "파일은 5MB 이하만 업로드 가능합니다." };
  }
  const ext = safeExt(file);
  if (!ext) return { ok: false, error: "bad_type" };

  const path = `${userId}/${uuidish()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    return { ok: false, error: "upload_failed", message: error.message };
  }
  return { ok: true, path };
}

/**
 * Server-only. Issues a signed URL for an admin to view a proof image.
 * Caller must already be admin-gated.
 */
export async function signedProofUrl(
  supabase: SupabaseClient<Database>,
  path: string,
  expiresInSec: number = 300,
): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSec);
  return data?.signedUrl ?? null;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/storage/signup-proofs.ts
git commit -m "signup-gating: client upload + admin signed-url helpers"
```

---

## Task 5: `SignupApplicationForm` client component

**Files:**
- Create: `vet-exam-ai/app/auth/pending-proof/_components/SignupApplicationForm.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { createClient } from "../../../../lib/supabase/client";
import { uploadSignupProof } from "../../../../lib/storage/signup-proofs";
import { submitSignupApplicationAction } from "../_actions";

type Mode = "image" | "text";

type Props = {
  userId: string;
  defaultUniversity?: string;
  defaultTargetRound?: number;
  showRejectionBanner?: { reason: string; count: number } | null;
};

export default function SignupApplicationForm({
  userId,
  defaultUniversity = "",
  defaultTargetRound,
  showRejectionBanner = null,
}: Props) {
  const [mode, setMode] = useState<Mode>("image");
  const [university, setUniversity] = useState(defaultUniversity);
  const [targetRound, setTargetRound] = useState<string>(
    defaultTargetRound != null ? String(defaultTargetRound) : "",
  );
  const [realName, setRealName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [freeNote, setFreeNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [proofText, setProofText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const round = Number(targetRound);
    if (!university.trim()) return setError("소속 대학을 입력해 주세요.");
    if (!Number.isFinite(round) || round < 1 || round > 200) {
      return setError("목표 회차를 1~200 사이로 입력해 주세요.");
    }

    setSubmitting(true);
    try {
      let proofStoragePath: string | null = null;
      let proofTextValue: string | null = null;

      if (mode === "image") {
        if (!file) {
          setError("학생증/수험표 이미지를 첨부해 주세요.");
          return;
        }
        const supabase = createClient();
        const up = await uploadSignupProof(supabase, userId, file);
        if (!up.ok) {
          setError(up.message ?? "이미지 업로드에 실패했습니다.");
          return;
        }
        proofStoragePath = up.path;
      } else {
        if (proofText.trim().length === 0) {
          setError("증빙 텍스트를 입력해 주세요.");
          return;
        }
        if (proofText.length > 2000) {
          setError("텍스트 증빙은 2000자 이내로 작성해 주세요.");
          return;
        }
        proofTextValue = proofText;
      }

      const result = await submitSignupApplicationAction({
        university: university.trim(),
        targetRound: round,
        realName: realName.trim() || null,
        studentNumber: studentNumber.trim() || null,
        freeNote: freeNote.trim() || null,
        proofKind: mode,
        proofStoragePath,
        proofText: proofTextValue,
      });

      if (!result.ok) {
        setError(result.message ?? "제출에 실패했습니다.");
        return;
      }
      // Server action revalidates and redirects to /auth/pending-review.
      // Fallback hard reload in case redirect did not fire.
      window.location.href = "/auth/pending-review";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%", maxWidth: 480 }}
    >
      {showRejectionBanner && (
        <div
          role="alert"
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            background: "var(--wrong-dim)",
            border: "1px solid rgba(192,74,58,0.3)",
            color: "var(--wrong)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            지난 신청이 거부되었어요 (총 {showRejectionBanner.count}회)
          </div>
          <div>사유: {showRejectionBanner.reason}</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => setMode("image")}
          className={mode === "image" ? "kvle-btn-primary" : "kvle-btn-secondary"}
          style={{ flex: 1 }}
        >
          학생증/수험표 이미지
        </button>
        <button
          type="button"
          onClick={() => setMode("text")}
          className={mode === "text" ? "kvle-btn-primary" : "kvle-btn-secondary"}
          style={{ flex: 1 }}
        >
          텍스트로 신고
        </button>
      </div>

      <div>
        <label className="kvle-label mb-2">소속 대학 *</label>
        <input
          className="kvle-input"
          value={university}
          onChange={(e) => setUniversity(e.target.value)}
          maxLength={100}
          required
          placeholder="예: 서울대학교 수의과대학"
        />
      </div>

      <div>
        <label className="kvle-label mb-2">목표 회차 *</label>
        <input
          className="kvle-input"
          type="number"
          inputMode="numeric"
          value={targetRound}
          onChange={(e) => setTargetRound(e.target.value)}
          min={1}
          max={200}
          required
          placeholder="예: 70"
        />
      </div>

      {mode === "image" ? (
        <div>
          <label className="kvle-label mb-2">학생증/수험표 이미지 *</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
            JPG / PNG / WEBP, 5MB 이하. 운영자만 열람하며 승인 즉시 삭제됩니다.
          </div>
        </div>
      ) : (
        <div>
          <label className="kvle-label mb-2">증빙 설명 *</label>
          <textarea
            className="kvle-input"
            value={proofText}
            onChange={(e) => setProofText(e.target.value)}
            rows={5}
            maxLength={2000}
            required
            placeholder="이미지 첨부가 어려운 사정과 본인 정보(학번/학교)를 자세히 적어 주세요. 운영자가 직접 검토합니다."
          />
        </div>
      )}

      <details style={{ fontSize: 13 }}>
        <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>선택 입력 (운영자만 열람)</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <div>
            <label className="kvle-label mb-2">실명</label>
            <input
              className="kvle-input"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              maxLength={50}
            />
          </div>
          <div>
            <label className="kvle-label mb-2">학번</label>
            <input
              className="kvle-input"
              value={studentNumber}
              onChange={(e) => setStudentNumber(e.target.value)}
              maxLength={30}
            />
          </div>
          <div>
            <label className="kvle-label mb-2">자유 메모</label>
            <textarea
              className="kvle-input"
              value={freeNote}
              onChange={(e) => setFreeNote(e.target.value)}
              rows={3}
              maxLength={1000}
            />
          </div>
        </div>
      </details>

      {error && (
        <div
          className="rounded-lg px-3 py-2.5 text-sm"
          style={{
            background: "var(--wrong-dim)",
            border: "1px solid rgba(192,74,58,0.3)",
            color: "var(--wrong)",
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="kvle-btn-primary w-full"
      >
        {submitting ? "제출 중…" : "제출하기"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: error in this file complaining about `submitSignupApplicationAction` (created in next task). That is acceptable; commit anyway and resolve in Task 6.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/auth/pending-proof/_components/SignupApplicationForm.tsx
git commit -m "signup-gating: SignupApplicationForm client component (image/text mode)"
```

---

## Task 6: `submitSignupApplicationAction` server action

**Files:**
- Create: `vet-exam-ai/app/auth/pending-proof/_actions.ts`

- [ ] **Step 1: Write the action**

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import type { Database } from "../../../lib/supabase/types";

type ProofKind = Database["public"]["Enums"]["signup_proof_kind"];

export type SubmitInput = {
  university:         string;
  targetRound:        number;
  realName:           string | null;
  studentNumber:      string | null;
  freeNote:           string | null;
  proofKind:          ProofKind;
  proofStoragePath:   string | null;
  proofText:          string | null;
};

export type SubmitResult =
  | { ok: true }
  | {
      ok: false;
      error: "auth_required" | "invalid_input" | "rpc_failed";
      message?: string;
    };

export async function submitSignupApplicationAction(input: SubmitInput): Promise<SubmitResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth_required" };

  if (!input.university.trim()) {
    return { ok: false, error: "invalid_input", message: "소속 대학을 입력해 주세요." };
  }
  if (!Number.isInteger(input.targetRound) || input.targetRound < 1 || input.targetRound > 200) {
    return { ok: false, error: "invalid_input", message: "목표 회차를 1~200으로 입력해 주세요." };
  }
  if (input.proofKind === "image" && !input.proofStoragePath) {
    return { ok: false, error: "invalid_input", message: "이미지 경로가 누락되었습니다." };
  }
  if (input.proofKind === "text" && !input.proofText) {
    return { ok: false, error: "invalid_input", message: "증빙 텍스트를 입력해 주세요." };
  }

  const { error } = await supabase.rpc("submit_signup_application", {
    p_university:          input.university,
    p_target_round:        input.targetRound,
    p_proof_kind:          input.proofKind,
    p_real_name:           input.realName,
    p_student_number:      input.studentNumber,
    p_free_note:           input.freeNote,
    p_proof_storage_path:  input.proofStoragePath,
    p_proof_text:          input.proofText,
  });
  if (error) {
    return { ok: false, error: "rpc_failed", message: error.message };
  }

  revalidatePath("/auth/pending-proof");
  revalidatePath("/auth/pending-review");
  redirect("/auth/pending-review");
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: pass (the redirect path makes return-after-redirect unreachable, which is fine).

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/auth/pending-proof/_actions.ts
git commit -m "signup-gating: submitSignupApplicationAction server action"
```

---

## Task 7: `/auth/pending-proof` server page

**Files:**
- Create: `vet-exam-ai/app/auth/pending-proof/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { getMySignupStatus } from "../../../lib/auth/signup-status";
import SignupApplicationForm from "./_components/SignupApplicationForm";

export const dynamic = "force-dynamic";

export default async function PendingProofPage() {
  const me = await getMySignupStatus();
  if (!me) redirect("/auth/login");

  // Reroute users in the wrong state to the right page (defense-in-depth
  // even though middleware already does this).
  if (me.status === "pending_review") redirect("/auth/pending-review");
  if (me.status === "rejected")       redirect("/auth/rejected");
  if (me.status === "approved")       redirect("/dashboard");

  // Status === 'pending_proof'. Pre-fill university/round from existing
  // user_profiles_public if present.
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("user_profiles_public")
    .select("university, target_round")
    .eq("user_id", me.userId)
    .maybeSingle();

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "3rem 1.5rem 4rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        <h1
          className="text-2xl font-bold tracking-tight mb-2"
          style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
        >
          학생 인증을 완료해 주세요
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
          저작권 보호와 시딩 안전망을 위해 운영자가 수험생 자격을 직접 검수합니다.
          평일 1~2일 내 처리됩니다. 학생증/수험표 이미지 업로드를 권장하며,
          첨부가 어려우면 텍스트로 본인 정보를 적어 주세요.
        </p>
        <SignupApplicationForm
          userId={me.userId}
          defaultUniversity={profile?.university ?? ""}
          defaultTargetRound={profile?.target_round ?? undefined}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/auth/pending-proof/page.tsx
git commit -m "signup-gating: /auth/pending-proof page (server shell)"
```

---

## Task 8: `/auth/pending-review` and `/auth/rejected` pages

**Files:**
- Create: `vet-exam-ai/app/auth/pending-review/page.tsx`
- Create: `vet-exam-ai/app/auth/rejected/page.tsx`

- [ ] **Step 1: Write `/auth/pending-review/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { getMySignupStatus } from "../../../lib/auth/signup-status";

export const dynamic = "force-dynamic";

export default async function PendingReviewPage() {
  const me = await getMySignupStatus();
  if (!me) redirect("/auth/login");
  if (me.status === "pending_proof") redirect("/auth/pending-proof");
  if (me.status === "rejected")      redirect("/auth/rejected");
  if (me.status === "approved")      redirect("/dashboard");

  const supabase = await createClient();
  const { data: app } = await supabase
    .from("my_signup_application")
    .select("submitted_at")
    .maybeSingle();

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 1.5rem",
        textAlign: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        <h1
          className="text-2xl font-bold tracking-tight mb-2"
          style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
        >
          운영자 검토 중
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.7 }}>
          신청서가 접수되었어요. 평일 1~2일 내로 검토 결과를 알려 드립니다.
          {app?.submitted_at ? (
            <>
              <br />
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                제출: {new Date(app.submitted_at).toLocaleString("ko-KR")}
              </span>
            </>
          ) : null}
        </p>
        <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: "1.5rem" }}>
          그동안 문제와 댓글은 자유롭게 둘러보실 수 있어요.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Write `/auth/rejected/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { getMySignupStatus } from "../../../lib/auth/signup-status";
import SignupApplicationForm from "../pending-proof/_components/SignupApplicationForm";

export const dynamic = "force-dynamic";

export default async function RejectedPage() {
  const me = await getMySignupStatus();
  if (!me) redirect("/auth/login");
  if (me.status === "pending_proof")  redirect("/auth/pending-proof");
  if (me.status === "pending_review") redirect("/auth/pending-review");
  if (me.status === "approved")       redirect("/dashboard");

  const supabase = await createClient();
  const { data: app } = await supabase
    .from("my_signup_application")
    .select("decision_reason, rejection_count")
    .maybeSingle();
  const { data: profile } = await supabase
    .from("user_profiles_public")
    .select("university, target_round")
    .eq("user_id", me.userId)
    .maybeSingle();

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "3rem 1.5rem 4rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        <h1
          className="text-2xl font-bold tracking-tight mb-2"
          style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
        >
          신청이 거부되었어요
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
          아래 사유를 확인하시고 다시 제출해 주세요. 횟수 제한은 없습니다.
        </p>
        <SignupApplicationForm
          userId={me.userId}
          defaultUniversity={profile?.university ?? ""}
          defaultTargetRound={profile?.target_round ?? undefined}
          showRejectionBanner={
            app?.decision_reason
              ? { reason: app.decision_reason, count: app.rejection_count ?? 1 }
              : null
          }
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add vet-exam-ai/app/auth/pending-review/page.tsx vet-exam-ai/app/auth/rejected/page.tsx
git commit -m "signup-gating: pending-review + rejected status pages"
```

---

## Task 9: Notification format extension

**Files:**
- Modify: `vet-exam-ai/lib/notifications/format.ts`

- [ ] **Step 1: Read current file**

Run: `Read vet-exam-ai/lib/notifications/format.ts`

Confirm:
- `correction_resolved` is handled before the `related == null` early-return (this is the pattern for non-comment notifications).
- `_exhaustive: never` check exists at the bottom of the inner switch and at the end of `textOnlyFallback`.

- [ ] **Step 2: Add signup cases above the `related == null` block**

Edit the file: insert these cases right after the existing `correction_resolved` block (lines 39–49 in the spec example), before `if (related == null)`:

```ts
  if (type === "signup_approved") {
    return { text: "가입이 승인되었어요 🎉", href: "/dashboard" };
  }
  if (type === "signup_rejected") {
    const reason = stringField(payload, "reason");
    return {
      text: reason
        ? `가입이 거부되었어요: ${reason}`
        : "가입이 거부되었어요",
      href: "/auth/rejected",
    };
  }
```

- [ ] **Step 3: Update `textOnlyFallback` switch type and exhaustiveness**

The function signature uses
`type: Exclude<NotificationType, "correction_resolved">`.
Update it to
`type: Exclude<NotificationType, "correction_resolved" | "signup_approved" | "signup_rejected">`
because the new types are also handled in the early returns above (so they never reach the fallback). The exhaustiveness check below the inner switch will now happily compile.

Edit the function declaration and verify the body's switch needs no new cases (it shouldn't — those types are excluded).

- [ ] **Step 4: Verify the inner switch's `_exhaustive: never` line**

The inner switch on `type` after the `related == null` short-circuit had:

```ts
default: {
  const _exhaustive: never = type;
  void _exhaustive;
  return { text: "새 알림", href: NO_HREF };
}
```

Because we returned early for the two new types, `type` at the `default` branch can never include them. TypeScript should infer this. If the typechecker still complains, narrow it with an explicit guard above the switch:

```ts
if (type === "signup_approved" || type === "signup_rejected") {
  // unreachable due to early returns above; keep TS happy
  return { text: "새 알림", href: NO_HREF };
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: project compiles cleanly.

- [ ] **Step 6: Commit**

```bash
git add vet-exam-ai/lib/notifications/format.ts
git commit -m "signup-gating: format signup_approved + signup_rejected notifications"
```

---

## Task 10: Middleware — gate non-approved users

**Files:**
- Create: `vet-exam-ai/middleware.ts`

This file may not exist yet. If it does, fold the gate into the existing middleware. Read first to be sure.

- [ ] **Step 1: Check for existing middleware**

Run: `Glob vet-exam-ai/middleware.ts`
Run: `Glob vet-exam-ai/src/middleware.ts`

If either exists, read it and adapt the snippet below into it. If neither exists, create at the path above.

- [ ] **Step 2: Write the middleware**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATH_PREFIXES = [
  "/_next",
  "/api/auth",
  "/auth/login",
  "/auth/callback",
  "/auth/pending-proof",
  "/auth/pending-review",
  "/auth/rejected",
  "/auth/reset",
];

const READ_ONLY_OK_PREFIXES = [
  "/",                  // landing
  "/questions",
  "/search",
  "/community",
  "/notifications",
];

const WRITE_GATED_EXACT = new Set<string>([
  "/dashboard",
  "/profile/me",
  "/profile/me/edit",
  "/settings",
]);

function statusToPath(status: string): string | null {
  switch (status) {
    case "pending_proof":  return "/auth/pending-proof";
    case "pending_review": return "/auth/pending-review";
    case "rejected":       return "/auth/rejected";
    default:               return null;
  }
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (PUBLIC_PATH_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => res.cookies.set({ name, value, ...options }));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Not signed in — read-only routes pass; write routes redirect to login.
    const isWrite = WRITE_GATED_EXACT.has(path) || path.startsWith("/profile/");
    if (isWrite) {
      const url = req.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
    return res;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("signup_status")
    .eq("id", user.id)
    .maybeSingle();

  const status = profile?.signup_status ?? "pending_proof";
  if (status === "approved") return res;

  // Non-approved: read-only routes are allowed; write routes bounce to status page.
  const target = statusToPath(status);
  if (!target) return res;

  const isReadOnly = READ_ONLY_OK_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
  if (isReadOnly) return res;

  // Anything else → redirect to status page.
  const url = req.nextUrl.clone();
  url.pathname = target;
  return NextResponse.redirect(url);
}

export const config = {
  // Run on app routes; skip static asset paths (images/fonts/etc).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?)$).*)",
  ],
};
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: pass. If `@supabase/ssr` types missing, confirm dependency is installed via `Read vet-exam-ai/package.json` — the project already uses it (see `lib/supabase/server.ts`).

- [ ] **Step 4: Commit**

```bash
git add vet-exam-ai/middleware.ts
git commit -m "signup-gating: middleware redirects non-approved users to status pages"
```

---

## Task 11: Admin queue — search params, filters, page shell

**Files:**
- Create: `vet-exam-ai/app/admin/signup-applications/_lib/parse-search-params.ts`
- Create: `vet-exam-ai/app/admin/signup-applications/_lib/format-application.ts`
- Create: `vet-exam-ai/app/admin/signup-applications/_components/queue-filters.tsx`
- Create: `vet-exam-ai/app/admin/signup-applications/_components/queue-pager.tsx`
- Create: `vet-exam-ai/app/admin/signup-applications/page.tsx`

- [ ] **Step 1: parse-search-params.ts**

```ts
import type { Database } from "../../../../lib/supabase/types";

export type SignupStatus = Database["public"]["Enums"]["signup_status"];

export type SignupAppsSearchParams = {
  status: SignupStatus;
  page:   number;
};

const VALID_STATUS: SignupStatus[] = [
  "pending_review",
  "pending_proof",
  "approved",
  "rejected",
];

export function parseSignupAppsSearchParams(
  raw: Record<string, string | string[] | undefined> | undefined,
): SignupAppsSearchParams {
  const statusRaw = single(raw?.status);
  const status = (VALID_STATUS as string[]).includes(statusRaw ?? "")
    ? (statusRaw as SignupStatus)
    : "pending_review";

  const pageRaw = Number(single(raw?.page) ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  return { status, page };
}

function single(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
```

- [ ] **Step 2: format-application.ts**

```ts
import type { Database } from "../../../../lib/supabase/types";

export type SignupStatus = Database["public"]["Enums"]["signup_status"];

export const STATUS_LABEL: Record<SignupStatus, string> = {
  pending_proof:  "증빙 미제출",
  pending_review: "검토 대기",
  approved:       "승인 완료",
  rejected:       "거부됨",
};

export function formatRound(round: number): string {
  return `${round}회`;
}

export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
```

- [ ] **Step 3: queue-filters.tsx**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { SignupStatus } from "../_lib/parse-search-params";
import { STATUS_LABEL } from "../_lib/format-application";

const TABS: SignupStatus[] = ["pending_review", "pending_proof", "rejected", "approved"];

export function QueueFilters({ active }: { active: SignupStatus }) {
  const router = useRouter();
  const sp = useSearchParams();

  function go(next: SignupStatus) {
    const u = new URLSearchParams(sp.toString());
    u.set("status", next);
    u.delete("page");
    router.push(`/admin/signup-applications?${u.toString()}`);
  }

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      {TABS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => go(s)}
          className={s === active ? "kvle-btn-primary" : "kvle-btn-secondary"}
          style={{ minHeight: 36, padding: "0 14px", fontSize: 13 }}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: queue-pager.tsx**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Props = { page: number; totalPages: number };

export function QueuePager({ page, totalPages }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function go(p: number) {
    if (p < 1 || p > totalPages) return;
    const u = new URLSearchParams(sp.toString());
    u.set("page", String(p));
    router.push(`/admin/signup-applications?${u.toString()}`);
  }

  if (totalPages <= 1) return null;

  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16, alignItems: "center" }}>
      <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} className="kvle-btn-secondary">
        이전
      </button>
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
        {page} / {totalPages}
      </span>
      <button type="button" onClick={() => go(page + 1)} disabled={page >= totalPages} className="kvle-btn-secondary">
        다음
      </button>
    </div>
  );
}
```

- [ ] **Step 5: page.tsx (shell, calls list_signup_applications)**

The QueueTable + Drawer come in Task 12; for now wire the shell to render a placeholder note so the page compiles.

```tsx
import { requireAdmin } from "../../../lib/admin/guards";
import { createClient } from "../../../lib/supabase/server";
import { parseSignupAppsSearchParams } from "./_lib/parse-search-params";
import { QueueFilters } from "./_components/queue-filters";
import { QueuePager } from "./_components/queue-pager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParamsInput = Record<string, string | string[] | undefined> | undefined;

export default async function SignupApplicationsPage(
  { searchParams }: { searchParams: Promise<SearchParamsInput> },
) {
  await requireAdmin();
  const sp = parseSignupAppsSearchParams(await searchParams);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_signup_applications", {
    p_status:    sp.status,
    p_page:      sp.page,
    p_page_size: PAGE_SIZE,
  });

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>가입 신청</h1>
        <div style={{ color: "var(--wrong)" }}>큐 로딩 실패: {error.message}</div>
      </main>
    );
  }

  const rows = data ?? [];
  const totalCount = Number(rows[0]?.total_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, fontFamily: "var(--font-serif)" }}>
        가입 신청
      </h1>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>총 {totalCount}건</div>
      <QueueFilters active={sp.status} />

      {/* Queue table + drawer wired in Task 12 */}
      <pre style={{ fontSize: 11, color: "var(--text-faint)" }}>
        {JSON.stringify(rows.map((r) => ({ user_id: r.user_id, status: r.status })), null, 2)}
      </pre>

      <QueuePager page={sp.page} totalPages={totalPages} />
    </main>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add vet-exam-ai/app/admin/signup-applications
git commit -m "signup-gating: admin queue shell + filters + pager (table TBD)"
```

---

## Task 12: Admin queue — table, drawer, approve/reject forms, actions

**Files:**
- Create: `vet-exam-ai/app/admin/signup-applications/_actions.ts`
- Create: `vet-exam-ai/app/admin/signup-applications/_components/approve-form.tsx`
- Create: `vet-exam-ai/app/admin/signup-applications/_components/reject-form.tsx`
- Create: `vet-exam-ai/app/admin/signup-applications/_components/application-detail-drawer.tsx`
- Create: `vet-exam-ai/app/admin/signup-applications/_components/queue-table.tsx`
- Modify: `vet-exam-ai/app/admin/signup-applications/page.tsx` (replace pre block with QueueTable)

- [ ] **Step 1: _actions.ts**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import { signedProofUrl } from "../../../lib/storage/signup-proofs";

export type AdminActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function approveSignupAction(userId: string, note: string | null): Promise<AdminActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_signup_application", {
    p_user_id: userId,
    p_note:    note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/signup-applications");
  return { ok: true };
}

export async function rejectSignupAction(userId: string, reason: string): Promise<AdminActionResult> {
  if (!reason || reason.trim().length < 3 || reason.length > 500) {
    return { ok: false, error: "거부 사유는 3~500자로 입력해 주세요." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_signup_application", {
    p_user_id: userId,
    p_reason:  reason.trim(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/signup-applications");
  return { ok: true };
}

export async function getProofImageUrlAction(path: string): Promise<{ url: string | null }> {
  const supabase = await createClient();
  const url = await signedProofUrl(supabase, path);
  return { url };
}
```

- [ ] **Step 2: approve-form.tsx**

```tsx
"use client";

import { useState, useTransition } from "react";
import { approveSignupAction } from "../_actions";

export function ApproveForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await approveSignupAction(userId, note.trim() || null);
      if (!r.ok) setError(r.error);
      else { onDone(); }
    });
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className="kvle-label">메모 (선택)</label>
      <input
        className="kvle-input"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="감사 로그에 남는 운영자 메모"
      />
      {error && <div style={{ color: "var(--wrong)", fontSize: 12 }}>{error}</div>}
      <button type="submit" disabled={pending} className="kvle-btn-primary">
        {pending ? "처리 중…" : "승인"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: reject-form.tsx**

```tsx
"use client";

import { useState, useTransition } from "react";
import { rejectSignupAction } from "../_actions";

export function RejectForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError("거부 사유는 3자 이상 입력해 주세요.");
      return;
    }
    startTransition(async () => {
      const r = await rejectSignupAction(userId, reason);
      if (!r.ok) setError(r.error);
      else { onDone(); }
    });
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className="kvle-label">거부 사유 *</label>
      <textarea
        className="kvle-input"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        maxLength={500}
        required
        placeholder="유저에게 알림으로 전달됩니다."
      />
      {error && <div style={{ color: "var(--wrong)", fontSize: 12 }}>{error}</div>}
      <button type="submit" disabled={pending} className="kvle-btn-secondary" style={{ background: "var(--wrong-dim)", color: "var(--wrong)" }}>
        {pending ? "처리 중…" : "거부"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: application-detail-drawer.tsx**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Database } from "../../../../lib/supabase/types";
import { getProofImageUrlAction } from "../_actions";
import { ApproveForm } from "./approve-form";
import { RejectForm } from "./reject-form";
import { shortDate } from "../_lib/format-application";

type Row = {
  user_id:            string;
  email:              string | null;
  nickname:           string | null;
  status:             Database["public"]["Enums"]["signup_status"];
  university:         string;
  target_round:       number;
  real_name:          string | null;
  student_number:     string | null;
  free_note:          string | null;
  proof_kind:         Database["public"]["Enums"]["signup_proof_kind"];
  proof_storage_path: string | null;
  proof_text:         string | null;
  submitted_at:       string;
  rejection_count:    number;
};

export function ApplicationDetailDrawer({
  row,
  onClose,
}: {
  row: Row | null;
  onClose: () => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setImageUrl(null);
    if (row?.proof_kind === "image" && row.proof_storage_path) {
      getProofImageUrlAction(row.proof_storage_path).then((r) => {
        if (!cancelled) setImageUrl(r.url);
      });
    }
    return () => { cancelled = true; };
  }, [row?.proof_storage_path, row?.proof_kind]);

  if (!row) return null;

  return (
    <div
      role="dialog"
      style={{
        position: "fixed",
        top: 0, right: 0, bottom: 0,
        width: "min(560px, 100vw)",
        background: "var(--surface)",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
        padding: 20,
        overflowY: "auto",
        zIndex: 60,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-serif)" }}>
          {row.nickname ?? "(닉네임 없음)"}
        </h2>
        <button type="button" onClick={onClose} className="kvle-btn-secondary">닫기</button>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 8, fontSize: 13, marginBottom: 16 }}>
        <dt style={{ color: "var(--text-muted)" }}>이메일</dt>
        <dd>{row.email ?? "—"}</dd>
        <dt style={{ color: "var(--text-muted)" }}>대학</dt>
        <dd>{row.university}</dd>
        <dt style={{ color: "var(--text-muted)" }}>목표 회차</dt>
        <dd>{row.target_round}회</dd>
        <dt style={{ color: "var(--text-muted)" }}>제출</dt>
        <dd>{shortDate(row.submitted_at)}</dd>
        <dt style={{ color: "var(--text-muted)" }}>실명</dt>
        <dd>{row.real_name ?? "—"}</dd>
        <dt style={{ color: "var(--text-muted)" }}>학번</dt>
        <dd>{row.student_number ?? "—"}</dd>
        <dt style={{ color: "var(--text-muted)" }}>거부 횟수</dt>
        <dd>{row.rejection_count}</dd>
      </dl>

      {row.free_note && (
        <div style={{ background: "var(--surface-raised)", padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>자유 메모</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{row.free_note}</div>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>증빙</div>
        {row.proof_kind === "image" ? (
          imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="증빙 이미지" style={{ width: "100%", borderRadius: 8 }} />
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>이미지 로딩 중…</div>
          )
        ) : (
          <div style={{ background: "var(--surface-raised)", padding: 12, borderRadius: 8, fontSize: 13, whiteSpace: "pre-wrap" }}>
            {row.proof_text ?? "—"}
          </div>
        )}
      </div>

      {row.status === "pending_review" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ApproveForm userId={row.user_id} onDone={onClose} />
          <RejectForm  userId={row.user_id} onDone={onClose} />
        </div>
      )}

      {row.status === "approved" && (
        <div style={{ fontSize: 12, color: "var(--correct)", marginTop: 8 }}>이미 승인된 신청입니다.</div>
      )}
      {row.status === "rejected" && (
        <div style={{ fontSize: 12, color: "var(--wrong)", marginTop: 8 }}>거부된 신청입니다.</div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: queue-table.tsx**

```tsx
"use client";

import { useState } from "react";
import type { Database } from "../../../../lib/supabase/types";
import { ApplicationDetailDrawer } from "./application-detail-drawer";
import { STATUS_LABEL, shortDate } from "../_lib/format-application";

type Row = {
  user_id:            string;
  email:              string | null;
  nickname:           string | null;
  status:             Database["public"]["Enums"]["signup_status"];
  university:         string;
  target_round:       number;
  real_name:          string | null;
  student_number:     string | null;
  free_note:          string | null;
  proof_kind:         Database["public"]["Enums"]["signup_proof_kind"];
  proof_storage_path: string | null;
  proof_text:         string | null;
  submitted_at:       string;
  rejection_count:    number;
};

export function QueueTable({ rows }: { rows: Row[] }) {
  const [selected, setSelected] = useState<Row | null>(null);

  if (rows.length === 0) {
    return <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 13 }}>비어 있어요.</div>;
  }

  return (
    <>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th style={th}>닉네임</th>
            <th style={th}>이메일</th>
            <th style={th}>대학</th>
            <th style={th}>회차</th>
            <th style={th}>증빙</th>
            <th style={th}>제출</th>
            <th style={th}>상태</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id} style={{ borderBottom: "1px solid var(--border-faint)" }}>
              <td style={td}>{r.nickname ?? "—"}</td>
              <td style={td}>{r.email ?? "—"}</td>
              <td style={td}>{r.university}</td>
              <td style={td}>{r.target_round}</td>
              <td style={td}>{r.proof_kind === "image" ? "이미지" : "텍스트"}</td>
              <td style={td}>{shortDate(r.submitted_at)}</td>
              <td style={td}>{STATUS_LABEL[r.status]}{r.rejection_count > 0 ? ` (×${r.rejection_count})` : ""}</td>
              <td style={td}>
                <button type="button" onClick={() => setSelected(r)} className="kvle-btn-secondary">
                  상세
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ApplicationDetailDrawer row={selected} onClose={() => setSelected(null)} />
    </>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 6px", fontWeight: 600, color: "var(--text-muted)" };
const td: React.CSSProperties = { padding: "8px 6px", verticalAlign: "middle" };
```

- [ ] **Step 6: Wire QueueTable into page.tsx**

In `vet-exam-ai/app/admin/signup-applications/page.tsx` replace the `<pre>...</pre>` placeholder with:

```tsx
import { QueueTable } from "./_components/queue-table";
// ... (other imports stay)

// inside the JSX, replace:
//   <pre style={{ fontSize: 11, color: "var(--text-faint)" }}>...</pre>
// with:
<QueueTable rows={rows} />
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add vet-exam-ai/app/admin/signup-applications
git commit -m "signup-gating: admin queue table + drawer + approve/reject forms"
```

---

## Task 13: AdminSidebar link + dashboard pending count

**Files:**
- Modify: `vet-exam-ai/app/admin/_components/admin-nav-items.ts`
- Modify: `vet-exam-ai/app/admin/page.tsx`

- [ ] **Step 1: Read current admin-nav-items.ts**

Run: `Read vet-exam-ai/app/admin/_components/admin-nav-items.ts`

Confirm the `ADMIN_NAV_ITEMS` array shape (label, href, icon, optional disabled).

- [ ] **Step 2: Add "가입 신청" item**

Insert immediately after the "회원" item:

```ts
{ label: "가입 신청", href: "/admin/signup-applications", icon: ShieldCheck },
```

Add `ShieldCheck` to the `lucide-react` import at the top.

- [ ] **Step 3: Read admin/page.tsx and find the dashboard widget area**

Run: `Read vet-exam-ai/app/admin/page.tsx`

Identify where existing count widgets render (e.g., pending reports, pending corrections — these already exist from PR #33/#34).

- [ ] **Step 4: Add a pending-applications count card**

Add a Supabase fetch:

```ts
const { count: pendingSignupCount } = await supabase
  .from("signup_applications")
  .select("*", { count: "exact", head: true })
  .eq("status", "pending_review");
```

Render alongside other count cards (mirror the existing card markup in the file — keep visual consistency):

```tsx
<a
  href="/admin/signup-applications"
  style={{ /* match other dashboard cards */ }}
>
  <div>가입 신청 검토</div>
  <div>{pendingSignupCount ?? 0}건</div>
</a>
```

If admin/page.tsx is using a server component pattern with sub-components, write the count read at the top and pass the value down. **Do not duplicate fetches across cards** — if there is already a `Promise.all` for counts, add this one to it.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add vet-exam-ai/app/admin/_components/admin-nav-items.ts vet-exam-ai/app/admin/page.tsx
git commit -m "signup-gating: admin sidebar entry + dashboard pending count"
```

---

## Task 14: Final manual smoke test + push + PR

This task is **operator-driven**. Subagent should produce instructions only.

- [ ] **Step 1: Operator creates a fresh test account**

Instructions for operator:
1. Open the app in a private/incognito window
2. Sign up with a throwaway email, e.g., `signup-gating-test+1@example.com`
3. Click confirmation link in email → land on `/auth/callback` → should auto-redirect to `/auth/pending-proof`

- [ ] **Step 2: Operator submits a TEXT proof**

1. Choose "텍스트로 신고" tab, fill university (e.g., "테스트대학교"), round (e.g., 70), and write a short text proof
2. Submit → land on `/auth/pending-review`

- [ ] **Step 3: Operator verifies admin queue**

1. In another window, signed in as admin: open `/admin/signup-applications`
2. Confirm the new application appears with status "검토 대기"
3. Click "상세" to open drawer
4. Verify text proof renders + admin-only fields (real_name etc.) blank if unfilled

- [ ] **Step 4: Operator rejects, then verifies user-side notification**

1. In drawer: enter a reason "테스트 거부 사유" and click 거부
2. Switch to test-account window
3. Reload — should redirect to `/auth/rejected` with banner showing "지난 신청이 거부되었어요 (총 1회)" + reason
4. Notification bell should show 1 unread "가입이 거부되었어요: 테스트 거부 사유"

- [ ] **Step 5: Operator resubmits, this time with IMAGE**

1. From `/auth/rejected` page, choose "학생증/수험표 이미지" tab and upload any test image (`.png`)
2. Submit → land on `/auth/pending-review`
3. Verify Storage bucket `signup-proofs` in Supabase Dashboard now has a new object under `{user_id}/...`

- [ ] **Step 6: Operator approves**

1. Admin window: refresh `/admin/signup-applications`, click 상세 on the resubmitted row, verify image renders inline (signed URL works)
2. Click 승인 (note optional)
3. Verify in Storage Dashboard: the object under `{user_id}/...` is gone
4. Test-account window: refresh — should land on `/dashboard`. Bell shows "가입이 승인되었어요 🎉"

- [ ] **Step 7: Operator verifies write-gate enforcement**

Negative test: create another test account, get to `/auth/pending-proof`, but **do not submit**. Then try to navigate to `/profile/me/edit` — should redirect to `/auth/pending-proof`. Try to POST a comment via existing UI on `/questions/<some>` — should fail with RLS error (verify in Network tab).

- [ ] **Step 8: Operator verifies grandfather**

Sign in as the operator's existing admin account → confirm normal access (no redirect). Try posting a test comment on any question — should succeed.

- [ ] **Step 9: Push branch + open PR**

```bash
git push -u origin feat/signup-gating
```

PR title: `feat: Action 2 가입 차단 강화 (signup gating)`

PR body:
```
Spec: vet-exam-ai/docs/superpowers/specs/2026-05-08-action2-signup-gating-design.md

## 요약
- 신규 가입자: 메일 인증 후 학생 인증(이미지/텍스트) 운영자 검수 필요
- 기존 유저: 자동 grandfather (전원 approved)
- pending 유저: 읽기 OK, 쓰기/투표/신고/프로필 편집 차단
- 거부 시 사유 + 인앱 알림, 무제한 재신청
- 학생증 이미지: 승인 즉시 삭제, 거부 30일 보관 후 cron 삭제

## 마이그레이션
SQL Editor 적용 완료 (`20260509000000_signup_gating.sql`).
Storage 버킷 `signup-proofs` private + cron `signup-proof-purge` 등록 확인.

## Test plan
- [x] 신규 가입 → 메일 인증 → /auth/pending-proof 도달
- [x] 텍스트 증빙 제출 → /auth/pending-review
- [x] admin 큐 노출, 거부 → 인앱 알림 + /auth/rejected
- [x] 이미지로 재제출 → 큐 재노출
- [x] 승인 → Storage 객체 삭제 + /dashboard 진입
- [x] pending 유저로 댓글 POST 시도 → RLS 거부
- [x] 기존 admin 계정 정상 동작

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 10: Update memories after merge**

After PR merge:
- Add `project_signup_gating_done.md` (Project type) summarizing PR + traps encountered
- Update `MEMORY.md` index
- Update `session_2026_05_08_summary.md` next-action pointer or write `session_2026_05_09_summary.md`

---

## Self-Review

**Spec coverage check:**
- [x] enum + profiles column + grandfather backfill → Task 1 §2
- [x] signup_applications table → Task 1 §3
- [x] my_signup_application view → Task 1 §4
- [x] RLS policies → Task 1 §5, §7
- [x] signup_status_of helper → Task 1 §6
- [x] notification_type extension → Task 1 §8
- [x] 5 RPCs → Task 1 §9
- [x] Storage bucket + RLS → Task 1 §10
- [x] pg_cron 30-day purge → Task 1 §11
- [x] Typed schema → Task 2
- [x] Server helpers (signup-status, signup-proofs) → Tasks 3, 4
- [x] SignupApplicationForm + action + 3 user-facing pages → Tasks 5, 6, 7, 8
- [x] Notification rendering → Task 9
- [x] Middleware gate → Task 10
- [x] Admin queue (full) → Tasks 11, 12
- [x] AdminSidebar link + dashboard widget → Task 13
- [x] End-to-end smoke + PR → Task 14

**Placeholder scan:** No "TBD" / "implement later" / abstract instructions. Each step has concrete code or shell commands.

**Type consistency:**
- `signup_status` enum spelled identically across SQL, types.ts, helpers
- `signup_proof_kind` enum spelled identically
- RPC arg names match between SQL DDL and TS function signatures (`p_university`, `p_target_round`, `p_proof_kind`, etc.)
- `signup_applications` columns match between SQL and TS Row type
- `STATUS_LABEL` keys cover all 4 enum values

**Known small risks (handled in plan):**
- RLS policy names verified against actual production migrations on 2026-05-08:
  - `comments: authenticated insert own` (legacy `supabase/migrations/20260425000001_community_comments.sql`)
  - `comment_votes: owner insert` (same file)
  - `comment_reports: authenticated insert` (same file)
  - `comment_pins_insert_own` (`vet-exam-ai/supabase/migrations/20260428000001_comment_pins.sql`)
  - `user_profiles_public: owner update` (`supabase/migrations/20260425000000_community_profiles_and_badges.sql`)
  Column names: `user_id` everywhere except `comment_reports.reporter_id`.
- Middleware: `signup_status` lookup runs on every request → RLS-readable directly via `profiles` (admin users grandfathered to approved already, no new policy needed). Caching not strictly necessary at our scale; revisit if it becomes a hot path.
- pg_cron job: idempotent `cron.schedule` may not exist on all envs; the `pg_extension` guard handles that.

---

## Execution

**Plan complete and saved to** `vet-exam-ai/docs/superpowers/plans/2026-05-08-action2-signup-gating.md`.

Ready for subagent-driven execution (recommended) or inline. Operator must run Task 1 §4 (SQL Editor apply) and all of Task 14 themselves.
