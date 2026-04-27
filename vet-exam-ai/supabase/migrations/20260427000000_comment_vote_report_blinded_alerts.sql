-- =============================================================================
-- §15 PR-B: comment vote / report — self-vote raise + comment_blinded notifications
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. handle_comment_vote — replace
--    (a) raise on self-vote (P0002)
--    (b) emit comment_blinded notification when comment first transitions
--        from 'visible' to 'hidden_by_votes' (status WHERE clause = idempotency)
-- ---------------------------------------------------------------------------
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
  hidden_owner uuid;
begin
  -- (a) self-vote guard (INSERT/UPDATE only — DELETE is the user cancelling their own vote)
  if TG_OP in ('INSERT', 'UPDATE') then
    select user_id into comment_owner
      from public.comments where id = new.comment_id;
    if comment_owner is not null and comment_owner = new.user_id then
      raise exception 'Cannot vote on own comment'
        using errcode = 'P0002';
    end if;
    comment_owner := null;  -- reset; milestone block re-resolves owner from update RETURNING
  end if;

  -- counter updates (unchanged from baseline)
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
      vote_delta := new.value - old.value;
      update public.comments
        set upvote_count   = upvote_count   + (case when new.value =  1 then 1 else -1 end),
            downvote_count = downvote_count + (case when new.value = -1 then 1 else -1 end),
            vote_score     = vote_score + vote_delta
        where id = new.comment_id
        returning vote_score, user_id into new_score, comment_owner;
    end if;
  elsif TG_OP = 'DELETE' then
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

  -- milestone notification + popular_comment badge (unchanged)
  if new_score in (10, 50, 100) and comment_owner is not null then
    insert into public.notifications (user_id, type, related_comment_id, payload)
    values (
      comment_owner,
      'vote_milestone',
      new.comment_id,
      jsonb_build_object('milestone', new_score, 'comment_score', new_score)
    )
    on conflict do nothing;

    if new_score = 10 then
      insert into public.badges (user_id, badge_type, reason)
      values (comment_owner, 'popular_comment', 'auto-granted on 10 upvotes')
      on conflict (user_id, badge_type) do nothing;
    end if;
  end if;

  -- (b) auto-hide at -5 + comment_blinded notification on transition only.
  --     status='visible' guard ensures the UPDATE returns at most one row,
  --     which makes the notification idempotent across repeated dips.
  if new_score is not null and new_score <= -5 then
    update public.comments
      set status = 'hidden_by_votes'
      where id = coalesce(new.comment_id, old.comment_id) and status = 'visible'
      returning user_id into hidden_owner;

    if hidden_owner is not null then
      insert into public.notifications (user_id, type, related_comment_id, payload)
      values (
        hidden_owner,
        'comment_blinded',
        coalesce(new.comment_id, old.comment_id),
        jsonb_build_object('reason', 'votes', 'score', new_score)
      );
    end if;
  end if;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. handle_comment_report — replace
--    Add: comment_blinded notification when comment first transitions
--    from 'visible' to 'blinded_by_report' (status WHERE clause = idempotency)
-- ---------------------------------------------------------------------------
create or replace function public.handle_comment_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count       smallint;
  blinded_owner   uuid;
begin
  update public.comments
    set report_count = report_count + 1
    where id = new.comment_id
    returning report_count into new_count;

  -- 3+ reports → auto-blind (transition only via status='visible' guard)
  if new_count >= 3 then
    update public.comments
      set status = 'blinded_by_report'
      where id = new.comment_id and status = 'visible'
      returning user_id into blinded_owner;

    if blinded_owner is not null then
      insert into public.notifications (user_id, type, related_comment_id, payload)
      values (
        blinded_owner,
        'comment_blinded',
        new.comment_id,
        jsonb_build_object('reason', 'reports', 'count', new_count)
      );
    end if;
  end if;

  -- defamation → 정보통신망법 30-day temporary measure (unchanged)
  if new.reason = 'defamation' then
    update public.comments
      set blinded_until = greatest(coalesce(blinded_until, now()), now() + interval '30 days')
      where id = new.comment_id;
  end if;

  return new;
end;
$$;
