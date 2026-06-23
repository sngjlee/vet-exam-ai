# 프로덕션 배포 직전 체크리스트

본 문서는 정식 공개 또는 큰 운영 배포 직전에 반드시 확인할 항목을 고정한 내부 체크리스트입니다.
비밀값은 원문으로 기록하지 않고, 확인 여부와 적용 범위만 기록합니다.

## 1. Vercel 환경변수

| 항목 | Production | Preview | 확인 기준 |
|---|---:|---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 필수 | 필수 | 운영/프리뷰가 의도한 Supabase 프로젝트를 가리킨다. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 필수 | 필수 | 위 Supabase 프로젝트의 anon key와 일치한다. |
| `SUPABASE_SERVICE_ROLE_KEY` | 필수 | 필요 시 | 서버 전용으로만 쓰이며 클라이언트 번들에 노출되지 않는다. |
| `CRON_SECRET` | 필수 | 필요 시 | Vercel Cron 호출과 API route 인증 값이 일치한다. |
| `NEXT_PUBLIC_SITE_URL` | 필수 | 권장 | Production은 실제 공개 도메인의 `https://` 절대 URL이다. |
| `NEXT_PUBLIC_INDEXING_ENABLED` | 필수 | 필수 | Production 공개 전환 시 `true`, Preview/베타 보류 시 `false`다. |
| `NEXT_PUBLIC_SENTRY_DSN` | 권장 | 권장 | 클라이언트/서버 이벤트가 같은 Sentry 프로젝트로 들어간다. |
| `SENTRY_AUTH_TOKEN` | 선택 | 선택 | source map 업로드가 필요한 배포 환경에만 설정한다. |

## 2. Supabase 환경

- 운영 DB와 Preview/Staging DB가 분리되어 있는지 확인한다.
- 최신 migration이 적용되어 있고 `npm run check:migrations`가 통과한다.
- Storage bucket `comment-images`, `signup-proofs`의 공개/비공개 정책이 의도와 일치한다.
- 댓글 이미지 첨부 제한과 정리 동작은 `docs/operations/comment-image-attachments.md` 기준으로 staging에서 표본 확인한다.
- `cron_run_logs` 테이블에 최근 cron 실행 결과가 쌓이는지 확인한다.
- RLS 정책을 임시로 끄거나 service role key를 브라우저에서 쓰는 코드가 없는지 확인한다.
- Supabase 자동 백업이 활성화되어 있고 최신 백업 시각이 정상 범위인지 확인한다.
- 베타 공개 전 라이브 계정/권한 증명은 `docs/operations/beta-live-security-proof.md` 기준으로 실행한다.

## 3. Sentry

- `/admin/sentry-test`에서 server event와 client event가 모두 Sentry에 도착한다.
- Production/Preview 이벤트가 environment 또는 release 기준으로 구분된다.
- `auth`, `supabase`, `storage`, `cron` 오류가 사용자 개인정보 원문 없이 집계된다.
- source map 업로드를 켠 경우 `SENTRY_AUTH_TOKEN`이 Vercel에만 저장되어 있고 repo에는 없다.

## 4. Cron

- `vercel.json`의 cron 경로가 실제 route와 일치한다.
- `/api/cron/comment-image-sweep`와 `/api/cron/signup-proof-purge`가 `CRON_SECRET` 없이 401을 반환한다.
- Vercel Cron 실행 로그에서 두 작업이 200으로 완료된다.
- `/admin/ops`의 최근 cron 실행 표에 성공/실패와 집계값이 표시된다.
- `comment-image-sweep`가 댓글 이미지 임시 파일/업로드 로그와 90일 초과 `cron_run_logs`를 정리한다.
- `signup-proof-purge`가 반려 후 30일 초과 가입 증빙 원본과 DB path를 정리한다.
- 실패 재시도 전 작업이 idempotent한지 확인한다.

## 5. Service role 사용 경로

