-- Transactional AI comment review narrative. Run after migrations in staging:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/ai-comment-review-regression.sql

begin;

create temp table ai_comment_review_fixture (
  admin_id uuid not null,
  seed_user_id uuid not null,
  question_public_id text not null,
  approved_candidate_id uuid,
  rejected_candidate_id uuid,
  published_comment_id uuid
) on commit drop;

insert into ai_comment_review_fixture (admin_id, seed_user_id, question_public_id)
select admin_profile.id, seed_profile.id, question.public_id
from lateral (
  select id from public.profiles
   where role = 'admin' and is_active
   order by created_at, id limit 1
) admin_profile
cross join lateral (
  select p.id from public.profiles p
   join auth.users u on u.id = p.id
   where p.is_active and p.id <> admin_profile.id
   order by p.created_at, p.id limit 1
) seed_profile
cross join lateral (
  select public_id from public.questions
   where is_active and public_id is not null
   order by public_id limit 1
) question;

do $$
begin
  if not exists (select 1 from ai_comment_review_fixture) then
    raise exception 'AI comment review fixture requires an active admin, seed user, and question';
  end if;
end;
$$;

-- Isolated-staging setup: clearing the private queue makes cap assertions
-- deterministic. The surrounding transaction rolls every row back.
delete from public.ai_comment_candidates;

-- A 15-minute generation lease is recovered before pending-capacity checks.
insert into public.ai_comment_candidates (
  question_public_id, status, model, prompt_version, input_hash, created_at, updated_at
)
select question_public_id, 'generating', 'test-model', 'test-v1', repeat('f', 64),
       now() - interval '16 minutes', now() - interval '16 minutes'
  from ai_comment_review_fixture;

create temp table ai_comment_reservation_results (
  sequence integer primary key,
  result public.ai_comment_claim_result not null,
  candidate_id uuid
) on commit drop;

insert into ai_comment_reservation_results
select 1, reservation.*
from ai_comment_review_fixture fixture
cross join lateral public.reserve_ai_comment_generation(
  fixture.question_public_id, repeat('c', 64), 'test-model', 'test-v1', 5, 150, 1
) reservation;

insert into ai_comment_reservation_results
select 2, reservation.*
from ai_comment_review_fixture fixture
cross join lateral public.reserve_ai_comment_generation(
  fixture.question_public_id, repeat('d', 64), 'test-model', 'test-v1', 5, 150, 1
) reservation;

update public.ai_comment_candidates
   set status = 'failed', failure_code = 'provider_error'
 where id = (select candidate_id from ai_comment_reservation_results where sequence = 1);

insert into ai_comment_reservation_results
select 3, reservation.*
from ai_comment_review_fixture fixture
cross join lateral public.reserve_ai_comment_generation(
  fixture.question_public_id, repeat('e', 64), 'test-model', 'test-v1', 1, 150, 50
) reservation;

insert into ai_comment_reservation_results
select 4, reservation.*
from ai_comment_review_fixture fixture
cross join lateral public.reserve_ai_comment_generation(
  fixture.question_public_id, repeat('c', 64), 'test-model', 'test-v1', 1, 150, 50
) reservation;

do $$
begin
  if (select result from ai_comment_reservation_results where sequence = 1) <> 'claimed'
     or (select candidate_id from ai_comment_reservation_results where sequence = 1) is null
     or (select result from ai_comment_reservation_results where sequence = 2) <> 'pending_limit'
     or (select result from ai_comment_reservation_results where sequence = 3) <> 'daily_limit'
     or (select result from ai_comment_reservation_results where sequence = 4) <> 'duplicate'
     or (select status from public.ai_comment_candidates where input_hash = repeat('f', 64)) <> 'failed'
     or (select failure_code from public.ai_comment_candidates where input_hash = repeat('f', 64)) <> 'stale_generation_claim'
     or (select completed_at from public.ai_comment_candidates where input_hash = repeat('f', 64)) is null
     or (select count(*) from public.ai_comment_candidates where input_hash = repeat('c', 64)) <> 1 then
    raise exception 'atomic reservation budget invariant failed';
  end if;
end;
$$;

-- True two-session staging proof (run only on an isolated queue):
-- Session A: BEGIN; reserve hash f with daily limit 1; leave transaction open.
-- Session B: BEGIN; reserve different hash g with daily limit 1; observe it
--            block on pg_advisory_xact_lock. COMMIT Session A; Session B must
--            return daily_limit with candidate_id NULL, then ROLLBACK both.
with inserted as (
  insert into public.ai_comment_candidates (
    question_public_id, seed_author_key, seed_user_id, comment_type, body_text,
    status, model, prompt_version, input_hash
  )
  select question_public_id, 'explain', seed_user_id, 'explanation',
         E'<script>alert("x")</script> & "quote" ''apostrophe''
second line', 'pending', 'test-model', 'test-v1', repeat('a', 64)
    from ai_comment_review_fixture
  returning id
)
update ai_comment_review_fixture set approved_candidate_id = inserted.id from inserted;

