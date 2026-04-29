-- supabase/migrations/20260429000001_comment_update_security_definer.sql
-- Hotfix: handle_comment_update를 SECURITY DEFINER로 승격.
-- comment_edit_history는 INSERT 정책이 없어 (자동 트리거만 insert 의도)
-- caller role로 실행되면 RLS 위반. 다른 comment 트리거(insert/vote/report)와
-- 동일하게 SECURITY DEFINER로 통일.

create or replace function public.handle_comment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.body_text != new.body_text or old.body_html != new.body_html then
    insert into public.comment_edit_history (comment_id, body_text, body_html, edited_at)
    values (old.id, old.body_text, old.body_html, old.updated_at);
    new.updated_at := now();
    new.edit_count := old.edit_count + 1;
  end if;
  return new;
end;
$$;