`SUPABASE_SERVICE_ROLE_KEY`는 다음 서버 전용 경로에서만 사용한다.

| 경로 | 목적 |
|---|---|
| `lib/supabase/admin.ts` | service role client 생성 진입점 |
| `lib/cron/run.ts` | 인증된 cron 작업의 시스템 권한 실행 |
| `app/settings/_actions.ts` | 계정 삭제 처리 |
| `app/admin/users/_actions.ts` | 운영자 비밀번호 재설정 링크 발급 |
| `app/admin/signup-applications/_actions.ts` | 가입 신청 승인/거절 및 증빙 처리 |
| `app/api/comments/upload/route.ts` | 댓글 이미지 업로드 보조 처리 |
| `app/api/admin/image-replacement/upload/route.ts` | 운영자 문항 이미지 교체 |
| `app/api/comments/correction-status/route.ts` | 정정 댓글 상태 집계 |
| `scripts/seed-community-comments.cjs` | 운영자 수동 댓글 시딩 |
| `scripts/update-seed-comment-voices.cjs` | 시딩 댓글 계정별 문체 보정 |

체크 기준:

- 위 경로가 `"use client"` 파일에서 import되지 않는다.
- service role 응답의 이메일, 파일 path, reset link 같은 민감 값은 로그/Sentry/audit에 원문 저장하지 않는다.
- 새 service role 사용처가 생기면 이 문서와 `/admin/ops`의 목록을 같은 커밋에서 갱신한다.
- 수동 댓글 시딩은 `scripts/seed-community-comments.cjs --dry-run`으로 확인한 뒤 `--apply`를 명시할 때만 실행한다.

## 6. metadataBase / robots / noindex

- `NEXT_PUBLIC_SITE_URL`이 실제 공개 도메인과 일치한다.
- `app/layout.tsx`의 `metadataBase`가 `/admin/ops`에 표시되는 값과 일치한다.
- 정식 공개 전 `NEXT_PUBLIC_INDEXING_ENABLED=true`를 명시한다.
- 비공개 베타, Preview, Staging은 `NEXT_PUBLIC_INDEXING_ENABLED=false`를 명시한다.
- `/robots.txt`가 공개 상태에서는 운영/인증/API 경로를 disallow하고, 비공개 상태에서는 `/` 전체를 disallow한다.
- 삭제/비공개/권한 제한 콘텐츠는 page metadata에서 `robots.index=false`를 유지한다.

## 7. 배포 전 명령

```bash
npm run check:migrations
npm run lint
npm run typecheck
npm run build
```

모든 명령이 통과한 뒤 `/admin/ops`, `/admin/sentry-test`, 공개 정책 문서 `/terms`, `/privacy`, `/community-guidelines`를 표본 확인합니다.
정식 공개 또는 큰 운영 배포에서는 이어서 `docs/operations/launch-smoke-test.md`의 역할별 스모크 테스트를 실행합니다.
베타 공개에서는 같은 순서 전에 `docs/operations/beta-live-security-proof.md`의 seeded 계정 준비와 RLS regression을 완료합니다.

## 8. 결제/프리미엄 기능 게이트

결제, 구독, 유료 권한, 프리미엄 API, 가격표 또는 환불 정책이 포함된 배포라면 `docs/operations/premium-readiness.md`를 먼저 확인합니다.

- 사업자 정보, 통신판매, 환불 정책, 약관, 개인정보 처리방침 반영 상태가 확정되어야 합니다.
- 테스트 결제 키와 운영 결제 키가 환경별로 분리되어야 합니다.
- webhook 중복 처리, 결제 실패, 해지, 환불, 관리자 수동 권한 변경이 smoke test에 포함되어야 합니다.
- 유료 기능 권한 체크는 클라이언트 표시가 아니라 서버/RLS 또는 서버 API 기준으로 보호되어야 합니다.
- 위 항목이 준비되지 않은 경우 결제 UI와 Stripe 등 결제 연동은 production에서 비활성화합니다.
