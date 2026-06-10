-- Persist signed-in users' mini mock exam summaries.
-- Detailed per-question answers already live in attempts; this table stores
-- session-level history for quick review and cross-device continuity.

create table if not exists public.mock_exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  total_count integer not null check (total_count > 0),
  score integer not null check (score >= 0),
  accuracy integer not null check (accuracy >= 0 and accuracy <= 100),
  elapsed_seconds integer not null check (elapsed_seconds >= 0),
  wrong_count integer not null check (wrong_count >= 0),
  unanswered_count integer not null check (unanswered_count >= 0),
  time_expired boolean not null default false,
  categories jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint mock_exam_sessions_score_bounds
    check (score <= total_count and wrong_count <= total_count and unanswered_count <= total_count),
  constraint mock_exam_sessions_user_session_unique unique (user_id, session_id)
);

create index if not exists mock_exam_sessions_user_completed_at
  on public.mock_exam_sessions (user_id, completed_at desc);

alter table public.mock_exam_sessions enable row level security;

create policy "mock_exam_sessions: owner read"
  on public.mock_exam_sessions
  for select
  using (auth.uid() = user_id);

create policy "mock_exam_sessions: owner insert"
  on public.mock_exam_sessions
  for insert
  with check (auth.uid() = user_id);
