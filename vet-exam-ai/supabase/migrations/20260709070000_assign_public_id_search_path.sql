-- =============================================================================
-- Phase 5 (maintenance): pin search_path on assign_question_public_id()
-- =============================================================================
-- The BEFORE INSERT trigger function had no `set search_path`, leaving it open to
-- search_path shadowing (a caller could prepend a schema hiding public.questions).
-- The body already schema-qualifies public.questions, so pinning search_path is a
-- pure hardening no-op on behavior. Left SECURITY INVOKER: questions inserts are
-- pipeline/admin only (service role bypasses RLS), so DEFINER is out of scope here.
create or replace function public.assign_question_public_id()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  next_n bigint;
begin
  if new.public_id is null then
    select coalesce(max((substring(public_id from 6))::bigint), 0) + 1
      into next_n
      from public.questions
      where public_id ~ '^KVLE-[0-9]+$';
    new.public_id := 'KVLE-' || lpad(next_n::text, 4, '0');
  end if;
  return new;
end;
$$;
