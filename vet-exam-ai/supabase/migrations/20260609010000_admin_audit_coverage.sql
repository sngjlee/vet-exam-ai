-- =============================================================================
-- Admin audit coverage hardening
-- =============================================================================
-- Board report resolution RPCs used to mutate report rows without writing an
-- admin_audit_logs row. Re-create them with the same permissions and add an
-- audit row whenever the operation actually resolves at least one report.

create or replace function public.resolve_board_post_report(
  p_post_id    uuid,
  p_resolution text,        -- 'upheld' | 'dismissed'
  p_note       text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id      uuid := auth.uid();
  v_target_status public.report_status;
  v_audit_action  public.audit_action;
  v_affected      int;
  v_before_counts jsonb;
begin
  if v_admin_id is null
     or not exists (select 1 from public.profiles
                    where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_resolution = 'upheld' then
    v_target_status := 'upheld';
    v_audit_action := 'report_uphold';
  elsif p_resolution = 'dismissed' then
    v_target_status := 'dismissed';
    v_audit_action := 'report_dismiss';
  else
    raise exception 'invalid resolution' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(status, report_count), '{}'::jsonb)
    into v_before_counts
  from (
    select status::text, count(*)::int as report_count
      from public.board_post_reports
     where post_id = p_post_id
       and status in ('pending', 'reviewing')
     group by status
  ) s;

  update public.board_post_reports
     set status = v_target_status,
         resolved_by = v_admin_id,
         resolved_at = now(),
         resolution_note = p_note
   where post_id = p_post_id
     and status in ('pending', 'reviewing');
  get diagnostics v_affected = row_count;

  if v_affected > 0 then
    insert into public.admin_audit_logs
      (admin_id, action, target_type, target_id, before_state, after_state, note)
    values (
      v_admin_id,
      v_audit_action,
      'board_post',
      p_post_id::text,
      jsonb_build_object('reports_by_status', v_before_counts),
      jsonb_build_object('resolution', p_resolution, 'reports_affected', v_affected),
      p_note
    );
  end if;

  return v_affected;
end;
$$;

revoke execute on function public.resolve_board_post_report(uuid, text, text) from public, anon;
grant execute on function public.resolve_board_post_report(uuid, text, text) to authenticated;

create or replace function public.resolve_board_post_comment_report(
  p_comment_id uuid,
  p_resolution text,
  p_note       text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id      uuid := auth.uid();
  v_target_status public.report_status;
  v_audit_action  public.audit_action;
  v_affected      int;
  v_before_counts jsonb;
begin
  if v_admin_id is null
     or not exists (select 1 from public.profiles
                    where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_resolution = 'upheld' then
    v_target_status := 'upheld';
    v_audit_action := 'report_uphold';
  elsif p_resolution = 'dismissed' then
    v_target_status := 'dismissed';
    v_audit_action := 'report_dismiss';
  else
    raise exception 'invalid resolution' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(status, report_count), '{}'::jsonb)
    into v_before_counts
  from (
    select status::text, count(*)::int as report_count
      from public.board_post_comment_reports
     where comment_id = p_comment_id
       and status in ('pending', 'reviewing')
     group by status
  ) s;

  update public.board_post_comment_reports
     set status = v_target_status,
         resolved_by = v_admin_id,
         resolved_at = now(),
         resolution_note = p_note
   where comment_id = p_comment_id
     and status in ('pending', 'reviewing');
  get diagnostics v_affected = row_count;

  if v_affected > 0 then
    insert into public.admin_audit_logs
      (admin_id, action, target_type, target_id, before_state, after_state, note)
    values (
      v_admin_id,
      v_audit_action,
      'board_post_comment',
      p_comment_id::text,
      jsonb_build_object('reports_by_status', v_before_counts),
      jsonb_build_object('resolution', p_resolution, 'reports_affected', v_affected),
      p_note
    );
  end if;

  return v_affected;
end;
$$;

revoke execute on function public.resolve_board_post_comment_report(uuid, text, text) from public, anon;
grant execute on function public.resolve_board_post_comment_report(uuid, text, text) to authenticated;
