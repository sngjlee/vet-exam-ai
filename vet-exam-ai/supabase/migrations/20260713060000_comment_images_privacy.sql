-- =============================================================================
-- comment-images privacy hardening (storage audit 2026-07-13, Low x2)
--
-- L1. Upload path scheme embedded the uploader's auth UUID in world-visible
--     public URLs ({auth.uid()}/{yyyymm}/{nanoid}.webp). New uploads use an
--     opaque per-user random prefix stored in profiles.comment_image_prefix.
--     (Bucket is empty in prod as of 2026-07-13 — no legacy-path compat.)
--
-- L2. Storage policies on the public bucket were wider than the app uses:
--       * "comment-images public read" — a public bucket serves
--         /object/public/ downloads WITHOUT a select policy; the policy's
--         only real effect was letting anon LIST the bucket and enumerate
--         per-user folders. Drop.
--       * "comment-images own insert" / "own delete" — every app write goes
--         through /api/comments/upload with the service-role client (RLS
--         bypass). Keeping them let an authenticated user upload directly
--         with the anon key, bypassing the API's WebP magic-number /
--         dimension / rate-limit validation. Drop.
--
-- Re-runnable.
-- =============================================================================

drop policy if exists "comment-images public read" on storage.objects;
drop policy if exists "comment-images own insert" on storage.objects;
drop policy if exists "comment-images own delete" on storage.objects;

-- Opaque per-user storage prefix for comment image paths.
-- Volatile default: ADD COLUMN evaluates it per row, so every existing
-- profile gets a distinct random value; new rows get one at insert
-- (16 hex = 64 bits — collision odds negligible, no unique index needed).
-- Not world-readable: profiles has owner-read / admin-read policies only.
alter table public.profiles
  add column if not exists comment_image_prefix text
    not null default substr(md5(gen_random_uuid()::text), 1, 16);
