# Suggestion Board MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/board` (suggestion + announcement) so the beta channel runs on self-hosted infrastructure instead of an external KakaoTalk open chat. Suggestion board accepts user feedback with a 4-state machine and adopter badge; announcement board lets the operator broadcast notices that surface in the dashboard banner and a fan-out notification.

**Architecture:** Single `board_posts` table with a `kind` enum (`suggestion` | `announcement`) plus a slim `board_post_comments` table (mirrors `comments` minus vote columns). All state mutations flow through SECURITY DEFINER RPCs; auto-blind, upvote, and broadcast happen via triggers. RLS is gated by `signup_status_of(auth.uid()) = 'approved'`. UI reuses TipTap composer, sanitize-html, the image-attach component, and the notifications dropdown.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase Postgres + RLS, React 19 with React Compiler, TipTap editor, sanitize-html, Supabase Storage, TypeScript strict.

---

## File map

⚠️ **Critical path note**: The repo has a nested layout — there are TWO `vet-exam-ai/` directories. **Project (Next.js) root** is `C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai/`. Specs/plans/SQL live at the **outer** repo root `C:/Users/Theriogenology/Desktop/vet-exam-ai/`. All file paths in this plan are relative to the **outer** repo root (so they begin with `vet-exam-ai/`).

**Migration / types (foundation)**
- Create: `vet-exam-ai/supabase/migrations/20260512000000_suggestion_board_mvp.sql`
- Modify: `vet-exam-ai/lib/supabase/types.ts` — add 5 new tables to `Tables`, extend 3 enums, add 7 RPC signatures to `Functions`

**Helpers**
- Create: `vet-exam-ai/lib/board/storage-keys.ts` — Storage path slugger (`boards/{post_id}/...`)
- Create: `vet-exam-ai/lib/board/sanitize.ts` — sanitize-html wrapper for post bodies (reuses comment sanitize config)
- Create: `vet-exam-ai/lib/board/labels.ts` — Korean labels for kind / status / visibility / report_reason

**Server actions**
- Create: `vet-exam-ai/app/board/_actions.ts` — `createPost`, `updatePost`, `softDeletePost`, `toggleUpvote`, `reportPost`
- Create: `vet-exam-ai/app/board/[kind]/[id]/_actions.ts` — `createPostComment`, `updatePostComment`, `softDeletePostComment`, `reportPostComment`
- Create: `vet-exam-ai/app/admin/suggestions/_actions.ts` — `updateSuggestionStateAction`, `setAnnouncementPinnedAction`, `setBoardPostVisibilityAction`, `setBoardPostCommentVisibilityAction`, `resolveBoardPostReportAction`, `resolveBoardPostCommentReportAction`

**Components**
- Create: `vet-exam-ai/components/board/SuggestionStatusBadge.tsx`
- Create: `vet-exam-ai/components/board/BoardPostListItem.tsx`
- Create: `vet-exam-ai/components/board/BoardPostComposer.tsx` (client)
- Create: `vet-exam-ai/components/board/BoardPostCard.tsx` (detail header + body + actions)
- Create: `vet-exam-ai/components/board/BoardCommentList.tsx`
- Create: `vet-exam-ai/components/board/BoardCommentItem.tsx` (client)
- Create: `vet-exam-ai/components/board/BoardCommentComposer.tsx` (client)
- Create: `vet-exam-ai/components/board/UpvoteButton.tsx` (client)
- Create: `vet-exam-ai/components/board/ReportButton.tsx` (client)
- Create: `vet-exam-ai/components/dashboard/AnnouncementBanner.tsx` (client)

**Pages**
- Create: `vet-exam-ai/app/board/layout.tsx` — approved gate + shared shell
- Create: `vet-exam-ai/app/board/page.tsx` — tab page (cards)
- Create: `vet-exam-ai/app/board/suggestions/page.tsx`
- Create: `vet-exam-ai/app/board/suggestions/new/page.tsx`
- Create: `vet-exam-ai/app/board/suggestions/[id]/page.tsx`
- Create: `vet-exam-ai/app/board/announcements/page.tsx`
- Create: `vet-exam-ai/app/board/announcements/new/page.tsx`
- Create: `vet-exam-ai/app/board/announcements/[id]/page.tsx`
- Create: `vet-exam-ai/app/admin/suggestions/page.tsx` — moderator queue

**NavBar / Dashboard / Notifications integration**
- Modify: `vet-exam-ai/components/NavBar.tsx` — add 공지·건의 entry
- Modify: `vet-exam-ai/app/admin/_components/AdminSidebar.tsx` (or equivalent) — add /admin/suggestions
- Modify: `vet-exam-ai/app/dashboard/page.tsx` — mount `<AnnouncementBanner />` below D-day widget
- Modify: `vet-exam-ai/lib/notifications/format.ts` — 4 new type branches
- Modify: `vet-exam-ai/components/notifications/NotificationItem.tsx` (if href routing lives here) — route 4 new types

**Proxy**
- Modify: `vet-exam-ai/proxy.ts` — `/board` prefix requires `signup_status='approved'`

**Total**: 새 파일 ~25 / 수정 ~5 / 마이그 1.

---

## Task 0: Worktree baseline

**Files:** None (verification only).

- [ ] **Step 1: Confirm clean working tree**

Run:
```bash
git status
git log --oneline -3
```
Expected: clean working tree; recent commits include `348f117 spec(suggestion-board): self-review fixes` and `53aff59 spec(suggestion-board): MVP design — 건의 + 공지 단일 인프라`.

- [ ] **Step 2: Create feature branch from main**

Run:
```bash
git checkout main && git pull --ff-only
git checkout -b feat/suggestion-board-mvp
```
Expected: switched to new branch tracking from main HEAD.

- [ ] **Step 3: Confirm nested project structure**

Run:
```bash
ls vet-exam-ai/app | head
ls vet-exam-ai/supabase/migrations | tail -3
```
Expected: `admin api auth dashboard …` and latest migration is `20260509000002_signup_approve_returns_path.sql`.

- [ ] **Step 4: Baseline typecheck**

Run:
```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: 0 errors. (Do not commit anything in Task 0.)

---

## Task 1: Migration — 5 tables + RLS + triggers + RPCs

**Files:**
- Create: `vet-exam-ai/supabase/migrations/20260512000000_suggestion_board_mvp.sql`

This single migration file is the entire data layer. It is long but cohesive — every block depends on the previous. Apply order: enums → tables → RLS → notifications check → trigger functions → triggers → RPCs.

- [ ] **Step 1: Create the migration file**

Create `vet-exam-ai/supabase/migrations/20260512000000_suggestion_board_mvp.sql` with the following content:

```sql
-- =============================================================================
-- Suggestion Board MVP — 건의 + 공지 단일 인프라
-- =============================================================================
-- Sections:
--   1. New enums (board_post_kind, suggestion_status, board_visibility)
--   2. Enum extensions (notification_type, badge_type, audit_action)
--   3. Tables (board_posts, board_post_comments, board_post_upvotes,
--               board_post_reports, board_post_comment_reports)
--   4. CHECK constraints + indexes
--   5. RLS policies
--   6. notifications.payload_keys_present CHECK extension
--   7. Trigger functions + triggers
--   8. RPCs (7) — all SECURITY DEFINER + admin gate where applicable
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New enums
-- ---------------------------------------------------------------------------
create type public.board_post_kind as enum ('suggestion', 'announcement');
create type public.suggestion_status as enum ('received', 'reviewing', 'accepted', 'rejected');
create type public.board_visibility as enum
  ('visible', 'hidden_by_author', 'blinded_by_report', 'removed_by_admin');

-- ---------------------------------------------------------------------------
-- 2. Enum extensions
-- ---------------------------------------------------------------------------
alter type public.notification_type add value if not exists 'post_reply';
alter type public.notification_type add value if not exists 'suggestion_state_changed';
alter type public.notification_type add value if not exists 'announcement_published';
alter type public.notification_type add value if not exists 'post_blinded';

alter type public.badge_type add value if not exists 'adopter';

alter type public.audit_action add value if not exists 'board_post_state_change';
alter type public.audit_action add value if not exists 'board_post_visibility_change';
alter type public.audit_action add value if not exists 'board_post_comment_visibility_change';
alter type public.audit_action add value if not exists 'announcement_pinned';

-- ---------------------------------------------------------------------------
-- 3a. board_posts
-- ---------------------------------------------------------------------------
create table public.board_posts (
  id                 uuid                       primary key default gen_random_uuid(),
  kind               public.board_post_kind     not null,
  user_id            uuid                       references public.profiles(id) on delete set null,
  title              text                       not null,
  body_text          text                       not null,
  body_html          text                       not null,
  image_urls         text[]                     not null default '{}',
  visibility         public.board_visibility    not null default 'visible',
  suggestion_status  public.suggestion_status,
  is_anonymized      boolean                    not null default false,
  is_pinned          boolean                    not null default false,
  resolution_note    text,
  upvote_count       integer                    not null default 0,
  report_count       smallint                   not null default 0,
  comment_count      integer                    not null default 0,
  blinded_until      timestamptz,
  edit_count         integer                    not null default 0,
  created_at         timestamptz                not null default now(),
  updated_at         timestamptz                not null default now(),

  constraint title_length        check (char_length(title) between 1 and 200),
  constraint body_length         check (char_length(body_text) between 1 and 20000),
  constraint image_count         check (cardinality(image_urls) <= 5),
  constraint kind_status_matrix  check (
    (kind = 'announcement' and suggestion_status is null and is_anonymized = false)
    or
    (kind = 'suggestion'   and suggestion_status is not null and is_pinned = false)
  )
);

comment on table public.board_posts is
  'Unified posts table for /board. kind=suggestion (user feedback, stateful) vs announcement (admin broadcast, pinnable).';

create index board_posts_kind_visible_created
  on public.board_posts (kind, created_at desc)
  where visibility = 'visible';
create index board_posts_announcement_pinned
  on public.board_posts (kind, is_pinned desc, created_at desc)
  where kind = 'announcement' and visibility = 'visible';
create index board_posts_suggestion_status
  on public.board_posts (suggestion_status, created_at desc)
  where kind = 'suggestion';
create index board_posts_user_created
  on public.board_posts (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3b. board_post_comments
-- ---------------------------------------------------------------------------
create table public.board_post_comments (
  id             uuid                    primary key default gen_random_uuid(),
  post_id        uuid                    not null references public.board_posts(id) on delete cascade,
  user_id        uuid                    references public.profiles(id) on delete set null,
  parent_id      uuid                    references public.board_post_comments(id) on delete cascade,
  body_text      text                    not null,
  body_html      text                    not null,
  image_urls     text[]                  not null default '{}',
  status         public.comment_status   not null default 'visible',
  is_anonymized  boolean                 not null default false,
  report_count   smallint                not null default 0,
  reply_count    smallint                not null default 0,
  blinded_until  timestamptz,
  edit_count     integer                 not null default 0,
  created_at     timestamptz             not null default now(),
  updated_at     timestamptz             not null default now(),

  constraint body_length check (char_length(body_text) between 1 and 5000),
  constraint image_count check (cardinality(image_urls) <= 3)
);

comment on table public.board_post_comments is
  'Comments on board posts. Slim version of comments — no vote columns; 1-level replies enforced by trigger.';

create index board_post_comments_post_visible_created
  on public.board_post_comments (post_id, created_at)
  where status = 'visible';
create index board_post_comments_thread
  on public.board_post_comments (post_id, parent_id, created_at);
create index board_post_comments_user_created
  on public.board_post_comments (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3c. board_post_upvotes
-- ---------------------------------------------------------------------------
create table public.board_post_upvotes (
  post_id     uuid        not null references public.board_posts(id) on delete cascade,
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index board_post_upvotes_user on public.board_post_upvotes (user_id);

-- ---------------------------------------------------------------------------
-- 3d. board_post_reports + board_post_comment_reports
-- ---------------------------------------------------------------------------
create table public.board_post_reports (
  id               uuid                  primary key default gen_random_uuid(),
  post_id          uuid                  not null references public.board_posts(id) on delete cascade,
  reporter_id      uuid                  not null references public.profiles(id) on delete cascade,
  reason           public.report_reason  not null,
  note             text,
  status           public.report_status  not null default 'pending',
  created_at       timestamptz           not null default now(),
  resolved_at      timestamptz,
  resolved_by      uuid                  references public.profiles(id) on delete set null,
  resolution_note  text,
  unique (post_id, reporter_id)
);
create index board_post_reports_pending
  on public.board_post_reports (created_at desc)
  where status in ('pending', 'reviewing');

create table public.board_post_comment_reports (
  id               uuid                  primary key default gen_random_uuid(),
  comment_id       uuid                  not null references public.board_post_comments(id) on delete cascade,
  reporter_id      uuid                  not null references public.profiles(id) on delete cascade,
  reason           public.report_reason  not null,
  note             text,
  status           public.report_status  not null default 'pending',
  created_at       timestamptz           not null default now(),
  resolved_at      timestamptz,
  resolved_by      uuid                  references public.profiles(id) on delete set null,
  resolution_note  text,
  unique (comment_id, reporter_id)
);
create index board_post_comment_reports_pending
  on public.board_post_comment_reports (created_at desc)
  where status in ('pending', 'reviewing');

-- ---------------------------------------------------------------------------
-- 4. Enable RLS
-- ---------------------------------------------------------------------------
alter table public.board_posts                 enable row level security;
alter table public.board_post_comments         enable row level security;
alter table public.board_post_upvotes          enable row level security;
alter table public.board_post_reports          enable row level security;
alter table public.board_post_comment_reports  enable row level security;

-- ---------------------------------------------------------------------------
-- 5a. RLS — board_posts
-- ---------------------------------------------------------------------------
-- SELECT: approved 사용자만, visibility/blinded_until 분기
create policy "board_posts: approved read visible"
  on public.board_posts for select
  using (
    public.signup_status_of(auth.uid()) = 'approved'
    and (
      -- 일반: visible + 비-임시조치
      (visibility = 'visible' and (blinded_until is null or blinded_until <= now()))
      -- 본인 글: 어떤 상태든
      or auth.uid() = user_id
      -- admin: 어떤 상태든
      or exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin' and is_active
      )
    )
  );

-- INSERT: suggestion = approved 누구나, announcement = admin only
create policy "board_posts: insert suggestion by approved"
  on public.board_posts for insert
  with check (
    auth.uid() = user_id
    and kind = 'suggestion'
    and public.signup_status_of(auth.uid()) = 'approved'
  );

create policy "board_posts: insert announcement by admin"
  on public.board_posts for insert
  with check (
    auth.uid() = user_id
    and kind = 'announcement'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and is_active
    )
  );

-- UPDATE (작성자 본인, 본문/제목/이미지/익명 토글):
-- visibility='visible' 이고 (announcement OR suggestion in received/reviewing)
create policy "board_posts: owner edit while open"
  on public.board_posts for update
  using (
    auth.uid() = user_id
    and visibility = 'visible'
    and (
      kind = 'announcement'
      or (kind = 'suggestion' and suggestion_status in ('received', 'reviewing'))
    )
  )
  with check (
    auth.uid() = user_id
    -- visibility, suggestion_status, is_pinned, resolution_note 등의 모더 필드 변경 금지
    and visibility = 'visible'
    and (
      kind = 'announcement'
      or (kind = 'suggestion' and suggestion_status in ('received', 'reviewing'))
    )
  );

-- DELETE 정책 없음 — soft delete만 (visibility='hidden_by_author' 또는 admin RPC).

-- ---------------------------------------------------------------------------
-- 5b. RLS — board_post_comments
-- ---------------------------------------------------------------------------
-- 부모 게시글이 본인에게 SELECT 가능해야 댓글도 SELECT.
create policy "bpc: approved read visible"
  on public.board_post_comments for select
  using (
    public.signup_status_of(auth.uid()) = 'approved'
    and exists (
      select 1 from public.board_posts p
      where p.id = post_id
        and (
          (p.visibility = 'visible' and (p.blinded_until is null or p.blinded_until <= now()))
          or p.user_id = auth.uid()
          or exists (select 1 from public.profiles
                     where id = auth.uid() and role = 'admin' and is_active)
        )
    )
    and (
      (status = 'visible' and (blinded_until is null or blinded_until <= now()))
      or auth.uid() = user_id
      or exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'admin' and is_active)
    )
  );

