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
--   20260425000000  community_profiles_and_badges
--   20260425000001  community_comments
--   20260425000002  community_notifications
--   20260425000003  community_admin
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
-- handle_new_user() is defined in the community_profiles_and_badges migration
-- (Part 1) below — it seeds profiles, user_profiles_public, and the newbie
-- badge on signup. The trigger definition is preserved here.

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================================================
-- The following sections were added by the 4 community-tables migrations
-- (20260425000000 through 20260425000003). They are appended verbatim from the
-- migration files for the canonical snapshot.
-- =============================================================================

-- =============================================================================
-- Community Tables Migration — Part 1 of 4: Profiles & Badges
-- =============================================================================
-- Adds the public profile, role/permission, and badge infrastructure required
-- for KVLE v0.2 community features.
--
-- Changes:
--   1. Extends public.profiles with role, is_active, updated_at
--   2. Creates public.user_profiles_public (public-facing identity)
--   3. Creates public.badges (achievement/role badges)
--   4. Defines reusable helper functions: set_updated_at, is_admin,
--      is_reviewer_or_admin
--   5. Replaces handle_new_user() to populate the new tables on signup
--
-- Convention: All tables RLS-enabled. Cascade rules per spec §8.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. user_role enum (used by profiles.role)
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('user', 'reviewer', 'admin');


-- -----------------------------------------------------------------------------
-- 2. Extend public.profiles
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column role       public.user_role not null default 'user',
  add column is_active  boolean          not null default true,
  add column updated_at timestamptz      not null default now();

comment on column public.profiles.role is
  'Permission tier. user = default, reviewer = official content review, admin = moderation + audit.';
comment on column public.profiles.is_active is
  'Set to false to suspend an account. RLS hides comments authored by inactive users from public read.';

-- -----------------------------------------------------------------------------
-- 3. Reusable helper: set_updated_at trigger function
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Attach to profiles immediately (other tables in this and later files attach
-- their own triggers individually — the function is reused).
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 4. Reusable helpers: role checks
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

create or replace function public.is_reviewer_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('reviewer', 'admin') and is_active = true
  );
$$;

-- -----------------------------------------------------------------------------
-- 5. user_profiles_public — public-facing identity, separate from sensitive data
-- -----------------------------------------------------------------------------
-- Split from profiles intentionally. profiles holds private/sensitive data
-- (role, is_active, future email/payment metadata); user_profiles_public is
-- world-readable. This split lets us add sensitive columns to profiles later
-- without accidentally exposing them through public RLS policies.
-- -----------------------------------------------------------------------------
create table public.user_profiles_public (
  user_id              uuid        primary key references public.profiles(id) on delete cascade,
  nickname             text        not null,
  bio                  text,
  target_round         smallint,
  university           text,
  target_round_visible boolean     not null default true,
  university_visible   boolean     not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint nickname_length      check (char_length(nickname) between 2 and 16),
  constraint nickname_format      check (nickname ~ '^[가-힣a-zA-Z0-9_]+$'),
  constraint nickname_unique      unique (nickname),
  constraint target_round_range   check (target_round is null or target_round between 1 and 200)
);

comment on table public.user_profiles_public is
  'World-readable profile. Separate from profiles to isolate public from sensitive data.';
comment on column public.user_profiles_public.target_round is
  'Exam round (회차) the user is preparing for. Matches questions.round (smallint).';
comment on column public.user_profiles_public.target_round_visible is
  'When false, target_round is hidden from public profile views (privacy toggle).';

create trigger user_profiles_public_set_updated_at
  before update on public.user_profiles_public
  for each row execute function public.set_updated_at();

alter table public.user_profiles_public enable row level security;

-- -----------------------------------------------------------------------------
-- 6. badges — achievement and role markers
-- -----------------------------------------------------------------------------
create type public.badge_type as enum (
  'operator',         -- 운영자 (manually granted)
  'reviewer',         -- 검수자 (manually granted)
  'newbie',           -- 새내기 (auto on signup)
  'first_contrib',    -- 첫 기여 (auto on first comment)
  'popular_comment'   -- 인기 댓글 (auto on 10 upvotes)
);

