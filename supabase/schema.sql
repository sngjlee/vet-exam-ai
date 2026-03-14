-- =============================================================================
-- Veterinary Exam AI — Supabase SQL Schema
-- =============================================================================
-- Conventions used throughout:
--   • All primary keys: uuid (gen_random_uuid()) except questions (text, see below)
--   • All timestamps: timestamptz named created_at / updated_at
--   • Soft-delete pattern: is_active boolean, never hard-delete content rows
--   • Row-Level Security (RLS) enabled on every table; policies defined at the end
--   • "denormalised" columns are intentional and noted inline
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Extensions
-- -----------------------------------------------------------------------------
-- pgcrypto is already enabled on Supabase by default; listed here for clarity.
-- No additional extensions are required for this schema.


-- =============================================================================
-- 1. profiles
-- =============================================================================
-- One row per user. Created automatically when a new auth.users record is made
-- (see trigger at the bottom). This is the single source of truth for identity
-- inside the public schema — never join directly to auth.users in queries.
--
-- Columns:
--   id            — mirrors auth.users.id exactly (same uuid)
--   display_name  — user-facing name; nullable until the user sets one
--   created_at    — when the account was created
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
-- Central content table. Seeded from lib/questions/bank.ts.
-- The primary key is text ("q1", "q2" …) to match the existing TypeScript ids;
-- switch to uuid only if the question set grows beyond manual curation.
--
-- Columns:
--   id            — matches bank.ts id ("q1" … )
--   question      — the question stem
--   choices       — ordered answer options stored as a text array
--   answer        — the single correct choice (must be one of choices[])
--   explanation   — shown after the user submits
--   category      — legacy grouping kept for backwards compatibility
--   subject       — coarser grouping, e.g. "Reproductive Physiology"
--   topic         — finer grouping, e.g. "Ovulation"
--   difficulty    — easy / medium / hard
--   source        — where the question came from
--   year          — exam year for past_exam questions; null otherwise
--   tags          — free-form search labels
--   is_active     — false = soft-deleted; excluded from new sessions
--   created_at    — when the row was inserted
--
-- NOT stored here (belongs elsewhere):
--   • per-user attempt history  → attempts table
--   • per-user wrong notes      → wrong_notes table
--   • correct-answer statistics → derivable from attempts via query
-- =============================================================================

create type public.difficulty_level as enum ('easy', 'medium', 'hard');
create type public.question_source  as enum ('manual', 'past_exam', 'ai_generated');

create table public.questions (
  id          text        primary key,
  question    text        not null,
  choices     text[]      not null,
  answer      text        not null,
  explanation text        not null,
  category    text        not null,
  subject     text,
  topic       text,
  difficulty  public.difficulty_level,
  source      public.question_source,
  year        smallint,
  tags        text[],
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.questions is
  'Question bank. Seeded from lib/questions/bank.ts. Read-only for end users.';
comment on column public.questions.answer is
  'Must be one of the values in choices[]. Enforced at the application layer.';
comment on column public.questions.is_active is
  'Set to false to hide a question from sessions without deleting it.';

alter table public.questions enable row level security;


-- =============================================================================
-- 3. attempts
-- =============================================================================
-- Append-only log of every answer a user submits. Never updated or hard-deleted.
-- A "session" is a client-generated UUID created when the user clicks Start;
-- grouping rows by session_id reconstructs a full quiz session.
--
-- Columns:
--   id              — surrogate uuid
--   user_id         — the user who answered
--   session_id      — groups all answers from one quiz session together
--   question_id     — which question was answered
--   selected_answer — the text of the option the user chose
--   is_correct      — pre-computed at submit time (avoids joining questions)
--   answered_at     — when the answer was submitted
--
-- NOT stored here:
--   • the correct answer or explanation — fetch from questions if needed
--   • session metadata (category filter, total count) — see sessions table note below
--
-- Future expansion:
--   A lightweight "sessions" table can be added later to store per-session
--   metadata (category, question_count, score) without changing this table.
-- =============================================================================

create table public.attempts (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  session_id      uuid        not null,
  question_id     text        not null references public.questions (id),
  selected_answer text        not null,
  is_correct      boolean     not null,
  answered_at     timestamptz not null default now()
);

comment on table public.attempts is
  'Immutable log of every answer submitted. Groups into sessions via session_id.';
comment on column public.attempts.session_id is
  'UUID generated on the client when the user clicks Start Session.';
comment on column public.attempts.is_correct is
  'Denormalised for query performance — avoids joining questions on every analytics read.';

create index attempts_user_session  on public.attempts (user_id, session_id);
create index attempts_user_question on public.attempts (user_id, question_id);
create index attempts_answered_at   on public.attempts (answered_at);

alter table public.attempts enable row level security;


-- =============================================================================
-- 4. wrong_notes
-- =============================================================================
-- One row per (user, question). Upserted when a user answers incorrectly;
-- deleted when the user answers correctly on a retry.
-- The unique constraint makes all upserts idempotent — safe to re-import from
-- localStorage more than once without creating duplicates.
--
-- Columns:
--   id              — surrogate uuid
--   user_id         — owner of this note
--   question_id     — which question was missed
--   question_text   — denormalised snapshot of the question stem at note creation
--   category        — denormalised for fast filtering without a join
--   choices         — denormalised so the retry UI never needs to re-fetch
--   correct_answer  — the right answer, stored for review
--   selected_answer — what the user actually chose
--   explanation     — stored so the review page works offline / without a DB read
--   saved_at        — last time this note was updated (most recent wrong attempt)
--
-- Denormalisation rationale:
--   wrong_notes is a user-facing review list that must load quickly. Storing
--   question_text, category, choices, correct_answer, and explanation avoids a
--   join to questions on every page load and also preserves the note even if the
--   question is later deactivated or edited.
--
-- NOT stored here:
--   • full attempt history for a question — that is in attempts
--   • how many times the user got it wrong — count from attempts if needed
-- =============================================================================

create table public.wrong_notes (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  question_id     text        not null references public.questions (id),
  question_text   text        not null,
  category        text        not null,
  choices         text[]      not null,
  correct_answer  text        not null,
  selected_answer text        not null,
  explanation     text        not null,
  saved_at        timestamptz not null default now(),

  unique (user_id, question_id)
);

comment on table public.wrong_notes is
  'One note per (user, question). Upserted on wrong answer; deleted on correct retry.';
comment on column public.wrong_notes.question_text is
  'Snapshot of question stem at time of wrong answer. Intentionally denormalised.';
comment on column public.wrong_notes.saved_at is
  'Updated on each new wrong answer to keep the note current.';

create index wrong_notes_user     on public.wrong_notes (user_id);
create index wrong_notes_category on public.wrong_notes (user_id, category);

alter table public.wrong_notes enable row level security;


-- =============================================================================
-- Row-Level Security Policies
-- =============================================================================

-- profiles: users can only read and update their own row
create policy "profiles: owner read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: owner update"
  on public.profiles for update
  using (auth.uid() = id);

-- questions: any authenticated user can read; writes are service_role only
create policy "questions: authenticated read"
  on public.questions for select
  to authenticated
  using (true);

-- attempts: users can read and insert their own rows only
create policy "attempts: owner read"
  on public.attempts for select
  using (auth.uid() = user_id);

create policy "attempts: owner insert"
  on public.attempts for insert
  with check (auth.uid() = user_id);

-- wrong_notes: users can read, insert, update, and delete their own rows
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
-- Fires after a new row is inserted into auth.users (e.g. email sign-up,
-- OAuth first login). Creates the matching profiles row so no application code
-- needs to handle the insert manually.

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
