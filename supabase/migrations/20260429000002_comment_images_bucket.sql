-- supabase/migrations/20260429000002_comment_images_bucket.sql
-- §14 2차 — 댓글 이미지 첨부용 Storage 버킷 + RLS.
-- public read (저작권 가드 = 기출 본문 비노출이지 사용자 첨부 비노출 아님).
-- INSERT/DELETE는 본인 userId prefix만 (path = {uid}/{yyyymm}/{nanoid}.webp).
-- sweep cron은 service_role 키로 RLS 우회.

insert into storage.buckets (id, name, public)
values ('comment-images', 'comment-images', true)
on conflict (id) do nothing;

drop policy if exists "comment-images own insert" on storage.objects;
create policy "comment-images own insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comment-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "comment-images own delete" on storage.objects;
create policy "comment-images own delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'comment-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "comment-images public read" on storage.objects;
create policy "comment-images public read"
  on storage.objects for select to public
  using (bucket_id = 'comment-images');