create table public.badges (
  id          uuid             primary key default gen_random_uuid(),
  user_id     uuid             not null references public.profiles(id) on delete cascade,
  badge_type  public.badge_type not null,
  awarded_at  timestamptz      not null default now(),
  reason      text,
  awarded_by  uuid             references public.profiles(id) on delete set null,

  unique (user_id, badge_type)
);

comment on table public.badges is
  'One row per (user, badge_type). Some are auto-granted by triggers (newbie, first_contrib, popular_comment); operator/reviewer are manually granted by an admin.';
comment on column public.badges.awarded_by is
  'Admin who manually granted this badge. NULL for auto-granted badges.';

-- (No standalone index on user_id — the unique (user_id, badge_type) constraint
--  already provides a btree on user_id via the leftmost-prefix rule.)

alter table public.badges enable row level security;

-- -----------------------------------------------------------------------------
-- 7. Replace handle_new_user trigger to populate new tables on signup
-- -----------------------------------------------------------------------------
-- Previous version (from initial_schema migration) only inserted profiles.
-- Now also creates user_profiles_public and grants the newbie badge.
--
-- Temporary nickname format: 'user_' + first 8 chars of UUID (always ASCII,
-- always passes the nickname_format regex). Frontend should force the user
-- to change this on first login or first comment submission.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_nickname text;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', null))
  on conflict (id) do nothing;

  generated_nickname := 'user_' || substring(new.id::text from 1 for 8);
  insert into public.user_profiles_public (user_id, nickname)
  values (new.id, generated_nickname)
  on conflict (user_id) do nothing;

  insert into public.badges (user_id, badge_type, reason)
  values (new.id, 'newbie', 'auto-granted on signup')
  on conflict (user_id, badge_type) do nothing;

  return new;
end;
$$;
-- Trigger 'on_auth_user_created' is already attached from initial_schema —
-- no re-create needed (CREATE OR REPLACE FUNCTION updates it in place).

-- -----------------------------------------------------------------------------
-- 8. RLS policies
-- -----------------------------------------------------------------------------

-- user_profiles_public: world-readable, owner-writable
create policy "user_profiles_public: world read"
  on public.user_profiles_public for select
  using (true);

create policy "user_profiles_public: owner insert"
  on public.user_profiles_public for insert
  with check (auth.uid() = user_id);

create policy "user_profiles_public: owner update"
  on public.user_profiles_public for update
  using (auth.uid() = user_id);

-- badges: world-readable, no public writes (trigger / service_role only)
create policy "badges: world read"
  on public.badges for select
  using (true);

-- (No insert/update/delete policies → only service_role can write,
--  which is what triggers run as.)

-- =============================================================================
-- Community Tables Migration — Part 2 of 4: Comments
-- =============================================================================
-- Core community discussion infrastructure: comments, votes, reports, and
-- edit history. All counters and status changes are maintained by triggers
-- (see §5.5 of design spec).
--
-- IMPORTANT: This file's triggers reference public.notifications, which is
-- created in Part 3. Functions resolve table references at call-time, not
-- at definition-time, so this is safe IF Parts 1-4 are applied together.
-- Do NOT apply Part 2 without Parts 3 and 4.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. enums
-- -----------------------------------------------------------------------------
create type public.comment_type as enum
  ('memorization', 'correction', 'explanation', 'question', 'discussion');

create type public.comment_status as enum (
  'visible',             -- normal
  'hidden_by_author',    -- soft-deleted by author (body kept, hidden in UI)
  'hidden_by_votes',     -- vote_score <= -5
  'blinded_by_report',   -- 3+ reports auto-blind
  'removed_by_admin'     -- admin removal
);

create type public.report_reason as enum (
  'spam', 'misinformation', 'privacy', 'hate_speech',
  'advertising', 'copyright', 'defamation', 'other'
);

