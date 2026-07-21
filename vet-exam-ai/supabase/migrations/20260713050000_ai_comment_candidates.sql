-- Private AI comment candidate queue and atomic administrator review.

-- SECURITY DEFINER functions below never resolve caller-created public objects.
revoke create on schema public from public, anon, authenticated;

alter type public.audit_action add value if not exists 'ai_comment_publish';
alter type public.audit_action add value if not exists 'ai_comment_reject';

create type public.ai_comment_claim_result as enum (
  'claimed', 'duplicate', 'daily_limit', 'monthly_limit', 'pending_limit'
);

create table public.ai_comment_candidates (
  id                    uuid primary key default gen_random_uuid(),
  question_public_id    text not null references public.questions(public_id) on delete cascade,
  seed_author_key       text check (seed_author_key in ('memory', 'explain', 'wrong', 'correction')),
  seed_user_id          uuid references auth.users(id) on delete restrict,
  comment_type          public.comment_type,
  body_text             text,
  status                text not null default 'generating'
    check (status in ('generating', 'pending', 'published', 'rejected', 'failed')),
  model                 text not null,
  prompt_version        text not null,
  input_hash            text not null unique check (input_hash ~ '^[0-9a-f]{64}$'),
  openai_request_id     text,
  client_request_id     text,
  risk_flags            jsonb not null default '[]'::jsonb
    check (jsonb_typeof(risk_flags) = 'array'),
  input_tokens          integer check (input_tokens is null or input_tokens >= 0),
  output_tokens         integer check (output_tokens is null or output_tokens >= 0),
  reasoning_tokens      integer check (reasoning_tokens is null or reasoning_tokens >= 0),
  failure_code          text,
  completed_at          timestamptz,
  reviewed_by           uuid references public.profiles(id) on delete set null,
  reviewed_at           timestamptz,
  published_comment_id  uuid references public.comments(id) on delete restrict,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint ai_comment_candidate_voice_type check (
    seed_author_key is null
    or comment_type is null
    or (seed_author_key = 'memory' and comment_type = 'memorization')
    or (seed_author_key in ('explain', 'wrong') and comment_type = 'explanation')
    or (seed_author_key = 'correction' and comment_type = 'correction')
  ),
  constraint ai_comment_candidate_state check (
    (status = 'generating'
      and reviewed_by is null and reviewed_at is null and published_comment_id is null)
    or (status = 'pending'
      and seed_author_key is not null and seed_user_id is not null
      and comment_type is not null and nullif(btrim(body_text), '') is not null
      and reviewed_by is null and reviewed_at is null
      and published_comment_id is null and failure_code is null)
    or (status = 'published'
      and seed_author_key is not null and seed_user_id is not null
      and comment_type is not null and nullif(btrim(body_text), '') is not null
      and reviewed_by is not null and reviewed_at is not null
      and published_comment_id is not null and failure_code is null)
    or (status = 'rejected'
      and seed_author_key is not null and seed_user_id is not null
      and comment_type is not null and nullif(btrim(body_text), '') is not null
      and reviewed_by is not null and reviewed_at is not null
      and published_comment_id is null and failure_code is null)
    or (status = 'failed'
      and failure_code is not null and reviewed_by is null
      and reviewed_at is null and published_comment_id is null)
  )
);

comment on table public.ai_comment_candidates is
  'Private generation and administrator-review queue. Public comments contain no generation provenance.';
comment on column public.ai_comment_candidates.published_comment_id is
  'Private provenance link to the single comment created by administrator approval.';

create unique index ai_comment_candidates_published_comment_key
  on public.ai_comment_candidates (published_comment_id)
  where published_comment_id is not null;
create index ai_comment_candidates_review_queue
  on public.ai_comment_candidates (status, created_at, id);

alter table public.ai_comment_candidates enable row level security;

create policy "ai_comment_candidates: admin read"
  on public.ai_comment_candidates for select
  using (public.is_admin());

