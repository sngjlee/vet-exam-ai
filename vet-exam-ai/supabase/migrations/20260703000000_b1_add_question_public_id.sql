-- =============================================================================
-- B1 — Phase 1 (EXPAND): add question_public_id to attempts / comments / wrong_notes
-- =============================================================================
-- 목적: 공개 API가 내부 questions.id (예: "3.5_산과_63회_q011" = 회차+과목 노출)를
--   흘리는 문제를 해소하기 위한 사전 작업. 최종적으로 클라이언트는 public_id
--   (KVLE-xxxx)만 주고받고, FK도 questions(public_id)를 참조하게 만든다.
--
-- 이 파일은 **추가(additive)·가역(reversible)** 단계만 담는다:
--   • 새 컬럼 question_public_id 추가 (nullable)
--   • 기존 행 백필 (questions.public_id 조인)
--   • 인덱스 + FK 추가 (public_id 는 UNIQUE 이므로 유효한 FK 타깃)
-- NOT NULL 설정, 기존 question_id 컬럼/FK 제거는 **Phase 3 (CONTRACT)** 에서.
--   → 코드 배포(Phase 2)가 끝나고 번인 후 별도 마이그레이션으로 진행.
--
-- 적용: Supabase SQL Editor 에서 이 파일 전체를 실행 (기존 운영 패턴).
--   백필 UPDATE 는 마이그레이션 롤(서비스/슈퍼유저)로 실행되므로
--   attempts 불변(insert-only) RLS 나 owner-only 정책에 막히지 않는다.
--
-- 사전조건(참고): questions.public_id 는 NOT NULL + UNIQUE(questions_public_id_key),
--   트리거 trg_questions_assign_public_id 로 100% 발급됨.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Phase 0 — precheck (읽기 전용, 기대값 0). 결과 확인 후 아래 EXPAND 진행.
-- -----------------------------------------------------------------------------
-- ✅ 2026-07-03 라이브 사전검증 완료 (service key, read-only):
--    questions total=3201, public_id IS NULL = 0
--    attempts orphans = 0 (distinct question_id 266)
--    comments orphans = 0 (distinct question_id 72)
--    wrong_notes 매핑불가 = 0 (distinct question_id 85, FK 없지만 전부 해소)
--    → 백필 100% 깨끗. 적용 시 아래 프리체크는 재확인 용도.
--
-- 아래 세 쿼리를 먼저 실행해 0 이 나오는지 확인하는 것을 권장한다.
-- (SQL Editor 에서 주석 해제 후 개별 실행 → 다시 주석 처리)
--
-- select count(*) as questions_missing_public_id
--   from public.questions where public_id is null;                 -- 기대 0
--
-- select count(*) as attempts_orphans
--   from public.attempts a
--   left join public.questions q on q.id = a.question_id
--   where q.id is null;                                            -- 기대 0 (FK 존재)
--
-- select count(*) as comments_orphans
--   from public.comments c
--   left join public.questions q on q.id = c.question_id
--   where q.id is null;                                            -- 기대 0 (FK 존재)
--
-- 참고: wrong_notes 는 FK 가 없어 (20260314000001) 과거 삭제된 질문을 가리키는
--   레거시 행이 있을 수 있다. 그 행들은 아래 백필에서 question_public_id 가 NULL 로
--   남는다 (스냅샷이 저장돼 있어 표시에는 문제 없음). Phase 3 에서도 NOT NULL 로
--   만들지 않고 nullable 유지한다.


-- -----------------------------------------------------------------------------
-- 1. attempts  (FK: questions.id 존재 → 백필 orphan 없음 보장)
-- -----------------------------------------------------------------------------
alter table public.attempts
  add column if not exists question_public_id text;

update public.attempts a
  set question_public_id = q.public_id
  from public.questions q
  where q.id = a.question_id
    and a.question_public_id is null;

create index if not exists attempts_user_question_public
  on public.attempts (user_id, question_public_id);

-- FK on new column (public_id 는 UNIQUE → 유효). Phase 2 배포 전까지는
-- 새 컬럼이 비어 있는 새 행이 없으므로 안전.
alter table public.attempts
  drop constraint if exists attempts_question_public_id_fkey;
alter table public.attempts
  add constraint attempts_question_public_id_fkey
  foreign key (question_public_id) references public.questions (public_id);


-- -----------------------------------------------------------------------------
-- 2. comments  (FK: questions.id on delete cascade)
-- -----------------------------------------------------------------------------
alter table public.comments
  add column if not exists question_public_id text;

