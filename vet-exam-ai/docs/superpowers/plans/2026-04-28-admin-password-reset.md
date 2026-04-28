# Admin Password Reset Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/users` 행마다 "비밀번호 재설정" 섹션 추가 — admin이 1회용 recovery 링크를 발급해 직접 사용자에게 전달. admin은 비번을 알 수 없음.

**Architecture:** 3-layer hybrid. (1) SQL Editor 마이그레이션으로 `audit_action` enum 확장 + 가드/audit RPC 추가. (2) `lib/supabase/admin.ts` 신규 — service role 클라이언트, server-only. (3) Server Action `issuePasswordResetLink`가 RPC 가드/audit → service role로 `auth.admin.generateLink('recovery')` → 결과 URL을 redirect 쿼리로 UI에 전달. UI는 `details` 5번째 섹션 + 결과 박스.

**Tech Stack:** Next.js 16 (App Router) + React 19, Supabase JS v2 (`@supabase/ssr` server client + `@supabase/supabase-js` admin client), PostgreSQL plpgsql `SECURITY DEFINER` RPC, server actions w/ FormData.

**Spec:** `vet-exam-ai/docs/superpowers/specs/2026-04-28-admin-password-reset-design.md`

**Branch:** `feat/admin-password-reset` (PR-D 후속, 단독 PR)

---

## Pre-flight

- [ ] **Step P-1: 사용자 작업 — Vercel env var 확인**

  사용자가 이미 `.env.local`에 `SUPABASE_SERVICE_ROLE_KEY`를 추가했음. **Vercel Production env vars에도 동일하게 추가됐는지 확인 필요** (확인은 사용자 직접). 아직이면 PR 머지 전까지 추가 부탁.

- [ ] **Step P-2: 새 브랜치 생성**

```bash
git checkout -b feat/admin-password-reset
git status
```
Expected: `On branch feat/admin-password-reset` / clean.

---

## Task 1: Migration SQL

**Files:**
- Create: `vet-exam-ai/supabase/migrations/20260504000001_admin_password_reset.sql`

- [ ] **Step 1.1: 마이그레이션 파일 작성**

Create `vet-exam-ai/supabase/migrations/20260504000001_admin_password_reset.sql` with this exact content:

```sql
-- =============================================================================
-- /admin/users PR-E — password reset link issuance
-- =============================================================================
-- Adds:
--   1. audit_action enum value 'password_reset_issued'
--   2. log_password_reset_issued RPC — admin-only guard + audit insert.
--      Actual link generation happens in Server Action via service role.
-- =============================================================================

alter type public.audit_action add value if not exists 'password_reset_issued';

create or replace function public.log_password_reset_issued(
  p_user_id uuid,
  p_note    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_user_id = v_admin_id then
    raise exception '본인 비밀번호는 이 화면에서 재설정할 수 없습니다.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception '대상 회원을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  perform public.log_admin_action(
    'password_reset_issued',
    'user',
    p_user_id::text,
    null,
    null,
    p_note
  );
end;
$$;

revoke execute on function public.log_password_reset_issued(uuid, text)
  from public, anon;
grant execute on function public.log_password_reset_issued(uuid, text)
  to authenticated;
```

- [ ] **Step 1.2: 사용자 작업 — Supabase SQL Editor 실행**

`community_tables_done.md` 함정 회피 — CLI db push 우회. Supabase Dashboard → SQL Editor에 위 파일 내용 그대로 붙여넣고 Run.

검증 SQL (같은 SQL Editor에서):
```sql
-- enum 확인
select unnest(enum_range(null::public.audit_action))::text as v
where unnest(enum_range(null::public.audit_action))::text = 'password_reset_issued';
-- 1행 'password_reset_issued' 나와야 함

-- RPC 확인
select proname from pg_proc where proname = 'log_password_reset_issued';
-- 1행 나와야 함
```

- [ ] **Step 1.3: 커밋**

```bash
git add vet-exam-ai/supabase/migrations/20260504000001_admin_password_reset.sql
git commit -m "PR-E: migration — password_reset_issued enum + log RPC"
```

---

## Task 2: Service Role Client Helper

**Files:**
- Create: `vet-exam-ai/lib/supabase/admin.ts`

- [ ] **Step 2.1: 헬퍼 작성**

Create `vet-exam-ai/lib/supabase/admin.ts` with this exact content:

