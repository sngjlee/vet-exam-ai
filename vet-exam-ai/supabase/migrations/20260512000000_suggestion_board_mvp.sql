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
