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