```ts
// Service-role Supabase client — server-only.
// NEVER import from a "use client" file or any code that ships to the browser.
// Bypasses ALL RLS. Use exclusively for auth admin APIs and system-level
// mutations that explicitly require it (e.g. password reset link issuance).

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin env vars missing — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient<Database>(url, key, {
    auth: {
      persistSession:    false,
      autoRefreshToken:  false,
    },
  });
}
```

- [ ] **Step 2.2: 타입체크**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 종료 코드 0, 출력 없음.

- [ ] **Step 2.3: 커밋**

```bash
git add vet-exam-ai/lib/supabase/admin.ts
git commit -m "PR-E: lib/supabase/admin — service role client helper"
```

---

## Task 3: Types — Extend audit_action + Add RPC Signature

**Files:**
- Modify: `vet-exam-ai/lib/supabase/types.ts`

- [ ] **Step 3.1: audit_action enum 확장**

Read `vet-exam-ai/lib/supabase/types.ts` to find the `audit_action` enum block. It currently ends with `"question_update"`. Add `"password_reset_issued"` as the new last value.

Replace the block exactly (using Edit tool):

OLD:
```ts
      audit_action:
        | "comment_remove"
        | "comment_unblind"
        | "user_suspend"
        | "user_unsuspend"
        | "badge_grant"
        | "badge_revoke"
        | "correction_accept"
        | "correction_reject"
        | "report_uphold"
        | "report_dismiss"
        | "role_change"
        | "question_update";
```

NEW:
```ts
      audit_action:
        | "comment_remove"
        | "comment_unblind"
        | "user_suspend"
        | "user_unsuspend"
        | "badge_grant"
        | "badge_revoke"
        | "correction_accept"
        | "correction_reject"
        | "report_uphold"
        | "report_dismiss"
        | "role_change"
        | "question_update"
        | "password_reset_issued";
```

- [ ] **Step 3.2: RPC signature 추가**

Locate the `Functions:` block (near `list_admin_user_emails`). Add the new RPC after `list_admin_user_emails` and before the closing `};` of `Functions`.

OLD (last function in block):
```ts
      list_admin_user_emails: {
        Args: { p_user_ids: string[] };
        Returns: { user_id: string; email: string }[];
      };
    };
    Enums: {
```

NEW:
```ts
      list_admin_user_emails: {
        Args: { p_user_ids: string[] };
        Returns: { user_id: string; email: string }[];
      };
      log_password_reset_issued: {
        Args: {
          p_user_id: string;
          p_note?:   string | null;
        };
        Returns: void;
      };
    };
    Enums: {
```

- [ ] **Step 3.3: 타입체크**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 종료 코드 0.

- [ ] **Step 3.4: 커밋**

```bash
git add vet-exam-ai/lib/supabase/types.ts
git commit -m "PR-E: types — extend audit_action + log_password_reset_issued sig"
```

---

## Task 4: Server Action — issuePasswordResetLink

**Files:**
- Modify: `vet-exam-ai/app/admin/users/_actions.ts`

- [ ] **Step 4.1: import 추가 + 새 액션 추가**

Read the existing `vet-exam-ai/app/admin/users/_actions.ts`. Two edits needed.

Edit A — top of file, add admin client import after the createClient import:

OLD:
```ts
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import type { Database } from "../../../lib/supabase/types";
```

NEW:
```ts
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import type { Database } from "../../../lib/supabase/types";
```

Edit B — append the new action at the bottom of the file (after `revokeBadge`):

OLD (last lines of file):
```ts
  if (error) redirectWithError(userErrorMessage(error.message));

  revalidatePath("/admin/users");
}
```

