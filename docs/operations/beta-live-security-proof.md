# 베타 라이브 보안 검증 준비물

본 문서는 베타 공개 전 staging 또는 production preview에서 권한 경계를 실제 계정으로 증명하기 위한 준비 체크리스트입니다. 비밀번호, magic link, reset link, 가입 증빙 원본 path, service role key, `CRON_SECRET`은 기록하지 않습니다.

## 1. 필요한 환경

| 항목 | 기준 |
|---|---|
| 배포 URL | Vercel preview 또는 staging 도메인. 테스트 중 `NEXT_PUBLIC_INDEXING_ENABLED=false` 유지 |
| Supabase DB | 운영과 분리된 staging DB 또는 승인된 production preview DB |
| Storage | `comment-images`, `signup-proofs`, `question-images-private`, `question-images-public` bucket 정책 적용 |
| `DATABASE_URL` | RLS regression SQL을 실행할 수 있는 승인된 연결 문자열 |
| Sentry | 테스트 이벤트가 production과 구분되는 environment/release로 들어감 |
| Cron secret | preview 또는 staging의 `CRON_SECRET`과 Vercel Cron 설정 일치 |

## 2. Seeded 계정

| 계정 상태 | 필수 속성 | 증명할 경계 |
|---|---|---|
| pending-proof | 로그인 가능, 가입 증빙 미제출 | dashboard/board/settings 접근 제한, 증빙 제출 화면 |
| pending-review | 증빙 제출 완료, 승인 대기 | 승인 전 학습/커뮤니티 쓰기 제한 |
| rejected | 반려 상태와 사용자 안내 사유 존재 | 반려 화면, 재신청/문의 안내 |
| approved user | `role=user`, `signup_status=approved`, `is_active=true` | quiz, wrong notes, comments, reports, settings |
| active admin | `role=admin`, `is_active=true` | admin screens, moderation, audit logs, image triage |

테스트 기록에는 이메일 전체를 남기지 않고 `approved-***@domain`처럼 마스킹합니다. 각 계정은 테스트 시작 전 비밀번호 재설정이 필요 없는 상태여야 합니다.

## 3. 필수 명령

앱 루트(`vet-exam-ai/`)에서 실행합니다.

```bash
npm run check:migrations
npm run lint
npm run typecheck
npm run build
npm run smoke:public -- --base-url https://<preview-or-staging-domain>
```

DB 권한 검증은 repo 루트에서 실행합니다.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f vet-exam-ai/supabase/tests/rls-permission-regression.sql
```

## 4. 수동 증명 순서

1. 비로그인 브라우저에서 `/`, `/guide`, `/questions`, `/search?q=KVLE-0001`, `/quiz`, `/terms`, `/privacy`, `/community-guidelines`가 의도한 공개/로그인 유도 상태인지 확인합니다.
2. pending-proof 계정으로 `/dashboard`, `/board`, `/settings` 접근 시 증빙 제출 또는 승인 전 제한 화면으로 이동하는지 확인합니다.
3. pending-review 계정으로 승인 회원 전용 쓰기 동작이 막히는지 확인합니다.
4. rejected 계정으로 반려 안내가 표시되고 승인 회원 화면이 열리지 않는지 확인합니다.
5. approved user로 quiz 답안 제출, 오답노트 저장, 댓글 작성, 댓글 신고, 설정 화면을 확인합니다.
6. active admin으로 `/admin/ops`, `/admin/signup-applications`, `/admin/reports`, `/admin/image-questions`, `/admin/audit`를 확인합니다.
7. 일반 회원 또는 비로그인 세션에서 `/admin`, admin API, cron API가 각각 307/401/403 계열로 막히는지 확인합니다.
8. Sentry와 audit log에 민감 원문 없이 테스트 이벤트와 관리자 액션이 남았는지 확인합니다.

## 5. 결과 기록

```md
## Beta live security proof

- 환경:
- 배포 SHA:
- 실행 시각:
- 실행자:
- 테스트 계정: pending-proof / pending-review / rejected / approved / admin
- public smoke:
- RLS regression:
- 비로그인 공개 경로:
- 승인 전 제한:
- 승인 회원 흐름:
- 관리자 흐름:
- cron/API 차단:
- Sentry/audit 확인:
- 결론: pass / conditional pass / fail
- 후속 이슈:
```

`fail` 또는 승인 전 사용자에게 승인 회원 기능이 열린 경우 베타 공개를 보류합니다.
