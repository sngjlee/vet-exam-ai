-- wrong_notes.question_id는 questions 테이블 FK를 가지고 있는데,
-- questions 테이블에 데이터가 없으면 INSERT가 FK 위반으로 실패한다.
-- wrong_notes는 질문 데이터를 모두 직접 저장(denormalised)하므로 FK가 불필요하다.

ALTER TABLE public.wrong_notes
  DROP CONSTRAINT IF EXISTS wrong_notes_question_id_fkey;