(this matches the closing of `revokeBadge` — it's the last function. Verify before editing.)

NEW (replace with same content + append new action):
```ts
  if (error) redirectWithError(userErrorMessage(error.message));

  revalidatePath("/admin/users");
}

export async function issuePasswordResetLink(formData: FormData): Promise<void> {
  const userId = String(formData.get("user_id") ?? "");
  const note   = String(formData.get("note") ?? "").trim() || null;

  if (!userId) redirectWithError("필수 입력이 누락되었습니다.");

  // 1) guard + audit (RLS context — runs as the requesting admin)
  const supabase = await createClient();
  const { error: rpcErr } = await supabase.rpc("log_password_reset_issued", {
    p_user_id: userId,
    p_note:    note,
  });
  if (rpcErr) redirectWithError(userErrorMessage(rpcErr.message));

  // 2) email lookup via service role (auth.users not exposed via REST)
  const admin = createAdminClient();
  const { data: u, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !u?.user?.email) {
    redirectWithError("대상 회원의 이메일을 찾을 수 없습니다.");
  }

  // 3) generate one-time recovery link
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type:  "recovery",
    email: u!.user!.email!,
  });
  if (linkErr || !link?.properties?.action_link) {
    redirectWithError("링크 발급에 실패했습니다.");
  }

  // 4) display via redirect query — short-lived, admin should copy immediately.
  //    Not stored in DB. URL = credential.
  redirect(
    `/admin/users?reset_link=${encodeURIComponent(link!.properties.action_link)}` +
      `&reset_for=${encodeURIComponent(userId)}`,
  );
}
```

- [ ] **Step 4.2: 타입체크**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 종료 코드 0.

- [ ] **Step 4.3: 커밋**

```bash
git add vet-exam-ai/app/admin/users/_actions.ts
git commit -m "PR-E: server action — issuePasswordResetLink (RPC + service role)"
```

---

## Task 5: UI — Password Reset Form Component

**Files:**
- Create: `vet-exam-ai/app/admin/users/_components/user-password-reset-form.tsx`

- [ ] **Step 5.1: 폼 컴포넌트 작성**

Create `vet-exam-ai/app/admin/users/_components/user-password-reset-form.tsx` with this exact content:

```tsx
import { issuePasswordResetLink } from "../_actions";

export function UserPasswordResetForm({
  userId,
  isSelf,
}: {
  userId: string;
  isSelf: boolean;
}) {
  if (isSelf) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        본인 비밀번호는 이 화면에서 재설정할 수 없습니다.
      </p>
    );
  }

  return (
    <form action={issuePasswordResetLink} className="flex flex-col gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        1회용 재설정 링크를 발급합니다. 발급된 링크는 admin 화면에 1회만 표시되며,
        사용자에게 직접 전달해 주세요.
      </p>
      <textarea
        name="note"
        maxLength={200}
        rows={2}
        placeholder="발급 사유 (선택, 200자 이내) — 예: 본인 분실 신고"
        className="text-sm rounded p-2"
        style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
      />
      <button
        type="submit"
        className="self-start text-sm px-3 py-1.5 rounded"
        style={{
          background: "var(--teal)",
          color:      "white",
          border:     0,
          cursor:     "pointer",
        }}
      >
        재설정 링크 생성
      </button>
    </form>
  );
}
```

- [ ] **Step 5.2: 타입체크**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 종료 코드 0.

- [ ] **Step 5.3: 커밋**

```bash
git add vet-exam-ai/app/admin/users/_components/user-password-reset-form.tsx
git commit -m "PR-E: user-password-reset-form component"
```

---

## Task 6: UsersTable — Wire 5th Section

**Files:**
- Modify: `vet-exam-ai/app/admin/users/_components/users-table.tsx`

- [ ] **Step 6.1: import 추가**

Read the existing file. Add the new import after the existing form imports.

OLD:
```tsx
import { UserRoleForm } from "./user-role-form";
import { UserActiveForm } from "./user-active-form";
import { UserBadgeGrantForm } from "./user-badge-grant-form";
import { UserBadgeRevokeForm } from "./user-badge-revoke-form";
```

NEW:
```tsx
import { UserRoleForm } from "./user-role-form";
import { UserActiveForm } from "./user-active-form";
import { UserBadgeGrantForm } from "./user-badge-grant-form";
import { UserBadgeRevokeForm } from "./user-badge-revoke-form";
import { UserPasswordResetForm } from "./user-password-reset-form";
```

- [ ] **Step 6.2: 5번째 섹션 추가**

Locate the closing `</section>` of the "뱃지 회수" block followed by `</div>` of the grid. Insert the new section before the grid closes.

OLD:
```tsx
                <section>
                  <h3 className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    뱃지 회수
                  </h3>
                  <UserBadgeRevokeForm userId={r.id} badges={badges} />
                </section>
              </div>
```

NEW:
```tsx
                <section>
                  <h3 className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    뱃지 회수
                  </h3>
                  <UserBadgeRevokeForm userId={r.id} badges={badges} />
                </section>
                <section className="sm:col-span-2">
                  <h3 className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    비밀번호 재설정
                  </h3>
                  <UserPasswordResetForm userId={r.id} isSelf={isSelf} />
                </section>
              </div>
```

(`sm:col-span-2` makes the 5th section span both columns at sm+ breakpoints, looks tidier than orphan single-column row.)

- [ ] **Step 6.3: 타입체크**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 종료 코드 0.

- [ ] **Step 6.4: 커밋**

```bash
git add vet-exam-ai/app/admin/users/_components/users-table.tsx
git commit -m "PR-E: users-table — wire 5th password-reset section"
```

---

## Task 7: Page — reset_link Query Param + Result Box

**Files:**
- Modify: `vet-exam-ai/app/admin/users/page.tsx`

- [ ] **Step 7.1: query 파싱 + 결과 박스 추가**

Read the existing file. The `errorMsg` parsing is around the page render section. Add the parallel `resetLink` parse + render.

OLD (around the error parse + render):
```tsx
  const errorRaw = raw["error"];
  const errorMsg = Array.isArray(errorRaw) ? errorRaw[0] : errorRaw;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          회원 관리
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          역할 변경 / 뱃지 부여 / 계정 정지는 모두 감사 로그에 기록됩니다.
        </p>
      </header>

      {errorMsg && (
        <div
          className="mb-4 rounded p-3 text-sm"
          style={{ background: "var(--danger-soft, #fde8e8)", color: "var(--danger, #c0392b)", border: "1px solid var(--danger, #c0392b)" }}
          role="alert"
        >
          {errorMsg}
        </div>
      )}
```

NEW:
```tsx
  const errorRaw = raw["error"];
  const errorMsg = Array.isArray(errorRaw) ? errorRaw[0] : errorRaw;

  const linkRaw  = raw["reset_link"];
  const resetLink = Array.isArray(linkRaw) ? linkRaw[0] : linkRaw;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          회원 관리
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          역할 변경 / 뱃지 부여 / 계정 정지는 모두 감사 로그에 기록됩니다.
        </p>
      </header>

      {errorMsg && (
        <div
          className="mb-4 rounded p-3 text-sm"
          style={{ background: "var(--danger-soft, #fde8e8)", color: "var(--danger, #c0392b)", border: "1px solid var(--danger, #c0392b)" }}
          role="alert"
        >
          {errorMsg}
        </div>
      )}

      {resetLink && (
        <div
          className="mb-4 rounded p-3 text-sm"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--teal)", color: "var(--text)" }}
          role="status"
        >
          <p className="mb-2 font-medium" style={{ color: "var(--teal)" }}>
            재설정 링크가 발급되었습니다 (1회용, 약 1시간 유효)
          </p>
          <code
            className="block break-all p-2 rounded text-xs kvle-mono"
            style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
          >
            {resetLink}
          </code>
          <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            이 링크를 사용자에게 전달하세요. 페이지를 떠나면 다시 볼 수 없습니다.
            발급 사실은 감사 로그에 기록됩니다.
          </p>
        </div>
      )}
```

- [ ] **Step 7.2: 타입체크**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 종료 코드 0.

- [ ] **Step 7.3: 커밋**

```bash
git add vet-exam-ai/app/admin/users/page.tsx
git commit -m "PR-E: page — reset_link result box"
```

---

## Task 8: Audit Page — Whitelist + Korean Label

**Files:**
- Modify: `vet-exam-ai/app/admin/audit/_lib/parse-audit-search-params.ts`

- [ ] **Step 8.1: 화이트리스트 + 라벨 맵 확장**

Two edits in the same file.

Edit A — `ALL_AUDIT_ACTIONS` array:

OLD:
```ts
export const ALL_AUDIT_ACTIONS: ReadonlyArray<AuditAction> = [
  "comment_remove",
  "comment_unblind",
  "user_suspend",
  "user_unsuspend",
  "badge_grant",
  "badge_revoke",
  "correction_accept",
  "correction_reject",
  "report_uphold",
  "report_dismiss",
  "role_change",
  "question_update",
];
```

NEW:
```ts
export const ALL_AUDIT_ACTIONS: ReadonlyArray<AuditAction> = [
  "comment_remove",
  "comment_unblind",
  "user_suspend",
  "user_unsuspend",
  "badge_grant",
  "badge_revoke",
  "correction_accept",
  "correction_reject",
  "report_uphold",
  "report_dismiss",
  "role_change",
  "question_update",
  "password_reset_issued",
];
```

Edit B — `AUDIT_ACTION_LABEL` map:

OLD:
```ts
export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  comment_remove:    "댓글 삭제",
  comment_unblind:   "댓글 블라인드 해제",
  user_suspend:      "회원 정지",
  user_unsuspend:    "회원 정지 해제",
  badge_grant:       "뱃지 부여",
  badge_revoke:      "뱃지 회수",
  correction_accept: "정정 채택",
  correction_reject: "정정 반려",
  report_uphold:     "신고 승인",
  report_dismiss:    "신고 기각",
  role_change:       "역할 변경",
  question_update:   "문제 수정",
};
```

NEW:
```ts
export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  comment_remove:        "댓글 삭제",
  comment_unblind:       "댓글 블라인드 해제",
  user_suspend:          "회원 정지",
  user_unsuspend:        "회원 정지 해제",
  badge_grant:           "뱃지 부여",
  badge_revoke:          "뱃지 회수",
  correction_accept:     "정정 채택",
  correction_reject:     "정정 반려",
  report_uphold:         "신고 승인",
  report_dismiss:        "신고 기각",
  role_change:           "역할 변경",
  question_update:       "문제 수정",
  password_reset_issued: "비밀번호 재설정 링크 발급",
};
```

- [ ] **Step 8.2: 타입체크**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 종료 코드 0. (TS의 `Record<AuditAction, string>` 강제 + audit_action enum 확장 → 라벨 누락 시 컴파일 실패. 정상 빌드 = 양쪽 sync 확인.)

- [ ] **Step 8.3: 커밋**

```bash
git add vet-exam-ai/app/admin/audit/_lib/parse-audit-search-params.ts
git commit -m "PR-E: audit — whitelist + label for password_reset_issued"
```

---

## Task 9: Build + Manual Verification

**Files:** none (verification only)

- [ ] **Step 9.1: 전체 빌드**

Run: `cd vet-exam-ai && npx tsc --noEmit && npx next build 2>&1 | tail -40`
Expected: 빌드 성공. 새 admin 페이지에 대해 type 에러나 RSC serialization 경고 없어야 함.

- [ ] **Step 9.2: 로컬 dev 서버 검증 (사용자 작업)**

```bash
cd vet-exam-ai && npm run dev
```

브라우저에서:
1. `/admin/users` 진입 → 본인 행 expanded → "본인 비밀번호는 이 화면에서…" 안내 표시
2. **다른 사용자 행** expanded → "재설정 링크 생성" 버튼 표시 → 클릭 → 결과 박스에 URL 표시 확인
3. 표시된 URL을 시크릿 창에서 열기 → Supabase 비번 재설정 화면 진입 → 새 비번 설정 → 로그인 성공
4. `/admin/audit` → action 필터에 "비밀번호 재설정 링크 발급" 옵션 노출 → 방금 발급 row 표시 확인

문제 발견 시 해당 task로 돌아가 수정.

- [ ] **Step 9.3: 검증 통과 시 push & PR 생성**

```bash
git push -u origin feat/admin-password-reset
```

PR 생성은 사용자가 GitHub UI에서 직접 (메모리: Windows에 `gh` CLI 미설치). PR 제목 권장:
> `admin: PR-E — password reset link issuance`

PR 본문 권장:
```
## Summary
- /admin/users 행마다 "비밀번호 재설정" 섹션 추가
- admin이 1회용 recovery 링크 발급 → UI에 표시 → 직접 사용자에게 전달
- service role 키 사용 (서버 전용), audit 로그 + audit 페이지 라벨 동기화

## Setup before merge
- Vercel Production env vars에 `SUPABASE_SERVICE_ROLE_KEY` 추가 (Supabase Dashboard → Settings → API → service_role)
- Supabase SQL Editor에 마이그레이션 실행 (`20260504000001_admin_password_reset.sql`)

## Test plan
- [ ] 본인 행: 안내 문구 표시, 폼 비활성
- [ ] 다른 사용자 행: 링크 발급 → URL 박스 표시
- [ ] 발급 URL 시크릿 창에서 정상 작동, 새 비번 설정 후 로그인
- [ ] `/admin/audit`에 `password_reset_issued` 라벨 + 발급 row 표시
```

---

## Self-Review Checklist (Plan Author — done before handoff)

- [x] Spec coverage: 모든 spec 섹션 매핑 (1→Task 4-7, 4→Task 1, 5→Task 2, 6→Task 4, 7→Task 5-7, 8→Task 4 error mapping, 9→Task 9, 12→전체 분포)
- [x] Placeholder scan: 0건. 모든 step에 실제 코드 또는 명령 포함
- [x] Type consistency: `issuePasswordResetLink`, `UserPasswordResetForm`, `log_password_reset_issued`, `password_reset_issued` 4개 식별자 모든 task에서 일관 표기
- [x] 사용자 작업 명시: P-1 (Vercel env), 1.2 (SQL Editor), 9.2 (dev 검증), 9.3 (PR 생성)
- [x] Hotfix 함정 학습 적용: Task 5의 폼 컴포넌트는 `<form action={...}>` 만 사용 (`onClick` 인라인 함수 없음 → server component 안전)
