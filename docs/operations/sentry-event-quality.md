# Sentry 이벤트 품질 기준

KVLE는 운영 중 원인 파악이 빨라지도록 Sentry 이벤트 태그를 통일합니다.
개인정보, 파일 path 원문, 인증 토큰, reset link, service role key는 Sentry tag/context/message에 넣지 않습니다.

## 공통 태그

| 태그 | 의미 | 예시 |
|---|---|---|
| `area` | 장애 영역 | `auth`, `supabase`, `rls`, `storage`, `cron`, `admin`, `api` |
| `operation` | 실패한 작업 | `auth_callback`, `create_comment`, `comment_image_upload` |
| `failure_kind` | 운영 분류 | `rls_denied`, `storage_upload_failed`, `cron_handler_failed` |
| `error_code` | Supabase/Postgres/Sentry-safe 코드 | `42501`, `23514`, `PGRST116` |
| `error_status` | HTTP 또는 SDK status | `401`, `403`, `500` |
| `cron_job` | cron 작업명 | `comment-image-sweep`, `signup-proof-purge` |
| `storage_bucket` | Storage bucket명 | `comment-images`, `question-images-public` |

## 캡처하는 오류

| 영역 | 캡처 기준 | 레벨 |
|---|---|---|
| Auth | callback의 code exchange 또는 OTP 검증 실패 | `warning` |
| RLS | Supabase 오류 코드 `42501`, RLS/permission denied 메시지 | `error` |
| Supabase | RPC/DB 조회가 5xx로 이어지는 실패 | `warning` 또는 `error` |
| Storage | 업로드 실패, 삭제 실패, rate-limit 로그 조회 실패 | 업로드 `error`, 삭제 best-effort `warning` |
| Cron | handler 실패, cron run log 기록 실패 | handler `error`, log insert `warning` |

## 사용자 안내만 하는 오류

- 로그인 폼의 잘못된 이메일/비밀번호
- 댓글/신고/이미지 입력 validation 실패
- 파일 크기, MIME, magic number, 이미지 dimensions 제한 실패
- 댓글 중첩 제한, 자기 댓글 추천/신고 같은 정상적인 4xx
- rate limit 도달 자체

## 현재 적용 경로

| 경로 | 주요 operation |
|---|---|
| `app/auth/callback/route.ts` | `auth_callback` |
| `app/auth/pending-proof/_actions.ts` | `submit_signup_application` |
| `app/api/comments/route.ts` | `create_comment` |
| `app/api/comments/upload/route.ts` | `comment_image_upload`, `comment_image_delete` |
| `app/api/admin/image-replacement/upload/route.ts` | `question_image_replacement_upload`, `question_image_replacement_delete` |
| `lib/cron/run.ts` | `run_cron_job`, `record_cron_run` |

새 운영 리스크 경로가 추가되면 `lib/utils/logging.ts`의 `captureOperationalError`를 사용하고 이 문서를 갱신합니다.
