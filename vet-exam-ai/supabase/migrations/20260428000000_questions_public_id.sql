-- Add a stable, copyright-safe public identifier to questions.
--
-- Why: 화면에 노출되는 식별자가 round/session/year 같은 출처 정보를 노출하면
-- 저작권 가드 위반. 기존 DB id ("q1", "q2", …)도 일부 화면에서 노출되고 있으나,
-- 댓글/공유에서 안정적으로 인용할 수 있는 자체 일련번호가 별도로 필요.
--
-- Format: KVLE-0001, KVLE-0002, … (4자리 zero-pad, 부족하면 자릿수 자동 확장)
-- 부여 순서: 최신 회차가 낮은 번호를 받도록 round DESC, session ASC, id ASC.
-- → 사용자는 "낮은 번호 = 더 최신"으로 직관적 학습 가능.
-- → 회차/연도는 절대 노출하지 않고, 상대적 신선도만 번호로 암시.

alter table public.questions
  add column if not exists public_id text;

-- Backfill existing rows: most recent round gets the lowest KVLE number.
-- nulls last so "round 미상" rows fall to the back.
with ordered as (
  select
    id,
    row_number() over (
      order by round desc nulls last, session asc nulls last, id asc
    ) as rn
  from public.questions
  where public_id is null
)
update public.questions q
set public_id = 'KVLE-' || lpad(o.rn::text, 4, '0')
from ordered o
where q.id = o.id
  and q.public_id is null;

-- Enforce non-null + unique going forward.
alter table public.questions
  alter column public_id set not null;

create unique index if not exists questions_public_id_key
  on public.questions (public_id);

-- New rows must supply a public_id. We auto-issue via trigger when omitted so
-- pipeline imports keep working without code changes.
create or replace function public.assign_question_public_id()
returns trigger
language plpgsql
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

drop trigger if exists trg_questions_assign_public_id on public.questions;
create trigger trg_questions_assign_public_id
before insert on public.questions
for each row
execute function public.assign_question_public_id();
