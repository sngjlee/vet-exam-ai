-- =============================================================================
-- Veterinary Exam AI — Supabase SQL Schema (Canonical / Current State)
-- =============================================================================
-- This file is the single source of truth for the *current* database state.
-- It is kept in sync with the incremental migrations in supabase/migrations/.
--
-- Migration history applied (in order):
--   20260314000000  initial_schema
--   20260314000001  drop_wrong_notes_question_fk
--   20260314000002  attempts_add_columns
--   20260314000004  wrong_notes_add_review
--   20260317000005  questions_allow_anon_read
--   20260317000010  seed_demo_questions
--   20260424000000  questions_add_session_round_community_notes
--
-- Conventions:
--   • All primary keys: uuid (gen_random_uuid()) except questions (text)
--   • All timestamps: timestamptz, named created_at / updated_at / saved_at
--   • Soft-delete pattern: is_active boolean, never hard-delete content rows
--   • RLS enabled on every table; policies defined at the end of this file
--   • Denormalised columns are intentional and noted inline
-- =============================================================================


-- =============================================================================
-- 1. profiles
-- =============================================================================
-- One row per user, auto-created by the handle_new_user() trigger below.
-- Single source of truth for user identity inside the public schema —
-- never JOIN directly to auth.users in application queries.
-- =============================================================================

create table public.profiles (
  id            uuid        primary key references auth.users (id) on delete cascade,
  display_name  text,
  created_at    timestamptz not null default now()
);

comment on table public.profiles is
  'Public profile for each authenticated user. 1-to-1 with auth.users.';

alter table public.profiles enable row level security;


-- =============================================================================
-- 2. questions
-- =============================================================================
-- Central question bank. Questions are seeded via scripts/seed-questions.ts.
-- The text primary key ("q1", "q2" …) matches the TypeScript bank IDs.
--
-- Columns:
--   id            — text key matching the TypeScript id ("q1", "q2" …)
--   question      — question stem
--   choices       — ordered answer options (text array)
--   answer        — the single correct choice; must be one of choices[]
--   explanation   — shown to the user after they submit an answer
--   category      — primary grouping used for filtering and statistics
--   subject       — coarser grouping, e.g. "Reproductive Physiology"
--   topic         — finer grouping, e.g. "Ovulation"
--   difficulty    — easy / medium / hard
--   source        — provenance: manual | past_exam | ai_generated
--   year          — exam year for past_exam questions; null otherwise
--   tags          — free-form search labels
--   is_active     — false = soft-deleted; excluded from new sessions
--   created_at    — when the row was inserted
-- =============================================================================

create type public.difficulty_level as enum ('easy', 'medium', 'hard');
create type public.question_source  as enum ('manual', 'past_exam', 'ai_generated');

create table public.questions (
  id              text        primary key,
  question        text        not null,
  choices         text[]      not null,
  answer          text        not null,
  explanation     text        not null,
  category        text        not null,
  subject         text,
  topic           text,
  difficulty      public.difficulty_level,
  source          public.question_source,
  year            smallint,
  session         smallint,    -- 국시 교시 (1~4)
  round           smallint,    -- 국시 회차. year = round + 1956
  community_notes text,        -- vet40 댓글 (수험생 정정/암기팁)
  tags            text[],
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  constraint questions_session_range
    check (session is null or session between 1 and 4),
  constraint questions_round_positive
    check (round is null or round > 0),
  constraint questions_round_year_consistent
    check (round is null or year is null or year = round + 1956)
);

comment on table public.questions is
  'Question bank. Seeded via scripts/seed-questions.ts. Read-only for end users.';
comment on column public.questions.answer is
  'Must be one of the values in choices[]. Enforced at the application layer.';
comment on column public.questions.is_active is
  'Set to false to hide a question without deleting it (soft-delete).';
comment on column public.questions.session is
  '국시 교시 (1=기초, 2=예방, 3=임상, 4=법규). 4.1 법규는 실제 3교시와 동시 시행.';
comment on column public.questions.round is
  '국시 회차. year = round + 1956 규칙으로 파생되지만 쿼리 편의상 양쪽 저장.';
comment on column public.questions.community_notes is
  'vet40 원본 댓글. 수험생 정정/암기팁 자료. 향후 "수험생 팁" UI에서 노출.';

create index questions_subject_round on public.questions (subject, round)
  where is_active = true;
create index questions_session       on public.questions (session)
  where is_active = true;

alter table public.questions enable row level security;


-- =============================================================================
-- 3. attempts
-- =============================================================================
-- Append-only log of every answer a user submits. Never updated or deleted.
-- A "session" is a UUID created client-side when the user clicks Start;
-- grouping rows by session_id reconstructs a full quiz session.
--
-- Columns:
--   id              — surrogate uuid
--   user_id         — the user who answered (references profiles)
--   session_id      — client-generated uuid grouping one quiz session
--   question_id     — which question was answered (no FK — questions may be
--                     deactivated or removed after attempts are recorded)
--   category        — denormalised from the question at submission time
--   selected_answer — the text of the option the user chose
--   correct_answer  — denormalised correct answer (avoids join on analytics)
--   is_correct      — pre-computed at submit time
--   answered_at     — when the answer was submitted
-- =============================================================================

