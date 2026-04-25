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
set search_path = public
as $$
begin
  if old.body_text != new.body_text or old.body_html != new.body_html then
    insert into public.comment_edit_history (comment_id, body_text, body_html, edited_at)
    values (old.id, old.body_text, old.body_html, old.updated_at);
    new.updated_at := now();
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
