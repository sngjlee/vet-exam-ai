# RLS / 권한 회귀 테스트 매트릭스

SQL 마이그레이션 적용 후에는 `vet-exam-ai/supabase/tests/rls-permission-regression.sql`을 실행해 고위험 권한 계약이 깨지지 않았는지 확인합니다.
테스트는 정책 메타데이터를 읽는 방식이며 앱 데이터를 생성하지 않습니다.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f vet-exam-ai/supabase/tests/rls-permission-regression.sql
```

## 기준 매트릭스

| 영역 | 허용되어야 하는 사용자 | 막혀야 하는 사용자/동작 | SQL 검증 포인트 |
|---|---|---|---|
| 댓글 읽기 | 공개 visible 댓글 조회 | 블라인드/삭제 댓글 공개 조회 | `comments: world read visible` 유지 |
| 댓글 작성 | 가입 승인된 본인 | 미승인 사용자, 타인 `user_id`, 하드 삭제 | insert policy의 `signup_status_of(...)=approved`, DELETE policy 부재 |
| 신고 | 가입 승인된 신고자, 관리자/검수자 조회·처리 | 미승인 신고, 타인 신고 조회, 직접 삭제 | reporter/admin 정책, insert 승인 게이트, DELETE policy 부재 |
| 알림 | 알림 수신자 읽기/읽음 처리 | 타인 알림 조회, 클라이언트 직접 생성/삭제 | owner read/update, INSERT/DELETE policy 부재 |
| 관리자 액션 | 관리자 RPC와 service role 기록 | 일반 사용자 audit 조회/수정/삭제 | `admin_audit_logs: admin read`, write policy 부재 |
| 계정 삭제/상태 | 서버 액션/service role | 클라이언트 직접 profile 삭제, 타인 상태 변경 | profiles RLS, DELETE policy 부재 |
| 가입 증빙 | 신청자 업로드, 관리자 조회, RPC 처리 | 타인 증빙 조회, 직접 DB 쓰기, 직접 삭제 | signup_applications direct write 부재, signup-proofs delete policy 부재 |
| 댓글 이미지 | 본인 prefix 업로드/삭제, 공개 이미지 읽기 | 타인 prefix 업로드/삭제, 업로드 로그 직접 쓰기 | storage own prefix 정책, upload log own select only |
| Cron/운영 로그 | active admin 조회, service role 삽입 | 일반 사용자 조회, 클라이언트 직접 삽입/삭제 | cron_run_logs admin read, write policy 부재 |
| IP 차단 | 관리자 조회/RPC 변경 | 일반 사용자 조회, 직접 insert/update/delete | ip_bans admin select only |

## 운영 절차

1. 새 SQL을 staging에 적용합니다.
2. `npm run check:migrations`를 실행합니다.
3. 위 SQL 검증 스크립트를 staging DB에서 실행합니다.
4. 운영 DB 적용 후 같은 스크립트를 다시 실행합니다.
5. 실패 항목은 마이그레이션 또는 정책 이름 변경 의도 여부를 확인하고, 의도된 변경이면 이 매트릭스와 SQL 검증 파일을 같은 커밋에서 갱신합니다.

## 한계

이 스크립트는 정책 구조와 금지 동작의 부재를 검증합니다. 실제 사용자별 insert/update/delete 동작은 별도 staging 계정으로 API/앱 플로우 테스트를 병행해야 합니다.