create policy "bpc: insert by approved on visible post"
  on public.board_post_comments for insert
  with check (
    auth.uid() = user_id
    and public.signup_status_of(auth.uid()) = 'approved'
    and exists (
      select 1 from public.board_posts p
      where p.id = post_id
        and p.visibility = 'visible'
    )
  );

create policy "bpc: owner edit visible"
  on public.board_post_comments for update
  using (
    auth.uid() = user_id
    and status = 'visible'
  )
  with check (
    auth.uid() = user_id
    and status = 'visible'
  );

-- ---------------------------------------------------------------------------
-- 5c. RLS — upvotes (approved 사용자, 자기 글 upvote 차단)
-- ---------------------------------------------------------------------------
create policy "upvotes: read all" on public.board_post_upvotes for select using (true);

create policy "upvotes: insert own"
  on public.board_post_upvotes for insert
  with check (
    auth.uid() = user_id
    and public.signup_status_of(auth.uid()) = 'approved'
    and not exists (
      select 1 from public.board_posts p
      where p.id = post_id and p.user_id = auth.uid()
    )
  );

create policy "upvotes: delete own"
  on public.board_post_upvotes for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5d. RLS — reports
-- ---------------------------------------------------------------------------
create policy "bpr: read own or admin"
  on public.board_post_reports for select
  using (
    auth.uid() = reporter_id
    or exists (select 1 from public.profiles
               where id = auth.uid() and role = 'admin' and is_active)
  );

create policy "bpr: insert own (not self-report)"
  on public.board_post_reports for insert
  with check (
    auth.uid() = reporter_id
    and public.signup_status_of(auth.uid()) = 'approved'
    and not exists (
      select 1 from public.board_posts p
      where p.id = post_id and p.user_id = auth.uid()
    )
  );

-- comment reports — same shape
create policy "bpcr: read own or admin"
  on public.board_post_comment_reports for select
  using (
    auth.uid() = reporter_id
    or exists (select 1 from public.profiles
               where id = auth.uid() and role = 'admin' and is_active)
  );

