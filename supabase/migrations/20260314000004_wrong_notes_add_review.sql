-- Add spaced-repetition review metadata to wrong_notes.
--
-- review_count     – how many times the user has reviewed this note
-- last_reviewed_at – when the user last reviewed it (NULL = never)
-- next_review_at   – when the note is next due for review
--                   defaults to now() so all existing notes are due immediately
--
-- The schedule (enforced in application code):
--   correct review #1 → +1 day
--   correct review #2 → +3 days
--   correct review #3 → +7 days
--   correct review #4+ → +14 days
--   incorrect review   → reset to 0, due immediately

ALTER TABLE public.wrong_notes
  ADD COLUMN IF NOT EXISTS review_count     INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_review_at   TIMESTAMPTZ NOT NULL DEFAULT now();
