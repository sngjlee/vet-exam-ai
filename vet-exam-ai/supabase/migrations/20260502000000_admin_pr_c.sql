-- =============================================================================
-- M3 §18 admin PR-C: reports + corrections queues
-- =============================================================================
-- 0. extend notification_type enum: correction_resolved
-- 1. resolve_comment_report  RPC (security definer + admin gate)
-- 2. resolve_question_correction RPC (security definer + admin gate)
-- =============================================================================

-- 0. notification_type enum 확장 (correction 결과 알림)
alter type public.notification_type add value if not exists 'correction_resolved';

-- 1. resolve_comment_report RPC
create or replace function public.resolve_comment_report(
  p_comment_id uuid,
  p_resolution text,            -- 'upheld' | 'dismissed'
  p_note       text default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id      uuid;
  v_target_status public.report_status;
  v_audit_action  public.audit_action;
  v_owner_id      uuid;
  v_curr_status   public.comment_status;
  v_affected      int;
  v_reporter_ids  uuid[];
begin
  v_admin_id := auth.uid();
  if v_admin_id is null
     or not exists (
       select 1 from public.profiles
       where id = v_admin_id and role = 'admin' and is_active
     ) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_resolution = 'upheld' then
    v_target_status := 'upheld';
    v_audit_action  := 'report_uphold';
  elsif p_resolution = 'dismissed' then
    v_target_status := 'dismissed';
    v_audit_action  := 'report_dismiss';
  else
    raise exception 'invalid resolution' using errcode = '22023';
  end if;

  select user_id, status into v_owner_id, v_curr_status
    from public.comments where id = p_comment_id;
  if v_owner_id is null then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;

  -- 그룹 단위로 pending/reviewing 신고 일괄 갱신, reporter_ids 회수
  with updated as (
    update public.comment_reports
       set status          = v_target_status,
           resolved_by     = v_admin_id,
           resolved_at     = now(),
           resolution_note = p_note
     where comment_id = p_comment_id
       and status in ('pending', 'reviewing')
    returning reporter_id
  )
  select count(*)::int,
         array_agg(distinct reporter_id) filter (where reporter_id is not null)
    into v_affected, v_reporter_ids
    from updated;

  if coalesce(v_affected, 0) = 0 then
    return 0;     -- 다른 운영자가 이미 처리. 멱등 종료.
  end if;

  -- 댓글 status 분기 (Q9-B)
  if p_resolution = 'upheld' then
    update public.comments
       set status     = 'removed_by_admin',
           updated_at = now()
     where id = p_comment_id
       and status <> 'removed_by_admin';
  else  -- dismissed: blinded_by_report만 visible로 복원
    update public.comments
       set status     = 'visible',
           updated_at = now()
     where id = p_comment_id
       and status = 'blinded_by_report';
  end if;

  -- reporter들에게 알림
  if v_reporter_ids is not null then
    insert into public.notifications (user_id, type, related_comment_id, payload, actor_id)
    select rid,
           'report_resolved',
           p_comment_id,
           jsonb_build_object(
             'resolution', p_resolution,
             'note',       coalesce(p_note, '')
           ),
           v_admin_id
      from unnest(v_reporter_ids) rid;
  end if;

  -- audit (그룹 단위 단일 행)
  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, before_state, after_state, note)
  values
    (v_admin_id, v_audit_action, 'comment', p_comment_id::text,
     jsonb_build_object('comment_status',  v_curr_status,
                       'reports_affected', v_affected),
     jsonb_build_object('comment_status_after',
       case when p_resolution = 'upheld' then 'removed_by_admin'::text
            when v_curr_status = 'blinded_by_report' then 'visible'::text
            else v_curr_status::text end),
     p_note);

  return v_affected;
end;
$$;

revoke execute on function public.resolve_comment_report(uuid, text, text) from public, anon;
grant  execute on function public.resolve_comment_report(uuid, text, text) to authenticated;

-- 2. resolve_question_correction RPC (수동 적용 모델 — 상태만 변경)
create or replace function public.resolve_question_correction(
  p_correction_id uuid,
  p_resolution    text,            -- 'accepted' | 'rejected'
  p_note          text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id      uuid;
  v_target_status public.correction_status;
  v_audit_action  public.audit_action;
  v_proposer_id   uuid;
  v_question_id   uuid;
  v_curr_status   public.correction_status;
begin
  v_admin_id := auth.uid();
  if v_admin_id is null
     or not exists (
       select 1 from public.profiles
       where id = v_admin_id and role = 'admin' and is_active
     ) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_resolution = 'accepted' then
    v_target_status := 'accepted';
    v_audit_action  := 'correction_accept';
  elsif p_resolution = 'rejected' then
    v_target_status := 'rejected';
    v_audit_action  := 'correction_reject';
  else
    raise exception 'invalid resolution' using errcode = '22023';
  end if;

  select proposed_by, question_id, status
    into v_proposer_id, v_question_id, v_curr_status
    from public.question_corrections where id = p_correction_id;

  if v_question_id is null then
    raise exception 'correction not found' using errcode = 'P0002';
  end if;

  if v_curr_status not in ('proposed', 'reviewing') then
    return false;     -- 이미 처리됨. 멱등 종료.
  end if;

  update public.question_corrections
     set status          = v_target_status,
         resolved_by     = v_admin_id,
         resolved_at     = now(),
         resolution_note = p_note,
         updated_at      = now()
   where id = p_correction_id
     and status in ('proposed', 'reviewing');

  if v_proposer_id is not null then
    -- payload에 question public_id까지 미리 회수 → dropdown 클라에서 추가 lookup 0
    insert into public.notifications (user_id, type, payload, actor_id)
    select v_proposer_id,
           'correction_resolved',
           jsonb_build_object(
             'resolution',         p_resolution,
             'note',               coalesce(p_note, ''),
             'question_id',        v_question_id::text,
             'question_public_id', q.public_id
           ),
           v_admin_id
      from public.questions q
     where q.id = v_question_id;
  end if;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, before_state, after_state, note)
  values
    (v_admin_id, v_audit_action, 'correction', p_correction_id::text,
     jsonb_build_object('status', v_curr_status),
     jsonb_build_object('status', v_target_status),
     p_note);

  return true;
end;
$$;

revoke execute on function public.resolve_question_correction(uuid, text, text) from public, anon;
grant  execute on function public.resolve_question_correction(uuid, text, text) to authenticated;
