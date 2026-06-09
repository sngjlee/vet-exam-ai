# KVLE 운영 런북

본 문서는 정기 운영 점검, cron 실패 대응, 백업·복구 리허설 절차를 정리한 내부 운영 기준입니다.
개인정보와 비밀값은 티켓, 로그, 스크린샷에 원문으로 남기지 않습니다.

## 1. 매일 점검

- `/admin/ops`에서 필수 환경변수, Sentry 설정, 최근 cron 실행 이력을 확인합니다.
- `comment-image-sweep`, `signup-proof-purge`의 마지막 성공 시각이 36시간을 넘으면 Vercel Cron 실행 로그를 확인합니다.
- 실패한 cron이 있으면 Sentry 이슈의 `cron_job` 태그로 원인을 확인하고, 재실행 전 중복 실행이 안전한 작업인지 확인합니다.
- 가입 증빙, 댓글 이미지, 계정 삭제 경로에서 원문 개인정보가 로그에 남지 않는지 확인합니다.

## 2. 매주 점검

- Supabase 대시보드에서 자동 백업이 활성화되어 있고 최신 백업 시각이 예상 범위 안인지 확인합니다.
- Vercel 환경변수 `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SENTRY_DSN`의 Production/Preview 적용 범위를 확인합니다.
- `/admin/audit`에서 최근 운영 조치가 의도한 작업과 일치하는지 표본 확인합니다.
- 신고, 가입 신청, 정정 제안 큐가 오래 방치되지 않았는지 확인합니다.

## 3. 월간 복구 리허설

1. Supabase 최신 백업 시각과 백업 보관 기간을 기록합니다.
2. 운영 DB가 아닌 별도 staging 프로젝트 또는 임시 복구 환경을 준비합니다.
3. 최신 백업을 staging으로 복구합니다.
4. 다음 표본을 확인합니다.
   - 로그인 가능한 테스트 계정 1개
   - 문제 목록과 문제 상세 조회
   - 학습 기록, 오답노트, 통계 RPC
   - 댓글, 신고, 감사 로그, 가입 신청 큐
   - Storage 버킷의 댓글 이미지와 가입 증빙 접근 정책
5. 복구 환경에서 `/admin/ops`를 열어 필수 설정 누락과 cron 로그 조회 가능 여부를 확인합니다.
6. 실제 복구에 걸린 시간, 막힌 지점, 누락된 환경변수를 기록합니다.

## 4. Cron 실패 대응

- 인증 실패 401: Vercel Cron 헤더와 `CRON_SECRET`이 일치하는지 확인합니다.
- Supabase admin env 실패: `SUPABASE_SERVICE_ROLE_KEY`와 `NEXT_PUBLIC_SUPABASE_URL`을 확인합니다.
- Storage 삭제 실패: 버킷명, 객체 path 구조, Storage 정책 변경 여부를 확인합니다.
- DB RPC 실패: 최신 migration 적용 여부와 함수 권한을 확인합니다.
- 부분 실패가 기록된 경우 본 작업의 집계값을 먼저 확인하고, 개인정보 원문 path를 외부 티켓에 복사하지 않습니다.

## 5. 비밀값 교체

- `CRON_SECRET` 교체 시 Vercel env와 Cron 요청 헤더 반영을 같은 배포 단위에서 확인합니다.
- `SUPABASE_SERVICE_ROLE_KEY` 교체 후 `/admin/ops`, 계정 삭제, 가입 승인, cron route를 표본 확인합니다.
- 비밀값 교체 후 이전 키가 실제로 폐기되었는지 Supabase/Vercel 대시보드에서 확인합니다.

## 6. 사고 후 기록

- 영향 범위, 시작·탐지·복구 시각, 사용자 영향, 재발 방지 조치를 기록합니다.
- 사용자에게 안내가 필요한 경우 약관·개인정보처리방침의 톤에 맞춰 사실, 영향, 조치, 문의 경로를 짧게 안내합니다.
- 임시 조치가 남았다면 별도 이슈로 분리하고 담당자와 기한을 정합니다.