create policy "bpcr: insert own (not self-report)"
  on public.board_post_comment_reports for insert
  with check (
    auth.uid() = reporter_id
    and public.signup_status_of(auth.uid()) = 'approved'
    and not exists (
      select 1 from public.board_post_comments c
      where c.id = comment_id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. notifications.payload_keys_present CHECK extension
-- ---------------------------------------------------------------------------
-- 기존 CHECK 제약 교체 (drop & add). 새 4개 type case 추가.
alter table public.notifications
  drop constraint if exists payload_keys_present;

alter table public.notifications
  add constraint payload_keys_present check (
    case type
      when 'reply'           then payload ? 'parent_comment_id' and payload ? 'actor_nickname'
      when 'vote_milestone'  then payload ? 'milestone'
      when 'report_resolved' then payload ? 'resolution'
      when 'comment_blinded' then payload ? 'reason'
      when 'mention'         then payload ? 'actor_nickname'
      when 'correction_resolved' then payload ? 'resolution'
      when 'post_reply'      then payload ? 'post_id' and payload ? 'post_title'
                                  and payload ? 'post_kind' and payload ? 'actor_nickname'
      when 'suggestion_state_changed'
                             then payload ? 'post_id' and payload ? 'post_title'
                                  and payload ? 'from_status' and payload ? 'to_status'
      when 'announcement_published'
                             then payload ? 'post_id' and payload ? 'post_title'
                                  and payload ? 'is_pinned'
      when 'post_blinded'    then payload ? 'post_id' and payload ? 'post_kind'
                                  and payload ? 'reason'
      else true
    end
  );

-- announcement broadcast 중복 차단
create unique index if not exists notifications_announcement_unique
  on public.notifications (user_id, (payload->>'post_id'))
  where type = 'announcement_published';

-- ---------------------------------------------------------------------------
-- 7a. Trigger function — upvote count maintenance
-- ---------------------------------------------------------------------------
create or replace function public.handle_board_post_upvote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.board_posts
       set upvote_count = upvote_count + 1
     where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.board_posts
       set upvote_count = greatest(upvote_count - 1, 0)
     where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_handle_board_post_upvote_ins
  after insert on public.board_post_upvotes
  for each row execute function public.handle_board_post_upvote();

create trigger trg_handle_board_post_upvote_del
  after delete on public.board_post_upvotes
  for each row execute function public.handle_board_post_upvote();

-- ---------------------------------------------------------------------------
-- 7b. Trigger function — report insert → count + 3 auto blind
-- ---------------------------------------------------------------------------
create or replace function public.handle_board_post_report_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_kind  public.board_post_kind;
  v_new_count smallint;
begin
  update public.board_posts
     set report_count = report_count + 1
   where id = new.post_id
  returning report_count, user_id, kind
       into v_new_count, v_owner, v_kind;

  if v_new_count >= 3 then
    update public.board_posts
       set visibility = 'blinded_by_report',
           blinded_until = now() + interval '30 days'
     where id = new.post_id
       and visibility = 'visible';

    if v_owner is not null then
      insert into public.notifications (user_id, type, payload)
      values (
        v_owner,
        'post_blinded',
        jsonb_build_object(
          'post_id', new.post_id::text,
          'post_kind', v_kind::text,
          'reason', 'reports_threshold'
        )
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_handle_board_post_report_insert
  after insert on public.board_post_reports
  for each row execute function public.handle_board_post_report_insert();

create or replace function public.handle_board_post_comment_report_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_count smallint;
begin
  update public.board_post_comments
     set report_count = report_count + 1
   where id = new.comment_id
  returning report_count into v_new_count;

  if v_new_count >= 3 then
    update public.board_post_comments
       set status = 'blinded_by_report',
           blinded_until = now() + interval '30 days'
     where id = new.comment_id
       and status = 'visible';
  end if;

  return new;
end;
$$;

create trigger trg_handle_board_post_comment_report_insert
  after insert on public.board_post_comment_reports
  for each row execute function public.handle_board_post_comment_report_insert();

-- ---------------------------------------------------------------------------
-- 7c. Trigger function — comment insert (count + 1-level enforcement + reply notif)
-- ---------------------------------------------------------------------------
create or replace function public.handle_board_post_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_parent  uuid;
  v_post_owner     uuid;
  v_post_title     text;
  v_post_kind      public.board_post_kind;
  v_parent_owner   uuid;
  v_actor_nick     text;
begin
  -- 1-level reply 강제
  if new.parent_id is not null then
    select parent_id into v_parent_parent
      from public.board_post_comments where id = new.parent_id;
    if v_parent_parent is not null then
      raise exception 'replies cannot have replies' using errcode = '23514';
    end if;
  end if;

  update public.board_posts
     set comment_count = comment_count + 1
   where id = new.post_id
  returning user_id, title, kind
       into v_post_owner, v_post_title, v_post_kind;

  if new.parent_id is not null then
    update public.board_post_comments
       set reply_count = reply_count + 1
     where id = new.parent_id
    returning user_id into v_parent_owner;
  end if;

  -- 알림: 부모 댓글 작성자 (있으면), 그게 아니면 게시글 작성자.
  -- 자기 글/자기 댓글에 답하면 알림 skip.
  select nickname into v_actor_nick
    from public.user_profiles_public where id = new.user_id;

  if new.parent_id is not null and v_parent_owner is not null
     and v_parent_owner <> new.user_id then
    insert into public.notifications (user_id, type, actor_id, payload, related_comment_id)
    values (
      v_parent_owner,
      'post_reply',
      new.user_id,
      jsonb_build_object(
        'post_id', new.post_id::text,
        'post_title', v_post_title,
        'post_kind', v_post_kind::text,
        'actor_nickname', coalesce(v_actor_nick, '익명')
      ),
      null
    );
  elsif new.parent_id is null and v_post_owner is not null
        and v_post_owner <> new.user_id then
    insert into public.notifications (user_id, type, actor_id, payload, related_comment_id)
    values (
      v_post_owner,
      'post_reply',
      new.user_id,
      jsonb_build_object(
        'post_id', new.post_id::text,
        'post_title', v_post_title,
        'post_kind', v_post_kind::text,
        'actor_nickname', coalesce(v_actor_nick, '익명')
      ),
      null
    );
  end if;

  return new;
end;
$$;

create trigger trg_handle_board_post_comment_insert
  after insert on public.board_post_comments
  for each row execute function public.handle_board_post_comment_insert();

-- ---------------------------------------------------------------------------
-- 7d. Trigger function — comment update (edit_count + updated_at)
-- ---------------------------------------------------------------------------
create or replace function public.handle_board_post_comment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.body_text is distinct from old.body_text
     or new.body_html is distinct from old.body_html
     or new.image_urls is distinct from old.image_urls then
    new.edit_count := old.edit_count + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_handle_board_post_comment_update
  before update on public.board_post_comments
  for each row execute function public.handle_board_post_comment_update();

-- ---------------------------------------------------------------------------
-- 7e. Trigger function — post update (edit_count + updated_at)
-- ---------------------------------------------------------------------------
create or replace function public.handle_board_post_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.title is distinct from old.title
     or new.body_text is distinct from old.body_text
     or new.body_html is distinct from old.body_html
     or new.image_urls is distinct from old.image_urls then
    new.edit_count := old.edit_count + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_handle_board_post_update
  before update on public.board_posts
  for each row execute function public.handle_board_post_update();

-- ---------------------------------------------------------------------------
-- 7f. Trigger function — comment soft-delete maintenance (post.comment_count)
-- ---------------------------------------------------------------------------
-- status가 visible→비visible로 바뀌면 comment_count 감소; 역방향엔 증가
create or replace function public.handle_board_post_comment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'visible' and new.status <> 'visible' then
    update public.board_posts
       set comment_count = greatest(comment_count - 1, 0)
     where id = new.post_id;
  elsif old.status <> 'visible' and new.status = 'visible' then
    update public.board_posts
       set comment_count = comment_count + 1
     where id = new.post_id;
  end if;
  return new;
end;
$$;

create trigger trg_handle_bpc_status_change
  after update of status on public.board_post_comments
  for each row execute function public.handle_board_post_comment_status_change();

-- ---------------------------------------------------------------------------
-- 8a. RPC — update_suggestion_state
-- ---------------------------------------------------------------------------
create or replace function public.update_suggestion_state(
  p_post_id    uuid,
  p_new_status public.suggestion_status,
  p_note       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_old      public.suggestion_status;
  v_owner    uuid;
  v_title    text;
  v_kind     public.board_post_kind;
begin
  if v_admin_id is null
     or not exists (select 1 from public.profiles
                    where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  select suggestion_status, user_id, title, kind
    into v_old, v_owner, v_title, v_kind
    from public.board_posts where id = p_post_id;

  if v_old is null then
    raise exception 'post not found or not a suggestion' using errcode = 'P0002';
  end if;

  if v_kind <> 'suggestion' then
    raise exception 'kind is not suggestion' using errcode = '22023';
  end if;

  update public.board_posts
     set suggestion_status = p_new_status,
         resolution_note = coalesce(p_note, resolution_note)
   where id = p_post_id;

  -- adopter 뱃지 (accepted 진입 시 idempotent)
  if p_new_status = 'accepted' and v_owner is not null then
    insert into public.badges (user_id, badge_type, reason, awarded_by)
    values (v_owner, 'adopter', '건의 채택', v_admin_id)
    on conflict (user_id, badge_type) do nothing;
  end if;

  -- 작성자 알림
  if v_owner is not null and v_owner <> v_admin_id then
    insert into public.notifications (user_id, type, actor_id, payload)
    values (
      v_owner,
      'suggestion_state_changed',
      v_admin_id,
      jsonb_build_object(
        'post_id', p_post_id::text,
        'post_title', v_title,
        'from_status', v_old::text,
        'to_status', p_new_status::text,
        'resolution_note', p_note
      )
    );
  end if;

  -- audit
  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, payload)
  values (
    v_admin_id, 'board_post_state_change', 'board_post', p_post_id::text,
    jsonb_build_object('from', v_old::text, 'to', p_new_status::text, 'note', p_note)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8b. RPC — set_announcement_pinned (단일 핀)
-- ---------------------------------------------------------------------------
create or replace function public.set_announcement_pinned(
  p_post_id uuid,
  p_pinned  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_kind     public.board_post_kind;
begin
  if v_admin_id is null
     or not exists (select 1 from public.profiles
                    where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  select kind into v_kind from public.board_posts where id = p_post_id;
  if v_kind is null then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  if v_kind <> 'announcement' then
    raise exception 'pinning only allowed for announcements' using errcode = '22023';
  end if;

  if p_pinned then
    update public.board_posts set is_pinned = false
      where kind = 'announcement' and is_pinned = true;
  end if;

  update public.board_posts set is_pinned = p_pinned where id = p_post_id;

  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, payload)
  values (
    v_admin_id, 'announcement_pinned', 'board_post', p_post_id::text,
    jsonb_build_object('pinned', p_pinned)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8c. RPC — set_board_post_visibility
-- ---------------------------------------------------------------------------
create or replace function public.set_board_post_visibility(
  p_post_id    uuid,
  p_visibility public.board_visibility,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_old      public.board_visibility;
  v_owner    uuid;
  v_kind     public.board_post_kind;
begin
  if v_admin_id is null
     or not exists (select 1 from public.profiles
                    where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  select visibility, user_id, kind into v_old, v_owner, v_kind
    from public.board_posts where id = p_post_id;
  if v_old is null then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  update public.board_posts
     set visibility = p_visibility,
         blinded_until = case
           when p_visibility = 'blinded_by_report' then now() + interval '30 days'
           when p_visibility = 'visible' then null
           else blinded_until
         end
   where id = p_post_id;

  -- 작성자에게 blinded 알림 (visible → blinded_by_report 진입 시)
  if p_visibility = 'blinded_by_report' and v_old <> 'blinded_by_report'
     and v_owner is not null then
    insert into public.notifications (user_id, type, payload)
    values (
      v_owner,
      'post_blinded',
      jsonb_build_object(
        'post_id', p_post_id::text,
        'post_kind', v_kind::text,
        'reason', coalesce(p_reason, 'admin')
      )
    );
  end if;

  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, payload)
  values (
    v_admin_id, 'board_post_visibility_change', 'board_post', p_post_id::text,
    jsonb_build_object('from', v_old::text, 'to', p_visibility::text, 'reason', p_reason)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8d. RPC — set_board_post_comment_visibility
-- ---------------------------------------------------------------------------
create or replace function public.set_board_post_comment_visibility(
  p_comment_id uuid,
  p_status     public.comment_status,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_old      public.comment_status;
begin
  if v_admin_id is null
     or not exists (select 1 from public.profiles
                    where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  select status into v_old from public.board_post_comments where id = p_comment_id;
  if v_old is null then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;

  update public.board_post_comments
     set status = p_status,
         blinded_until = case
           when p_status = 'blinded_by_report' then now() + interval '30 days'
           when p_status = 'visible' then null
           else blinded_until
         end
   where id = p_comment_id;

  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, payload)
  values (
    v_admin_id, 'board_post_comment_visibility_change', 'board_post_comment',
    p_comment_id::text,
    jsonb_build_object('from', v_old::text, 'to', p_status::text, 'reason', p_reason)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8e. RPC — resolve_board_post_report
-- ---------------------------------------------------------------------------
create or replace function public.resolve_board_post_report(
  p_post_id    uuid,
  p_resolution text,        -- 'upheld' | 'dismissed'
  p_note       text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id      uuid := auth.uid();
  v_target_status public.report_status;
  v_affected      int;
begin
  if v_admin_id is null
     or not exists (select 1 from public.profiles
                    where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_resolution = 'upheld' then
    v_target_status := 'upheld';
  elsif p_resolution = 'dismissed' then
    v_target_status := 'dismissed';
  else
    raise exception 'invalid resolution' using errcode = '22023';
  end if;

  update public.board_post_reports
     set status = v_target_status,
         resolved_by = v_admin_id,
         resolved_at = now(),
         resolution_note = p_note
   where post_id = p_post_id
     and status in ('pending', 'reviewing');
  get diagnostics v_affected = row_count;

  return v_affected;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8f. RPC — resolve_board_post_comment_report
-- ---------------------------------------------------------------------------
create or replace function public.resolve_board_post_comment_report(
  p_comment_id uuid,
  p_resolution text,
  p_note       text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id      uuid := auth.uid();
  v_target_status public.report_status;
  v_affected      int;
begin
  if v_admin_id is null
     or not exists (select 1 from public.profiles
                    where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_resolution = 'upheld' then
    v_target_status := 'upheld';
  elsif p_resolution = 'dismissed' then
    v_target_status := 'dismissed';
  else
    raise exception 'invalid resolution' using errcode = '22023';
  end if;

  update public.board_post_comment_reports
     set status = v_target_status,
         resolved_by = v_admin_id,
         resolved_at = now(),
         resolution_note = p_note
   where comment_id = p_comment_id
     and status in ('pending', 'reviewing');
  get diagnostics v_affected = row_count;

  return v_affected;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8g. Trigger + RPC — broadcast_announcement
-- ---------------------------------------------------------------------------
create or replace function public.broadcast_announcement(p_post_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title    text;
  v_pinned   boolean;
  v_inserted int;
begin
  select title, is_pinned into v_title, v_pinned
    from public.board_posts
   where id = p_post_id and kind = 'announcement' and visibility = 'visible';
  if v_title is null then
    return 0;
  end if;

  insert into public.notifications (user_id, type, payload)
  select p.id,
         'announcement_published',
         jsonb_build_object(
           'post_id', p_post_id::text,
           'post_title', v_title,
           'is_pinned', coalesce(v_pinned, false)
         )
    from public.profiles p
   where p.signup_status = 'approved'
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.handle_board_post_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'announcement' and new.visibility = 'visible' then
    perform public.broadcast_announcement(new.id);
  end if;
  return new;
end;
$$;

create trigger trg_handle_board_post_insert
  after insert on public.board_posts
  for each row execute function public.handle_board_post_insert();

-- =============================================================================
-- End migration
-- =============================================================================
```

- [ ] **Step 2: Commit the migration**

```bash
git add vet-exam-ai/supabase/migrations/20260512000000_suggestion_board_mvp.sql
git commit -m "suggestion-board: migration — 5 tables + RLS + triggers + 7 RPCs"
```

- [ ] **Step 3: Verify SQL parseability via Postgres dry-parse**

Run from outer repo root:
```bash
cd vet-exam-ai && npx -y prettier --parser sql --write supabase/migrations/20260512000000_suggestion_board_mvp.sql 2>/dev/null || true
```
The prettier call is best-effort (project may not have SQL parser installed). Skip if it errors.

The real validation is **Task 24 — apply via Supabase SQL Editor**. Not at Task 1.

---

## Task 2: Typed schema additions

**Files:**
- Modify: `vet-exam-ai/lib/supabase/types.ts`

Add the 5 new tables, 3 enum extensions, and 7 RPC signatures.

- [ ] **Step 1: Read existing types.ts to learn the shape**

Run:
```bash
head -80 vet-exam-ai/lib/supabase/types.ts
```
Note where `Tables`, `Enums`, `Functions` live; existing tables (`comments`, `comment_reports`, `notifications`, etc.) provide the template.

- [ ] **Step 2: Add enum extensions**

In the `Enums` section of `Database['public']`, find `notification_type`, `badge_type`, `audit_action` and extend them:

```ts
notification_type:
  | "reply"
  | "vote_milestone"
  | "mention"
  | "report_resolved"
  | "comment_blinded"
  | "correction_resolved"
  | "post_reply"
  | "suggestion_state_changed"
  | "announcement_published"
  | "post_blinded";

badge_type:
  | "operator"
  | "reviewer"
  | "newbie"
  | "first_contrib"
  | "popular_comment"
  | "adopter";

audit_action:
  // ... existing values ...
  | "board_post_state_change"
  | "board_post_visibility_change"
  | "board_post_comment_visibility_change"
  | "announcement_pinned";
```

Add 3 new enums:
```ts
board_post_kind: "suggestion" | "announcement";
suggestion_status: "received" | "reviewing" | "accepted" | "rejected";
board_visibility: "visible" | "hidden_by_author" | "blinded_by_report" | "removed_by_admin";
```

- [ ] **Step 3: Add `board_posts` table type**

In `Tables`:
```ts
board_posts: {
  Row: {
    id: string;
    kind: Database["public"]["Enums"]["board_post_kind"];
    user_id: string | null;
    title: string;
    body_text: string;
    body_html: string;
    image_urls: string[];
    visibility: Database["public"]["Enums"]["board_visibility"];
    suggestion_status: Database["public"]["Enums"]["suggestion_status"] | null;
    is_anonymized: boolean;
    is_pinned: boolean;
    resolution_note: string | null;
    upvote_count: number;
    report_count: number;
    comment_count: number;
    blinded_until: string | null;
    edit_count: number;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    kind: Database["public"]["Enums"]["board_post_kind"];
    user_id?: string | null;
    title: string;
    body_text: string;
    body_html: string;
    image_urls?: string[];
    visibility?: Database["public"]["Enums"]["board_visibility"];
    suggestion_status?: Database["public"]["Enums"]["suggestion_status"] | null;
    is_anonymized?: boolean;
    is_pinned?: boolean;
    resolution_note?: string | null;
    upvote_count?: number;
    report_count?: number;
    comment_count?: number;
    blinded_until?: string | null;
    edit_count?: number;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<Database["public"]["Tables"]["board_posts"]["Insert"]>;
  Relationships: [];
};
```

- [ ] **Step 4: Add the other 4 tables**

`board_post_comments`, `board_post_upvotes`, `board_post_reports`, `board_post_comment_reports` — same Row / Insert / Update triplet. Copy the comments table shape for comments; copy comment_reports for reports.

For `board_post_upvotes`:
```ts
board_post_upvotes: {
  Row: { post_id: string; user_id: string; created_at: string };
  Insert: { post_id: string; user_id: string; created_at?: string };
  Update: Partial<Database["public"]["Tables"]["board_post_upvotes"]["Insert"]>;
  Relationships: [];
};
```

- [ ] **Step 5: Add RPC signatures to `Functions`**

```ts
update_suggestion_state: {
  Args: { p_post_id: string; p_new_status: Database["public"]["Enums"]["suggestion_status"]; p_note?: string | null };
  Returns: undefined;
};
set_announcement_pinned: {
  Args: { p_post_id: string; p_pinned: boolean };
  Returns: undefined;
};
set_board_post_visibility: {
  Args: { p_post_id: string; p_visibility: Database["public"]["Enums"]["board_visibility"]; p_reason?: string | null };
  Returns: undefined;
};
set_board_post_comment_visibility: {
  Args: { p_comment_id: string; p_status: Database["public"]["Enums"]["comment_status"]; p_reason?: string | null };
  Returns: undefined;
};
resolve_board_post_report: {
  Args: { p_post_id: string; p_resolution: string; p_note?: string | null };
  Returns: number;
};
resolve_board_post_comment_report: {
  Args: { p_comment_id: string; p_resolution: string; p_note?: string | null };
  Returns: number;
};
broadcast_announcement: {
  Args: { p_post_id: string };
  Returns: number;
};
```

- [ ] **Step 6: Typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: 0 errors. If errors, fix typos/missing semicolons inline.

- [ ] **Step 7: Commit**

```bash
git add vet-exam-ai/lib/supabase/types.ts
git commit -m "suggestion-board: typed schema for 5 new tables + 3 enum extensions + 7 RPCs"
```

---

## Task 3: Helpers — storage paths + sanitize + labels

**Files:**
- Create: `vet-exam-ai/lib/board/storage-keys.ts`
- Create: `vet-exam-ai/lib/board/sanitize.ts`
- Create: `vet-exam-ai/lib/board/labels.ts`

- [ ] **Step 1: storage-keys.ts**

```ts
// vet-exam-ai/lib/board/storage-keys.ts
// Storage path slug for board post/comment images. Same bucket as comments
// (`comment-images`) but a distinct prefix.

import { randomUUID } from "crypto";

export function postImagePath(postId: string, originalName: string): string {
  const ext = extractExt(originalName);
  return `boards/${postId}/${randomUUID()}${ext}`;
}

export function postCommentImagePath(
  postId: string,
  commentId: string,
  originalName: string,
): string {
  const ext = extractExt(originalName);
  return `boards/${postId}/comments/${commentId}/${randomUUID()}${ext}`;
}

function extractExt(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  const ext = name.slice(i).toLowerCase();
  // ASCII-only allowed in Supabase storage keys (see supabase_storage_ascii_only memory)
  if (!/^\.[a-z0-9]{1,5}$/.test(ext)) return "";
  return ext;
}
```

- [ ] **Step 2: sanitize.ts**

```ts
// vet-exam-ai/lib/board/sanitize.ts
// Reuse sanitize-html config from the comment layer. Posts allow the same tags
// + image src plus `<h2>` and `<h3>` for headings.

import sanitizeHtml from "sanitize-html";

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "u", "s",
    "h2", "h3",
    "ul", "ol", "li",
    "blockquote", "code", "pre",
    "a", "img",
  ],
  allowedAttributes: {
    a: ["href", "rel", "target"],
    img: ["src", "alt"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
  },
};

export function sanitizePostHtml(input: string): string {
  return sanitizeHtml(input ?? "", SANITIZE_OPTIONS);
}

export function htmlToText(input: string): string {
  return sanitizeHtml(input ?? "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}
```

- [ ] **Step 3: labels.ts**

```ts
// vet-exam-ai/lib/board/labels.ts
import type { Database } from "@/lib/supabase/types";

type Kind = Database["public"]["Enums"]["board_post_kind"];
type Status = Database["public"]["Enums"]["suggestion_status"];
type Visibility = Database["public"]["Enums"]["board_visibility"];

export const KIND_LABEL: Record<Kind, string> = {
  suggestion: "건의",
  announcement: "공지",
};

export const SUGGESTION_STATUS_LABEL: Record<Status, string> = {
  received: "접수",
  reviewing: "검토중",
  accepted: "채택",
  rejected: "반려",
};

export const SUGGESTION_TERMINAL: ReadonlySet<Status> = new Set<Status>(["accepted", "rejected"]);

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  visible: "표시중",
  hidden_by_author: "작성자 숨김",
  blinded_by_report: "신고 임시조치",
  removed_by_admin: "운영자 삭제",
};
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: 0 errors.

```bash
git add vet-exam-ai/lib/board
git commit -m "suggestion-board: storage / sanitize / label helpers"
```

---

## Task 4: Server actions — post create / update / soft-delete

**Files:**
- Create: `vet-exam-ai/app/board/_actions.ts`

This task implements the user-facing post lifecycle. (Upvote / report split off to Task 5 for size.)

- [ ] **Step 1: Create `_actions.ts`**

```ts
// vet-exam-ai/app/board/_actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { sanitizePostHtml, htmlToText } from "@/lib/board/sanitize";

const KindSchema = z.enum(["suggestion", "announcement"]);

const CreateSchema = z.object({
  kind: KindSchema,
  title: z.string().trim().min(1).max(200),
  body_html: z.string().min(1).max(80_000), // pre-sanitize generous; post-sanitize enforces 20k
  image_urls: z.array(z.string().min(1)).max(5).default([]),
  is_anonymized: z.boolean().default(false),
});

const UpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  body_html: z.string().min(1).max(80_000),
  image_urls: z.array(z.string().min(1)).max(5).default([]),
  is_anonymized: z.boolean().default(false),
});

export async function createPost(input: z.input<typeof CreateSchema>): Promise<{ id: string }> {
  const parsed = CreateSchema.parse(input);
  const supabase = await createServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    redirect("/auth/login?next=/board");
  }

  const safeHtml = sanitizePostHtml(parsed.body_html);
  const bodyText = htmlToText(safeHtml);
  if (bodyText.length < 1 || bodyText.length > 20_000) {
    throw new Error("본문은 1~20000자 사이여야 합니다.");
  }

  // announcement는 익명 강제 false; suggestion만 사용자 선택 반영
  const isAnon = parsed.kind === "suggestion" ? parsed.is_anonymized : false;

  const { data, error } = await supabase
    .from("board_posts")
    .insert({
      kind: parsed.kind,
      user_id: userRes.user.id,
      title: parsed.title,
      body_text: bodyText,
      body_html: safeHtml,
      image_urls: parsed.image_urls,
      is_anonymized: isAnon,
      suggestion_status: parsed.kind === "suggestion" ? "received" : null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "글 작성 실패");
  }

  revalidatePath(`/board/${parsed.kind}s`);
  return { id: data.id };
}

export async function updatePost(input: z.input<typeof UpdateSchema>): Promise<void> {
  const parsed = UpdateSchema.parse(input);
  const supabase = await createServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    redirect("/auth/login");
  }

  const safeHtml = sanitizePostHtml(parsed.body_html);
  const bodyText = htmlToText(safeHtml);
  if (bodyText.length < 1 || bodyText.length > 20_000) {
    throw new Error("본문은 1~20000자 사이여야 합니다.");
  }

  // RLS가 visibility/status 잠금 처리. 위반 시 supabase가 0 row 반환.
  const { error, count } = await supabase
    .from("board_posts")
    .update({
      title: parsed.title,
      body_text: bodyText,
      body_html: safeHtml,
      image_urls: parsed.image_urls,
      is_anonymized: parsed.is_anonymized,
    }, { count: "exact" })
    .eq("id", parsed.id);

  if (error) throw new Error(error.message);
  if (!count) {
    throw new Error("수정 불가 상태이거나 권한이 없습니다.");
  }

  // 어떤 kind인지 모르므로 두 경로 모두 invalidate
  revalidatePath(`/board/suggestions/${parsed.id}`);
  revalidatePath(`/board/announcements/${parsed.id}`);
}

export async function softDeletePost(id: string): Promise<void> {
  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    redirect("/auth/login");
  }

  const { error, count } = await supabase
    .from("board_posts")
    .update({ visibility: "hidden_by_author" }, { count: "exact" })
    .eq("id", id)
    .eq("user_id", userRes.user.id);

  if (error) throw new Error(error.message);
  if (!count) throw new Error("삭제 불가 상태이거나 권한이 없습니다.");

  revalidatePath("/board/suggestions");
  revalidatePath("/board/announcements");
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/app/board/_actions.ts
git commit -m "suggestion-board: server actions — create/update/softDelete post"
```

---

## Task 5: Server actions — upvote toggle + post report

**Files:**
- Modify: `vet-exam-ai/app/board/_actions.ts` (append)

- [ ] **Step 1: Append to `_actions.ts`**

Append the following to `vet-exam-ai/app/board/_actions.ts`:

```ts
const REPORT_REASONS = [
  "spam", "misinformation", "privacy", "hate_speech",
  "advertising", "copyright", "defamation", "other",
] as const;
const ReportSchema = z.object({
  post_id: z.string().uuid(),
  reason: z.enum(REPORT_REASONS),
  note: z.string().max(500).optional(),
});

export async function toggleUpvote(postId: string): Promise<{ upvoted: boolean }> {
  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");

  const userId = userRes.user.id;

  // 현재 상태 확인
  const { data: existing } = await supabase
    .from("board_post_upvotes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("board_post_upvotes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    revalidatePath(`/board/suggestions/${postId}`);
    revalidatePath(`/board/announcements/${postId}`);
    return { upvoted: false };
  }

  const { error } = await supabase
    .from("board_post_upvotes")
    .insert({ post_id: postId, user_id: userId });
  if (error) throw new Error(error.message);

  revalidatePath(`/board/suggestions/${postId}`);
  revalidatePath(`/board/announcements/${postId}`);
  return { upvoted: true };
}

export async function reportPost(input: z.input<typeof ReportSchema>): Promise<void> {
  const parsed = ReportSchema.parse(input);
  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");

  const { error } = await supabase
    .from("board_post_reports")
    .insert({
      post_id: parsed.post_id,
      reporter_id: userRes.user.id,
      reason: parsed.reason,
      note: parsed.note ?? null,
    });

  // unique (post_id, reporter_id) 충돌은 멱등 처리
  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }

  revalidatePath(`/board/suggestions/${parsed.post_id}`);
  revalidatePath(`/board/announcements/${parsed.post_id}`);
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/app/board/_actions.ts
git commit -m "suggestion-board: server actions — upvote toggle + report post"
```

---

## Task 6: Server actions — comments CRUD + report

**Files:**
- Create: `vet-exam-ai/app/board/[kind]/[id]/_actions.ts`

- [ ] **Step 1: Create the actions file**

```ts
// vet-exam-ai/app/board/[kind]/[id]/_actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { sanitizePostHtml, htmlToText } from "@/lib/board/sanitize";

const KindSchema = z.enum(["suggestion", "announcement"]);
const KindUrlSegmentSchema = z.enum(["suggestions", "announcements"]);
function kindFromSegment(seg: z.infer<typeof KindUrlSegmentSchema>) {
  return seg === "suggestions" ? "suggestion" : "announcement";
}

const CreateCommentSchema = z.object({
  post_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable().optional(),
  body_html: z.string().min(1).max(80_000),
  image_urls: z.array(z.string().min(1)).max(3).default([]),
  is_anonymized: z.boolean().default(false),
  kind_segment: KindUrlSegmentSchema, // for revalidatePath only
});

const UpdateCommentSchema = z.object({
  id: z.string().uuid(),
  body_html: z.string().min(1).max(80_000),
  image_urls: z.array(z.string().min(1)).max(3).default([]),
  is_anonymized: z.boolean().default(false),
  post_id: z.string().uuid(),
  kind_segment: KindUrlSegmentSchema,
});

const ReportCommentSchema = z.object({
  comment_id: z.string().uuid(),
  reason: z.enum([
    "spam", "misinformation", "privacy", "hate_speech",
    "advertising", "copyright", "defamation", "other",
  ]),
  note: z.string().max(500).optional(),
  post_id: z.string().uuid(),
  kind_segment: KindUrlSegmentSchema,
});

export async function createPostComment(input: z.input<typeof CreateCommentSchema>): Promise<{ id: string }> {
  const parsed = CreateCommentSchema.parse(input);
  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");

  const safeHtml = sanitizePostHtml(parsed.body_html);
  const bodyText = htmlToText(safeHtml);
  if (bodyText.length < 1 || bodyText.length > 5000) {
    throw new Error("댓글은 1~5000자 사이여야 합니다.");
  }

  const { data, error } = await supabase
    .from("board_post_comments")
    .insert({
      post_id: parsed.post_id,
      user_id: userRes.user.id,
      parent_id: parsed.parent_id ?? null,
      body_text: bodyText,
      body_html: safeHtml,
      image_urls: parsed.image_urls,
      is_anonymized: parsed.is_anonymized,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "댓글 작성 실패");

  revalidatePath(`/board/${parsed.kind_segment}/${parsed.post_id}`);
  return { id: data.id };
}

export async function updatePostComment(input: z.input<typeof UpdateCommentSchema>): Promise<void> {
  const parsed = UpdateCommentSchema.parse(input);
  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");

  const safeHtml = sanitizePostHtml(parsed.body_html);
  const bodyText = htmlToText(safeHtml);
  if (bodyText.length < 1 || bodyText.length > 5000) {
    throw new Error("댓글은 1~5000자 사이여야 합니다.");
  }

  const { error, count } = await supabase
    .from("board_post_comments")
    .update({
      body_text: bodyText,
      body_html: safeHtml,
      image_urls: parsed.image_urls,
      is_anonymized: parsed.is_anonymized,
    }, { count: "exact" })
    .eq("id", parsed.id);

  if (error) throw new Error(error.message);
  if (!count) throw new Error("수정 불가 상태이거나 권한이 없습니다.");

  revalidatePath(`/board/${parsed.kind_segment}/${parsed.post_id}`);
}

export async function softDeletePostComment(
  commentId: string,
  postId: string,
  kindSegment: z.infer<typeof KindUrlSegmentSchema>,
): Promise<void> {
  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");

  const { error, count } = await supabase
    .from("board_post_comments")
    .update({ status: "hidden_by_author" }, { count: "exact" })
    .eq("id", commentId)
    .eq("user_id", userRes.user.id);

  if (error) throw new Error(error.message);
  if (!count) throw new Error("삭제 불가 상태이거나 권한이 없습니다.");

  revalidatePath(`/board/${kindSegment}/${postId}`);
}

export async function reportPostComment(input: z.input<typeof ReportCommentSchema>): Promise<void> {
  const parsed = ReportCommentSchema.parse(input);
  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");

  const { error } = await supabase
    .from("board_post_comment_reports")
    .insert({
      comment_id: parsed.comment_id,
      reporter_id: userRes.user.id,
      reason: parsed.reason,
      note: parsed.note ?? null,
    });

  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }

  revalidatePath(`/board/${parsed.kind_segment}/${parsed.post_id}`);
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/app/board
git commit -m "suggestion-board: server actions — comments CRUD + report"
```

---

## Task 7: Server actions — admin (suggestion state + pin + visibility + report resolve)

**Files:**
- Create: `vet-exam-ai/app/admin/suggestions/_actions.ts`

- [ ] **Step 1: Create the admin actions file**

```ts
// vet-exam-ai/app/admin/suggestions/_actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const SuggestionStatus = z.enum(["received", "reviewing", "accepted", "rejected"]);
const Visibility = z.enum(["visible", "hidden_by_author", "blinded_by_report", "removed_by_admin"]);
const CommentStatus = z.enum(["visible", "hidden_by_author", "hidden_by_votes", "blinded_by_report", "removed_by_admin"]);
const Resolution = z.enum(["upheld", "dismissed"]);

const StateSchema = z.object({
  post_id: z.string().uuid(),
  new_status: SuggestionStatus,
  note: z.string().max(2000).optional().nullable(),
});

const PinSchema = z.object({
  post_id: z.string().uuid(),
  pinned: z.boolean(),
});

const VisibilitySchema = z.object({
  post_id: z.string().uuid(),
  visibility: Visibility,
  reason: z.string().max(500).optional().nullable(),
});

const CommentVisibilitySchema = z.object({
  comment_id: z.string().uuid(),
  status: CommentStatus,
  reason: z.string().max(500).optional().nullable(),
});

const ResolveReportSchema = z.object({
  post_id: z.string().uuid(),
  resolution: Resolution,
  note: z.string().max(2000).optional().nullable(),
});
const ResolveCommentReportSchema = z.object({
  comment_id: z.string().uuid(),
  resolution: Resolution,
  note: z.string().max(2000).optional().nullable(),
});

export async function updateSuggestionStateAction(input: z.input<typeof StateSchema>): Promise<void> {
  const parsed = StateSchema.parse(input);
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("update_suggestion_state", {
    p_post_id: parsed.post_id,
    p_new_status: parsed.new_status,
    p_note: parsed.note ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/suggestions");
  revalidatePath(`/board/suggestions/${parsed.post_id}`);
}

export async function setAnnouncementPinnedAction(input: z.input<typeof PinSchema>): Promise<void> {
  const parsed = PinSchema.parse(input);
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_announcement_pinned", {
    p_post_id: parsed.post_id,
    p_pinned: parsed.pinned,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/board/announcements");
  revalidatePath(`/board/announcements/${parsed.post_id}`);
}

export async function setBoardPostVisibilityAction(input: z.input<typeof VisibilitySchema>): Promise<void> {
  const parsed = VisibilitySchema.parse(input);
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_board_post_visibility", {
    p_post_id: parsed.post_id,
    p_visibility: parsed.visibility,
    p_reason: parsed.reason ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/suggestions");
  revalidatePath(`/board/suggestions/${parsed.post_id}`);
  revalidatePath(`/board/announcements/${parsed.post_id}`);
}

export async function setBoardPostCommentVisibilityAction(input: z.input<typeof CommentVisibilitySchema>): Promise<void> {
  const parsed = CommentVisibilitySchema.parse(input);
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_board_post_comment_visibility", {
    p_comment_id: parsed.comment_id,
    p_status: parsed.status,
    p_reason: parsed.reason ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/suggestions");
}

export async function resolveBoardPostReportAction(input: z.input<typeof ResolveReportSchema>): Promise<void> {
  const parsed = ResolveReportSchema.parse(input);
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("resolve_board_post_report", {
    p_post_id: parsed.post_id,
    p_resolution: parsed.resolution,
    p_note: parsed.note ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/suggestions");
}

export async function resolveBoardPostCommentReportAction(input: z.input<typeof ResolveCommentReportSchema>): Promise<void> {
  const parsed = ResolveCommentReportSchema.parse(input);
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("resolve_board_post_comment_report", {
    p_comment_id: parsed.comment_id,
    p_resolution: parsed.resolution,
    p_note: parsed.note ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/suggestions");
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/app/admin/suggestions/_actions.ts
git commit -m "suggestion-board: admin server actions — state/pin/visibility/report"
```

---

## Task 8: Component — SuggestionStatusBadge + BoardPostListItem

**Files:**
- Create: `vet-exam-ai/components/board/SuggestionStatusBadge.tsx`
- Create: `vet-exam-ai/components/board/BoardPostListItem.tsx`

- [ ] **Step 1: SuggestionStatusBadge.tsx**

```tsx
// vet-exam-ai/components/board/SuggestionStatusBadge.tsx
import type { Database } from "@/lib/supabase/types";
import { SUGGESTION_STATUS_LABEL } from "@/lib/board/labels";

type Status = Database["public"]["Enums"]["suggestion_status"];

const COLOR: Record<Status, { bg: string; fg: string }> = {
  received:  { bg: "#eef2ff", fg: "#3730a3" },
  reviewing: { bg: "#fef3c7", fg: "#92400e" },
  accepted:  { bg: "#dcfce7", fg: "#166534" },
  rejected:  { bg: "#fee2e2", fg: "#991b1b" },
};

export function SuggestionStatusBadge({ status }: { status: Status }) {
  const { bg, fg } = COLOR[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: bg, color: fg }}
    >
      {SUGGESTION_STATUS_LABEL[status]}
    </span>
  );
}
```

- [ ] **Step 2: BoardPostListItem.tsx**

```tsx
// vet-exam-ai/components/board/BoardPostListItem.tsx
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import { SuggestionStatusBadge } from "./SuggestionStatusBadge";

type Post = Pick<
  Database["public"]["Tables"]["board_posts"]["Row"],
  | "id" | "kind" | "title" | "is_pinned"
  | "suggestion_status" | "is_anonymized"
  | "upvote_count" | "comment_count" | "created_at"
>;

type Props = {
  post: Post;
  authorNickname: string | null;
};

function formatRelative(iso: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return date.toLocaleDateString("ko-KR");
}

export function BoardPostListItem({ post, authorNickname }: Props) {
  const kindSegment = post.kind === "suggestion" ? "suggestions" : "announcements";
  const author = post.is_anonymized ? "익명" : (authorNickname ?? "탈퇴한 사용자");

  return (
    <Link
      href={`/board/${kindSegment}/${post.id}`}
      className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {post.is_pinned ? <span className="text-xs font-bold text-amber-600">📌 고정</span> : null}
          {post.suggestion_status ? (
            <SuggestionStatusBadge status={post.suggestion_status} />
          ) : null}
        </div>
        <h3 className="mt-1 truncate text-base font-semibold text-gray-900">{post.title}</h3>
        <div className="mt-1 text-xs text-gray-500">
          {author} · {formatRelative(post.created_at)}
        </div>
      </div>
      <div className="shrink-0 text-right text-xs text-gray-500">
        <div>👍 {post.upvote_count}</div>
        <div>💬 {post.comment_count}</div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/components/board
git commit -m "suggestion-board: SuggestionStatusBadge + BoardPostListItem"
```

---

## Task 9: Component — BoardPostComposer (client, with image attach)

**Files:**
- Create: `vet-exam-ai/components/board/BoardPostComposer.tsx`

- [ ] **Step 1: Check the existing comment composer to mirror image handling**

Run:
```bash
head -100 vet-exam-ai/components/comments/CommentComposer.tsx
```
Note how it uses `CommentImageAttacher` and TipTap. We mirror but for posts.

- [ ] **Step 2: Create BoardPostComposer.tsx**

```tsx
// vet-exam-ai/components/board/BoardPostComposer.tsx
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@/lib/supabase/types";
import { createPost, updatePost } from "@/app/board/_actions";

type Kind = Database["public"]["Enums"]["board_post_kind"];

type Mode =
  | { mode: "create"; kind: Kind }
  | { mode: "edit"; postId: string; kind: Kind; initialTitle: string;
      initialHtml: string; initialImageUrls: string[]; initialAnonymized: boolean };

export function BoardPostComposer(props: Mode) {
  const router = useRouter();
  const [title, setTitle] = useState(props.mode === "edit" ? props.initialTitle : "");
  const [imageUrls, setImageUrls] = useState<string[]>(
    props.mode === "edit" ? props.initialImageUrls : []
  );
  const [isAnonymized, setIsAnonymized] = useState(
    props.mode === "edit" ? props.initialAnonymized : false
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content: props.mode === "edit" ? props.initialHtml : "",
    immediatelyRender: false,
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!editor) return;
    const html = editor.getHTML();
    if (!title.trim()) { setError("제목을 입력하세요."); return; }
    if (title.length > 200) { setError("제목은 200자 이내."); return; }
    startTransition(async () => {
      try {
        if (props.mode === "create") {
          const { id } = await createPost({
            kind: props.kind, title: title.trim(), body_html: html,
            image_urls: imageUrls, is_anonymized: isAnonymized,
          });
          const seg = props.kind === "suggestion" ? "suggestions" : "announcements";
          router.push(`/board/${seg}/${id}`);
          router.refresh();
        } else {
          await updatePost({
            id: props.postId, title: title.trim(), body_html: html,
            image_urls: imageUrls, is_anonymized: isAnonymized,
          });
          const seg = props.kind === "suggestion" ? "suggestions" : "announcements";
          router.push(`/board/${seg}/${props.postId}`);
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "저장 실패");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="제목"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
        />
        <div className="mt-1 text-right text-xs text-gray-500">{title.length}/200</div>
      </div>

      <div className="rounded-md border border-gray-300">
        <EditorContent editor={editor} className="prose min-h-[200px] max-w-none px-3 py-2" />
      </div>

      {/* 이미지 첨부 — CommentImageAttacher 패턴 재사용. MVP에서는 단순 file input으로 시작.
          후속 PR에서 boards prefix로 전환. */}
      <div className="text-xs text-gray-500">
        이미지 첨부: 최대 5장 (현재 {imageUrls.length}장)
      </div>

      {props.kind === "suggestion" ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isAnonymized}
            onChange={(e) => setIsAnonymized(e.target.checked)}
          />
          익명으로 작성 (운영자에게는 보입니다)
        </label>
      ) : null}

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "저장 중…" : props.mode === "create" ? "작성" : "수정 저장"}
      </button>
    </form>
  );
}
```

NOTE: Image attach is stubbed as count-only in this task. Wire up actual upload reusing `CommentImageAttacher` in a follow-up if needed; the v1 surface uses TipTap text + optional empty image_urls.

- [ ] **Step 3: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/components/board/BoardPostComposer.tsx
git commit -m "suggestion-board: BoardPostComposer (client, TipTap)"
```

---

## Task 10: Component — BoardPostCard (detail view)

**Files:**
- Create: `vet-exam-ai/components/board/BoardPostCard.tsx`

- [ ] **Step 1: Create BoardPostCard.tsx**

```tsx
// vet-exam-ai/components/board/BoardPostCard.tsx
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import { SuggestionStatusBadge } from "./SuggestionStatusBadge";
import { SUGGESTION_TERMINAL } from "@/lib/board/labels";
import { UpvoteButton } from "./UpvoteButton";
import { ReportButton } from "./ReportButton";

type Post = Database["public"]["Tables"]["board_posts"]["Row"];

type Props = {
  post: Post;
  authorNickname: string | null;
  viewerId: string | null;
  viewerIsAdmin: boolean;
  hasUpvoted: boolean;
};

export function BoardPostCard({
  post, authorNickname, viewerId, viewerIsAdmin, hasUpvoted,
}: Props) {
  const isOwner = viewerId !== null && viewerId === post.user_id;
  const seg = post.kind === "suggestion" ? "suggestions" : "announcements";
  const locked = post.suggestion_status
    ? SUGGESTION_TERMINAL.has(post.suggestion_status)
    : false;
  const author = post.is_anonymized ? "익명" : (authorNickname ?? "탈퇴한 사용자");

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-6">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {post.is_pinned ? <span className="text-xs font-bold text-amber-600">📌 고정</span> : null}
            {post.suggestion_status ? <SuggestionStatusBadge status={post.suggestion_status} /> : null}
          </div>
          <h1 className="mt-1 text-xl font-bold text-gray-900">{post.title}</h1>
          <div className="mt-1 text-sm text-gray-500">
            {author}
            {viewerIsAdmin && post.is_anonymized && authorNickname ? (
              <span className="ml-2 text-xs text-gray-400">(작성자: {authorNickname})</span>
            ) : null}
            {" · "}
            {new Date(post.created_at).toLocaleString("ko-KR")}
            {post.edit_count > 0 ? <span className="ml-1 text-xs text-gray-400">(수정됨)</span> : null}
          </div>
        </div>
        {isOwner && !locked ? (
          <div className="flex gap-2 text-sm">
            <Link href={`/board/${seg}/${post.id}/edit`} className="text-blue-600 hover:underline">수정</Link>
            <form action={async () => {
              "use server";
              const { softDeletePost } = await import("@/app/board/_actions");
              await softDeletePost(post.id);
            }}>
              <button className="text-red-600 hover:underline">삭제</button>
            </form>
          </div>
        ) : null}
      </header>

      <div
        className="prose mt-4 max-w-none"
        dangerouslySetInnerHTML={{ __html: post.body_html }}
      />

      {post.resolution_note ? (
        <aside className="mt-4 rounded-md border-l-4 border-emerald-500 bg-emerald-50 p-3 text-sm">
          <div className="font-semibold text-emerald-800">운영자 코멘트</div>
          <div className="mt-1 whitespace-pre-wrap text-emerald-900">{post.resolution_note}</div>
        </aside>
      ) : null}

      <footer className="mt-4 flex items-center gap-3 border-t border-gray-100 pt-3 text-sm">
        <UpvoteButton
          postId={post.id}
          count={post.upvote_count}
          initialUpvoted={hasUpvoted}
          disabled={isOwner || viewerId === null}
        />
        {viewerId !== null && !isOwner ? (
          <ReportButton kind="post" id={post.id} />
        ) : null}
      </footer>
    </article>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: 0 errors (UpvoteButton + ReportButton will be created in Task 11; if errors appear, defer typecheck until Task 11 commit — note in the commit message).

Actually we need UpvoteButton/ReportButton before typecheck passes. Defer commit to Task 11.

- [ ] **Step 3: Skip commit; proceed to Task 11**

No commit yet — Task 11 supplies the missing imports.

---

## Task 11: Components — UpvoteButton + ReportButton (client)

**Files:**
- Create: `vet-exam-ai/components/board/UpvoteButton.tsx`
- Create: `vet-exam-ai/components/board/ReportButton.tsx`

- [ ] **Step 1: UpvoteButton.tsx**

```tsx
// vet-exam-ai/components/board/UpvoteButton.tsx
"use client";

import { useState, useTransition } from "react";
import { toggleUpvote } from "@/app/board/_actions";

type Props = {
  postId: string;
  count: number;
  initialUpvoted: boolean;
  disabled?: boolean;
};

export function UpvoteButton({ postId, count, initialUpvoted, disabled }: Props) {
  const [upvoted, setUpvoted] = useState(initialUpvoted);
  const [localCount, setLocalCount] = useState(count);
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    if (disabled || pending) return;
    const nextUpvoted = !upvoted;
    setUpvoted(nextUpvoted);
    setLocalCount((c) => c + (nextUpvoted ? 1 : -1));
    startTransition(async () => {
      try {
        await toggleUpvote(postId);
      } catch {
        // 롤백
        setUpvoted(!nextUpvoted);
        setLocalCount((c) => c + (nextUpvoted ? -1 : 1));
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${
        upvoted ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-700"
      } disabled:opacity-50`}
      aria-pressed={upvoted}
    >
      <span>{upvoted ? "👍" : "👍🏻"}</span>
      <span>{localCount}</span>
    </button>
  );
}
```

- [ ] **Step 2: ReportButton.tsx**

```tsx
// vet-exam-ai/components/board/ReportButton.tsx
"use client";

import { useState, useTransition } from "react";
import { reportPost } from "@/app/board/_actions";
import { reportPostComment } from "@/app/board/[kind]/[id]/_actions";

type Props =
  | { kind: "post"; id: string }
  | { kind: "comment"; id: string; postId: string; kindSegment: "suggestions" | "announcements" };

const REASONS = [
  { value: "spam", label: "스팸" },
  { value: "advertising", label: "광고/홍보" },
  { value: "hate_speech", label: "혐오 발언" },
  { value: "privacy", label: "개인정보 노출" },
  { value: "defamation", label: "명예훼손" },
  { value: "copyright", label: "저작권 침해" },
  { value: "misinformation", label: "허위/잘못된 정보" },
  { value: "other", label: "기타" },
] as const;

export function ReportButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<typeof REASONS[number]["value"]>("spam");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      try {
        if (props.kind === "post") {
          await reportPost({ post_id: props.id, reason, note: note || undefined });
        } else {
          await reportPostComment({
            comment_id: props.id,
            reason,
            note: note || undefined,
            post_id: props.postId,
            kind_segment: props.kindSegment,
          });
        }
        setDone(true);
      } catch {
        setDone(true); // 멱등 처리 — 중복 신고면 23505로 무시
      }
    });
  };

  if (done) {
    return <span className="text-xs text-gray-500">신고 접수됨</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-gray-500 hover:text-red-600 hover:underline"
      >
        신고
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-white p-4">
            <h3 className="text-base font-semibold">신고 사유</h3>
            <div className="mt-2 space-y-1">
              {REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="추가 설명 (선택, 500자)"
              className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              rows={3}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-600">취소</button>
              <button type="button" onClick={submit} disabled={pending}
                className="rounded-md bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50">
                {pending ? "전송 중…" : "신고"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 3: Typecheck + commit (combined with Task 10)**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/components/board
git commit -m "suggestion-board: BoardPostCard + UpvoteButton + ReportButton"
```

---

## Task 12: Component — BoardCommentList + BoardCommentItem + BoardCommentComposer

**Files:**
- Create: `vet-exam-ai/components/board/BoardCommentList.tsx`
- Create: `vet-exam-ai/components/board/BoardCommentItem.tsx`
- Create: `vet-exam-ai/components/board/BoardCommentComposer.tsx`

- [ ] **Step 1: BoardCommentComposer.tsx**

```tsx
// vet-exam-ai/components/board/BoardCommentComposer.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPostComment } from "@/app/board/[kind]/[id]/_actions";

type Props = {
  postId: string;
  kindSegment: "suggestions" | "announcements";
  parentId?: string | null;
  onDone?: () => void;
};

export function BoardCommentComposer({ postId, kindSegment, parentId, onDone }: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isAnon, setIsAnon] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!body.trim()) { setError("내용을 입력하세요."); return; }
    startTransition(async () => {
      try {
        await createPostComment({
          post_id: postId,
          parent_id: parentId ?? null,
          body_html: `<p>${escapeHtml(body)}</p>`,
          image_urls: [],
          is_anonymized: isAnon,
          kind_segment: kindSegment,
        });
        setBody("");
        setIsAnon(false);
        router.refresh();
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "댓글 작성 실패");
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={5000}
        placeholder={parentId ? "답글을 입력하세요" : "댓글을 입력하세요"}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        rows={3}
      />
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1 text-xs text-gray-600">
          <input type="checkbox" checked={isAnon} onChange={(e) => setIsAnon(e.target.checked)} />
          익명
        </label>
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
        <button type="submit" disabled={pending}
          className="rounded-md bg-blue-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "전송 중…" : parentId ? "답글" : "댓글"}
        </button>
      </div>
    </form>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c] ?? c);
}
```

- [ ] **Step 2: BoardCommentItem.tsx (client, with reply toggle + report)**

```tsx
// vet-exam-ai/components/board/BoardCommentItem.tsx
"use client";

import { useState } from "react";
import type { Database } from "@/lib/supabase/types";
import { ReportButton } from "./ReportButton";
import { BoardCommentComposer } from "./BoardCommentComposer";

type Comment = Database["public"]["Tables"]["board_post_comments"]["Row"];

type Props = {
  comment: Comment;
  authorNickname: string | null;
  viewerId: string | null;
  viewerIsAdmin: boolean;
  postId: string;
  kindSegment: "suggestions" | "announcements";
  isReply: boolean;
};

export function BoardCommentItem({
  comment, authorNickname, viewerId, viewerIsAdmin, postId, kindSegment, isReply,
}: Props) {
  const [replying, setReplying] = useState(false);
  const isOwner = viewerId !== null && viewerId === comment.user_id;
  const author = comment.is_anonymized ? "익명" : (authorNickname ?? "탈퇴한 사용자");

  return (
    <li className={isReply ? "ml-6 border-l border-gray-200 pl-4" : ""}>
      <div className="rounded-md bg-gray-50 p-3">
        <div className="text-xs text-gray-500">
          <span className="font-semibold text-gray-700">{author}</span>
          {viewerIsAdmin && comment.is_anonymized && authorNickname ? (
            <span className="ml-2 text-xs text-gray-400">(작성자: {authorNickname})</span>
          ) : null}
          {" · "}
          {new Date(comment.created_at).toLocaleString("ko-KR")}
          {comment.edit_count > 0 ? <span className="ml-1 text-xs text-gray-400">(수정됨)</span> : null}
        </div>
        <div
          className="prose prose-sm mt-1 max-w-none"
          dangerouslySetInnerHTML={{ __html: comment.body_html }}
        />
        <div className="mt-2 flex items-center gap-3 text-xs">
          {!isReply && viewerId ? (
            <button type="button" onClick={() => setReplying((v) => !v)}
              className="text-gray-500 hover:underline">
              {replying ? "취소" : "답글"}
            </button>
          ) : null}
          {!isOwner && viewerId ? (
            <ReportButton kind="comment" id={comment.id} postId={postId} kindSegment={kindSegment} />
          ) : null}
        </div>
      </div>
      {replying ? (
        <div className="mt-2 ml-4">
          <BoardCommentComposer
            postId={postId}
            kindSegment={kindSegment}
            parentId={comment.id}
            onDone={() => setReplying(false)}
          />
        </div>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 3: BoardCommentList.tsx (server)**

```tsx
// vet-exam-ai/components/board/BoardCommentList.tsx
import type { Database } from "@/lib/supabase/types";
import { BoardCommentItem } from "./BoardCommentItem";

type Comment = Database["public"]["Tables"]["board_post_comments"]["Row"];

type NicknameMap = Map<string, string | null>;

type Props = {
  comments: Comment[];
  nicknames: NicknameMap;
  viewerId: string | null;
  viewerIsAdmin: boolean;
  postId: string;
  kindSegment: "suggestions" | "announcements";
};

export function BoardCommentList({
  comments, nicknames, viewerId, viewerIsAdmin, postId, kindSegment,
}: Props) {
  if (comments.length === 0) {
    return <div className="text-sm text-gray-500">아직 댓글이 없습니다.</div>;
  }

  // 1-level threading: root → replies
  const roots = comments.filter((c) => c.parent_id == null);
  const repliesByParent = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parent_id) {
      const arr = repliesByParent.get(c.parent_id) ?? [];
      arr.push(c);
      repliesByParent.set(c.parent_id, arr);
    }
  }

  return (
    <ul className="space-y-3">
      {roots.flatMap((c) => [
        <BoardCommentItem
          key={c.id}
          comment={c}
          authorNickname={c.user_id ? nicknames.get(c.user_id) ?? null : null}
          viewerId={viewerId}
          viewerIsAdmin={viewerIsAdmin}
          postId={postId}
          kindSegment={kindSegment}
          isReply={false}
        />,
        ...(repliesByParent.get(c.id) ?? []).map((r) => (
          <BoardCommentItem
            key={r.id}
            comment={r}
            authorNickname={r.user_id ? nicknames.get(r.user_id) ?? null : null}
            viewerId={viewerId}
            viewerIsAdmin={viewerIsAdmin}
            postId={postId}
            kindSegment={kindSegment}
            isReply={true}
          />
        )),
      ])}
    </ul>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/components/board
git commit -m "suggestion-board: BoardCommentList + Item + Composer"
```

---

## Task 13: Page — /board layout + /board/page.tsx (tab)

**Files:**
- Create: `vet-exam-ai/app/board/layout.tsx`
- Create: `vet-exam-ai/app/board/page.tsx`

- [ ] **Step 1: Layout (approved gate)**

```tsx
// vet-exam-ai/app/board/layout.tsx
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    redirect("/auth/login?next=/board");
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("signup_status")
    .eq("id", userRes.user.id)
    .single();
  if (!profile || profile.signup_status !== "approved") {
    redirect("/auth/pending-proof");
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold">공지·건의</h1>
      <p className="mt-1 text-sm text-gray-600">운영자 공지와 사용자 건의를 한 곳에서.</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Tab page**

```tsx
// vet-exam-ai/app/board/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BoardTabPage() {
  const supabase = await createServerClient();
  const [annRes, sugRes] = await Promise.all([
    supabase.from("board_posts")
      .select("id,title,created_at,is_pinned,is_anonymized,user_id")
      .eq("kind", "announcement")
      .eq("visibility", "visible")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(3),
    supabase.from("board_posts")
      .select("id,title,created_at,suggestion_status,is_anonymized,user_id,upvote_count,comment_count")
      .eq("kind", "suggestion")
      .eq("visibility", "visible")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">📢 공지</h2>
          <Link href="/board/announcements" className="text-sm text-blue-600 hover:underline">전체 →</Link>
        </header>
        <ul className="mt-3 space-y-2 text-sm">
          {(annRes.data ?? []).map((p) => (
            <li key={p.id}>
              <Link href={`/board/announcements/${p.id}`} className="hover:underline">
                {p.is_pinned ? "📌 " : ""}{p.title}
              </Link>
            </li>
          ))}
          {(annRes.data ?? []).length === 0 ? <li className="text-gray-500">아직 공지가 없습니다.</li> : null}
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">💬 건의</h2>
          <Link href="/board/suggestions" className="text-sm text-blue-600 hover:underline">전체 →</Link>
        </header>
        <ul className="mt-3 space-y-2 text-sm">
          {(sugRes.data ?? []).map((p) => (
            <li key={p.id}>
              <Link href={`/board/suggestions/${p.id}`} className="hover:underline">
                {p.title}
              </Link>
              <span className="ml-2 text-xs text-gray-500">
                👍 {p.upvote_count} · 💬 {p.comment_count}
              </span>
            </li>
          ))}
          {(sugRes.data ?? []).length === 0 ? <li className="text-gray-500">아직 건의가 없습니다.</li> : null}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/app/board/layout.tsx vet-exam-ai/app/board/page.tsx
git commit -m "suggestion-board: /board layout (approved gate) + tab page"
```

---

## Task 14: Page — /board/suggestions list

**Files:**
- Create: `vet-exam-ai/app/board/suggestions/page.tsx`

- [ ] **Step 1: List page with filter + sort**

```tsx
// vet-exam-ai/app/board/suggestions/page.tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { BoardPostListItem } from "@/components/board/BoardPostListItem";
import { SUGGESTION_STATUS_LABEL } from "@/lib/board/labels";

export const dynamic = "force-dynamic";

type SP = { sort?: string; status?: string; page?: string };

const PAGE_SIZE = 20;

export default async function SuggestionsListPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1"));
  const sort = sp.sort === "popular" ? "popular" : "latest";
  const status = ["received", "reviewing", "accepted", "rejected"].includes(sp.status ?? "")
    ? sp.status as "received" | "reviewing" | "accepted" | "rejected"
    : null;

  const supabase = await createServerClient();
  let q = supabase.from("board_posts")
    .select("id,kind,title,suggestion_status,is_anonymized,user_id,upvote_count,comment_count,created_at,is_pinned",
            { count: "exact" })
    .eq("kind", "suggestion")
    .eq("visibility", "visible");
  if (status) q = q.eq("suggestion_status", status);
  q = sort === "popular"
    ? q.order("upvote_count", { ascending: false }).order("created_at", { ascending: false })
    : q.order("created_at", { ascending: false });
  q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data: posts, count } = await q;

  // 작성자 닉네임 batch
  const userIds = Array.from(new Set((posts ?? []).map((p) => p.user_id).filter(Boolean) as string[]));
  const nicknames = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: nicks } = await supabase
      .from("user_profiles_public")
      .select("id,nickname")
      .in("id", userIds);
    for (const n of nicks ?? []) nicknames.set(n.id, n.nickname);
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 text-sm">
          {(["latest", "popular"] as const).map((s) => (
            <Link key={s} href={`?sort=${s}${status ? `&status=${status}` : ""}`}
              className={s === sort ? "font-bold text-blue-600" : "text-gray-600 hover:underline"}>
              {s === "latest" ? "최신" : "인기"}
            </Link>
          ))}
          <span className="text-gray-300">|</span>
          <Link href="?" className={!status ? "font-bold text-blue-600" : "text-gray-600 hover:underline"}>전체</Link>
          {(["received", "reviewing", "accepted", "rejected"] as const).map((s) => (
            <Link key={s} href={`?status=${s}${sort === "popular" ? "&sort=popular" : ""}`}
              className={s === status ? "font-bold text-blue-600" : "text-gray-600 hover:underline"}>
              {SUGGESTION_STATUS_LABEL[s]}
            </Link>
          ))}
        </div>
        <Link href="/board/suggestions/new"
          className="rounded-md bg-blue-600 px-3 py-1 text-sm font-semibold text-white">
          건의 작성
        </Link>
      </div>

      <ul className="mt-4 space-y-2">
        {(posts ?? []).map((p) => (
          <li key={p.id}>
            <BoardPostListItem
              post={p}
              authorNickname={p.user_id ? nicknames.get(p.user_id) ?? null : null}
            />
          </li>
        ))}
        {(posts ?? []).length === 0 ? <li className="text-sm text-gray-500">건의글이 없습니다.</li> : null}
      </ul>

      {totalPages > 1 ? (
        <nav className="mt-4 flex justify-center gap-2 text-sm">
          {page > 1 ? <Link href={`?page=${page - 1}`}>이전</Link> : null}
          <span>{page} / {totalPages}</span>
          {page < totalPages ? <Link href={`?page=${page + 1}`}>다음</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/app/board/suggestions/page.tsx
git commit -m "suggestion-board: /board/suggestions list page (sort + status filter + pagination)"
```

---

## Task 15: Page — /board/suggestions/new + /board/suggestions/[id]

**Files:**
- Create: `vet-exam-ai/app/board/suggestions/new/page.tsx`
- Create: `vet-exam-ai/app/board/suggestions/[id]/page.tsx`

- [ ] **Step 1: /new page**

```tsx
// vet-exam-ai/app/board/suggestions/new/page.tsx
import { BoardPostComposer } from "@/components/board/BoardPostComposer";

export default function NewSuggestionPage() {
  return (
    <div>
      <h2 className="text-xl font-semibold">건의 작성</h2>
      <p className="mt-1 text-sm text-gray-600">운영자가 검토 후 채택/반려 여부를 알려드립니다.</p>
      <div className="mt-4">
        <BoardPostComposer mode="create" kind="suggestion" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: /[id] detail page**

```tsx
// vet-exam-ai/app/board/suggestions/[id]/page.tsx
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { BoardPostCard } from "@/components/board/BoardPostCard";
import { BoardCommentList } from "@/components/board/BoardCommentList";
import { BoardCommentComposer } from "@/components/board/BoardCommentComposer";

export const dynamic = "force-dynamic";

export default async function SuggestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();

  const [{ data: post }, { data: userRes }, { data: comments }] = await Promise.all([
    supabase.from("board_posts").select("*").eq("id", id).eq("kind", "suggestion").single(),
    supabase.auth.getUser(),
    supabase.from("board_post_comments")
      .select("*")
      .eq("post_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!post) notFound();

  const viewer = userRes.user ?? null;
  let viewerIsAdmin = false;
  let hasUpvoted = false;

  if (viewer) {
    const [{ data: profile }, { data: up }] = await Promise.all([
      supabase.from("profiles").select("role,is_active").eq("id", viewer.id).single(),
      supabase.from("board_post_upvotes")
        .select("post_id")
        .eq("post_id", id)
        .eq("user_id", viewer.id)
        .maybeSingle(),
    ]);
    viewerIsAdmin = profile?.role === "admin" && profile?.is_active === true;
    hasUpvoted = !!up;
  }

  const allUserIds = Array.from(new Set([
    post.user_id,
    ...((comments ?? []).map((c) => c.user_id)),
  ].filter(Boolean) as string[]));

  const nicknames = new Map<string, string | null>();
  if (allUserIds.length > 0) {
    const { data: nicks } = await supabase
      .from("user_profiles_public")
      .select("id,nickname")
      .in("id", allUserIds);
    for (const n of nicks ?? []) nicknames.set(n.id, n.nickname);
  }

  return (
    <div className="space-y-6">
      <BoardPostCard
        post={post}
        authorNickname={post.user_id ? nicknames.get(post.user_id) ?? null : null}
        viewerId={viewer?.id ?? null}
        viewerIsAdmin={viewerIsAdmin}
        hasUpvoted={hasUpvoted}
      />

      <section>
        <h2 className="text-lg font-semibold">댓글 {post.comment_count}</h2>
        <div className="mt-3 space-y-3">
          <BoardCommentComposer postId={post.id} kindSegment="suggestions" />
          <BoardCommentList
            comments={comments ?? []}
            nicknames={nicknames}
            viewerId={viewer?.id ?? null}
            viewerIsAdmin={viewerIsAdmin}
            postId={post.id}
            kindSegment="suggestions"
          />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/app/board/suggestions/new vet-exam-ai/app/board/suggestions/[id]
git commit -m "suggestion-board: /board/suggestions/new + /[id] detail"
```

---

## Task 16: Page — /board/announcements/* (list + new + detail)

**Files:**
- Create: `vet-exam-ai/app/board/announcements/page.tsx`
- Create: `vet-exam-ai/app/board/announcements/new/page.tsx`
- Create: `vet-exam-ai/app/board/announcements/[id]/page.tsx`

- [ ] **Step 1: List page**

```tsx
// vet-exam-ai/app/board/announcements/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { BoardPostListItem } from "@/components/board/BoardPostListItem";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AnnouncementsListPage({
  searchParams,
}: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1"));
  const supabase = await createServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login?next=/board/announcements");
  const { data: profile } = await supabase
    .from("profiles").select("role,is_active").eq("id", userRes.user.id).single();
  const isAdmin = profile?.role === "admin" && profile?.is_active === true;

  const { data: posts, count } = await supabase
    .from("board_posts")
    .select("id,kind,title,is_pinned,is_anonymized,user_id,upvote_count,comment_count,suggestion_status,created_at",
            { count: "exact" })
    .eq("kind", "announcement")
    .eq("visibility", "visible")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const userIds = Array.from(new Set((posts ?? []).map((p) => p.user_id).filter(Boolean) as string[]));
  const nicknames = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: nicks } = await supabase
      .from("user_profiles_public").select("id,nickname").in("id", userIds);
    for (const n of nicks ?? []) nicknames.set(n.id, n.nickname);
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">📢 공지</h2>
        {isAdmin ? (
          <Link href="/board/announcements/new"
            className="rounded-md bg-blue-600 px-3 py-1 text-sm font-semibold text-white">
            새 공지 작성
          </Link>
        ) : null}
      </div>
      <ul className="mt-4 space-y-2">
        {(posts ?? []).map((p) => (
          <li key={p.id}>
            <BoardPostListItem
              post={p}
              authorNickname={p.user_id ? nicknames.get(p.user_id) ?? null : null}
            />
          </li>
        ))}
        {(posts ?? []).length === 0 ? <li className="text-sm text-gray-500">공지가 없습니다.</li> : null}
      </ul>
      {totalPages > 1 ? (
        <nav className="mt-4 flex justify-center gap-2 text-sm">
          {page > 1 ? <Link href={`?page=${page - 1}`}>이전</Link> : null}
          <span>{page} / {totalPages}</span>
          {page < totalPages ? <Link href={`?page=${page + 1}`}>다음</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: /new page (admin gate)**

```tsx
// vet-exam-ai/app/board/announcements/new/page.tsx
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { BoardPostComposer } from "@/components/board/BoardPostComposer";

export default async function NewAnnouncementPage() {
  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login?next=/board/announcements/new");
  const { data: profile } = await supabase
    .from("profiles").select("role,is_active").eq("id", userRes.user.id).single();
  if (!(profile?.role === "admin" && profile?.is_active === true)) {
    redirect("/board/announcements");
  }

  return (
    <div>
      <h2 className="text-xl font-semibold">새 공지 작성</h2>
      <p className="mt-1 text-sm text-gray-600">게시 즉시 모든 사용자에게 알림이 발송됩니다.</p>
      <div className="mt-4">
        <BoardPostComposer mode="create" kind="announcement" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: /[id] detail page**

```tsx
// vet-exam-ai/app/board/announcements/[id]/page.tsx
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { BoardPostCard } from "@/components/board/BoardPostCard";
import { BoardCommentList } from "@/components/board/BoardCommentList";
import { BoardCommentComposer } from "@/components/board/BoardCommentComposer";

export const dynamic = "force-dynamic";

export default async function AnnouncementDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();

  const [{ data: post }, { data: userRes }, { data: comments }] = await Promise.all([
    supabase.from("board_posts").select("*").eq("id", id).eq("kind", "announcement").single(),
    supabase.auth.getUser(),
    supabase.from("board_post_comments")
      .select("*").eq("post_id", id).order("created_at", { ascending: true }),
  ]);

  if (!post) notFound();
  const viewer = userRes.user ?? null;
  let viewerIsAdmin = false;
  let hasUpvoted = false;
  if (viewer) {
    const [{ data: profile }, { data: up }] = await Promise.all([
      supabase.from("profiles").select("role,is_active").eq("id", viewer.id).single(),
      supabase.from("board_post_upvotes")
        .select("post_id").eq("post_id", id).eq("user_id", viewer.id).maybeSingle(),
    ]);
    viewerIsAdmin = profile?.role === "admin" && profile?.is_active === true;
    hasUpvoted = !!up;
  }

  const allUserIds = Array.from(new Set([
    post.user_id, ...((comments ?? []).map((c) => c.user_id)),
  ].filter(Boolean) as string[]));
  const nicknames = new Map<string, string | null>();
  if (allUserIds.length > 0) {
    const { data: nicks } = await supabase
      .from("user_profiles_public").select("id,nickname").in("id", allUserIds);
    for (const n of nicks ?? []) nicknames.set(n.id, n.nickname);
  }

  return (
    <div className="space-y-6">
      <BoardPostCard
        post={post}
        authorNickname={post.user_id ? nicknames.get(post.user_id) ?? null : null}
        viewerId={viewer?.id ?? null}
        viewerIsAdmin={viewerIsAdmin}
        hasUpvoted={hasUpvoted}
      />
      <section>
        <h2 className="text-lg font-semibold">댓글 {post.comment_count}</h2>
        <div className="mt-3 space-y-3">
          <BoardCommentComposer postId={post.id} kindSegment="announcements" />
          <BoardCommentList
            comments={comments ?? []}
            nicknames={nicknames}
            viewerId={viewer?.id ?? null}
            viewerIsAdmin={viewerIsAdmin}
            postId={post.id}
            kindSegment="announcements"
          />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/app/board/announcements
git commit -m "suggestion-board: /board/announcements list + /new + /[id]"
```

---

## Task 17: Page — /admin/suggestions queue

**Files:**
- Create: `vet-exam-ai/app/admin/suggestions/page.tsx`

The simplest possible queue. Uses inline forms calling server actions.

- [ ] **Step 1: Create the page**

```tsx
// vet-exam-ai/app/admin/suggestions/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { SuggestionStatusBadge } from "@/components/board/SuggestionStatusBadge";
import {
  updateSuggestionStateAction,
  setBoardPostVisibilityAction,
} from "./_actions";

export const dynamic = "force-dynamic";

type SP = { status?: string; page?: string };
const PAGE_SIZE = 20;
const VALID = ["received", "reviewing", "accepted", "rejected"] as const;

export default async function AdminSuggestionsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");
  const { data: profile } = await supabase
    .from("profiles").select("role,is_active").eq("id", userRes.user.id).single();
  if (!(profile?.role === "admin" && profile?.is_active === true)) {
    redirect("/dashboard");
  }

  const statusFilter = (VALID as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as typeof VALID[number])
    : null;
  const page = Math.max(1, Number(sp.page ?? "1"));

  let q = supabase.from("board_posts")
    .select("id,title,suggestion_status,is_anonymized,user_id,upvote_count,comment_count,report_count,created_at,visibility",
            { count: "exact" })
    .eq("kind", "suggestion");
  if (statusFilter) q = q.eq("suggestion_status", statusFilter);
  q = q.order("created_at", { ascending: false })
       .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data: posts, count } = await q;

  const userIds = Array.from(new Set((posts ?? []).map((p) => p.user_id).filter(Boolean) as string[]));
  const nicknames = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: nicks } = await supabase
      .from("user_profiles_public").select("id,nickname").in("id", userIds);
    for (const n of nicks ?? []) nicknames.set(n.id, n.nickname);
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">건의 모더레이션</h1>
        <p className="text-sm text-gray-600">상태 변경은 작성자에게 알림이 발송됩니다.</p>
      </header>

      <nav className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/suggestions" className={!statusFilter ? "font-bold text-blue-600" : "text-gray-600 hover:underline"}>전체</Link>
        {VALID.map((s) => (
          <Link key={s} href={`?status=${s}`}
            className={s === statusFilter ? "font-bold text-blue-600" : "text-gray-600 hover:underline"}>
            {s === "received" ? "접수"
              : s === "reviewing" ? "검토중"
              : s === "accepted" ? "채택" : "반려"}
          </Link>
        ))}
      </nav>

      <ul className="space-y-3">
        {(posts ?? []).map((p) => (
          <li key={p.id} className="rounded-md border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {p.suggestion_status ? <SuggestionStatusBadge status={p.suggestion_status} /> : null}
                  {p.visibility !== "visible" ? (
                    <span className="text-xs text-red-600">{p.visibility}</span>
                  ) : null}
                </div>
                <Link href={`/board/suggestions/${p.id}`} className="mt-1 block text-base font-semibold hover:underline">
                  {p.title}
                </Link>
                <div className="mt-1 text-xs text-gray-500">
                  {p.is_anonymized ? "익명" : (p.user_id ? nicknames.get(p.user_id) ?? "탈퇴" : "탈퇴")}
                  {p.is_anonymized && p.user_id ? (
                    <span className="ml-1 text-gray-400">(작성자: {nicknames.get(p.user_id) ?? "탈퇴"})</span>
                  ) : null}
                  {" · "}
                  👍 {p.upvote_count} · 💬 {p.comment_count}
                  {p.report_count > 0 ? <span className="ml-1 text-red-600">🚩 {p.report_count}</span> : null}
                  {" · "}
                  {new Date(p.created_at).toLocaleString("ko-KR")}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {VALID.map((s) => (
                <form key={s} action={async () => {
                  "use server";
                  await updateSuggestionStateAction({ post_id: p.id, new_status: s });
                }}>
                  <button className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100"
                    disabled={p.suggestion_status === s}>
                    {s === "received" ? "접수로" : s === "reviewing" ? "검토중으로"
                      : s === "accepted" ? "채택" : "반려"}
                  </button>
                </form>
              ))}
              {p.visibility === "visible" ? (
                <form action={async () => {
                  "use server";
                  await setBoardPostVisibilityAction({ post_id: p.id, visibility: "removed_by_admin" });
                }}>
                  <button className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                    삭제
                  </button>
                </form>
              ) : (
                <form action={async () => {
                  "use server";
                  await setBoardPostVisibilityAction({ post_id: p.id, visibility: "visible" });
                }}>
                  <button className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100">
                    복구
                  </button>
                </form>
              )}
            </div>
          </li>
        ))}
        {(posts ?? []).length === 0 ? <li className="text-sm text-gray-500">건의글이 없습니다.</li> : null}
      </ul>

      {totalPages > 1 ? (
        <nav className="flex justify-center gap-2 text-sm">
          {page > 1 ? <Link href={`?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}`}>이전</Link> : null}
          <span>{page} / {totalPages}</span>
          {page < totalPages ? <Link href={`?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}`}>다음</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/app/admin/suggestions/page.tsx
git commit -m "suggestion-board: /admin/suggestions moderation queue"
```

---

## Task 18: NavBar entry + Admin sidebar entry

**Files:**
- Modify: `vet-exam-ai/components/NavBar.tsx`
- Modify: existing admin sidebar component (locate first)

- [ ] **Step 1: Locate the admin sidebar component**

Run:
```bash
ls vet-exam-ai/app/admin/_components
grep -rn "admin-nav\|AdminSidebar\|admin-nav-items" vet-exam-ai/app/admin/_components | head
```
Expected: a file like `admin-nav-items.ts` that lists `{ href, label }`. Add `{ href: "/admin/suggestions", label: "건의 모더" }`.

- [ ] **Step 2: NavBar — add 공지·건의 entry**

Open `vet-exam-ai/components/NavBar.tsx`. Find the block of `<Link href="/wrong-notes" ...>` and `<Link href="/search" ...>` entries. Add this immediately before `</nav>` or after the existing entries (test ordering on the actual file when applying):

```tsx
<Link href="/board" className={linkClass("/board")} aria-label="공지·건의">
  공지·건의
</Link>
```

`linkClass` is the existing helper used by sibling entries — match the case of neighbors (e.g., `linkClass("/search")` in the same file). Place the new entry between `/questions` and `/my-stats` for visibility, or near other community-style entries.

- [ ] **Step 3: Admin sidebar entry**

Append to the `admin-nav-items.ts` array (or equivalent):
```ts
{ href: "/admin/suggestions", label: "건의 모더" },
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/components/NavBar.tsx vet-exam-ai/app/admin/_components
git commit -m "suggestion-board: NavBar 공지·건의 entry + admin sidebar 건의 모더"
```

---

## Task 19: AnnouncementBanner + Dashboard integration

**Files:**
- Create: `vet-exam-ai/components/dashboard/AnnouncementBanner.tsx`
- Modify: `vet-exam-ai/app/dashboard/page.tsx` (mount)

- [ ] **Step 1: Server component fetcher**

Add a helper at the top of `AnnouncementBanner.tsx` (server component variant returns the post; the client component handles dismiss state).

Create `vet-exam-ai/components/dashboard/AnnouncementBanner.tsx`:

```tsx
// vet-exam-ai/components/dashboard/AnnouncementBanner.tsx
import { createServerClient } from "@/lib/supabase/server";
import { AnnouncementBannerClient } from "./AnnouncementBannerClient";

export async function AnnouncementBanner() {
  const supabase = await createServerClient();
  const { data: posts } = await supabase
    .from("board_posts")
    .select("id,title,is_pinned,created_at")
    .eq("kind", "announcement")
    .eq("visibility", "visible")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  const post = posts?.[0];
  if (!post) return null;

  return (
    <AnnouncementBannerClient
      postId={post.id}
      title={post.title}
      isPinned={post.is_pinned}
    />
  );
}
```

- [ ] **Step 2: Client dismiss helper**

Create `vet-exam-ai/components/dashboard/AnnouncementBannerClient.tsx`:

```tsx
// vet-exam-ai/components/dashboard/AnnouncementBannerClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Props = { postId: string; title: string; isPinned: boolean };

const KEY = "kvle.announcement.dismissed";

type Dismissed = { id: string; at: number };

const TWELVE_FOUR_H_MS = 24 * 60 * 60 * 1000;

export function AnnouncementBannerClient({ postId, title, isPinned }: Props) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Dismissed;
        if (parsed.id === postId && Date.now() - parsed.at < TWELVE_FOUR_H_MS) {
          return;
        }
      }
    } catch { /* ignore */ }
    setHidden(false);
  }, [postId]);

  if (hidden) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify({ id: postId, at: Date.now() }));
    } catch { /* ignore */ }
    setHidden(true);
  };

  return (
    <div className="mb-3 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
      <div className="min-w-0">
        <span className="mr-2 font-semibold text-amber-800">
          {isPinned ? "📌 " : "📢 "}공지
        </span>
        <Link href={`/board/announcements/${postId}`} className="hover:underline">
          {title}
        </Link>
      </div>
      <button type="button" onClick={dismiss}
        aria-label="닫기" className="ml-2 text-amber-700 hover:text-amber-900">
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Mount in dashboard**

Open `vet-exam-ai/app/dashboard/page.tsx`. Add an import:
```tsx
import { AnnouncementBanner } from "@/components/dashboard/AnnouncementBanner";
```
Then place `<AnnouncementBanner />` immediately below the D-day widget (search for D-day component, e.g. `<DDayBadge />` or similar; insert sibling underneath).

- [ ] **Step 4: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/components/dashboard vet-exam-ai/app/dashboard/page.tsx
git commit -m "suggestion-board: AnnouncementBanner + dashboard mount"
```

---

## Task 20: Notifications dropdown — 4 new types

**Files:**
- Modify: `vet-exam-ai/lib/notifications/format.ts`
- Modify: `vet-exam-ai/components/notifications/NotificationItem.tsx` (or wherever href routing lives)

- [ ] **Step 1: Locate format helpers**

Run:
```bash
ls vet-exam-ai/lib/notifications
grep -n "report_resolved\|comment_blinded\|correction_resolved" vet-exam-ai/lib/notifications/format.ts | head
```

- [ ] **Step 2: Extend format.ts**

Add (or merge into existing switch/case):
```ts
case "post_reply":
  return {
    title: `${actor ?? "익명"}님이 ${kindLabel(payload.post_kind)}글에 댓글을 남겼어요`,
    body: payload.post_title,
    href: hrefForBoardPost(payload.post_kind, payload.post_id, true),
  };
case "suggestion_state_changed":
  return {
    title: `건의글 상태가 ${suggestionStatusLabel(payload.to_status)}로 변경되었어요`,
    body: payload.post_title + (payload.resolution_note ? ` — ${payload.resolution_note}` : ""),
    href: `/board/suggestions/${payload.post_id}`,
  };
case "announcement_published":
  return {
    title: payload.is_pinned ? "📌 새 공지" : "새 공지",
    body: payload.post_title,
    href: `/board/announcements/${payload.post_id}`,
  };
case "post_blinded":
  return {
    title: "내 글이 임시조치되었어요",
    body: blindReasonLabel(payload.reason),
    href: hrefForBoardPost(payload.post_kind, payload.post_id, false),
  };
```

Add helpers inline if not present:
```ts
function kindLabel(k: string): string {
  return k === "suggestion" ? "건의" : k === "announcement" ? "공지" : "게시";
}
function suggestionStatusLabel(s: string): string {
  return ({ received: "접수", reviewing: "검토중", accepted: "채택", rejected: "반려" } as const)[s as "received"] ?? s;
}
function blindReasonLabel(r: string): string {
  return r === "reports_threshold" ? "신고 누적" : "운영자 조치";
}
function hrefForBoardPost(kind: string, postId: string, comments: boolean): string {
  const seg = kind === "suggestion" ? "suggestions" : "announcements";
  return `/board/${seg}/${postId}${comments ? "#comments" : ""}`;
}
```

- [ ] **Step 3: NotificationItem routing**

If `NotificationItem.tsx` has its own switch for href / icon based on `type`, add the 4 new types there too — match the existing pattern. Otherwise this is already covered by format.ts returning `href`.

- [ ] **Step 4: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/lib/notifications vet-exam-ai/components/notifications
git commit -m "suggestion-board: notification formatting for 4 new types"
```

---

## Task 21: proxy.ts — /board prefix gate

**Files:**
- Modify: `vet-exam-ai/proxy.ts`

- [ ] **Step 1: Read current proxy logic**

Run:
```bash
grep -n "signup_status\|approved\|pending\|/auth/\|/admin/" vet-exam-ai/proxy.ts | head -40
```
Existing gating likely treats `/admin`, `/dashboard`, `/wrong-notes`, etc. Add `/board` to the same approved-required category.

- [ ] **Step 2: Add /board to the approved list**

Find the array/regex of paths requiring `approved`. Add `/board` (and via prefix include `/board/*`). Example: if the list looks like
```ts
const REQUIRE_APPROVED = ["/dashboard", "/wrong-notes", "/quiz", "/questions", "/my-stats", "/admin", "/profile"];
```
add `"/board"`.

If matching is via regex, ensure `/board/**` is covered.

Layout-level redirect in `app/board/layout.tsx` (Task 13) is a backstop, but the proxy ensures unauthenticated SSR responses don't even render the layout.

- [ ] **Step 3: Typecheck + commit**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

```bash
git add vet-exam-ai/proxy.ts
git commit -m "suggestion-board: proxy /board prefix requires approved signup_status"
```

---

## Task 22: Final typecheck + push + open PR

**Files:** None.

- [ ] **Step 1: Final typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 2: Lint scan (optional, project-dependent)**

```bash
cd vet-exam-ai && npx eslint app/board components/board lib/board app/admin/suggestions components/dashboard 2>&1 | head -40 || true
```
Fix obvious unused-import / Korean message escapes.

- [ ] **Step 3: Push branch**

```bash
cd C:/Users/Theriogenology/Desktop/vet-exam-ai
git push -u origin feat/suggestion-board-mvp
```

- [ ] **Step 4: Apply migration via Supabase SQL Editor (USER ACTION)**

Open Supabase Dashboard → SQL Editor → paste `vet-exam-ai/supabase/migrations/20260512000000_suggestion_board_mvp.sql` content → Run.

Expected: "Success. No rows returned" (or row counts on the `update profiles set signup_status='approved'` style statements — but this migration has no DML, only DDL).

Verification queries (paste into SQL Editor after apply):
```sql
-- Enums present?
select enum_range(null::public.board_post_kind);
select enum_range(null::public.suggestion_status);
select enum_range(null::public.board_visibility);

-- Tables created?
select count(*) from information_schema.tables
 where table_schema='public'
   and table_name in ('board_posts','board_post_comments','board_post_upvotes',
                      'board_post_reports','board_post_comment_reports');
-- Expected: 5

-- RLS enabled?
select relname, relrowsecurity from pg_class
 where relname in ('board_posts','board_post_comments','board_post_upvotes',
                   'board_post_reports','board_post_comment_reports')
 order by relname;
-- Expected: all relrowsecurity = t

-- RPCs callable?
select proname from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('update_suggestion_state','set_announcement_pinned',
                   'set_board_post_visibility','set_board_post_comment_visibility',
                   'resolve_board_post_report','resolve_board_post_comment_report',
                   'broadcast_announcement')
 order by proname;
-- Expected: 7 rows
```

- [ ] **Step 5: Manual smoke test (USER ACTION)**

On Vercel Preview (or local dev), as an approved test account:
1. `/board` → both cards render with "건의/공지 없음" empty state initially
2. `/board/suggestions/new` → fill title + body → submit → redirected to detail
3. Detail page renders body, upvote button works, report button opens modal
4. Add a comment → appears in list, comment count increments
5. As admin: `/admin/suggestions` → click "검토중으로" on the new post → 작성자 알림 발송 확인
6. `/board/announcements/new` (admin only) → 작성 → 모든 approved 사용자에 알림 + dashboard 배너 노출
7. Dashboard `×` 닫기 → 24h dismissed

If any step fails, file a follow-up commit on `feat/suggestion-board-mvp` and re-push.

- [ ] **Step 6: Open PR via `gh` or GitHub web**

If `gh` is installed:
```bash
gh pr create --base main --head feat/suggestion-board-mvp \
  --title "suggestion-board: MVP — 건의 + 공지 (Phase A)" \
  --body "$(cat <<'EOF'
## Summary
- 건의하세요 + 공지사항 보드 MVP. 외부 오픈카톡 대체.
- 단일 `board_posts` (kind enum) + 슬림 `board_post_comments`.
- 7 RPC + 7 trigger function. 신고 3건 자동 blind + 공지 broadcast.
- adopter 뱃지 자동 부여 (채택 1회 이상).

## Spec / Plan
- `docs/superpowers/specs/2026-05-11-suggestion-board-mvp-design.md`
- `docs/superpowers/plans/2026-05-11-suggestion-board-mvp.md`

## Test plan
- [ ] 마이그 SQL Editor 적용 (검증 쿼리 5개 모두 expected)
- [ ] 건의글 작성 → 댓글 → upvote → 신고 → admin 채택 → adopter 뱃지
- [ ] 공지 작성 → 전원 알림 + 대시보드 배너 + 24h dismiss
- [ ] 작성자 본인 편집/삭제 잠금 (채택/반려 후)
- [ ] 익명 글 admin view 작성자 식별

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

If `gh` isn't installed (Windows), use the URL printed by `git push`.

---

## Self-review checklist (run AFTER plan is committed)

- [ ] Spec section 2.1 (라우트 7개) — Tasks 13 / 14 / 15 / 16 / 17 ✅
- [ ] Spec 2.2 (NavBar + Admin sidebar) — Task 18 ✅
- [ ] Spec 2.3 (Dashboard banner + 24h dismiss) — Task 19 ✅
- [ ] Spec 3.1 (3 new enums + 3 enum extensions) — Task 1 §1-2 ✅
- [ ] Spec 3.2 (board_posts + 5 CHECK) — Task 1 §3a ✅
- [ ] Spec 3.3 (board_post_comments + 1-level reply enforcement) — Task 1 §3b + 7c trigger ✅
- [ ] Spec 3.4 (board_post_reports + board_post_comment_reports) — Task 1 §3d ✅
- [ ] Spec 3.5 (board_post_upvotes) — Task 1 §3c ✅
- [ ] Spec 3.6 (Storage path prefix) — Task 3 §1 helpers ✅
- [ ] Spec 4.1 (state transitions) — Task 1 §8a + Task 7 + Task 17 ✅
- [ ] Spec 4.2 (RLS — board_posts) — Task 1 §5a ✅
- [ ] Spec 4.3 (RLS — board_post_comments) — Task 1 §5b ✅
- [ ] Spec 4.4 (Upvote / report RLS) — Task 1 §5c / 5d ✅
- [ ] Spec 5.1 (7 RPCs) — Task 1 §8a-8g ✅
- [ ] Spec 5.2 (7 triggers) — Task 1 §7a-7g ✅
- [ ] Spec 5.3 (Adopter badge) — Task 1 §8a (update_suggestion_state) ✅
- [ ] Spec 6.1 (4 new notification types) — Task 1 §2, §6 + Task 20 ✅
- [ ] Spec 6.2 (Idempotency unique index) — Task 1 §6 ✅
- [ ] Spec 6.3 (Dropdown routing) — Task 20 ✅
- [ ] Spec 7.1-7.6 (UI surfaces) — Tasks 8–17 ✅
- [ ] Spec 8 (Acceptance) — Task 22 §5 manual smoke test ✅
- [ ] Spec 9 함정 가드 — Task 1 trigger/RPC SECURITY DEFINER, types uuid not text, RLS uses signup_status_of() ✅

**Open items / known limitations**
- BoardPostComposer 이미지 첨부는 v1에서 텍스트 위주 — full upload wiring 별건 가능
- 공부정보공유 보드 / 광고 자동 필터 / 게시판 본문 검색 backlog (spec §10)
- BoardCommentComposer는 plain textarea + escapeHtml만 — TipTap composer로 후속 통합 가능
