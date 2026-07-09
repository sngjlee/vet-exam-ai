# API 에러코드 표준화 (Phase 5 ⑥) — 설계

- **날짜**: 2026-07-09
- **범위**: `app/api/**/route.ts` 23개 라우트의 에러 응답 형식/코드 통일
- **관련**: 2026-07-08 감사 Phase 5 ⑥ ([[audit-2026-07-08]])

## 문제

현재 API 라우트의 에러 응답이 세 가지 형식으로 혼재한다.

1. `{ error: "Human message" }` — 대부분 (`"Question not found"`, `"Invalid JSON"`, `"Missing id"`, `"Forbidden"` 등)
2. `{ error: "snake_case_code" }` — 신규 라우트 (`comments/upload`, `admin/image-replacement/upload`, `notifications` 일부, rate-limit surface: `too_large`, `rate_limited`, `notifications_fetch_failed` 등)
3. `{ error: "Validation failed", issues: [...] }` — zod 라우트 5개

추가로 **DB 내부 메시지 유출**: 다수 라우트가 `{ error: error.message }`로 Supabase/Postgres 원본 에러 메시지(스키마명·제약조건명 포함)를 클라이언트에 그대로 노출한다 — 보안상 실제 문제.

클라이언트 소비 실태: API 라우트 응답은 대부분 `.items`/`.count`만 읽고 `error` 필드를 세분화해 분기하지 않음 → 형식 변경의 클라 파손 리스크 낮음. (server action들은 별개로 이미 `result.error === "wrong_current_password"` 식 플랫 코드로 분기 중이며, **이번 범위 밖**.)

## 결정: 봉투 형식

**플랫 `{ error: "snake_case_code" }`** 로 통일.

- 기존 필드명(`error`) 유지 → 클라 소비처/타입 변경 최소.
- 신규 라우트·server action의 기존 플랫 코드 컨벤션과 일관.
- `error` 값은 항상 사람 메시지가 아닌 **안정 머신 코드**.

## 아키텍처

### 1. 새 헬퍼 모듈 `lib/api/errors.ts`

재사용 에러 코드 카탈로그 + 단일 응답 생성 함수.

```ts
import { NextResponse } from "next/server";

export const ApiError = {
  AuthRequired: "auth_required",
  Forbidden: "forbidden",
  NotFound: "not_found",
  InvalidJson: "invalid_json",
  MissingParam: "missing_param",
  ValidationFailed: "validation_failed",
  Conflict: "conflict",
  RateLimited: "rate_limited",
  Internal: "internal_error",
} as const;

export type ApiErrorCode = (typeof ApiError)[keyof typeof ApiError];

/**
 * 표준 에러 응답 생성. `{ error: code, ...extra }` 형태.
 * 도메인 특화 플랫 코드(too_large 등)는 code에 문자열 직접 전달 가능(string 허용).
 */
export function jsonError(
  code: ApiErrorCode | string,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: code, ...(extra ?? {}) }, { status });
}
```

- **유일한 에러 응답 경로**. 모든 라우트가 이 함수로만 에러를 반환.
- `code`는 카탈로그 union 또는 `string`(upload/이미지교체의 기존 도메인 코드 `too_large`/`invalid_mime`/`decode_failed` 등을 그대로 통과시키기 위함).
- `extra`는 zod `issues`, upload `detail` 대체 등 additive 필드 전용.

### 2. 23개 라우트 전환 규칙

| 현재 | 전환 후 |
|---|---|
| `{ error: error.message }` (DB 원본 유출, 500) | `jsonError("internal_error", 500)` + 서버측 `logError`/`captureOperationalError`로 원본 기록 |
| `{ error: "Missing id" }` (400) | `jsonError("missing_param", 400)` |
| `{ error: "Invalid JSON" }` (400) | `jsonError("invalid_json", 400)` |
| `{ error: "Forbidden" }` (403) | `jsonError("forbidden", 403)` |
| `{ error: "X not found" }` (404) | `jsonError("not_found", 404)` |
| `{ error: "Validation failed", issues }` (400) | `jsonError("validation_failed", 400, { issues })` |
| `{ error: error.message }` (409/422 등 의미 있는 상태) | 상태별 전용 코드 유지: `conflict`(409), 도메인 코드(422) |
| `{ error: "snake_case_code" }` (upload 등) | 봉투만 `jsonError(...)` 경유로 통일, 코드 문자열 불변 |

