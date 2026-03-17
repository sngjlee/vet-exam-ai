-- Allow unauthenticated (anon) users to read questions.
-- The quiz works in guest mode before sign-in, so questions must be
-- readable without an auth session.
--
-- Replaces the previous "authenticated read" policy with an open read policy.

DROP POLICY IF EXISTS "questions: authenticated read" ON public.questions;

CREATE POLICY "questions: public read"
  ON public.questions FOR SELECT
  USING (true);
