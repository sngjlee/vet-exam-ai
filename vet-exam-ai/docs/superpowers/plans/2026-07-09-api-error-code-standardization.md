# API Error Code Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify every `app/api/**/route.ts` error response to a flat `{ error: "snake_case_code" }` envelope via one helper, and stop leaking raw DB messages to clients.

**Architecture:** New `lib/api/errors.ts` exposes a code catalog + `jsonError(code, status, extra?)` as the single error-response path. Each route swaps its ad-hoc `NextResponse.json({ error: ... }, { status })` for `jsonError(...)`. Raw `error.message` at 500 collapses to `internal_error` plus a server-side log; semantically meaningful statuses (401/403/404/409/410/422/429) keep dedicated codes. Three comment composers stop rendering `data.error` as user text.

**Tech Stack:** Next.js 16 (App Router route handlers), TypeScript, vitest (colocated `lib/**/*.test.ts`), existing `lib/utils/logging.ts` (`logError`, `captureOperationalError`).

**Spec:** `docs/superpowers/specs/2026-07-09-api-error-code-standardization-design.md`

**Working dir note:** The app lives in the nested `vet-exam-ai/` folder. The bash cwd can reset to the outer repo root between calls — always `cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"` at the start of each command, or use `npm --prefix vet-exam-ai`. All paths below are relative to that nested folder.

---

### Task 1: Create the error helper + catalog (TDD)

**Files:**
- Create: `lib/api/errors.ts`
- Test: `lib/api/errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/api/errors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { jsonError, ApiError } from "./errors";

describe("jsonError", () => {
  it("returns a flat { error: code } body with the given status", async () => {
    const res = jsonError(ApiError.NotFound, 404);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
  });

  it("merges extra fields additively into the envelope", async () => {
    const res = jsonError(ApiError.ValidationFailed, 400, { issues: [{ path: ["x"] }] });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "validation_failed",
      issues: [{ path: ["x"] }],
    });
  });

  it("accepts arbitrary domain code strings (upload family)", async () => {
    const res = jsonError("too_large", 400);
    await expect(res.json()).resolves.toEqual({ error: "too_large" });
  });

  it("never places a raw message into the body unless passed as extra", async () => {
    const res = jsonError(ApiError.Internal, 500);
    const body = await res.json();
    expect(body).toEqual({ error: "internal_error" });
    expect(Object.keys(body)).toEqual(["error"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix vet-exam-ai run test -- errors`
Expected: FAIL — `Cannot find module "./errors"` (or import error).

- [ ] **Step 3: Write minimal implementation**

Create `lib/api/errors.ts`:

```ts
import { NextResponse } from "next/server";

/**
 * Stable, reusable API error codes. Values are the machine codes clients may
 * switch on; they are NOT user-facing copy. Domain-specific one-off codes
 * (upload family: too_large, invalid_mime, ...) are passed to jsonError as raw
 * strings and need no entry here.
 */
export const ApiError = {
  AuthRequired: "auth_required",
  Forbidden: "forbidden",
  NotFound: "not_found",
  Gone: "gone",
  InvalidJson: "invalid_json",
  MissingParam: "missing_param",
  ValidationFailed: "validation_failed",
  Conflict: "conflict",
  RateLimited: "rate_limited",
  Internal: "internal_error",
} as const;

export type ApiErrorCode = (typeof ApiError)[keyof typeof ApiError];

/**
 * Single path for API error responses. Body is always `{ error: code, ...extra }`.
 * `code` accepts the catalog union or a raw domain string. `extra` is for
 * additive, non-sensitive fields only (zod `issues`, an offending `detail` URL) —
 * never the raw DB `error.message`.
 */
export function jsonError(
  code: ApiErrorCode | string,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: code, ...(extra ?? {}) }, { status });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix vet-exam-ai run test -- errors`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git add lib/api/errors.ts lib/api/errors.test.ts