**핵심 원칙**:
- **DB 500 유출은 `internal_error`로 일괄 붕괴** + 서버 로그. 이미 404/403/409/422로 의미 구분되던 상태코드는 전용 코드 유지 → 정보은닉과 클라 신호의 균형.
- `requireUser` (`lib/auth/requireUser.ts`)의 401 응답을 `{ error: "Authentication required" }` → `jsonError("auth_required", 401)`로 교체.
- upload/이미지교체 admin 게이트(`auth.error`/`auth.status`)는 `requireUser`가 아닌 별도 게이트. `auth.error`가 이미 코드 문자열이므로 봉투를 `jsonError(auth.error, auth.status)` 경유로만 정리, 게이트 시그니처는 불변.

### 3. 로깅 연동

`internal_error`로 붕괴하는 지점마다 원본 에러를 반드시 서버에 남긴다. 기존 인프라 재사용:
- 단순 콘솔: `logError("[route] operation failed", err)`
- Sentry 포착이 필요한 운영 오류: `captureOperationalError(err, { area: "api", operation, failureKind })`
- 라우트가 이미 로깅 중이면 중복 추가하지 않음.

## 코드 카탈로그 (재사용 코드)

| 코드 | 상태 | 의미 |
|---|---|---|
| `auth_required` | 401 | 인증 필요 |
| `forbidden` | 403 | 권한 없음 |
| `not_found` | 404 | 리소스 없음 |
| `invalid_json` | 400 | 요청 바디 JSON 파싱 실패 |
| `missing_param` | 400 | 필수 파라미터 누락 |
| `validation_failed` | 400 | zod 검증 실패 (`{ issues }` 동반) |
| `conflict` | 409 | 상태 충돌 (중복 등) |
| `rate_limited` | 429 | 레이트리밋 |
| `internal_error` | 500 | 서버 내부 오류 (원본은 서버 로그) |

도메인 특화 코드(upload 계열: `too_large`, `invalid_mime`, `invalid_magic`, `decode_failed`, `dimensions_exceeded`, `storage_upload_failed`, `storage_delete_failed`, `missing_file`, `missing_key`, `invalid_payload`, `invalid_role`, `invalid_index` 등)는 이미 플랫 코드이므로 **그대로 유지**, 봉투만 헬퍼 경유.

## 테스트

기존 vitest 컨벤션(콜로케이트, `import { describe, it, expect } from "vitest"` 명시)에 맞춰 `lib/api/errors.test.ts` 추가:
1. `jsonError(code, status)`가 `{ error: code }` + 올바른 status를 반환.
2. `extra`가 봉투에 머지됨 (`{ error, issues }`).
3. `internal_error` 경로가 DB 원본 메시지를 응답 바디에 포함하지 않음(회귀 가드) — 대표 라우트 하나에 대해 fake client로 DB 에러 주입 후 응답 바디에 원본 message 문자열이 없음을 assert.

## 비범위 (Out of scope)

- server action들의 에러 반환(`_actions.ts` 계열) — 이미 플랫 코드, 별도 계약, 이번 범위 밖.
- 성공 응답 형식.
- 클라이언트 에러 UI 카피 변경 — 라우트 응답을 세분 분기하는 클라가 없어 불필요.
- Phase 5 잔여 ②④⑤(useQuizSession/quiz분할/noUncheckedIndexedAccess).

## 검증 계획

- `tsc --noEmit` 클린.
- `npm run lint` 신규 error 없음 (main 베이스라인 대비).
- `npm run test` 전체 그린(신규 포함).
- 프리뷰 스모크: 공개 라우트(`/api/questions`, `/api/comments/counts`) 200 + 에러 경로 하나(예: `missing_param`) 형식 육안 확인.
