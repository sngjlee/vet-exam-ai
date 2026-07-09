-- Add category and correct_answer to attempts.
-- The table should be empty at this point; the DEFAULT '' is a safety net
-- for any edge case, and is dropped immediately after so new rows must
-- always supply a value.

ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS category      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS correct_answer text NOT NULL DEFAULT '';

ALTER TABLE public.attempts
  ALTER COLUMN category      DROP DEFAULT,
  ALTER COLUMN correct_answer DROP DEFAULT;

-- Drop the FK on question_id (questions table is not seeded from the app;
-- the column is kept for reference but the constraint blocks inserts).
ALTER TABLE public.attempts
  DROP CONSTRAINT IF EXISTS attempts_question_id_fkey;
