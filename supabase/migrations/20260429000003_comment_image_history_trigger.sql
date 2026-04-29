-- supabase/migrations/20260429000003_comment_image_history_trigger.sql
-- §14 2차 — comment_edit_history에 image_urls 스냅샷 컬럼 추가 (UI 미노출, 미래 비교 UI 대비).
-- handle_comment_update 트리거에 image_urls 변경 분기 추가.
-- SECURITY DEFINER + set search_path = public 그대로 유지 (feedback_security_definer_trigger.md).

alter table public.comment_edit_history
  add column if not exists image_urls text[] not null default '{}';

create or replace function public.handle_comment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.body_text is distinct from new.body_text
     or old.body_html is distinct from new.body_html
     or old.image_urls is distinct from new.image_urls then
    insert into public.comment_edit_history (comment_id, body_text, body_html, image_urls, edited_at)
    values (old.id, old.body_text, old.body_html, old.image_urls, old.updated_at);
    new.updated_at := now();
    new.edit_count := old.edit_count + 1;
  end if;
  return new;
end;
$$;
