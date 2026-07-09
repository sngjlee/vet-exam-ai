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
