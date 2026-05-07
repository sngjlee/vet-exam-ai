-- =============================================================================
-- Image replacement — admin uploads legal replacement, swaps DB pointer,
-- preserves original in private bucket. User-facing public bucket.
-- =============================================================================

-- 1. enum 확장
alter type public.image_triage_status add value if not exists 'activate_with_replacement';

-- 2. 원본 백업 컬럼 (revert용)
alter table public.questions
  add column if not exists question_image_files_original    text[],
  add column if not exists explanation_image_files_original text[];

-- 3. 신규 public Storage 버킷
insert into storage.buckets (id, name, public)
values ('question-images-public', 'question-images-public', true)
on conflict (id) do nothing;

-- 4. RLS — public read만. write/update/delete는 service_role bypass
drop policy if exists "public read replacement" on storage.objects;
create policy "public read replacement" on storage.objects
  for select to public
  using (bucket_id = 'question-images-public');

-- =============================================================================
-- RPC: 교체 + 활성화 (단일 트랜잭션)
-- =============================================================================
create or replace function public.triage_question_replace_and_activate(
  p_question_id        text,
  p_question_files     text[],
  p_explanation_files  text[],
  p_note               text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id         uuid := auth.uid();
  v_q_count_existing int;
  v_e_count_existing int;
  v_q_count_new      int;
  v_e_count_new      int;
begin
  if not exists (
    select 1 from profiles
     where id = v_admin_id and role = 'admin' and is_active
  ) then
    raise exception 'forbidden: admin only';
  end if;

  select coalesce(array_length(question_image_files, 1), 0),
         coalesce(array_length(explanation_image_files, 1), 0)
    into v_q_count_existing, v_e_count_existing
    from questions where id = p_question_id;

  v_q_count_new := coalesce(array_length(p_question_files, 1), 0);
  v_e_count_new := coalesce(array_length(p_explanation_files, 1), 0);

  if v_q_count_new <> v_q_count_existing then
    raise exception 'replacement slot count mismatch (question): expected %, got %',
      v_q_count_existing, v_q_count_new;
  end if;
  if v_e_count_new <> v_e_count_existing then
    raise exception 'replacement slot count mismatch (explanation): expected %, got %',
      v_e_count_existing, v_e_count_new;
  end if;

  update questions
     set question_image_files_original    = coalesce(question_image_files_original,    question_image_files),
         explanation_image_files_original = coalesce(explanation_image_files_original, explanation_image_files),
         question_image_files             = coalesce(p_question_files,    '{}'),
         explanation_image_files          = coalesce(p_explanation_files, '{}'),
         is_active                        = true
   where id = p_question_id;

  insert into question_image_triage (question_id, status, note, decided_by)
  values (p_question_id, 'activate_with_replacement', p_note, v_admin_id)
  on conflict (question_id) do update
    set status     = 'activate_with_replacement',
        note       = excluded.note,
        decided_by = excluded.decided_by,
        decided_at = now(),
        updated_at = now();

  perform log_admin_action(
    'image_triage_decide'::audit_action,
    'question',
    p_question_id,
    null,
    jsonb_build_object(
      'status',  'activate_with_replacement',
      'q_files', p_question_files,
      'e_files', p_explanation_files,
      'note',    p_note
    ),
    null
  );
end $$;

revoke all on function public.triage_question_replace_and_activate(text, text[], text[], text) from public;
grant execute on function public.triage_question_replace_and_activate(text, text[], text[], text) to authenticated;

-- =============================================================================
-- RPC: revert 교체 — `_original` 우선 복원, 없으면 기존 로직 (이미지 큐 1차 호환)
-- =============================================================================
create or replace function public.triage_question_revert(
  p_question_id text
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

  -- _original 백업이 있으면 거기서 복원, 없으면 기존 has_image 정책
  update questions
     set question_image_files    = coalesce(question_image_files_original,    question_image_files),
         explanation_image_files = coalesce(explanation_image_files_original, explanation_image_files),
         question_image_files_original    = null,
         explanation_image_files_original = null,
         is_active                        = not ('has_image' = any(tags))
   where id = p_question_id;

  perform log_admin_action(
    'image_triage_revert'::audit_action,
    'question',
    p_question_id,
    jsonb_build_object('status', v_old.status, 'note', v_old.note),
    null,
    null
  );
end $$;

revoke all on function public.triage_question_revert(text) from public;
grant execute on function public.triage_question_revert(text) to authenticated;
