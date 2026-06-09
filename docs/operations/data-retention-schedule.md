# 운영 데이터 보존/삭제 주기

이 문서는 공개 개인정보처리방침의 원칙을 실제 DB, Storage, cron 동작과 맞추기 위한 내부 운영 기준입니다. 보존 기간을 바꾸면 공개 문서, 이 문서, cron/DB 구현을 같은 변경 단위로 갱신합니다.

## 기준

- 원본 증빙, reset link, 이메일, 파일 path 같은 민감 값은 필요 시점에만 조회하고 로그/Sentry/audit에는 원문을 남기지 않습니다.
- 사용자 탈퇴는 `app/settings/_actions.ts`에서 service role로 Auth 계정을 삭제하고, 삭제 전 남아 있는 가입 증빙 Storage 객체를 best-effort로 제거합니다.
- 커뮤니티 콘텐츠는 서비스 연속성과 신고 대응을 위해 행을 보존할 수 있지만, 탈퇴 사용자의 식별자는 FK `set null` 또는 cascade 동작으로 분리합니다.
- cron 정리 결과는 aggregate counter만 `cron_run_logs.detail`에 남깁니다.

## 보존 매트릭스

| 데이터 | 보존 기준 | 삭제/익명화 동작 | 구현 경로 |
|---|---|---|---|
| 가입 증빙 원본 이미지 | 승인 시 즉시 삭제, 반려 후 최대 30일 | 승인 RPC가 path를 비우고 Storage 삭제를 시도합니다. 반려 건은 30일 후 cron이 Storage 삭제 후 DB path를 비웁니다. | `approve_signup_application`, `/api/cron/signup-proof-purge`, `purge_signup_proof_paths` |
| 가입 신청 행 | 운영 심사 이력으로 보존 | 탈퇴 시 `profiles` cascade로 삭제됩니다. 증빙 원본 path는 승인/cron/탈퇴 경로에서 제거됩니다. | `signup_applications` FK, `app/settings/_actions.ts` |
| 댓글 이미지 Storage | 댓글에 연결된 동안 보존 | DB `comments.image_urls`에 참조되지 않는 객체는 24시간 이후 삭제합니다. 업로드 실패/미사용 객체도 같은 기준입니다. | `/api/cron/comment-image-sweep` |
| 댓글 이미지 업로드 로그 | 24시간 | 24시간 초과 행을 daily sweep에서 삭제합니다. | `comment_image_upload_log`, `/api/cron/comment-image-sweep` |
| 댓글/게시글 본문 | 서비스 연속성 및 신고 대응 기간 | 사용자가 삭제하면 soft-delete 상태로 전환합니다. 운영자 삭제/블라인드는 상태값으로 보존하고 공개 조회에서 제외합니다. 개인정보 포함 게시물은 운영 절차로 삭제 또는 수정합니다. | comment/board status fields, moderation RPCs |
| 신고 기록 | 신고 처리와 분쟁 대응에 필요한 기간 | 대상 콘텐츠가 hard-delete되면 cascade될 수 있고, 탈퇴 사용자의 식별자는 FK 정책에 따라 분리됩니다. 직접 클라이언트 삭제는 허용하지 않습니다. | report tables, RLS regression |
| 알림 | 계정 유지 중 알림 기능 제공 기간 | 사용자는 읽음 처리만 할 수 있습니다. 계정 삭제 시 계정 연관 데이터와 함께 정리됩니다. | `notifications` RLS/FK |
| 관리자 감사 로그 | 운영 책임 추적 기간 | 원문 개인정보 없이 action, target, 상태 변화, 메모만 보존합니다. 별도 법무/운영 판단 전 자동 삭제하지 않습니다. | `admin_audit_logs`, `/admin/audit` |
| cron 실행 로그 | 90일 | daily sweep에서 90일 초과 행을 삭제합니다. detail은 aggregate counter만 허용합니다. | `cron_run_logs`, `/api/cron/comment-image-sweep` |
| 계정 식별 정보 | 탈퇴 요청 시 지체 없이 삭제 | Auth user 삭제를 기준으로 cascade/set-null FK가 적용됩니다. 탈퇴 전 남은 가입 증빙 파일은 best-effort 삭제합니다. | `app/settings/_actions.ts`, FK constraints |

## 배포 전 확인

1. `/api/cron/comment-image-sweep`가 미참조 댓글 이미지, 업로드 로그, 90일 초과 cron 로그를 정리하는지 staging에서 확인합니다.
2. 댓글 이미지 첨부는 `docs/operations/comment-image-attachments.md`의 배포 전 확인 항목을 함께 수행합니다.
3. `/api/cron/signup-proof-purge`가 반려 후 30일 초과 증빙만 삭제하고 `proof_storage_path`를 null로 비우는지 확인합니다.
4. 탈퇴 테스트 계정에서 가입 증빙 파일이 남아 있지 않고, 커뮤니티 콘텐츠 작성자 표시가 탈퇴 사용자로 처리되는지 확인합니다.
5. `/admin/audit`와 Sentry에 이메일, reset link, 증빙 path 원문이 남지 않는지 표본 확인합니다.