create table public.attempts (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  session_id      uuid        not null,
  question_id     text        not null,
  category        text        not null,
  selected_answer text        not null,
  correct_answer  text        not null,
  is_correct      boolean     not null,
  answered_at     timestamptz not null default now()
);

comment on table public.attempts is
  'Immutable log of every answer submitted. Groups into sessions via session_id.';
comment on column public.attempts.session_id is
  'UUID generated on the client when the user clicks Start Session.';
comment on column public.attempts.is_correct is
  'Denormalised for query performance — avoids joining questions on every stats read.';
comment on column public.attempts.correct_answer is
  'Denormalised at submission time — preserved even if the question is later edited.';

create index attempts_user_session  on public.attempts (user_id, session_id);
create index attempts_user_question on public.attempts (user_id, question_id);
create index attempts_answered_at   on public.attempts (answered_at);

alter table public.attempts enable row level security;


-- =============================================================================
-- 4. wrong_notes
-- =============================================================================
-- One row per (user, question). Upserted when a user answers incorrectly;
-- deleted when the user answers correctly on a retry.
-- Stores a denormalised snapshot of the question so the review UI works without
-- a join, and so notes are preserved even if the question is later deactivated.
--
-- Columns:
--   id              — surrogate uuid
--   user_id         — owner of this note (references profiles)
--   question_id     — which question was missed (no FK — see above rationale)
--   question_text   — snapshot of the question stem at note creation
--   category        — denormalised for fast filtering without a join
--   choices         — denormalised so the retry UI never needs to re-fetch
--   correct_answer  — the right answer
--   selected_answer — what the user actually chose
--   explanation     — stored so the review page never needs a DB read
--   saved_at        — last time this note was updated
--   review_count    — how many times the user has correctly reviewed this note
--   last_reviewed_at — when the user last reviewed it (NULL = never reviewed)
--   next_review_at  — when the note is next due for review
--
-- Spaced-repetition schedule (enforced in application code):
--   correct review #1 → +1 day
--   correct review #2 → +3 days
--   correct review #3 → +7 days
--   correct review #4+ → +14 days
--   incorrect review   → review_count reset to 0, due immediately
-- =============================================================================

create table public.wrong_notes (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles (id) on delete cascade,
  question_id      text        not null,
  question_text    text        not null,
  category         text        not null,
  choices          text[]      not null,
  correct_answer   text        not null,
  selected_answer  text        not null,
  explanation      text        not null,
  saved_at         timestamptz not null default now(),
  review_count     integer     not null default 0,
  last_reviewed_at timestamptz,
  next_review_at   timestamptz not null default now(),

  unique (user_id, question_id)
);

comment on table public.wrong_notes is
  'One note per (user, question). Upserted on wrong answer; deleted on correct retry.';
comment on column public.wrong_notes.question_text is
  'Snapshot of question stem at time of wrong answer. Intentionally denormalised.';
comment on column public.wrong_notes.review_count is
  'Incremented on each correct review. Drives the spaced-repetition interval.';
comment on column public.wrong_notes.next_review_at is
  'When the item is next due. Defaults to now() so all new notes are due immediately.';

create index wrong_notes_user     on public.wrong_notes (user_id);
create index wrong_notes_category on public.wrong_notes (user_id, category);
create index wrong_notes_due      on public.wrong_notes (user_id, next_review_at);

alter table public.wrong_notes enable row level security;


-- =============================================================================
-- Row-Level Security Policies
-- =============================================================================

-- profiles: owner can read and update their own row only
create policy "profiles: owner read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: owner update"
  on public.profiles for update
  using (auth.uid() = id);

-- questions: publicly readable by anyone (including unauthenticated guests)
-- so that the quiz works without sign-in. Writes are service_role only.
create policy "questions: public read"
  on public.questions for select
  using (true);

-- attempts: owner can read and insert their own rows; no update or delete
create policy "attempts: owner read"
  on public.attempts for select
  using (auth.uid() = user_id);

create policy "attempts: owner insert"
  on public.attempts for insert
  with check (auth.uid() = user_id);

-- wrong_notes: owner can read, insert, update, and delete their own rows
create policy "wrong_notes: owner read"
  on public.wrong_notes for select
  using (auth.uid() = user_id);

create policy "wrong_notes: owner insert"
  on public.wrong_notes for insert
  with check (auth.uid() = user_id);

create policy "wrong_notes: owner update"
  on public.wrong_notes for update
  using (auth.uid() = user_id);

create policy "wrong_notes: owner delete"
  on public.wrong_notes for delete
  using (auth.uid() = user_id);


-- =============================================================================
-- Trigger: auto-create profile on sign-up
-- =============================================================================
-- Fires after a new row is inserted into auth.users (email sign-up or OAuth
-- first login). Creates the matching profiles row automatically so no
-- application code needs to handle the insert.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
