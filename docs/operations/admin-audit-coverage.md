# 관리자 감사 로그 커버리지

관리자 권한으로 사용자 상태, 신고, 콘텐츠, 가입 증빙, 이미지, IP 차단을 바꾸는 경로는 `admin_audit_logs`에 남겨야 합니다. 사용자 self-service 변경, 조회 전용 RPC, 이미 처리된 no-op은 감사 로그 대상에서 제외합니다.

## 기준

- `admin_id`, `action`, `target_type`, `target_id`가 있어야 합니다.
- 가능한 경우 `before_state`와 `after_state`에는 상태값, 집계 수, 공개 여부처럼 운영 판단에 필요한 최소 데이터만 남깁니다.
- 이메일, reset link, 증빙 파일 path 원문, 본문 전문처럼 민감하거나 긴 값은 감사 로그에 저장하지 않습니다.
- DB RPC가 실제 mutation을 수행하면 같은 트랜잭션 안에서 감사 로그를 씁니다.
- 앱 서버에서 직접 update하는 관리자 액션은 `logAdminAction()`을 호출합니다.

## 커버리지 매트릭스

| 영역 | 관리자 액션 | 기록 위치 | audit action | 상태 |
|---|---|---|---|---|
| 사용자 | 역할 변경 | `set_user_role` RPC | `role_change` | 커버됨 |
| 사용자 | 정지/해제 | `set_user_active` RPC | `user_suspend`, `user_unsuspend` | 커버됨 |
| 사용자 | 배지 부여/회수 | `grant_badge`, `revoke_badge` RPC | `badge_grant`, `badge_revoke` | 커버됨 |
| 사용자 | 비밀번호 재설정 링크 발급 | `log_password_reset_issued` RPC | `password_reset_issued` | 커버됨 |
| 댓글 | 관리자 댓글 삭제 | `app/api/comments/[id]/route.ts` | `comment_remove` | 커버됨 |
| 댓글 | 신고 처리 | `resolve_comment_report` RPC | `report_uphold`, `report_dismiss` | 커버됨 |
| 문제 | 문제 수정 | `app/admin/questions/[id]/edit/_actions.ts` | `question_update` | 커버됨 |
| 문제 | 정정 제안 처리 | `resolve_question_correction` RPC | `correction_accept`, `correction_reject` | 커버됨 |
| 가입 | 가입 증빙 승인/반려 | `approve_signup_application`, `reject_signup_application` RPC | `signup_approve`, `signup_reject` | 커버됨 |
| 이미지 | 이미지 triage 결정/되돌리기 | image triage RPCs | `image_triage_decide`, `image_triage_revert` | 커버됨 |
| 보드 | 건의 상태 변경 | `update_suggestion_state` RPC | `board_post_state_change` | 커버됨 |
| 보드 | 공지 고정 변경 | `set_announcement_pinned` RPC | `announcement_pinned` | 커버됨 |
| 보드 | 글/댓글 공개 상태 변경 | board visibility RPCs | `board_post_visibility_change`, `board_post_comment_visibility_change` | 커버됨 |
| 보드 | 글/댓글 신고 처리 | board report RPCs | `report_uphold`, `report_dismiss` | 2026-06-09 보강 |
| 보안 | IP 차단/해제 | `add_ip_ban`, `revoke_ip_ban` RPC | `ip_ban_grant`, `ip_ban_revoke` | 커버됨 |

## 회귀 테스트

`vet-exam-ai/supabase/tests/admin-audit-coverage.sql`은 주요 관리자 mutation RPC의 함수 정의에 감사 기록 호출이 남아 있는지 확인합니다.

운영 SQL 적용 후 staging에서 다음 순서로 확인합니다.

1. 최신 migration 적용
2. `supabase/tests/rls-permission-regression.sql` 실행
3. `supabase/tests/admin-audit-coverage.sql` 실행
4. `/admin/audit`에서 최근 처리 샘플 3건 이상 확인

## 새 관리자 액션 추가 시

- DB RPC로 mutation한다면 RPC 내부에서 `log_admin_action()` 또는 `admin_audit_logs` insert를 추가합니다.
- 서버 액션/API route에서 직접 mutation한다면 성공한 변경 직후 `logAdminAction()`을 호출합니다.
- 이 문서의 매트릭스와 `admin-audit-coverage.sql`을 같은 PR에서 갱신합니다.
