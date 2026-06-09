# KVLE 문서 구조

KVLE 문서는 사용자에게 공개되는 정책 문서와 내부 운영 문서를 분리해 관리합니다.

## 사용자 공개 문서

앱에서 실제 공개되는 문서는 `docs/public`에 보관하고, 배포 앱의 `public/legal` 사본을 통해 아래 경로로 렌더링합니다.

| 문서 | repo 원본 | 앱 공개 경로 | 앱 사본 |
|---|---|---|---|
| 이용약관 | `docs/public/terms-of-service.md` | `/terms` | `vet-exam-ai/public/legal/terms-of-service.md` |
| 개인정보 처리방침 | `docs/public/privacy-policy.md` | `/privacy` | `vet-exam-ai/public/legal/privacy-policy.md` |
| 커뮤니티 가이드라인 | `docs/public/community-guidelines.md` | `/community-guidelines` | `vet-exam-ai/public/legal/community-guidelines.md` |

공개 문서 원본을 수정하면 배포 앱 사본도 같은 커밋에서 갱신합니다.

## 내부 운영 문서

운영자만 참고하는 절차, 체크리스트, 대응 기준은 `docs/operations`에 둡니다. 사용자 공개 페이지로 직접 연결하지 않습니다.

| 문서 | 경로 | 공개 여부 |
|---|---|---|
| 운영 런북 | `docs/operations/operations-runbook.md` | 내부 |
| 프로덕션 배포 체크리스트 | `docs/operations/production-readiness-checklist.md` | 내부 |
| RLS/권한 회귀 테스트 | `docs/operations/rls-permission-regression.md` | 내부 |
| Sentry 이벤트 품질 기준 | `docs/operations/sentry-event-quality.md` | 내부 |
| 관리자 감사 로그 커버리지 | `docs/operations/admin-audit-coverage.md` | 내부 |
| 운영 데이터 보존/삭제 주기 | `docs/operations/data-retention-schedule.md` | 내부 |
| 검색 1차 운영 기준 | `docs/operations/search-v1.md` | 내부 |
| 댓글 이미지 첨부 운영 기준 | `docs/operations/comment-image-attachments.md` | 내부 |
| 모더레이션 플레이북 | `docs/operations/moderation-playbook.md` | 내부 |
| 마이그레이션 런북 | `docs/operations/migration-runbook.md` | 내부 |
