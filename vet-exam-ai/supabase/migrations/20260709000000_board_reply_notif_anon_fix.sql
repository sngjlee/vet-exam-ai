-- =============================================================================
-- Fix — board reply notification leaks the real nickname of anonymous commenters
-- =============================================================================
-- handle_board_post_comment_insert() (from 20260512000000_suggestion_board_mvp)
-- always wrote the commenter's real nickname into the notification payload,
-- even when the comment was posted anonymously (board_post_comments.is_anonymized).
-- The notification payload is the only identity surface the recipient sees —
-- lib/notifications/format.ts renders payload.actor_nickname for 'post_reply',
-- and /api/notifications never selects or joins actor_id — so masking the
-- payload nickname fully closes the leak.
--
-- This is a `create or replace` so the live production function is corrected.
-- Body is identical to the original except for the nickname resolution block.
-- See memory: anon_nickname_in_og_trap (check is_anonymized before exposing
-- nickname on any external surface: OG / notification / mail).
-- =============================================================================

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
  -- 익명 댓글은 실명 nickname을 노출하지 않는다 (payload가 유일한 신원 표면).
  if new.is_anonymized then
    v_actor_nick := '익명';
  else
    select nickname into v_actor_nick
      from public.user_profiles_public where user_id = new.user_id;
  end if;

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

-- Trigger already exists from 20260512000000; create or replace function is
-- sufficient — no need to re-create the trigger binding.