git commit -m "feat(api): add jsonError helper + error code catalog"
```

---

### Task 2: Migrate `requireUser` 401 to `auth_required`

**Files:**
- Modify: `lib/auth/requireUser.ts:31-34`
- Modify: `lib/auth/requireUser.test.ts:21-23`

- [ ] **Step 1: Update the test assertion first**

In `lib/auth/requireUser.test.ts`, change the expected body:

```ts
      await expect(res.response.json()).resolves.toEqual({
        error: "auth_required",
      });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix vet-exam-ai run test -- requireUser`
Expected: FAIL — received `{ error: "Authentication required" }`.

- [ ] **Step 3: Update `requireUser` to use the helper**

In `lib/auth/requireUser.ts`, replace the import block top and the 401 response.

Add near the other imports (line 3 area):

```ts
import { jsonError, ApiError } from "../api/errors";
```

Replace lines 29-35 (the `return { ok: false, response: ... }` block):

```ts
    return {
      ok: false,
      response: jsonError(ApiError.AuthRequired, 401),
    };
```

The unused `NextResponse` import stays (the type `RequireUserResult` still references `NextResponse`). Leave line 1 (`import { NextResponse } from "next/server";`) as-is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix vet-exam-ai run test -- requireUser`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git add lib/auth/requireUser.ts lib/auth/requireUser.test.ts
git commit -m "refactor(api): requireUser returns auth_required code"
```

---

## Route migration conventions (apply in Tasks 3–8)

For every route file in a task:

1. Add the import (place next to the existing `NextResponse` import):
   ```ts
   import { jsonError, ApiError } from "@/lib/api/errors";
   ```
   Check the file's existing import style — if it uses relative paths (`../../../lib/...`) match that; most `app/api` routes use the `@/` alias. Verify against a sibling import already in the file.
2. Replace each listed `NextResponse.json({ error: ... }, { status: N })` with the given `jsonError(...)` call.
3. **DB message leaks (`{ error: <x>.message }` at 500):** replace with `jsonError(ApiError.Internal, 500)`. Before returning, ensure the original error is logged. If the route already calls `logError`/`captureOperationalError` for that error, do not add a second log. Otherwise add:
   ```ts
   logError("[<route>] <operation> failed", <errVar>);
   ```
   importing `logError` from `@/lib/utils/logging` if not already imported.
4. Do **not** touch success responses or non-error `NextResponse.json(data, ...)` calls.
5. Keep `NextResponse` imported if any success/other response still uses it.

After each task: `npm --prefix vet-exam-ai run test` stays green and the touched files typecheck (full tsc runs in Task 10).

---

### Task 3: notifications cluster

**Files:**
- Modify: `app/api/notifications/route.ts:14,33`
- Modify: `app/api/notifications/[id]/route.ts:12,19,22-24,39,42,55`
- Modify: `app/api/notifications/mark-all-read/route.ts:17`
- Modify: `app/api/notifications/unread-count/route.ts:16`

- [ ] **Step 1: Migrate `notifications/route.ts`**

Add the import. Replace:
- L14 `{ error: "Invalid limit" }, { status: 400 }` → `jsonError(ApiError.MissingParam, 400)`
- L33 `{ error: "notifications_fetch_failed" }, { status: 500 }` → `jsonError(ApiError.Internal, 500)` (this path already logs; confirm — if it does not, add `logError`).

- [ ] **Step 2: Migrate `notifications/[id]/route.ts`**

Add the import. Replace:
- L12 `{ error: "Missing id" }, { status: 400 }` → `jsonError(ApiError.MissingParam, 400)`
- L19 `{ error: "Invalid JSON" }, { status: 400 }` → `jsonError(ApiError.InvalidJson, 400)`
- L22-24 `{ error: "Only { read: true } is supported" }, { status: 400 }` → `jsonError(ApiError.ValidationFailed, 400)`
- L39 `{ error: selectErr.message }, { status: 500 }` → add `logError("[notifications/:id] select failed", selectErr);` then `jsonError(ApiError.Internal, 500)`
- L42 `{ error: "Notification not found" }, { status: 404 }` → `jsonError(ApiError.NotFound, 404)`
- L55 `{ error: updateErr.message }, { status: 500 }` → add `logError("[notifications/:id] update failed", updateErr);` then `jsonError(ApiError.Internal, 500)`

- [ ] **Step 3: Migrate `mark-all-read/route.ts` and `unread-count/route.ts`**

Add the import to each. Replace:
- `mark-all-read` L17 `{ error: error.message }, { status: 500 }` → add `logError("[notifications/mark-all-read] failed", error);` then `jsonError(ApiError.Internal, 500)`
- `unread-count` L16 `{ error: error.message }, { status: 500 }` → add `logError("[notifications/unread-count] failed", error);` then `jsonError(ApiError.Internal, 500)`

- [ ] **Step 4: Verify tests still green**

Run: `npm --prefix vet-exam-ai run test`
Expected: PASS (all existing tests unaffected).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git add app/api/notifications
git commit -m "refactor(api): standardize error codes in notifications routes"
```

