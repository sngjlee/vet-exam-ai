-- attempts.category drift 봉합: questions 테이블은 20260426000000_rename_번식학_to_산과학.sql에서 처리됐지만,
-- attempts.category는 풀이 시점 스냅샷이라 옛 명칭 '번식학'이 그대로 남아 my-stats 페이지에 잘못 노출됐다.
-- SUBJECT_GROUPS의 '산과학'으로 통일.

UPDATE public.attempts
SET category = '산과학'
WHERE category = '번식학';

-- 검증용 (실행 후 0이 나와야 정상)
-- SELECT count(*) FROM public.attempts WHERE category = '번식학';
