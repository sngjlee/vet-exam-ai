-- =============================================================================
-- B1 Phase 3 PRE-DROP GUARD — re-backfill question_public_id, then assert no NULLs
-- =============================================================================
-- Must run before the (future) Phase 3 migration that drops the legacy internal
-- question_id references on attempts / comments / comment_pins /
-- question_corrections.
--
-- Why this exists:
--   Between the B1 EXPAND migration (20260703000000) applying and the B1 code
--   deploying, old code could still insert rows with question_id set but
--   question_public_id NULL (the expand/contract backfill gap — see memory
--   expand_contract_backfill_gap). The one-time backfill was re-run at merge
--   time, but any row that slipped through would lose its question linkage the
--   moment question_id is dropped. This migration is the guard for that drop.
--
-- What it does:
--   1. Idempotently re-runs the EXPAND-phase backfill (join questions.id =
--      T.question_id where T.question_public_id is null). Because those tables
--      FK question_id -> questions(id), every non-null question_id resolves to a
--      public_id, so the only NULLs left afterward are rows that have neither id.
--   2. Hard-fails if any FK-bound table still has a NULL question_public_id, so
--      the Phase 3 drop can never silently orphan rows. Applied now it also acts
--      as early warning: a clean pass proves the cutover is fully backfilled.
--
-- wrong_notes is intentionally exempt from the guard: it is FK-less /
-- denormalized and keeps question_public_id nullable by design (best-effort
-- snapshot). It is re-backfilled here but never asserted.
-- =============================================================================

-- 1. Re-backfill (idempotent) --------------------------------------------------
update public.attempts a
  set question_public_id = q.public_id
  from public.questions q
  where q.id = a.question_id
    and a.question_public_id is null;

update public.comments c
  set question_public_id = q.public_id
  from public.questions q
  where q.id = c.question_id
    and c.question_public_id is null;

update public.comment_pins p
  set question_public_id = q.public_id
  from public.questions q
  where q.id = p.question_id
    and p.question_public_id is null;

update public.question_corrections c
  set question_public_id = q.public_id
  from public.questions q
  where q.id = c.question_id
    and c.question_public_id is null;

-- wrong_notes: best-effort only, no guard (nullable by design).
update public.wrong_notes w
  set question_public_id = q.public_id
  from public.questions q
  where q.id = w.question_id
    and w.question_public_id is null;

-- 2. Guard: no FK-bound row may reach the Phase 3 drop with a NULL public_id ---
do $$
declare
  v_attempts    bigint;
  v_comments    bigint;
  v_pins        bigint;
  v_corrections bigint;
begin
  select count(*) into v_attempts    from public.attempts             where question_public_id is null;
  select count(*) into v_comments    from public.comments             where question_public_id is null;
  select count(*) into v_pins        from public.comment_pins         where question_public_id is null;
  select count(*) into v_corrections from public.question_corrections where question_public_id is null;

  if v_attempts + v_comments + v_pins + v_corrections > 0 then
    raise exception
      'B1 pre-drop guard: NULL question_public_id remains (attempts=%, comments=%, comment_pins=%, question_corrections=%). Resolve before dropping legacy question_id.',
      v_attempts, v_comments, v_pins, v_corrections;
  end if;
end $$;