create type public.report_status as enum
  ('pending', 'reviewing', 'upheld', 'dismissed');

-- -----------------------------------------------------------------------------
-- 2. comments
-- -----------------------------------------------------------------------------
create table public.comments (
  id              uuid                   primary key default gen_random_uuid(),
  question_id     text                   not null references public.questions(id) on delete cascade,
  user_id         uuid                   references public.profiles(id) on delete set null,
  parent_id       uuid                   references public.comments(id) on delete cascade,
  type            public.comment_type    not null,
  body_text       text                   not null,
  body_html       text                   not null,
  image_urls      text[]                 not null default '{}',
  status          public.comment_status  not null default 'visible',

  -- denormalized counters maintained by triggers
  vote_score      integer                not null default 0,
  upvote_count    integer                not null default 0,
  downvote_count  integer                not null default 0,
  report_count    smallint               not null default 0,
  reply_count     smallint               not null default 0,

  blinded_until   timestamptz,
  is_anonymized   boolean                not null default false,

  created_at      timestamptz            not null default now(),
  updated_at      timestamptz            not null default now(),
  edit_count      integer                not null default 0,

  constraint body_length check (char_length(body_text) between 1 and 5000),
  constraint image_count check (cardinality(image_urls) <= 3)
);

comment on table public.comments is
  'Community discussion thread per question. parent_id self-ref for 1-level replies (depth max enforced by trigger).';
comment on column public.comments.user_id is
  'NULL when author has been deleted (cascade set null). Body is preserved; UI shows "탈퇴한 사용자".';
comment on column public.comments.body_text is
  'Plain-text version for search/preview. Always kept in sync with body_html via application layer.';
comment on column public.comments.blinded_until is
  '정보통신망법 임시조치 (defamation reports). When > now(), comment hidden from public read regardless of status.';
comment on column public.comments.vote_score is
  'Denormalized: upvote_count - downvote_count. Maintained by handle_comment_vote trigger.';

create index comments_question_created
  on public.comments (question_id, created_at desc) where status = 'visible';
create index comments_question_score
  on public.comments (question_id, vote_score desc)
  where status = 'visible' and parent_id is null;
create index comments_parent
  on public.comments (parent_id) where parent_id is not null;
create index comments_user
  on public.comments (user_id) where user_id is not null;

alter table public.comments enable row level security;

-- -----------------------------------------------------------------------------
-- 3. enforce_comment_depth — block 2+ level nesting
-- -----------------------------------------------------------------------------
create or replace function public.enforce_comment_depth()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.parent_id is not null then
    if exists (
      select 1 from public.comments
      where id = new.parent_id and parent_id is not null
    ) then
      raise exception 'Comments cannot be nested beyond 1 level (parent already has parent_id)';
    end if;
  end if;
  return new;
end;
$$;

create trigger comments_enforce_depth
  before insert or update of parent_id on public.comments
  for each row execute function public.enforce_comment_depth();

-- -----------------------------------------------------------------------------
-- 4. comment_votes
-- -----------------------------------------------------------------------------
create table public.comment_votes (
  comment_id  uuid      not null references public.comments(id) on delete cascade,
  user_id     uuid      not null references public.profiles(id) on delete cascade,
  value       smallint  not null check (value in (-1, 1)),
  created_at  timestamptz not null default now(),

  primary key (comment_id, user_id)
);

comment on table public.comment_votes is
  'One vote per (comment, user). value: 1 = upvote, -1 = downvote. Toggleable via update or delete.';

alter table public.comment_votes enable row level security;


