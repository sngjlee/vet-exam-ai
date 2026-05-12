-- =============================================================================
-- Hotfix — suggestion_board MVP 4종 RPC가 존재하지 않는 admin_audit_logs.payload
-- 컬럼에 insert 시도하던 버그 봉합 (실제 컬럼은 before_state/after_state/note).
-- 원본 migration 20260512000000은 이미 prod에 적용됐고 4 함수 바디만 잘못 들어가
-- 있으므로, 4 함수를 CREATE OR REPLACE 로 갱신한다. enum/테이블/RLS는 그대로.
-- =============================================================================

-- 8a. update_suggestion_state
create or replace function public.update_suggestion_state(
  p_post_id    uuid,
  p_new_status public.suggestion_status,
  p_note       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_old      public.suggestion_status;
  v_owner    uuid;
  v_title    text;
  v_kind     public.board_post_kind;
begin
  if v_admin_id is null
     or not exists (select 1 from public.profiles
                    where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  select suggestion_status, user_id, title, kind
    into v_old, v_owner, v_title, v_kind
    from public.board_posts where id = p_post_id;

  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  if v_kind <> 'suggestion' then
    raise exception 'kind is not suggestion' using errcode = '22023';
  end if;

  update public.board_posts
     set suggestion_status = p_new_status,
         resolution_note = coalesce(p_note, resolution_note)
   where id = p_post_id;

  if p_new_status = 'accepted' and v_owner is not null then
    insert into public.badges (user_id, badge_type, reason, awarded_by)
    values (v_owner, 'adopter', '건의 채택', v_admin_id)
    on conflict (user_id, badge_type) do nothing;
  end if;

  if v_owner is not null and v_owner <> v_admin_id then
    insert into public.notifications (user_id, type, actor_id, payload)
    values (
      v_owner,
      'suggestion_state_changed',
      v_admin_id,
      jsonb_build_object(
        'post_id', p_post_id::text,
        'post_title', v_title,
        'from_status', v_old::text,
        'to_status', p_new_status::text,
        'resolution_note', p_note
      )
    );
  end if;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, before_state, after_state, note)
  values (
    v_admin_id, 'board_post_state_change', 'board_post', p_post_id::text,
    jsonb_build_object('status', v_old::text),
    jsonb_build_object('status', p_new_status::text),
    p_note
  );
end;
$$;

-- 8b. set_announcement_pinned
create or replace function public.set_announcement_pinned(
  p_post_id uuid,
  p_pinned  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_kind     public.board_post_kind;
begin
  if v_admin_id is null
     or not exists (select 1 from public.profiles
                    where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  select kind into v_kind from public.board_posts where id = p_post_id;
  if v_kind is null then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  if v_kind <> 'announcement' then
    raise exception 'pinning only allowed for announcements' using errcode = '22023';
  end if;

  if p_pinned then
    update public.board_posts set is_pinned = false
      where kind = 'announcement' and is_pinned = true;
  end if;

  update public.board_posts set is_pinned = p_pinned where id = p_post_id;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, before_state, after_state, note)
  values (
    v_admin_id, 'announcement_pinned', 'board_post', p_post_id::text,
    null,
    jsonb_build_object('pinned', p_pinned),
    null
  );
end;
$$;

-- 8c. set_board_post_visibility
create or replace function public.set_board_post_visibility(
  p_post_id    uuid,
  p_visibility public.board_visibility,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_old      public.board_visibility;
  v_owner    uuid;
  v_kind     public.board_post_kind;
begin
  if v_admin_id is null
     or not exists (select 1 from public.profiles
                    where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  select visibility, user_id, kind into v_old, v_owner, v_kind
    from public.board_posts where id = p_post_id;
  if v_old is null then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  update public.board_posts
     set visibility = p_visibility,
         blinded_until = case
           when p_visibility = 'blinded_by_report' then now() + interval '30 days'
           when p_visibility = 'visible' then null
           else blinded_until
         end
   where id = p_post_id;

  if p_visibility = 'blinded_by_report' and v_old <> 'blinded_by_report'
     and v_owner is not null then
    insert into public.notifications (user_id, type, payload)
    values (
      v_owner,
      'post_blinded',
      jsonb_build_object(
        'post_id', p_post_id::text,
        'post_kind', v_kind::text,
        'reason', coalesce(p_reason, 'admin')
      )
    );
  end if;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, before_state, after_state, note)
  values (
    v_admin_id, 'board_post_visibility_change', 'board_post', p_post_id::text,
    jsonb_build_object('visibility', v_old::text),
    jsonb_build_object('visibility', p_visibility::text),
    p_reason
  );
end;
$$;

-- 8d. set_board_post_comment_visibility
create or replace function public.set_board_post_comment_visibility(
  p_comment_id uuid,
  p_status     public.comment_status,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_old      public.comment_status;
begin
  if v_admin_id is null
     or not exists (select 1 from public.profiles
                    where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  select status into v_old from public.board_post_comments where id = p_comment_id;
  if v_old is null then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;

  update public.board_post_comments
     set status = p_status,
         blinded_until = case
           when p_status = 'blinded_by_report' then now() + interval '30 days'
           when p_status = 'visible' then null
           else blinded_until
         end
   where id = p_comment_id;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, before_state, after_state, note)
  values (
    v_admin_id, 'board_post_comment_visibility_change', 'board_post_comment',
    p_comment_id::text,
    jsonb_build_object('status', v_old::text),
    jsonb_build_object('status', p_status::text),
    p_reason
  );
end;
$$;