revoke all on table public.ai_comment_candidates from public, anon, authenticated;
grant select on table public.ai_comment_candidates to authenticated;
grant all on table public.ai_comment_candidates to service_role;

create or replace function public.render_ai_comment_body_html(p_body_text text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  with normalized as (
    select pg_catalog.replace(
      pg_catalog.replace(p_body_text, E'\r\n', E'\n'),
      E'\r',
      E'\n'
    ) as body_text
  ),
  escaped as (
    select pg_catalog.replace(
      pg_catalog.replace(
        pg_catalog.replace(
          pg_catalog.replace(
            pg_catalog.replace(body_text, '&', '&amp;'),
            '<',
            '&lt;'
          ),
          '>',
          '&gt;'
        ),
        '"',
        '&quot;'
      ),
      '''',
      '&#39;'
    ) as body_html
    from normalized
  )
  select '<p>' || pg_catalog.replace(body_html, E'\n', E'<br>\n') || '</p>'
  from escaped
$$;
revoke execute on function public.render_ai_comment_body_html(text)
  from public, anon, authenticated;

create or replace function public.protect_ai_comment_candidate_body()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.body_text is not null and new.body_text is distinct from old.body_text then
    raise exception 'candidate body_text is immutable' using errcode = '22000';
  end if;
  return new;
end;
$$;

create trigger ai_comment_candidates_protect_body
  before update of body_text on public.ai_comment_candidates
  for each row execute function public.protect_ai_comment_candidate_body();

create trigger ai_comment_candidates_set_updated_at
  before update on public.ai_comment_candidates
  for each row execute function public.set_updated_at();

create or replace function public.reserve_ai_comment_generation(
  p_question_public_id text,
  p_input_hash text,
  p_model text,
  p_prompt_version text,
  p_daily_limit integer default 5,
  p_monthly_limit integer default 150,
  p_pending_limit integer default 50
) returns table (
  result public.ai_comment_claim_result,
  candidate_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate_id uuid;
  v_daily_requests bigint;
  v_monthly_requests bigint;
  v_pending_candidates bigint;
  v_day_start timestamptz := pg_catalog.date_trunc(
    'day',
    pg_catalog.now() at time zone 'UTC'
  ) at time zone 'UTC';
  v_month_start timestamptz := pg_catalog.date_trunc(
    'month',
    pg_catalog.now() at time zone 'UTC'
  ) at time zone 'UTC';
begin
  if pg_catalog.nullif(pg_catalog.btrim(p_question_public_id), '') is null
     or p_input_hash is null or p_input_hash !~ '^[0-9a-f]{64}$'
     or pg_catalog.nullif(pg_catalog.btrim(p_model), '') is null
     or pg_catalog.nullif(pg_catalog.btrim(p_prompt_version), '') is null then
    raise exception 'invalid AI comment reservation input' using errcode = '22023';
  end if;

  if p_daily_limit is null or p_daily_limit not between 1 and 5
     or p_monthly_limit is null or p_monthly_limit not between 1 and 150
     or p_pending_limit is null or p_pending_limit not between 1 and 50 then
    raise exception 'invalid AI comment reservation limit' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('kvle.ai_comment_generation_budget', 0)
  );

  -- A generation claim is a 15-minute lease. Recovery happens under the
  -- reservation lock so abandoned work stops consuming pending capacity,
  -- while the failed row remains part of daily/monthly request accounting.
  update public.ai_comment_candidates
     set status = 'failed',
         failure_code = 'stale_generation_claim',
         completed_at = pg_catalog.now()
   where status = 'generating'
     and created_at < pg_catalog.now() - interval '15 minutes';

  if exists (
    select 1 from public.ai_comment_candidates where input_hash = p_input_hash
  ) then
    return query select 'duplicate'::public.ai_comment_claim_result, null::uuid;
    return;
  end if;

  select count(*) into v_pending_candidates
    from public.ai_comment_candidates
   where status in ('generating', 'pending');
  if v_pending_candidates >= p_pending_limit then
    return query select 'pending_limit'::public.ai_comment_claim_result, null::uuid;
    return;
  end if;

  select count(*) into v_monthly_requests
    from public.ai_comment_candidates
   where created_at >= v_month_start
     and status in ('generating', 'pending', 'published', 'rejected', 'failed');
  if v_monthly_requests >= p_monthly_limit then
    return query select 'monthly_limit'::public.ai_comment_claim_result, null::uuid;
    return;
  end if;

  select count(*) into v_daily_requests
    from public.ai_comment_candidates
   where created_at >= v_day_start
     and status in ('generating', 'pending', 'published', 'rejected', 'failed');
  if v_daily_requests >= p_daily_limit then
    return query select 'daily_limit'::public.ai_comment_claim_result, null::uuid;
    return;
  end if;

  insert into public.ai_comment_candidates (
    question_public_id, status, model, prompt_version, input_hash
  ) values (
    p_question_public_id, 'generating', p_model, p_prompt_version, p_input_hash
  ) returning id into v_candidate_id;

  return query select 'claimed'::public.ai_comment_claim_result, v_candidate_id;
end;
$$;

revoke execute on function public.reserve_ai_comment_generation(
  text, text, text, text, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.reserve_ai_comment_generation(
  text, text, text, text, integer, integer, integer
) to service_role;
drop function if exists public.review_ai_comment_candidate(uuid, text, text, text);

create or replace function public.review_ai_comment_candidate(
  p_candidate_id uuid,
  p_resolution text,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_id uuid := auth.uid();
  v_candidate public.ai_comment_candidates%rowtype;
  v_comment_id uuid;
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_resolution is null or p_resolution not in ('approve', 'reject') then
    raise exception 'invalid AI comment resolution' using errcode = '22023';
  end if;

  select * into v_candidate
    from public.ai_comment_candidates
   where id = p_candidate_id
   for update;

  if not found then
    raise exception 'AI comment candidate not found' using errcode = 'P0002';
  end if;

  if v_candidate.status <> 'pending' then
    raise exception 'AI comment candidate is not pending' using errcode = '55000';
  end if;

  if p_resolution = 'approve' then
    insert into public.comments (
      question_id, question_public_id, user_id, parent_id, type,
      body_text, body_html, image_urls, status, is_anonymized
    ) values (
      null, v_candidate.question_public_id, v_candidate.seed_user_id, null,
      v_candidate.comment_type, v_candidate.body_text,
      public.render_ai_comment_body_html(v_candidate.body_text),
      '{}'::text[], 'visible', false
    ) returning id into v_comment_id;

    update public.ai_comment_candidates
       set status = 'published',
           reviewed_by = v_admin_id,
           reviewed_at = pg_catalog.now(),
           published_comment_id = v_comment_id
     where id = p_candidate_id;

    insert into public.admin_audit_logs (
      admin_id, action, target_type, target_id, before_state, after_state, note
    ) values (
      v_admin_id, 'ai_comment_publish', 'ai_comment_candidate', p_candidate_id::text,
      pg_catalog.jsonb_build_object('status', 'pending'),
      pg_catalog.jsonb_build_object(
        'status', 'published', 'published_comment_id', v_comment_id
      ),
      p_note
    );

    return v_comment_id;
  end if;

  update public.ai_comment_candidates
     set status = 'rejected',
         reviewed_by = v_admin_id,
         reviewed_at = pg_catalog.now()
   where id = p_candidate_id;

  insert into public.admin_audit_logs (
    admin_id, action, target_type, target_id, before_state, after_state, note
  ) values (
    v_admin_id, 'ai_comment_reject', 'ai_comment_candidate', p_candidate_id::text,
    pg_catalog.jsonb_build_object('status', 'pending'),
    pg_catalog.jsonb_build_object('status', 'rejected'),
    p_note
  );

  return null;
end;
$$;

revoke execute on function public.review_ai_comment_candidate(uuid, text, text)
  from public, anon;
grant execute on function public.review_ai_comment_candidate(uuid, text, text)
  to authenticated;