-- -----------------------------------------------------------------------------
-- 5. comment_reports
-- -----------------------------------------------------------------------------
create table public.comment_reports (
  id              uuid                primary key default gen_random_uuid(),
  comment_id      uuid                not null references public.comments(id) on delete cascade,
  reporter_id     uuid                references public.profiles(id) on delete set null,
  reason          public.report_reason not null,
  description     text,
  status          public.report_status not null default 'pending',
  resolved_by     uuid                references public.profiles(id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz         not null default now(),

  unique (comment_id, reporter_id)
);

comment on table public.comment_reports is
  'One report per (comment, reporter). 3+ reports auto-blind via handle_comment_report trigger.';
comment on column public.comment_reports.reporter_id is
  'NULL when reporter account is deleted; report preserved for moderation audit.';

create index comment_reports_status
  on public.comment_reports (status, created_at desc);

alter table public.comment_reports enable row level security;


-- -----------------------------------------------------------------------------
-- 6. comment_edit_history
-- -----------------------------------------------------------------------------
create table public.comment_edit_history (
  id          uuid        primary key default gen_random_uuid(),
  comment_id  uuid        not null references public.comments(id) on delete cascade,
  body_text   text        not null,
  body_html   text        not null,
  edited_at   timestamptz not null default now()
);

comment on table public.comment_edit_history is
  'Snapshot of comment body before each edit. Auto-populated by handle_comment_update trigger.';

create index comment_edit_history_comment
  on public.comment_edit_history (comment_id, edited_at desc);

alter table public.comment_edit_history enable row level security;

-- -----------------------------------------------------------------------------
-- 7. handle_comment_vote — vote_score / milestone alerts / hidden_by_votes
-- -----------------------------------------------------------------------------
create or replace function public.handle_comment_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  vote_delta integer := 0;
  new_score  integer;
  comment_owner uuid;
begin
  if TG_OP = 'INSERT' then
    if new.value = 1 then
      update public.comments
        set upvote_count = upvote_count + 1,
            vote_score   = vote_score + 1
        where id = new.comment_id
        returning vote_score, user_id into new_score, comment_owner;
    else
      update public.comments
        set downvote_count = downvote_count + 1,
            vote_score     = vote_score - 1
        where id = new.comment_id
        returning vote_score, user_id into new_score, comment_owner;
    end if;
  elsif TG_OP = 'UPDATE' then
    if new.value != old.value then
      vote_delta := new.value - old.value; -- ±2
      update public.comments
        set upvote_count   = upvote_count   + (case when new.value =  1 then 1 else -1 end),
            downvote_count = downvote_count + (case when new.value = -1 then 1 else -1 end),
            vote_score     = vote_score + vote_delta
        where id = new.comment_id
        returning vote_score, user_id into new_score, comment_owner;
    end if;
  elsif TG_OP = 'DELETE' then
    -- Capture new_score so the auto-hide check at the bottom runs (e.g. removing
    -- the only upvote from a -4 comment pushes it to -5). comment_owner stays
    -- null because deletions can only lower the score, never trip a milestone.
    if old.value = 1 then
      update public.comments
        set upvote_count = upvote_count - 1,
            vote_score   = vote_score - 1
        where id = old.comment_id
        returning vote_score into new_score;
    else
      update public.comments
        set downvote_count = downvote_count - 1,
            vote_score     = vote_score + 1
        where id = old.comment_id
        returning vote_score into new_score;
    end if;
  end if;

  -- Milestone notification (10/50/100 score reached, idempotent via unique index).
  -- Only fires for INSERT/UPDATE — DELETE leaves comment_owner null.
  if new_score in (10, 50, 100) and comment_owner is not null then
    insert into public.notifications (user_id, type, related_comment_id, payload)
    values (
      comment_owner,
      'vote_milestone',
      new.comment_id,
      jsonb_build_object('milestone', new_score, 'comment_score', new_score)
    )
    on conflict do nothing;

    -- popular_comment badge at 10
    if new_score = 10 then
      insert into public.badges (user_id, badge_type, reason)
      values (comment_owner, 'popular_comment', 'auto-granted on 10 upvotes')
      on conflict (user_id, badge_type) do nothing;
    end if;
  end if;

  -- Auto-hide at -5. Uses coalesce so DELETE (which has no `new`) still resolves
  -- the comment id from `old`.
  if new_score is not null and new_score <= -5 then
    update public.comments
      set status = 'hidden_by_votes'
      where id = coalesce(new.comment_id, old.comment_id) and status = 'visible';
  end if;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger comment_votes_after_change
  after insert or update or delete on public.comment_votes
  for each row execute function public.handle_comment_vote();

-- -----------------------------------------------------------------------------
-- 8. handle_comment_report — report_count / auto-blind / 30-day temporary measure
-- -----------------------------------------------------------------------------
create or replace function public.handle_comment_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count smallint;
begin
  update public.comments
    set report_count = report_count + 1
    where id = new.comment_id
    returning report_count into new_count;

  -- 3+ reports → auto-blind
  if new_count >= 3 then
    update public.comments
      set status = 'blinded_by_report'
      where id = new.comment_id and status = 'visible';
  end if;

  -- defamation → 정보통신망법 30-day temporary measure
  if new.reason = 'defamation' then
    update public.comments
      set blinded_until = greatest(coalesce(blinded_until, now()), now() + interval '30 days')
      where id = new.comment_id;
  end if;

  return new;
end;
$$;

create trigger comment_reports_after_insert
  after insert on public.comment_reports
  for each row execute function public.handle_comment_report();


-- -----------------------------------------------------------------------------
-- 9. handle_report_resolution — notify reporter when status changes to upheld/dismissed
-- -----------------------------------------------------------------------------
create or replace function public.handle_report_resolution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('upheld', 'dismissed')
     and old.status not in ('upheld', 'dismissed')
     and new.reporter_id is not null then
    insert into public.notifications (user_id, type, related_comment_id, payload)
    values (
      new.reporter_id,
      'report_resolved',
      new.comment_id,
      jsonb_build_object('resolution', new.status::text)
    );
  end if;
  return new;
end;
$$;

create trigger comment_reports_after_resolve
  after update of status on public.comment_reports
  for each row execute function public.handle_report_resolution();

-- -----------------------------------------------------------------------------
-- 10. handle_comment_insert — reply_count / reply notification / first_contrib badge
-- -----------------------------------------------------------------------------
create or replace function public.handle_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_owner       uuid;
  is_first_comment   boolean;
  author_nickname    text;
begin
  if new.parent_id is not null then
    update public.comments
      set reply_count = reply_count + 1
      where id = new.parent_id
      returning user_id into parent_owner;

    if parent_owner is not null and parent_owner != new.user_id then
      select nickname into author_nickname
        from public.user_profiles_public where user_id = new.user_id;

      insert into public.notifications (user_id, type, actor_id, related_comment_id, payload)
      values (
        parent_owner,
        'reply',
        new.user_id,
        new.id,
        jsonb_build_object(
          'parent_comment_id', new.parent_id,
          'actor_nickname', coalesce(author_nickname, '익명')
        )
      );
    end if;
  end if;

  -- first_contrib badge on first ever comment by this user
  if new.user_id is not null then
    select not exists (
      select 1 from public.comments
      where user_id = new.user_id and id != new.id
    ) into is_first_comment;

    if is_first_comment then
      insert into public.badges (user_id, badge_type, reason)
      values (new.user_id, 'first_contrib', 'auto-granted on first comment')
      on conflict (user_id, badge_type) do nothing;
    end if;
  end if;

  return new;
end;
$$;

create trigger comments_after_insert
  after insert on public.comments
  for each row execute function public.handle_comment_insert();


-- -----------------------------------------------------------------------------
-- 11. handle_comment_update — snapshot prior body to comment_edit_history
-- -----------------------------------------------------------------------------
create or replace function public.handle_comment_update()
returns trigger
language plpgsql
security definer
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

create trigger comments_before_update
  before update on public.comments
  for each row execute function public.handle_comment_update();

-- -----------------------------------------------------------------------------
-- 12. RLS policies
-- -----------------------------------------------------------------------------

-- comments: world-readable except blinded; owner write; admin override
create policy "comments: world read visible"
  on public.comments for select
  using (
    -- visible to all when not blinded
    (status not in ('blinded_by_report', 'removed_by_admin')
       and (blinded_until is null or blinded_until <= now()))
    -- always visible to author
    or auth.uid() = user_id
    -- always visible to admin
    or public.is_admin()
  );

create policy "comments: authenticated insert own"
  on public.comments for insert
  with check (auth.uid() = user_id);

create policy "comments: owner update"
  on public.comments for update
  using (auth.uid() = user_id);

create policy "comments: admin update"
  on public.comments for update
  using (public.is_admin());

-- comment_votes: own only
create policy "comment_votes: owner read"
  on public.comment_votes for select
  using (auth.uid() = user_id);

create policy "comment_votes: owner insert"
  on public.comment_votes for insert
  with check (auth.uid() = user_id);

create policy "comment_votes: owner update"
  on public.comment_votes for update
  using (auth.uid() = user_id);

create policy "comment_votes: owner delete"
  on public.comment_votes for delete
  using (auth.uid() = user_id);

-- comment_reports: reporter sees own; admin/reviewer sees all
create policy "comment_reports: reporter read own"
  on public.comment_reports for select
  using (auth.uid() = reporter_id);

create policy "comment_reports: admin/reviewer read all"
  on public.comment_reports for select
  using (public.is_reviewer_or_admin());

create policy "comment_reports: authenticated insert"
  on public.comment_reports for insert
  with check (auth.uid() = reporter_id);

create policy "comment_reports: admin/reviewer update"
  on public.comment_reports for update
  using (public.is_reviewer_or_admin());

-- comment_edit_history: world-readable (visible if comment is visible at app layer)
create policy "comment_edit_history: world read"
  on public.comment_edit_history for select
  using (true);

-- =============================================================================
-- Community Tables Migration — Part 3 of 4: Notifications
-- =============================================================================
-- In-app notification queue. Inserts are made by triggers in Part 2 (and
-- Part 4 admin actions in the future). Users can only read their own rows
-- and update read_at; deletion is not permitted (audit trail).
--
-- Payload schema enforced via CHECK constraint per type.
-- =============================================================================

create type public.notification_type as enum (
  'reply',              -- someone replied to my comment
  'vote_milestone',     -- my comment hit 10/50/100 upvotes
  'mention',            -- @mention (V2; type defined now for forward compat)
  'report_resolved',    -- my report was resolved
  'comment_blinded'     -- my comment was blinded (reports/admin/defamation)
);

create table public.notifications (
  id                  uuid                     primary key default gen_random_uuid(),
  user_id             uuid                     not null references public.profiles(id) on delete cascade,
  type                public.notification_type not null,
  payload             jsonb                    not null default '{}'::jsonb,
  actor_id            uuid                     references public.profiles(id) on delete set null,
  related_comment_id  uuid                     references public.comments(id) on delete cascade,
  read_at             timestamptz,
  created_at          timestamptz              not null default now(),

  constraint payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint payload_keys_present check (
    case type
      when 'reply'           then payload ? 'parent_comment_id' and payload ? 'actor_nickname'
      when 'vote_milestone'  then payload ? 'milestone'
      when 'report_resolved' then payload ? 'resolution'
      when 'comment_blinded' then payload ? 'reason'
      when 'mention'         then payload ? 'actor_nickname'
      else true
    end
  )
);

comment on table public.notifications is
  'In-app notification queue. Insert via triggers only; user reads/marks own.';
comment on column public.notifications.payload is
  'Type-specific data. Required keys per type enforced by payload_keys_present check.';
comment on column public.notifications.related_comment_id is
  'Most notifications reference a comment; cascade delete keeps the queue clean.';

-- Milestone idempotency: a given user/comment/milestone notification only once
create unique index notifications_milestone_unique
  on public.notifications (user_id, related_comment_id, (payload->>'milestone'))
  where type = 'vote_milestone';

-- Most-common access patterns
create index notifications_user_created
  on public.notifications (user_id, created_at desc);
create index notifications_user_unread
  on public.notifications (user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

-- read own only
create policy "notifications: owner read"
  on public.notifications for select
  using (auth.uid() = user_id);

-- update own only (for marking read_at)
create policy "notifications: owner update"
  on public.notifications for update
  using (auth.uid() = user_id);

-- No insert / delete policies → only service_role / triggers can write.

-- =============================================================================
-- Community Tables Migration — Part 4 of 4: Admin
-- =============================================================================
-- question_corrections    — user-submitted correction proposals (MVP: table
--                            only; auto-creation from upvoted correction
--                            comments deferred to V2)
-- admin_audit_logs        — immutable audit trail of admin/moderator actions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. question_corrections
-- -----------------------------------------------------------------------------
create type public.correction_status as enum
  ('proposed', 'reviewing', 'accepted', 'rejected');

create table public.question_corrections (
  id              uuid                     primary key default gen_random_uuid(),
  question_id     text                     not null references public.questions(id) on delete cascade,
  proposed_by     uuid                     references public.profiles(id) on delete set null,
  proposed_change jsonb                    not null,
  status          public.correction_status not null default 'proposed',
  resolved_by     uuid                     references public.profiles(id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz              not null default now(),
  updated_at      timestamptz              not null default now(),

  constraint proposed_change_object check (jsonb_typeof(proposed_change) = 'object')
);

comment on table public.question_corrections is
  'User-submitted question correction proposals. MVP: manual review only. V2: auto-created from upvoted correction comments.';
comment on column public.question_corrections.proposed_change is
  'JSONB shape: {"field": "answer|explanation|...", "before": "...", "after": "...", "reason": "..."}';

create index question_corrections_status
  on public.question_corrections (status, created_at desc);
create index question_corrections_question
  on public.question_corrections (question_id);

create trigger question_corrections_set_updated_at
  before update on public.question_corrections
  for each row execute function public.set_updated_at();

alter table public.question_corrections enable row level security;

-- -----------------------------------------------------------------------------
-- 2. admin_audit_logs
-- -----------------------------------------------------------------------------
create type public.audit_action as enum (
  'comment_remove', 'comment_unblind',
  'user_suspend',   'user_unsuspend',
  'badge_grant',    'badge_revoke',
  'correction_accept', 'correction_reject',
  'report_uphold',  'report_dismiss',
  'role_change'
);

create table public.admin_audit_logs (
  id           uuid                primary key default gen_random_uuid(),
  admin_id     uuid                references public.profiles(id) on delete set null,
  action       public.audit_action not null,
  target_type  text                not null,
  target_id    text                not null,
  before_state jsonb,
  after_state  jsonb,
  note         text,
  created_at   timestamptz         not null default now()
);

comment on table public.admin_audit_logs is
  'Immutable audit trail of admin/moderator actions. No update / delete policies; rows are insert-only.';
comment on column public.admin_audit_logs.target_id is
  'Text type accommodates uuids (comments, users) and short ids (questions).';

create index admin_audit_admin
  on public.admin_audit_logs (admin_id, created_at desc);
create index admin_audit_target
  on public.admin_audit_logs (target_type, target_id);
create index admin_audit_action
  on public.admin_audit_logs (action, created_at desc);

alter table public.admin_audit_logs enable row level security;

-- -----------------------------------------------------------------------------
-- 3. RLS policies
-- -----------------------------------------------------------------------------

-- question_corrections
create policy "question_corrections: proposer read own"
  on public.question_corrections for select
  using (auth.uid() = proposed_by);

create policy "question_corrections: admin/reviewer read all"
  on public.question_corrections for select
  using (public.is_reviewer_or_admin());

create policy "question_corrections: authenticated insert"
  on public.question_corrections for insert
  with check (auth.uid() = proposed_by);

create policy "question_corrections: admin/reviewer update"
  on public.question_corrections for update
  using (public.is_reviewer_or_admin());

-- admin_audit_logs: admin-only read, no other access
create policy "admin_audit_logs: admin read"
  on public.admin_audit_logs for select
  using (public.is_admin());

-- No insert / update / delete policies → trigger / service_role only,
-- and audit rows are immutable.