---

### Task 4: comments top-level cluster

**Files:**
- Modify: `app/api/comments/route.ts` (L77,80,84,119,122,176,181-183,194-196,218,221-223,227-229,243-245,282,288,290)
- Modify: `app/api/comments/counts/route.ts:41`
- Modify: `app/api/comments/correction-status/route.ts:21,35`

- [ ] **Step 1: Migrate `comments/route.ts`**

Add the import. This route already uses `logError` in places — reuse it for new `internal_error` collapses; if a specific 500 branch lacks a log, add `logError("[comments] <op> failed", <errVar>)`.

- L77 `{ error: error.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L80 `{ error: allCountRes.error.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L84 `{ error: result.error.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L119 `{ error: questionsRes.error.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L122 `{ error: profilesRes.error.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L176 `{ error: "Invalid JSON" }, { status: 400 }` → `jsonError(ApiError.InvalidJson, 400)`
- L181-183 `{ error: "Validation failed", issues: parsed.error.issues }, { status: 400 }` → `jsonError(ApiError.ValidationFailed, 400, { issues: parsed.error.issues })`
- L194-196 `{ error: "invalid_image_url", detail: invalidUrl }, { status: 400 }` → `jsonError("invalid_image_url", 400, { detail: invalidUrl })`
- L218 `{ error: parentErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L221-223 `{ error: "Parent comment not found" }, { status: 404 }` → `jsonError(ApiError.NotFound, 404)`
- L227-229 `{ error: "Parent belongs to another question" }, { status: 400 }` → `jsonError(ApiError.ValidationFailed, 400)`
- L243-245 `{ error: "type is required for root comments" }, { status: 400 }` → `jsonError(ApiError.MissingParam, 400)`
- L282 `{ error: error.message }, { status: 422 }` → `jsonError(ApiError.ValidationFailed, 422)` (insert content validation; log via existing handling if present)
- L288 `{ error: error.message }, { status: 409 }` → `jsonError(ApiError.Conflict, 409)`
- L290 `{ error: error.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`

- [ ] **Step 2: Migrate `comments/counts/route.ts`**

Add the import. Replace L41 `NextResponse.json({}, { status: 500 })` → add `logError("[comments/counts] page fetch failed", error);` then `jsonError(ApiError.Internal, 500)`.

- [ ] **Step 3: Migrate `comments/correction-status/route.ts`**

Add the import. Replace:
- L21 `{ error: "Missing question_id" }, { status: 400 }` → `jsonError(ApiError.MissingParam, 400)`
- L35 `{ error: error.message }, { status: 500 }` → add `logError("[comments/correction-status] failed", error);` then `jsonError(ApiError.Internal, 500)`

- [ ] **Step 4: Verify tests still green**

Run: `npm --prefix vet-exam-ai run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git add app/api/comments/route.ts app/api/comments/counts app/api/comments/correction-status
git commit -m "refactor(api): standardize error codes in comments top-level routes"
```

---

### Task 5: comments/[id] cluster

**Files:**
- Modify: `app/api/comments/[id]/route.ts` (L14,28,31,40,46,56,84,91,96-98,110-112,126,129,132,135-137,146-148,194)
- Modify: `app/api/comments/[id]/history/route.ts` (L10,22,25,28,38)
- Modify: `app/api/comments/[id]/report/route.ts` (L12,19,24-26,37-39,50,53,56-58,62-64,81-83,86)
- Modify: `app/api/comments/[id]/vote/route.ts` (L13,20,25-27,38-40,52,55,58-60,64-66,79,91,103,114)

- [ ] **Step 1: Migrate `comments/[id]/route.ts`**

Add the import. Replace:
- L14 `{ error: "Missing id" }, { status: 400 }` → `jsonError(ApiError.MissingParam, 400)`
- L28 `{ error: selectErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L31 `{ error: "Comment not found" }, { status: 404 }` → `jsonError(ApiError.NotFound, 404)`
- L40 `{ error: profileErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L46 `{ error: "Forbidden" }, { status: 403 }` → `jsonError(ApiError.Forbidden, 403)`
- L56 `{ error: updateErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L84 `{ error: "Missing id" }, { status: 400 }` → `jsonError(ApiError.MissingParam, 400)`
- L91 `{ error: "Invalid JSON" }, { status: 400 }` → `jsonError(ApiError.InvalidJson, 400)`
- L96-98 `{ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }` → `jsonError(ApiError.ValidationFailed, 422, { issues: parsed.error.issues })`
- L110-112 `{ error: "invalid_image_url", detail: invalidUrl }, { status: 400 }` → `jsonError("invalid_image_url", 400, { detail: invalidUrl })`
- L126 `{ error: selectErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L129 `{ error: "Comment not found" }, { status: 404 }` → `jsonError(ApiError.NotFound, 404)`
- L132 `{ error: "Forbidden" }, { status: 403 }` → `jsonError(ApiError.Forbidden, 403)`
- L135-137 `{ error: "이 댓글은 더 이상 수정할 수 없습니다" }, { status: 409 }` → `jsonError(ApiError.Conflict, 409)`
- L146-148 `{ error: "내용 또는 이미지 중 하나는 남아있어야 합니다" }, { status: 422 }` → `jsonError(ApiError.ValidationFailed, 422)`
- L194 `{ error: updateErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`

(The 200-response object at L157-167 is a success payload — leave untouched.)

- [ ] **Step 2: Migrate `comments/[id]/history/route.ts`**

Add the import. Replace:
- L10 `{ error: "Missing id" }, { status: 400 }` → `jsonError(ApiError.MissingParam, 400)`
- L22 `{ error: cErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L25 `{ error: "Comment not found" }, { status: 404 }` → `jsonError(ApiError.NotFound, 404)`
- L28 `{ error: "Comment unavailable" }, { status: 410 }` → `jsonError(ApiError.Gone, 410)`
- L38 `{ error: hErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`

- [ ] **Step 3: Migrate `comments/[id]/report/route.ts`**

Add the import. Replace:
- L12 `{ error: "Missing id" }, { status: 400 }` → `jsonError(ApiError.MissingParam, 400)`
- L19 `{ error: "Invalid JSON" }, { status: 400 }` → `jsonError(ApiError.InvalidJson, 400)`
- L24-26 `{ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }` → `jsonError(ApiError.ValidationFailed, 422, { issues: parsed.error.issues })`
- L37-39 `{ error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429, headers: { "Retry-After": ... } }` → keep the headers; use the 4th arg is not available for headers, so build the response explicitly. Replace with:
  ```ts
  return jsonError(ApiError.RateLimited, 429);
  ```
  **but preserve the `Retry-After` header.** Since `jsonError` does not set headers, keep this branch as a direct `NextResponse.json` OR extend: use `const res = jsonError(ApiError.RateLimited, 429); res.headers.set("Retry-After", String(rl.retryAfterSeconds)); return res;`
- L50 `{ error: commentErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L53 `{ error: "Comment not found" }, { status: 404 }` → `jsonError(ApiError.NotFound, 404)`
- L56-58 `{ error: "Cannot report own comment" }, { status: 403 }` → `jsonError(ApiError.Forbidden, 403)`
- L62-64 `{ error: "Comment is no longer available" }, { status: 410 }` → `jsonError(ApiError.Gone, 410)`
- L81-83 `{ error: "Already reported" }, { status: 409 }` → `jsonError(ApiError.Conflict, 409)`
- L86 `{ error: insertErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`

- [ ] **Step 4: Migrate `comments/[id]/vote/route.ts`**

Add the import. Replace:
- L13 `{ error: "Missing id" }, { status: 400 }` → `jsonError(ApiError.MissingParam, 400)`
- L20 `{ error: "Invalid JSON" }, { status: 400 }` → `jsonError(ApiError.InvalidJson, 400)`
- L25-27 `{ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }` → `jsonError(ApiError.ValidationFailed, 422, { issues: parsed.error.issues })`
- L38-40 `{ error: "요청이 너무 많습니다. ..." }, { status: 429, headers: {...} }` → same Retry-After pattern as report: `const res = jsonError(ApiError.RateLimited, 429); res.headers.set("Retry-After", String(rl.retryAfterSeconds)); return res;`
- L52 `{ error: commentErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L55 `{ error: "Comment not found" }, { status: 404 }` → `jsonError(ApiError.NotFound, 404)`
- L58-60 `{ error: "Cannot vote on own comment" }, { status: 403 }` → `jsonError(ApiError.Forbidden, 403)`
- L64-66 `{ error: "Voting is not available on this comment" }, { status: 409 }` → `jsonError(ApiError.Conflict, 409)`
- L79 `{ error: existingErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L91 `{ error: upsertErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L103 `{ error: deleteErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L114 `{ error: updateErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`

(The `{ vote: ... }` success responses stay untouched.)

- [ ] **Step 5: Verify tests still green + commit**

Run: `npm --prefix vet-exam-ai run test`
Expected: PASS.

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git add "app/api/comments/[id]"
git commit -m "refactor(api): standardize error codes in comments/[id] routes"
```

---

### Task 6: comments pins / reports-mine / votes-mine / upload

**Files:**
- Modify: `app/api/comments/pins/route.ts` (L18-20,40,63,75,85,107)
- Modify: `app/api/comments/reports-mine/route.ts` (L10,28,42)
- Modify: `app/api/comments/votes-mine/route.ts` (L11,30,45)
- Modify: `app/api/comments/upload/route.ts` (L102,150 — the `detail` leaks; domain codes stay)

- [ ] **Step 1: Migrate `pins/route.ts`**

Add the import. Replace:
- L18-20 `{ error: "question_id is required" }, { status: 400 }` → `jsonError(ApiError.MissingParam, 400)`
- L40 `{ error: error.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L63 `{ error: "invalid payload" }, { status: 400 }` → `jsonError(ApiError.ValidationFailed, 400)`
- L75 `{ error: existingErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L85 `{ error: delErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L107 `{ error: upsertErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`

(The `{ comment_id: ... }` / `{ pinned: ... }` 200 responses stay untouched.)

- [ ] **Step 2: Migrate `reports-mine/route.ts` and `votes-mine/route.ts`**

Add the import to each. Replace:
- `reports-mine` L10 `{ error: "question_id is required" }, { status: 400 }` → `jsonError(ApiError.MissingParam, 400)`
- `reports-mine` L28 `{ error: idsErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- `reports-mine` L42 `{ error: reportsErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- `votes-mine` L11 `{ error: "question_id is required" }, { status: 400 }` → `jsonError(ApiError.MissingParam, 400)`
- `votes-mine` L30 `{ error: idsErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- `votes-mine` L45 `{ error: votesErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`

(The `[]` empty-200 anon responses stay untouched.)

- [ ] **Step 3: Migrate `upload/route.ts` (domain codes kept, message leaks removed)**

Add the import. The domain-code 400s (`too_large`, `invalid_mime`, `invalid_magic`, `decode_failed`, `dimensions_exceeded`, `missing_file`, `invalid_payload`, `missing_url`, `invalid_url`) and `rate_limited`/`forbidden`/`rate_lookup_failed` should be routed through `jsonError("<code>", <status>)` for envelope consistency (same body, so behaviorally identical). The two leaks to fix:
- L102 `{ error: "upload_failed", detail: uploadErr.message }, { status: 500 }` → add `logError("[comments/upload] storage upload failed", uploadErr);` then `jsonError("upload_failed", 500)` (drop the raw `detail` message).
- L150 `{ ok: false, detail: removeErr.message }, { status: 200 }` → this is a non-`error` best-effort cleanup response (200, `ok:false`). Leave the shape but drop the raw message: `NextResponse.json({ ok: false }, { status: 200 })` and add `logWarn("[comments/upload] cleanup remove failed", removeErr);` (import `logWarn` from `@/lib/utils/logging`). Do NOT route through `jsonError` (it is not an `error` envelope).

Converting the other domain codes to `jsonError` is optional-but-preferred for consistency; if a subagent does it, keep the exact code strings and statuses unchanged.

- [ ] **Step 4: Verify tests still green + commit**

Run: `npm --prefix vet-exam-ai run test`
Expected: PASS.

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git add app/api/comments/pins app/api/comments/reports-mine app/api/comments/votes-mine app/api/comments/upload
git commit -m "refactor(api): standardize error codes in pins/reports-mine/votes-mine/upload"
```

---

### Task 7: profile / questions / search

**Files:**
- Modify: `app/api/profile/route.ts` (L15,20-22,39,42,58-64,85-87,90)
- Modify: `app/api/profile/[user_id]/comments/route.ts` (L27,45)
- Modify: `app/api/questions/route.ts` (L103-105,109,117-119,135-137,145-147,154-156,178)
- (search: **descoped** — see Step 4)

- [ ] **Step 1: Migrate `profile/route.ts`**

Add the import. Replace:
- L15 `{ error: "Invalid JSON" }, { status: 400 }` → `jsonError(ApiError.InvalidJson, 400)`
- L20-22 `{ error: "Validation failed", issues: parsed.error.issues }, { status: 400 }` → `jsonError(ApiError.ValidationFailed, 400, { issues: parsed.error.issues })`
- L39 `{ error: selectErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L42 `{ error: "Profile not found" }, { status: 404 }` → `jsonError(ApiError.NotFound, 404)`
- L58-64 `{ error: "nickname_change_too_soon", next_change_available_at: policy.nextChangeAt.toISOString() }, { status: 400 }` → `jsonError("nickname_change_too_soon", 400, { next_change_available_at: policy.nextChangeAt.toISOString() })` — **exact code string + the additive `next_change_available_at` field preserved** (client `ProfileEditController:90` switches on the code).
- L85-87 `{ error: "nickname_taken" }, { status: 400 }` → `jsonError("nickname_taken", 400)` — **exact code string preserved** (client `ProfileEditController:88` switches on it).
- L90 `{ error: updateErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`

- [ ] **Step 2: Migrate `profile/[user_id]/comments/route.ts`**

Add the import. Replace:
- L27 `{ error: cErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`
- L45 `{ error: qErr.message }, { status: 500 }` → log + `jsonError(ApiError.Internal, 500)`

- [ ] **Step 3: Migrate `questions/route.ts`**

Add the import. All listed branches are human-message 500s/404 (no raw DB message leaked — they already use safe static strings, but standardize to codes):
- L103-105 `{ error: "Failed to load question" }, { status: 500 }` → `jsonError(ApiError.Internal, 500)` (ensure the preceding `question.error` is logged; add `logError` if not)
- L109 `{ error: "Question not found" }, { status: 404 }` → `jsonError(ApiError.NotFound, 404)`
- L117-119 `{ error: "Failed to load question metadata" }, { status: 500 }` → `jsonError(ApiError.Internal, 500)` (+log)
- L135-137 `{ error: "Failed to load session questions" }, { status: 500 }` → `jsonError(ApiError.Internal, 500)` (this branch already `logError`s at L134 — no second log)
- L145-147 `{ error: "Failed to resolve latest year" }, { status: 500 }` → `jsonError(ApiError.Internal, 500)` (+log)
- L154-156 `{ error: "Failed to load question summaries" }, { status: 500 }` → `jsonError(ApiError.Internal, 500)` (+log)
- L178 `{ error: "Failed to load questions" }, { status: 500 }` → `jsonError(ApiError.Internal, 500)` (+log)

- [ ] **Step 4: search — descoped, leave untouched**

`search/route.ts` returns a full `SearchResponse` payload (`items`/`total`/…) with an embedded `error` field typed as a **literal union** in `lib/search/types.ts:36`: `error: null | "too_short" | "internal"`. It is not a bare error envelope, it already uses flat codes, and the client (`search/page.tsx`) only checks presence. Renaming `"internal"` → `"internal_error"` would force a type-union edit for zero client benefit and touch a differently-shaped response.

**Do not modify `search/route.ts` or `lib/search/types.ts`.** Search is out of scope for this refactor.

- [ ] **Step 5: Verify tests still green + commit**

Run: `npm --prefix vet-exam-ai run test`
Expected: PASS.

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git add app/api/profile app/api/questions/route.ts
git commit -m "refactor(api): standardize error codes in profile/questions"
```

---

### Task 8: admin/image-replacement/upload

**Files:**
- Modify: `app/api/admin/image-replacement/upload/route.ts` (L37,41,48,57,60,63,67,71,74,83,87,90,113,121,125,138)

- [ ] **Step 1: Migrate the admin upload route**

Add the import. The admin auth gate (`auth.error`/`auth.status`) already carries a flat code string:
- L37 `{ error: auth.error }, { status: auth.status }` → `jsonError(auth.error, auth.status)`
- L121 `{ error: auth.error }, { status: auth.status }` → `jsonError(auth.error, auth.status)`

Domain-code branches — route through `jsonError` keeping exact code + status:
- L41 `too_large` 400, L48 `invalid_payload` 400, L57 `missing_file` 400, L60 `missing_question_id` 400, L63 `invalid_role` 400, L67 `invalid_index` 400, L71 `invalid_mime` 400, L74 `too_large` 400, L83 `invalid_magic` 400, L87 `decode_failed` 400, L90 `dimensions_exceeded` 400, L125 `missing_key` 400 → `jsonError("<code>", 400)`
- L113 `storage_upload_failed` 500 → add `logError` for the upload error if a nearby error var exists (check the branch); then `jsonError("storage_upload_failed", 500)`
- L138 `storage_delete_failed` 500 → same, `jsonError("storage_delete_failed", 500)`

No raw `.message` is leaked in this file, so no message-stripping needed — this is envelope consistency + gate routing only.

- [ ] **Step 2: Verify tests still green + commit**

Run: `npm --prefix vet-exam-ai run test`
Expected: PASS.

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git add app/api/admin/image-replacement/upload/route.ts
git commit -m "refactor(api): route admin image-replacement upload errors through jsonError"
```

---

### Task 9: Client composer defensive fix

Flat codes must not surface as user-facing text. Three composers currently `throw new Error(data.error ?? "...")`, which would display a raw code. Show the friendly fallback instead (this also removes the pre-existing raw-DB-message exposure).

**Files:**
- Modify: `components/comments/CommentComposer.tsx:56`
- Modify: `components/comments/CommentEditComposer.tsx:93`
- Modify: `components/comments/CommentReplyComposer.tsx:90,107`

- [ ] **Step 1: Fix `CommentComposer.tsx`**

Read lines 50-60 for context. Replace L56:
```ts
        throw new Error(data.error ?? "전송 실패. 다시 시도해주세요.");
```
with:
```ts
        throw new Error("전송 실패. 다시 시도해주세요.");
```
The now-unused `data`/`res.json()` may trigger a lint no-unused warning — if `data` becomes unused, remove the `const data = await res.json()...` line in that branch too. Verify the surrounding branch still compiles.

- [ ] **Step 2: Fix `CommentEditComposer.tsx`**

Replace L93:
```ts
        throw new Error(data.error ?? "수정 실패. 다시 시도해주세요.");
```
with:
```ts
        throw new Error("수정 실패. 다시 시도해주세요.");
```
Remove the now-unused `const data = await res.json().catch(() => ({}));` at L92 if it becomes unused. Keep the L86-90 `res.status === 409` branch (its Korean copy is client-owned) untouched.

- [ ] **Step 3: Fix `CommentReplyComposer.tsx`**

Read lines 84-110 for context. Replace L90 and L107 (both `throw new Error(data.error ?? "...")`) with the same-message literal, dropping `data.error`:
- L90 → `throw new Error("수정 실패. 다시 시도해주세요.");`
- L107 → `throw new Error("전송 실패. 다시 시도해주세요.");`
Remove the corresponding now-unused `data` reads in each branch if they become unused.

- [ ] **Step 4: Verify tests still green + commit**

Run: `npm --prefix vet-exam-ai run test`
Expected: PASS (no test covers these components; this guards the verify step below).

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git add components/comments/CommentComposer.tsx components/comments/CommentEditComposer.tsx components/comments/CommentReplyComposer.tsx
git commit -m "fix(comments): don't render raw API error codes in composer error UI"
```

---

### Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm --prefix vet-exam-ai run typecheck` (or `npx --prefix vet-exam-ai tsc --noEmit` — check `package.json` scripts for the exact name)
Expected: clean, 0 errors. Fix any unused-import (`NextResponse`) or type errors surfaced.

- [ ] **Step 2: Lint (no new errors vs baseline)**

Run: `npm --prefix vet-exam-ai run lint`
Expected: no NEW errors beyond the main baseline (main has pre-existing lint errors — see `[[lint_baseline_pre_existing]]`; do not attempt to fix unrelated ones, just confirm you added none).

- [ ] **Step 3: Full test suite**

Run: `npm --prefix vet-exam-ai run test`
Expected: PASS — previously 8 files / 31 tests, now 9 files / 35 tests (errors.test.ts adds 4).

- [ ] **Step 4: Preview smoke (public routes)**

Start the dev server (preview_start) and verify:
- `GET /api/questions?meta=1` → 200, body has categories (unchanged success path).
- Trigger a `missing_param`: `GET /api/comments/votes-mine` (no `question_id`) → 400 `{ "error": "missing_param" }`.
- `GET /api/comments/counts?ids=` or a malformed request → confirm no raw DB message appears in any error body.

Use `preview_network` / `preview_eval(fetch(...))` to read the JSON bodies. Confirm every error body matches `{ error: "<code>" }` shape.

- [ ] **Step 5: Final grep audit (no leaks remain)**

Run:
```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
grep -rn "error:.*\.message" app/api --include=route.ts | grep -v "app/api/cron"
```
Expected: no matches (every DB-message leak in non-cron routes is gone). If any remain, migrate them per the Task 3–8 convention.

- [ ] **Step 6: Confirm preserved client contracts**

Run:
```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
grep -rn "nickname_taken\|nickname_change_too_soon" app/api/profile
```
Expected: both code strings still present in `app/api/profile/route.ts` (client switch contract intact).

- [ ] **Step 7: Push branch + open PR**

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git push -u origin HEAD
gh pr create --title "refactor(api): standardize error response codes (Phase 5 ⑥)" --body "..."
```
(Only if the user has asked to push/PR — otherwise stop after Step 6 and report.)

---

## Self-Review notes (author)

- **Spec coverage:** envelope (Task 1), catalog (Task 1), 23-route transition incl. DB-leak collapse (Tasks 3–8), requireUser (Task 2), zod `issues` additive (Tasks 4,5,7), logging connect (Tasks 3–8), tests (Task 1), client preserve/defense (Task 9), cron out-of-scope (noted), verification (Task 10). All covered.
- **Retry-After preservation:** report/vote 429 branches keep the header via `res.headers.set` since `jsonError` has no header arg — called out explicitly to avoid dropping it.
- **search** (typed literal-union `error` field in a full payload) and **upload-cleanup** (`{ ok: false }` 200) are non-`error`-envelope responses; explicitly excluded from `jsonError` routing to avoid changing payload/type shapes.
- **Type consistency:** `ApiError`, `ApiErrorCode`, `jsonError(code, status, extra?)` names used identically across all tasks.
- **Branch:** create a feature branch before Task 1 (e.g. `chore/phase5-api-error-codes`) per repo convention — do not commit to `main`.