update public.comments c
  set question_public_id = q.public_id
  from public.questions q
  where q.id = c.question_id
    and c.question_public_id is null;

create index if not exists comments_question_public_created
  on public.comments (question_public_id, created_at desc)
  where status = 'visible';

alter table public.comments
  drop constraint if exists comments_question_public_id_fkey;
alter table public.comments
  add constraint comments_question_public_id_fkey
  foreign key (question_public_id) references public.questions (public_id)
  on delete cascade;


-- -----------------------------------------------------------------------------
-- 3. wrong_notes  (FK 없음 — denormalized 스냅샷 보관. best-effort 백필)
-- -----------------------------------------------------------------------------
alter table public.wrong_notes
  add column if not exists question_public_id text;

update public.wrong_notes w
  set question_public_id = q.public_id
  from public.questions q
  where q.id = w.question_id
    and w.question_public_id is null;

create index if not exists wrong_notes_user_question_public
  on public.wrong_notes (user_id, question_public_id);

-- 오답노트 upsert 는 onConflict (user_id, question_public_id) 로 전환될 예정.
-- 그 대상이 될 UNIQUE 인덱스를 미리 만든다. question_public_id 가 NULL 인
-- 레거시 행은 (NULL 은 서로 distinct 하므로) 충돌 없이 공존한다.
create unique index if not exists wrong_notes_user_question_public_key
  on public.wrong_notes (user_id, question_public_id);


-- -----------------------------------------------------------------------------
-- 4. comment_pins  (FK: questions.id on delete cascade, unique(user_id,question_id))
--    2026-07-03 라이브: 0행 → 백필 자명. 핀 upsert onConflict 를 위해 UNIQUE 필요.
-- -----------------------------------------------------------------------------
alter table public.comment_pins
  add column if not exists question_public_id text;

update public.comment_pins p
  set question_public_id = q.public_id
  from public.questions q
  where q.id = p.question_id
    and p.question_public_id is null;

create index if not exists comment_pins_user_question_public_idx
  on public.comment_pins (user_id, question_public_id);

create unique index if not exists comment_pins_user_question_public_key
  on public.comment_pins (user_id, question_public_id);

alter table public.comment_pins
  drop constraint if exists comment_pins_question_public_id_fkey;
alter table public.comment_pins
  add constraint comment_pins_question_public_id_fkey
  foreign key (question_public_id) references public.questions (public_id)
  on delete cascade;


-- -----------------------------------------------------------------------------
-- 5. question_corrections  (FK: questions.id on delete cascade)
--    2026-07-03 라이브: 0행 → 백필 자명.
-- -----------------------------------------------------------------------------
alter table public.question_corrections
  add column if not exists question_public_id text;

update public.question_corrections c
  set question_public_id = q.public_id
  from public.questions q
  where q.id = c.question_id
    and c.question_public_id is null;

create index if not exists question_corrections_question_public
  on public.question_corrections (question_public_id);

alter table public.question_corrections
  drop constraint if exists question_corrections_question_public_id_fkey;
alter table public.question_corrections
  add constraint question_corrections_question_public_id_fkey
  foreign key (question_public_id) references public.questions (public_id)
  on delete cascade;


-- =============================================================================
-- 되돌리기(롤백) — 필요 시 아래를 실행 (Phase 1 은 완전 가역)
-- =============================================================================
-- alter table public.attempts             drop constraint if exists attempts_question_public_id_fkey;
-- alter table public.comments             drop constraint if exists comments_question_public_id_fkey;
-- alter table public.comment_pins         drop constraint if exists comment_pins_question_public_id_fkey;
-- alter table public.question_corrections drop constraint if exists question_corrections_question_public_id_fkey;
-- drop index if exists public.attempts_user_question_public;
-- drop index if exists public.comments_question_public_created;
-- drop index if exists public.wrong_notes_user_question_public;
-- drop index if exists public.wrong_notes_user_question_public_key;
-- drop index if exists public.comment_pins_user_question_public_idx;
-- drop index if exists public.comment_pins_user_question_public_key;
-- drop index if exists public.question_corrections_question_public;
-- alter table public.attempts             drop column if exists question_public_id;
-- alter table public.comments             drop column if exists question_public_id;
-- alter table public.wrong_notes          drop column if exists question_public_id;
-- alter table public.comment_pins         drop column if exists question_public_id;
-- alter table public.question_corrections drop column if exists question_public_id;
