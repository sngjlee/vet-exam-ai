# 시딩 댓글 운영 기준

시딩 댓글은 초기 사용자가 문제 상세에서 바로 학습 맥락을 볼 수 있게 하는 성장 작업입니다. 댓글은 실제 수험생이 남길 법한 암기 팁, 오답 포인트, 해설 보강, 정정 확인 요청으로 구성하고, 공개 댓글 정책과 동일한 검수 기준을 적용합니다.

## 현재 진입점

| 경로 | 목적 | 기본 동작 |
|---|---|---|
| `scripts/seed-community-comments.cjs` | 수동 일괄 투입 | 기본 dry-run, `--apply`일 때만 DB insert |
| `lib/cron/comment-seeding.ts` | legacy 정적 풀 helper | 예약 실행에서는 호출하지 않으며 수동 복구·참조용으로만 보존 |
| `/api/cron/comment-seed` | legacy 수동 route | `CRON_SECRET` 인증 뒤 운영자가 명시적으로 호출할 때만 실행 |
| `scripts/update-seed-comment-voices.cjs` | 기존 댓글 문체 보정 | 기존 seed 계정 댓글 update |

## 투입 전 확인

1. 대상 Supabase 프로젝트가 Production인지 Preview/Staging인지 확인합니다.
2. `NEXT_PUBLIC_SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 실행 터미널에 출력하지 않습니다.
3. 대상 문항이 공개 가능 상태인지 `/admin/questions`에서 확인합니다.
4. 이미지가 필요한 댓글은 `docs/operations/comment-image-attachments.md` 기준으로 먼저 업로드/검증합니다.
5. 댓글 내용은 문제 원문 복제보다 학습 맥락, 함정, 암기 구조, 정정 필요성 중심으로 작성합니다.

## 수동 투입 절차

기본 실행은 DB에 쓰지 않고 투입 계획만 보여줍니다.

```powershell
cd C:\Users\Theriogenology\Desktop\vet-exam-ai\vet-exam-ai
node scripts\seed-community-comments.cjs --dry-run
```

dry-run에서 확인할 항목:

- 전체 댓글 수가 20~40개 범위인지
- `memorization`, `explanation`, `wrong`, `correction` 성격이 과하게 한쪽으로 치우치지 않는지
- seed 계정 닉네임이 공개 화면에서 어색하지 않은지
- 표본 5개 댓글에 원문 과다 복제, 개인정보, 공격적 표현이 없는지

적용:

```powershell
node scripts\seed-community-comments.cjs --apply
```

스크립트는 seed 계정을 생성/갱신하고, 같은 `question_id + body_text` 조합이 이미 있으면 중복 삽입하지 않습니다.

## Legacy 정적 시딩 경로 (수동 전용)

정적 댓글 풀은 더 이상 Vercel 예약 작업이나 `signup-proof-purge`에서 자동 실행하지 않습니다. `lib/cron/comment-seeding.ts`와 `/api/cron/comment-seed`는 과거 데이터 복구·점검을 위한 legacy 경로이며, 운영 책임자가 대상 DB와 투입 범위를 확인한 뒤에만 수동 호출합니다.

- Production에서는 `scripts/seed-community-comments.cjs --dry-run` 결과와 대상 문항을 기록한 후 `--apply`를 명시합니다.
- `/api/cron/comment-seed`를 `vercel.json`에 다시 등록하지 않습니다.
- 자동 후보 생성은 `/api/cron/ai-comment-candidates`와 `/admin/ai-comments` 승인 큐를 사용하며, 이 정적 시딩 경로와 분리합니다.
- legacy 호출 뒤에는 inserted/remaining 집계와 공개 댓글 표본을 확인하고, 반복 호출 전 중복 안전성을 재확인합니다.
## 검증

투입 후 다음을 표본 확인합니다.

1. `/questions/{public_id}`에서 댓글이 visible 상태로 보입니다.
2. `/search?include_comments=1&q=<핵심어>`에서 visible 댓글만 검색됩니다.
3. seed 계정 프로필 공개 닉네임이 의도대로 보입니다.
4. 정정 성격 댓글은 관리자 정정 처리 큐 또는 운영 메모와 충돌하지 않습니다.
5. Sentry와 audit 로그에 seed 계정 이메일, service role key, 원본 파일 path가 남지 않습니다.

## Rollback

| 상황 | 조치 |
|---|---|
| 댓글 일부 문구 수정 필요 | `scripts/update-seed-comment-voices.cjs`를 수정한 뒤 staging에서 먼저 실행합니다. |
| 특정 댓글 숨김 필요 | 관리자 댓글 블라인드/삭제 경로를 사용해 audit을 남깁니다. |
| batch 전체 회수 필요 | seed 계정 user id와 투입 시각을 기준으로 대상 댓글을 select한 뒤, 운영자 삭제 처리합니다. |
| 잘못된 계정 노출 | seed 계정 `user_profiles_public.nickname`을 수정하고 표본 페이지를 재확인합니다. |

직접 DB 삭제는 마지막 수단입니다. 삭제 SQL을 쓰기 전에는 대상 row count와 `question_id` 목록을 먼저 기록합니다.