select set_config(
  'request.jwt.claim.sub',
  (select admin_id::text from ai_comment_review_fixture),
  true
);

-- The administrator RPC has no HTML argument, so direct calls cannot bypass
-- the database-owned escaping boundary.
do $$
begin
  begin
    execute 'select public.review_ai_comment_candidate($1, $2, $3, $4)'
      using (select approved_candidate_id from ai_comment_review_fixture),
            'approve', '<img src=x onerror=alert(1)>', 'bypass attempt';
    raise exception 'caller-controlled HTML unexpectedly reached review RPC';
  exception
    when undefined_function then null;
  end;
end;
$$;

do $$
declare
  v_candidate_id uuid;
  v_question_public_id text;
  v_comment_count bigint;
begin
  select approved_candidate_id, question_public_id
    into strict v_candidate_id, v_question_public_id
    from ai_comment_review_fixture;

  select count(*) into v_comment_count
    from public.comments where question_public_id = v_question_public_id;

  begin
    perform public.review_ai_comment_candidate(v_candidate_id, null, null);
    raise exception 'NULL resolution unexpectedly succeeded';
  exception
    when sqlstate '22023' then null;
  end;

  if (select status from public.ai_comment_candidates where id = v_candidate_id) <> 'pending'
     or exists (
       select 1 from public.ai_comment_candidates
        where id = v_candidate_id and published_comment_id is not null
     )
     or (select count(*) from public.comments
          where question_public_id = v_question_public_id) <> v_comment_count then
    raise exception 'NULL resolution changed candidate state';
  end if;
end;
$$;
update ai_comment_review_fixture
   set published_comment_id = public.review_ai_comment_candidate(
     approved_candidate_id, 'approve', 'SQL regression'
   );

do $$
declare
  v_fixture ai_comment_review_fixture%rowtype;
  v_before bigint;
  v_after bigint;
begin
  select * into strict v_fixture from ai_comment_review_fixture;

  if (select status from public.ai_comment_candidates where id = v_fixture.approved_candidate_id) <> 'published'
     or (select published_comment_id from public.ai_comment_candidates where id = v_fixture.approved_candidate_id)
        is distinct from v_fixture.published_comment_id
     or (select count(*) from public.comments where id = v_fixture.published_comment_id) <> 1
     or (select body_html from public.comments where id = v_fixture.published_comment_id)
        is distinct from E'<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;quote&quot; &#39;apostrophe&#39;<br>
second line</p>'
     or (select count(*) from public.admin_audit_logs
          where target_id = v_fixture.approved_candidate_id::text
            and action = 'ai_comment_publish') <> 1 then
    raise exception 'approval did not publish exactly one audited comment';
  end if;

  select count(*) into v_before from public.comments
   where question_public_id = v_fixture.question_public_id;
  begin
    perform public.review_ai_comment_candidate(
      v_fixture.approved_candidate_id, 'approve', null
    );
    raise exception 'second approval unexpectedly succeeded';
  exception
    when sqlstate '55000' then null;
  end;
  select count(*) into v_after from public.comments
   where question_public_id = v_fixture.question_public_id;
  if v_after <> v_before then
    raise exception 'second approval changed the comment count';
  end if;
end;
$$;

with inserted as (
  insert into public.ai_comment_candidates (
    question_public_id, seed_author_key, seed_user_id, comment_type, body_text,
    status, model, prompt_version, input_hash
  )
  select question_public_id, 'memory', seed_user_id, 'memorization',
         '검수 거절 회귀 테스트 댓글', 'pending', 'test-model', 'test-v1', repeat('b', 64)
    from ai_comment_review_fixture
  returning id
)
update ai_comment_review_fixture set rejected_candidate_id = inserted.id from inserted;

select public.review_ai_comment_candidate(
  (select rejected_candidate_id from ai_comment_review_fixture),
  'reject', 'SQL regression'
);

do $$
declare
  v_fixture ai_comment_review_fixture%rowtype;
begin
  select * into strict v_fixture from ai_comment_review_fixture;
  if (select status from public.ai_comment_candidates where id = v_fixture.rejected_candidate_id) <> 'rejected'
     or exists (
       select 1 from public.ai_comment_candidates
        where id = v_fixture.rejected_candidate_id and published_comment_id is not null
     )
     or (select count(*) from public.admin_audit_logs
          where target_id = v_fixture.rejected_candidate_id::text
            and action = 'ai_comment_reject') <> 1 then
    raise exception 'rejection publication or audit invariant failed';
  end if;
end;
$$;

-- Rollback is fixture cleanup; no test candidate, comment, or audit row persists.
rollback;
