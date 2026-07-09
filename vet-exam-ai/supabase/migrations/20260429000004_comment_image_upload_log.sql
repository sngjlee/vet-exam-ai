-- supabase/migrations/20260429000004_comment_image_upload_log.sql
-- §14 2차 — 업로드 어뷰저 차단용 시간당 rate-limit 로그.
-- /api/comments/upload가 매 성공 시 INSERT, 직전 1시간 카운트로 cap 검증.
-- 24h 이전 row는 sweep cron이 함께 정리.

create table if not exists public.comment_image_upload_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  storage_path text not null
);

create index if not exists comment_image_upload_log_user_recent_idx
  on public.comment_image_upload_log (user_id, created_at desc);

alter table public.comment_image_upload_log enable row level security;

drop policy if exists "comment_image_upload_log own select" on public.comment_image_upload_log;
create policy "comment_image_upload_log own select"
  on public.comment_image_upload_log for select to authenticated
  using (user_id = auth.uid());
