-- =============================================================================
-- questions: add session / round / community_notes
-- =============================================================================
-- Adds the three columns required to ingest vet40 기출 archive:
--   • session          — 국시 교시 (1=기초, 2=예방, 3=임상, 4=법규)
--                        4.1 법규는 실제로 3교시와 동시 시행되지만 DB에는 4로 저장
--   • round            — 국시 회차 (예: 66). year = round + 1956.
--   • community_notes  — vet40 댓글 원문. 원본 해설이 불완전할 때 수험생들이
--                        정정/암기팁을 달아놓은 텍스트로, 추후 UI에서
--                        "수험생 팁" 섹션으로 노출 예정.
--
-- All three are nullable so existing rows (manual / ai_generated source)
-- don't need backfill. Seeded past_exam rows from pipeline/ must set all three.
-- =============================================================================

alter table public.questions
  add column session          smallint,
  add column round            smallint,
  add column community_notes  text;

alter table public.questions
  add constraint questions_session_range
    check (session is null or session between 1 and 4);

alter table public.questions
  add constraint questions_round_positive
    check (round is null or round > 0);

-- round ↔ year consistency: if both set, year must equal round + 1956.
-- Nullable so manual/ai_generated rows without a round still work.
alter table public.questions
  add constraint questions_round_year_consistent
    check (round is null or year is null or year = round + 1956);

comment on column public.questions.session is
  '국시 교시 (1=기초, 2=예방, 3=임상, 4=법규). 4.1 법규는 실제 3교시와 동시 시행.';
comment on column public.questions.round is
  '국시 회차. year = round + 1956 규칙으로 파생되지만 쿼리 편의상 양쪽 저장.';
comment on column public.questions.community_notes is
  'vet40 원본 댓글. 수험생 정정/암기팁 자료. 향후 "수험생 팁" UI에서 노출.';

-- Useful composite indexes for common access patterns:
--   • by subject × round (e.g. "수의법규 66회 문제만")
--   • by session (e.g. "3교시 전체 랜덤")
create index questions_subject_round on public.questions (subject, round)
  where is_active = true;
create index questions_session       on public.questions (session)
  where is_active = true;
