-- Data drift 정리: 옛날 명칭 "번식학"을 새 정식 명칭 "산과학"으로 통일.
-- 출처: pipeline/extract.py SUBJECTS 테이블의 "3.5 산과" → full="산과학" 정의.
-- DB에 남아 있던 초기 시드/업로드 잔재가 SUBJECT_GROUPS와 불일치해 quiz selector chip이 누락되던 문제 해결.

UPDATE public.questions
SET category = '산과학'
WHERE category = '번식학';

-- 검증용 (실행 후 0이 나와야 정상)
-- SELECT count(*) FROM public.questions WHERE category = '번식학';
