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
