-- supabase/migrations/20260429000000_comment_edit_count.sql
-- §14 4차 — comments.edit_count + handle_comment_update 트리거 갱신

alter table public.comments
  add column edit_count integer not null default 0;

create or replace function public.handle_comment_update()
returns trigger
language plpgsql
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
