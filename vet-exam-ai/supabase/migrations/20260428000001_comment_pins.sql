-- Per-user, per-question comment pins.
--
-- Why: 사용자가 회독 중 다시 보고 싶은 암기팁(댓글)을 본인 화면 상단에
-- 고정해 둘 수 있게 한다. ROADMAP 2026-04-27 P1.
--
-- Scope (MVP):
-- - 사용자별/문제별 1개 고정 (UNIQUE 제약). 추후 N개 확장 시 UNIQUE 제거.
-- - 다른 사용자에게 영향 없음 (RLS).
-- - 고정된 댓글 또는 문제가 삭제되면 핀도 cascade 삭제 (안전한 자동 unpin).

create table if not exists public.comment_pins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null references public.questions(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- MVP 1개 고정 — 같은 (user, question)에 두 번째 핀이 들어올 수 없음.
  unique (user_id, question_id)
);

create index if not exists comment_pins_user_question_idx
  on public.comment_pins (user_id, question_id);

create index if not exists comment_pins_comment_id_idx
  on public.comment_pins (comment_id);

alter table public.comment_pins enable row level security;

-- 본인 핀만 읽기. 다른 사용자의 핀 상태는 노출하지 않는다.
create policy "comment_pins_select_own"
  on public.comment_pins
  for select
  using (auth.uid() = user_id);

create policy "comment_pins_insert_own"
  on public.comment_pins
  for insert
  with check (auth.uid() = user_id);

-- "다른 댓글로 교체" semantics 지원. 같은 (user, question) 행을 update.
create policy "comment_pins_update_own"
  on public.comment_pins
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "comment_pins_delete_own"
  on public.comment_pins
  for delete
  using (auth.uid() = user_id);
