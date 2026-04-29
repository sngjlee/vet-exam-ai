-- supabase/migrations/20260429000005_comment_body_length_image_aware.sql
-- §14 2차 hotfix — image-only 댓글 허용을 위해 body_length 제약 완화.
-- 기존: char_length(body_text) between 1 and 5000  (text-only 강제)
-- 수정: char_length(body_text) <= 5000 AND (text 1+ OR image 1+)
-- 본문/이미지 둘 다 비어있는 댓글은 여전히 거부.

alter table public.comments
  drop constraint if exists body_length;

alter table public.comments
  add constraint body_length check (
    char_length(body_text) <= 5000
    and (char_length(body_text) >= 1 or cardinality(image_urls) >= 1)
  );
