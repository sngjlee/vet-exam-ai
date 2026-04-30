-- =============================================================================
-- Image triage queue — admin 5-action workflow for has_image questions
-- =============================================================================
-- Adds:
--   1. image_triage_status enum (pending / activate_no_image / needs_rewrite /
--      needs_rebuild / needs_license / remove)
--   2. audit_action enum extension (image_triage_decide, image_triage_revert)
--   3. question_image_triage table (1:1 with questions, admin-only RLS)
--   4. questions.question_image_files / explanation_image_files (text[])
--   5. Storage bucket question-images-private (admin signed URL only)
--   6. RPCs: triage_question_decide, triage_questions_bulk_activate,
--            triage_question_revert (all SECURITY DEFINER + admin guard)
-- =============================================================================

-- 1. enum 신설
do $$ begin
  if not exists (select 1 from pg_type where typname = 'image_triage_status') then
    create type public.image_triage_status as enum (
      'pending',
      'activate_no_image',
      'needs_rewrite',
      'needs_rebuild',
      'needs_license',
      'remove'
    );
  end if;
end $$;

-- 2. audit_action 확장
alter type public.audit_action add value if not exists 'image_triage_decide';
alter type public.audit_action add value if not exists 'image_triage_revert';

-- 3. 분류 상태 테이블
create table if not exists public.question_image_triage (
  question_id  uuid primary key references public.questions(id) on delete cascade,
  status       public.image_triage_status not null,
  note         text,
  decided_by   uuid not null references auth.users(id),
  decided_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists question_image_triage_status_idx
  on public.question_image_triage(status);

create index if not exists question_image_triage_decided_at_idx
  on public.question_image_triage(decided_at desc);

-- updated_at 트리거 (set_updated_at은 기존 community 마이그에서 정의됨)
drop trigger if exists question_image_triage_set_updated_at on public.question_image_triage;
create trigger question_image_triage_set_updated_at
  before update on public.question_image_triage
  for each row execute function public.set_updated_at();

-- 4. RLS — admin only
alter table public.question_image_triage enable row level security;

drop policy if exists "admin read triage" on public.question_image_triage;
create policy "admin read triage" on public.question_image_triage
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'admin' and p.is_active
  ));

drop policy if exists "admin write triage" on public.question_image_triage;
create policy "admin write triage" on public.question_image_triage
  for all to authenticated
  using (exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'admin' and p.is_active
  ))
  with check (exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'admin' and p.is_active
  ));

-- 5. 이미지 파일명 컬럼 (questions)
alter table public.questions
  add column if not exists question_image_files    text[] not null default '{}',
  add column if not exists explanation_image_files text[] not null default '{}';

-- 6. Storage 버킷 (private)
insert into storage.buckets (id, name, public)
values ('question-images-private', 'question-images-private', false)
on conflict (id) do nothing;

drop policy if exists "admin signed url access" on storage.objects;
create policy "admin signed url access" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'question-images-private'
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'admin' and p.is_active
    )
  );

-- =============================================================================
-- RPC 1: 단건 분류 (upsert + activate_no_image면 is_active=true 동시 flip)
-- =============================================================================
create or replace function public.triage_question_decide(
  p_question_id uuid,
  p_status      public.image_triage_status,
  p_note        text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id   uuid := auth.uid();
  v_old_status public.image_triage_status;
begin
  if not exists (
    select 1 from profiles
     where id = v_admin_id and role = 'admin' and is_active
  ) then
    raise exception 'forbidden: admin only';
  end if;

  select status into v_old_status
    from question_image_triage where question_id = p_question_id;

  insert into question_image_triage (question_id, status, note, decided_by)
  values (p_question_id, p_status, p_note, v_admin_id)
  on conflict (question_id) do update
    set status     = excluded.status,
        note       = excluded.note,
        decided_by = excluded.decided_by,
        decided_at = now(),
        updated_at = now();

  if p_status = 'activate_no_image' then
    update questions set is_active = true where id = p_question_id;
  end if;

  perform log_admin_action(
    'image_triage_decide'::audit_action,
    'question',
    p_question_id::text,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_status, 'note', p_note),
    null
  );
end $$;

revoke all on function public.triage_question_decide(uuid, public.image_triage_status, text) from public;
grant execute on function public.triage_question_decide(uuid, public.image_triage_status, text) to authenticated;

-- =============================================================================
-- RPC 2: 일괄 활성화 (activate_no_image 전용, 단일 트랜잭션)
-- =============================================================================
create or replace function public.triage_questions_bulk_activate(
  p_ids  uuid[],
  p_note text default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_count    int;
begin
  if not exists (
    select 1 from profiles
     where id = v_admin_id and role = 'admin' and is_active
  ) then
    raise exception 'forbidden: admin only';
  end if;

  insert into question_image_triage (question_id, status, note, decided_by)
  select unnest(p_ids), 'activate_no_image', p_note, v_admin_id
  on conflict (question_id) do update
    set status     = 'activate_no_image',
        note       = excluded.note,
        decided_by = excluded.decided_by,
        decided_at = now(),
        updated_at = now();

  update questions set is_active = true where id = any(p_ids);
  get diagnostics v_count = row_count;

  perform log_admin_action(
    'image_triage_decide'::audit_action,
    'question_batch',
    'bulk-' || extract(epoch from now())::text,
    null,
    jsonb_build_object('count', v_count, 'ids', to_jsonb(p_ids), 'note', p_note),
    null
  );
  return v_count;
end $$;

revoke all on function public.triage_questions_bulk_activate(uuid[], text) from public;
grant execute on function public.triage_questions_bulk_activate(uuid[], text) to authenticated;

-- =============================================================================
-- RPC 3: 되돌리기 (triage row 삭제 + is_active 원본 정책으로 원복)
-- =============================================================================
create or replace function public.triage_question_revert(
  p_question_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_old      record;
begin
  if not exists (
    select 1 from profiles
     where id = v_admin_id and role = 'admin' and is_active
  ) then
    raise exception 'forbidden: admin only';
  end if;

  select * into v_old from question_image_triage where question_id = p_question_id;
  if not found then return; end if;

  delete from question_image_triage where question_id = p_question_id;

  -- pipeline 원본 정책 (`upload.py:67`): has_image면 is_active=false
  update questions
     set is_active = not ('has_image' = any(tags))
   where id = p_question_id;

  perform log_admin_action(
    'image_triage_revert'::audit_action,
    'question',
    p_question_id::text,
    jsonb_build_object('status', v_old.status, 'note', v_old.note),
    null,
    null
  );
end $$;

revoke all on function public.triage_question_revert(uuid) from public;
grant execute on function public.triage_question_revert(uuid) to authenticated;
