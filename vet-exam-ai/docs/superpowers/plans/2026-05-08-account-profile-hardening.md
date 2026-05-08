# Account/Profile Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/settings` (account info + password change), `/auth/reset` (forgot password completion), `/profile/me` (idempotent profile bootstrap RPC), and NavBar pill amber-CTA fallback for users with missing `user_profiles_public` rows.

**Architecture:** New `ensure_my_profile_public` RPC (SECURITY DEFINER, idempotent) acts as permanent safety net for `handle_new_user` trigger orphan cases. Self-service password change uses Server Action with `signInWithPassword` re-auth + `updateUser({password})`. Forgot-password flow uses Supabase `resetPasswordForEmail` → `/auth/callback?next=/auth/reset`. NavBar adds gear icon to `/settings` and replaces null-nickname email-fallback `<div>` with amber clickable Link to `/profile/me`.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Auth + RPC, Postgres SECURITY DEFINER functions, Server Actions.

**Spec:** `vet-exam-ai/docs/superpowers/specs/2026-05-08-account-profile-hardening-design.md`

---

## File Structure

**New:**
- `vet-exam-ai/supabase/migrations/20260508000000_ensure_my_profile_public.sql`
- `vet-exam-ai/lib/profile/passwordPolicy.ts`
- `vet-exam-ai/app/settings/page.tsx`
- `vet-exam-ai/app/settings/_components/AccountInfo.tsx`
- `vet-exam-ai/app/settings/_components/PasswordChangeForm.tsx`
- `vet-exam-ai/app/settings/_actions.ts`
- `vet-exam-ai/app/auth/reset/page.tsx`
- `vet-exam-ai/app/auth/reset/_components/ResetPasswordForm.tsx`
- `vet-exam-ai/app/profile/me/page.tsx`

**Modified:**
- `vet-exam-ai/app/auth/login/page.tsx` (mode `'forgot'` + reset link)
- `vet-exam-ai/components/NavBar.tsx` (gear + amber CTA fallback)
- `vet-exam-ai/lib/supabase/types.ts` (add RPC type entry)

---

## Task 1: Create `ensure_my_profile_public` RPC migration

**Files:**
- Create: `vet-exam-ai/supabase/migrations/20260508000000_ensure_my_profile_public.sql`

**Note on migration timestamp:** Repo has both `vet-exam-ai/supabase/migrations/` (active) and `supabase/migrations/` (legacy root). Always write **inside `vet-exam-ai/`** (memory: `feedback_subagent_repo_root_path_confusion.md`).

- [ ] **Step 1: Create migration file with RPC definition**

```sql
-- =============================================================================
-- ensure_my_profile_public: idempotent backfill RPC
--
-- Purpose: Safety net for handle_new_user trigger failures (see 2026-04-28
-- orphan incident). Any signed-in user can call this to guarantee their
-- profiles, user_profiles_public, and newbie badge rows exist. Used by
-- /profile/me server route + future error-recovery flows.
--
-- SECURITY DEFINER required: caller's auth.uid() is read but inserts run
-- as the function owner (postgres) so RLS does not block the writes.
-- search_path locked to public to prevent malicious schema substitution
-- (memory: feedback_security_definer_trigger.md).
-- =============================================================================

create or replace function public.ensure_my_profile_public()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_nickname text;
begin
  if v_user_id is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  -- 1) profiles
  insert into public.profiles (id)
  values (v_user_id)
  on conflict (id) do nothing;

  -- 2) user_profiles_public — temporary nickname (matches handle_new_user format)
  v_nickname := 'user_' || substring(v_user_id::text from 1 for 8);
  insert into public.user_profiles_public (user_id, nickname)
  values (v_user_id, v_nickname)
  on conflict (user_id) do nothing;

  -- 3) newbie badge
  insert into public.badges (user_id, badge_type, reason)
  values (v_user_id, 'newbie', 'auto-granted (ensure_my_profile_public)')
  on conflict (user_id, badge_type) do nothing;

  -- 4) Return the actual nickname (may be user_xxx OR a previously-set custom one)
  select nickname into v_nickname
    from public.user_profiles_public
    where user_id = v_user_id;

  return v_nickname;
end;
$$;

grant execute on function public.ensure_my_profile_public() to authenticated;
```

- [ ] **Step 2: Apply migration via Supabase SQL Editor (operator step)**

The repo runs migrations through the SQL Editor (memory: `community_tables_done.md` — "CLI db push 'up to date' 함정"). Operator must:
1. Open Supabase Dashboard → SQL Editor
2. Paste the above SQL
3. Run
4. Confirm: `select public.ensure_my_profile_public();` returns a `user_xxxxxxxx` text (after signing in as a test account through dashboard) — or skip until manual integration test in Task 12

- [ ] **Step 3: Add RPC entry to typed schema**

Modify `vet-exam-ai/lib/supabase/types.ts` — add to the `Functions:` block (around line 554, alphabetical or after `count_questions_distinct`):

```ts
      ensure_my_profile_public: {
        Args: Record<string, never>;
        Returns: string;
      };
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add vet-exam-ai/supabase/migrations/20260508000000_ensure_my_profile_public.sql vet-exam-ai/lib/supabase/types.ts
git commit -m "account-hardening: ensure_my_profile_public RPC + typed schema entry"
```

---

## Task 2: Password validation policy module

**Files:**
- Create: `vet-exam-ai/lib/profile/passwordPolicy.ts`

- [ ] **Step 1: Write the module**

```ts
// Pure validation — no I/O, no side effects.
// Used client-side (form pre-check) and server-side (defense in depth).

export type PasswordValidationError =
  | "empty"
  | "too_short"
  | "mismatch_confirm"
  | "same_as_current";

export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; error: PasswordValidationError };

const MIN_LENGTH = 6;

export function validateNewPassword(
  current: string,
  next: string,
  confirm: string,
): PasswordValidationResult {
  if (!next || !confirm) return { ok: false, error: "empty" };
  if (next.length < MIN_LENGTH) return { ok: false, error: "too_short" };
  if (next !== confirm) return { ok: false, error: "mismatch_confirm" };
  if (current && next === current) return { ok: false, error: "same_as_current" };
  return { ok: true };
}

export function passwordErrorMessage(error: PasswordValidationError): string {
  switch (error) {
    case "empty":
      return "비밀번호를 입력해주세요";
    case "too_short":
      return "비밀번호는 6자 이상이어야 합니다";
    case "mismatch_confirm":
      return "비밀번호가 일치하지 않습니다";
    case "same_as_current":
      return "기존 비밀번호와 다른 비밀번호를 입력하세요";
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/profile/passwordPolicy.ts
git commit -m "account-hardening: password validation policy (6+ chars, ≠ current)"
```

---

## Task 3: `changePassword` Server Action

**Files:**
- Create: `vet-exam-ai/app/settings/_actions.ts`

- [ ] **Step 1: Write the Server Action**

```ts
"use server";

import { createClient } from "../../lib/supabase/server";
import { validateNewPassword } from "../../lib/profile/passwordPolicy";

export type ChangePasswordResult =
  | { ok: true }
  | {
      ok: false;
      error: "auth_required" | "wrong_current_password" | "invalid_input" | "update_failed";
      message?: string;
    };

export async function changePassword(
  current: string,
  next: string,
  confirm: string,
): Promise<ChangePasswordResult> {
  // 1) Defense-in-depth: validate inputs server-side too
  const policy = validateNewPassword(current, next, confirm);
  if (!policy.ok) {
    return { ok: false, error: "invalid_input", message: policy.error };
  }

  const supabase = await createClient();

  // 2) Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { ok: false, error: "auth_required" };
  }

  // 3) Re-authenticate with current password (defends against session-hijack
  //    permanent takeover via password change)
  const { error: reauthErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (reauthErr) {
    return { ok: false, error: "wrong_current_password" };
  }

  // 4) Update to new password
  const { error: updateErr } = await supabase.auth.updateUser({ password: next });
  if (updateErr) {
    return { ok: false, error: "update_failed", message: updateErr.message };
  }

  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/settings/_actions.ts
git commit -m "account-hardening: changePassword Server Action with re-auth"
```

---

## Task 4: `PasswordChangeForm` client component

**Files:**
- Create: `vet-exam-ai/app/settings/_components/PasswordChangeForm.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { validateNewPassword, passwordErrorMessage } from "../../../lib/profile/passwordPolicy";
import { changePassword } from "../_actions";

export default function PasswordChangeForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const policy = validateNewPassword(current, next, confirm);
    if (!policy.ok) {
      setError(passwordErrorMessage(policy.error));
      return;
    }

    setSubmitting(true);
    const result = await changePassword(current, next, confirm);
    setSubmitting(false);

    if (!result.ok) {
      const msg =
        result.error === "wrong_current_password"
          ? "현재 비밀번호가 일치하지 않습니다"
          : result.error === "auth_required"
          ? "로그인이 필요합니다"
          : result.error === "invalid_input"
          ? "입력값을 확인해주세요"
          : result.message ?? "변경에 실패했습니다. 잠시 후 다시 시도해주세요";
      setError(msg);
      return;
    }

    setCurrent("");
    setNext("");
    setConfirm("");
    setSuccess(true);
  }

  const inputType = showPw ? "text" : "password";

  return (
    <section
      style={{
        padding: 20,
        borderRadius: 12,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        marginTop: 20,
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 20,
          fontWeight: 700,
          marginTop: 0,
          marginBottom: 4,
          color: "var(--text)",
        }}
      >
        비밀번호 변경
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        보안을 위해 현재 비밀번호를 다시 입력해주세요.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label className="kvle-label mb-2">현재 비밀번호</label>
          <input
            type={inputType}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
            className="kvle-input"
          />
        </div>

        <div>
          <label className="kvle-label mb-2">새 비밀번호 (6자 이상)</label>
          <input
            type={inputType}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="kvle-input"
          />
        </div>

        <div>
          <label className="kvle-label mb-2">새 비밀번호 확인</label>
          <input
            type={inputType}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="kvle-input"
          />
        </div>

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
          {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
          비밀번호 표시
        </label>

        {error && (
          <div
            role="alert"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: "var(--wrong-dim)",
              color: "var(--wrong)",
              border: "1px solid rgba(192,74,58,0.3)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: "var(--correct-dim)",
              color: "var(--correct)",
              border: "1px solid rgba(45,159,107,0.3)",
              fontSize: 13,
            }}
          >
            비밀번호가 변경되었습니다.
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="kvle-btn-primary"
          style={{ alignSelf: "flex-start", paddingInline: 24 }}
        >
          {submitting ? "변경 중…" : "비밀번호 변경"}
        </button>
      </form>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/settings/_components/PasswordChangeForm.tsx
git commit -m "account-hardening: PasswordChangeForm client component"
```

---

## Task 5: `AccountInfo` server component

**Files:**
- Create: `vet-exam-ai/app/settings/_components/AccountInfo.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { createClient } from "../../../lib/supabase/server";

export default async function AccountInfo() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const joinedAt = user.created_at
    ? new Date(user.created_at).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <section
      style={{
        padding: 20,
        borderRadius: 12,
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 20,
          fontWeight: 700,
          marginTop: 0,
          marginBottom: 16,
          color: "var(--text)",
        }}
      >
        계정 정보
      </h2>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "max-content 1fr",
          rowGap: 12,
          columnGap: 24,
          margin: 0,
          fontSize: 14,
        }}
      >
        <dt style={{ color: "var(--text-muted)" }}>이메일</dt>
        <dd style={{ margin: 0, color: "var(--text)" }}>{user.email ?? "—"}</dd>
        <dt style={{ color: "var(--text-muted)" }}>가입일</dt>
        <dd style={{ margin: 0, color: "var(--text)" }}>{joinedAt}</dd>
      </dl>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/settings/_components/AccountInfo.tsx
git commit -m "account-hardening: AccountInfo server component (email + joined date)"
```

---

## Task 6: `/settings` page shell

**Files:**
- Create: `vet-exam-ai/app/settings/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import AccountInfo from "./_components/AccountInfo";
import PasswordChangeForm from "./_components/PasswordChangeForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "설정 — KVLE" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login?next=/settings");
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "32px 20px 80px",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 32,
          fontWeight: 800,
          margin: 0,
          marginBottom: 24,
          color: "var(--text)",
        }}
      >
        설정
      </h1>
      <AccountInfo />
      <PasswordChangeForm />
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/settings/page.tsx
git commit -m "account-hardening: /settings page shell composes AccountInfo + PasswordChangeForm"
```

---

## Task 7: `ResetPasswordForm` client component

**Files:**
- Create: `vet-exam-ai/app/auth/reset/_components/ResetPasswordForm.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "../../../../lib/supabase/client";
import { validateNewPassword, passwordErrorMessage } from "../../../../lib/profile/passwordPolicy";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<"loading" | "valid" | "invalid">("loading");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setSessionState(user ? "valid" : "invalid");
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // current is empty for reset flow — same_as_current check skips when current is falsy
    const policy = validateNewPassword("", next, confirm);
    if (!policy.ok) {
      setError(passwordErrorMessage(policy.error));
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error: e1 } = await supabase.auth.updateUser({ password: next });
    setSubmitting(false);

    if (e1) {
      setError(e1.message ?? "변경에 실패했습니다");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (sessionState === "loading") {
    return <p style={{ color: "var(--text-muted)" }}>확인 중…</p>;
  }

  if (sessionState === "invalid") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ color: "var(--wrong)", fontSize: 14, margin: 0 }}>
          유효하지 않거나 만료된 링크입니다.
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
          비밀번호 찾기를 다시 요청해주세요.
        </p>
        <Link
          href="/auth/login"
          className="kvle-btn-primary"
          style={{ alignSelf: "flex-start", textDecoration: "none", paddingInline: 24 }}
        >
          로그인 페이지로
        </Link>
      </div>
    );
  }

  const inputType = showPw ? "text" : "password";

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label className="kvle-label mb-2">새 비밀번호 (6자 이상)</label>
        <input
          type={inputType}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          className="kvle-input"
        />
      </div>

      <div>
        <label className="kvle-label mb-2">새 비밀번호 확인</label>
        <input
          type={inputType}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          className="kvle-input"
        />
      </div>

      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
        {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
        비밀번호 표시
      </label>

      {error && (
        <div
          role="alert"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            background: "var(--wrong-dim)",
            color: "var(--wrong)",
            border: "1px solid rgba(192,74,58,0.3)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="kvle-btn-primary"
        style={{ paddingInline: 24 }}
      >
        {submitting ? "저장 중…" : "비밀번호 변경"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/auth/reset/_components/ResetPasswordForm.tsx
git commit -m "account-hardening: ResetPasswordForm (recovery session new-password setter)"
```

---

## Task 8: `/auth/reset` page

**Files:**
- Create: `vet-exam-ai/app/auth/reset/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Zap } from "lucide-react";
import ResetPasswordForm from "./_components/ResetPasswordForm";

export const metadata = { title: "비밀번호 재설정 — KVLE" };

export default function ResetPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400, marginBottom: "1.5rem" }}>
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium"
          style={{ color: "var(--text-muted)", textDecoration: "none" }}
        >
          <ArrowLeft size={14} />
          로그인으로
        </Link>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 400,
          padding: 6,
          borderRadius: 22,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div
          style={{
            borderRadius: 16,
            padding: "2rem",
            background: "var(--surface)",
            borderTop: "3px solid var(--teal)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.75rem" }}>
            <div
              style={{
                display: "inline-flex",
                padding: 4,
                borderRadius: 10,
                background: "var(--teal-dim)",
                border: "1px solid var(--teal-border)",
              }}
            >
              <Zap size={14} style={{ color: "var(--teal)" }} />
            </div>
            <span
              className="font-bold text-lg tracking-tight"
              style={{ fontFamily: "var(--font-serif)", color: "var(--teal)" }}
            >
              KVLE
            </span>
          </div>

          <h1
            className="text-2xl font-bold tracking-tight mb-1"
            style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
          >
            새 비밀번호 설정
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            새로 사용할 비밀번호를 입력해주세요.
          </p>

          <Suspense fallback={<p style={{ color: "var(--text-muted)" }}>확인 중…</p>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/auth/reset/page.tsx
git commit -m "account-hardening: /auth/reset page wraps ResetPasswordForm"
```

---

## Task 9: `/profile/me` server-redirect route

**Files:**
- Create: `vet-exam-ai/app/profile/me/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfileMePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login?next=/profile/me");
  }

  // Idempotent backfill — safety net for handle_new_user trigger orphans.
  // RPC returns the guaranteed nickname (existing or newly-created user_xxx).
  const { data: nickname, error } = await supabase.rpc("ensure_my_profile_public");
  if (error || !nickname) {
    throw new Error(
      `Failed to bootstrap profile: ${error?.message ?? "RPC returned no nickname"}`,
    );
  }

  redirect(`/profile/${encodeURIComponent(nickname)}`);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (depends on Task 1 Step 3 — types.ts entry)

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/profile/me/page.tsx
git commit -m "account-hardening: /profile/me — RPC backfill + redirect to /profile/[nickname]"
```

---

## Task 10: Login page — `forgot` mode + reset link

**Files:**
- Modify: `vet-exam-ai/app/auth/login/page.tsx`

- [ ] **Step 1: Update the mode union and state**

Find this line near top of `LoginForm`:

```tsx
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
```

Replace with:

```tsx
  const initialModeParam = searchParams.get("mode");
  const initialMode: "signin" | "signup" | "forgot" =
    initialModeParam === "signup"
      ? "signup"
      : initialModeParam === "forgot"
      ? "forgot"
      : "signin";
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(initialMode);
```

- [ ] **Step 2: Update `handleSubmit` to handle `forgot` branch**

Find the `else` branch under `if (mode === "signin")`. Replace the current `if/else` with:

```tsx
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage({ text: error.message, type: "error" });
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } else if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage({ text: error.message, type: "error" });
      } else if (data.session) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setMessage({
          text: "계정이 생성되었습니다. 이메일로 전송된 인증 링크를 확인해 주세요.",
          type: "success",
        });
      }
    } else {
      // forgot
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
      });
      if (error) {
        setMessage({ text: error.message, type: "error" });
      } else {
        setMessage({
          text: "메일을 보냈습니다. 받은편지함을 확인해 주세요. (도착하지 않으면 스팸함도 확인)",
          type: "success",
        });
      }
    }
```

- [ ] **Step 3: Update `toggleMode` (full 3-state cycle is overkill — replace with explicit handlers)**

Find:

```tsx
  function toggleMode() {
    setMode((prev) => (prev === "signin" ? "signup" : "signin"));
    setMessage(null);
  }
```

Replace with:

```tsx
  function setModeAndClear(newMode: "signin" | "signup" | "forgot") {
    setMode(newMode);
    setMessage(null);
  }
```

- [ ] **Step 4: Update card title/subtitle to handle 3 modes**

Find:

```tsx
            <h1 ...>
              {mode === "signin" ? "로그인" : "회원가입"}
            </h1>
            <p ...>
              {mode === "signin"
                ? "학습 기록과 복습 큐에 접근하려면 로그인하세요."
                : "무료로 시작하세요. 카드 정보가 필요 없습니다."}
            </p>
```

Replace with:

```tsx
            <h1
              className="text-2xl font-bold tracking-tight mb-1"
              style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
            >
              {mode === "signin" ? "로그인" : mode === "signup" ? "회원가입" : "비밀번호 찾기"}
            </h1>
            <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
              {mode === "signin"
                ? "학습 기록과 복습 큐에 접근하려면 로그인하세요."
                : mode === "signup"
                ? "무료로 시작하세요. 카드 정보가 필요 없습니다."
                : "가입한 이메일로 재설정 링크를 보내드립니다."}
            </p>
```

- [ ] **Step 5: Conditionally render password field (hidden in `forgot` mode)**

Find the entire `<div>` block that renders the password label + input + show/hide button (starts with `<label className="kvle-label">비밀번호</label>` parent div). Wrap it in `{mode !== "forgot" && (...)}`:

```tsx
              {mode !== "forgot" && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <label className="kvle-label">비밀번호</label>
                    <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                      6자 이상
                    </span>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      className="kvle-input"
                      style={{ paddingRight: "2.75rem" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      style={{
                        position: "absolute",
                        right: "0.75rem",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--text-faint)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px",
                        lineHeight: 0,
                      }}
                      aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}
```

Note: also remove the now-invalid `required` semantics in forgot mode — the password field being absent means the form is naturally email-only.

- [ ] **Step 6: Update submit button label**

Find:

```tsx
                {loading ? "처리 중…" : mode === "signin" ? "로그인" : "회원가입"}
```

Replace with:

```tsx
                {loading
                  ? "처리 중…"
                  : mode === "signin"
                  ? "로그인"
                  : mode === "signup"
                  ? "회원가입"
                  : "재설정 메일 보내기"}
```

- [ ] **Step 7: Replace bottom toggle button with 3-mode link block**

Find the `<button onClick={toggleMode} ...>...</button>` block at the bottom. Replace with:

```tsx
            <div
              style={{
                marginTop: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                alignItems: "center",
                fontSize: 13,
              }}
            >
              {mode === "signin" && (
                <>
                  <button
                    type="button"
                    onClick={() => setModeAndClear("signup")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    계정이 없으신가요? <span style={{ color: "var(--text)" }}>회원가입</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModeAndClear("forgot")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    비밀번호를 잊으셨나요?
                  </button>
                </>
              )}
              {mode === "signup" && (
                <button
                  type="button"
                  onClick={() => setModeAndClear("signin")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  이미 계정이 있으신가요? <span style={{ color: "var(--text)" }}>로그인</span>
                </button>
              )}
              {mode === "forgot" && (
                <button
                  type="button"
                  onClick={() => setModeAndClear("signin")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <span style={{ color: "var(--text)" }}>로그인</span>으로 돌아가기
                </button>
              )}
            </div>
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 9: Lint**

Run: `npm run lint`
Expected: no new errors in `app/auth/login/page.tsx`

- [ ] **Step 10: Commit**

```bash
git add vet-exam-ai/app/auth/login/page.tsx
git commit -m "account-hardening: login page mode='forgot' — reset email send + entry links"
```

---

## Task 11: NavBar — gear icon + amber CTA fallback

**Files:**
- Modify: `vet-exam-ai/components/NavBar.tsx`

- [ ] **Step 1: Add `Settings` to lucide-react import**

Find:

```tsx
import { LogOut, BookOpen, BarChart3, RotateCcw, PenTool, User, CirclePlay, ListChecks, Shield, Search } from "lucide-react";
```

Replace with:

```tsx
import { LogOut, BookOpen, BarChart3, RotateCcw, PenTool, User, CirclePlay, ListChecks, Shield, Search, Settings } from "lucide-react";
```

- [ ] **Step 2: Replace null-nickname email-fallback with amber CTA Link**

Find the block (around line 142-154):

```tsx
                ) : (
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
                    style={{
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                    }}
                  >
                    <User size={13} />
                    <span className="truncate max-w-[120px]">{user.email}</span>
                  </div>
                )}
```

Replace with:

```tsx
                ) : (
                  <Link
                    href="/profile/me"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs no-underline"
                    style={{
                      background: "var(--amber-dim)",
                      border: "1px solid var(--amber)",
                      color: "var(--amber)",
                      textDecoration: "none",
                    }}
                    title="프로필을 설정해주세요"
                  >
                    <User size={13} />
                    <span>프로필 설정</span>
                  </Link>
                )}
```

- [ ] **Step 3: Add gear-icon `/settings` link after the profile pill**

Find the closing `</Link>` or `</div>` of the profile pill (right after the block from Step 2). Right before the `<button onClick={handleSignOut}` block, insert the gear link:

```tsx
                <Link
                  href="/settings"
                  className="flex items-center justify-center"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                    textDecoration: "none",
                  }}
                  title="계정 설정"
                  aria-label="계정 설정"
                >
                  <Settings size={14} />
                </Link>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors in `components/NavBar.tsx`

- [ ] **Step 6: Commit**

```bash
git add vet-exam-ai/components/NavBar.tsx
git commit -m "account-hardening: NavBar gear → /settings + amber 'profile setup' fallback CTA"
```

---

## Task 12: Build + manual integration smoke

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere

- [ ] **Step 2: Full lint**

Run: `npm run lint`
Expected: no new errors

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds (memory: `feedback_module_load_env_throw.md` — Vercel page-data collection only fires on build, so a clean local build matters)

- [ ] **Step 4: Dev server + manual smoke (operator step)**

Run: `npm run dev`

Test matrix (all routes — open in browser):

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | NavBar gear | Click gear icon next to nickname pill | Navigates to `/settings` |
| 2 | `/settings` shell | Visit `/settings` while logged in | Sees email + 가입일 + 비번 변경 폼 |
| 3 | `/settings` redirect | Logout, visit `/settings` | Redirects to `/auth/login?next=/settings` |
| 4 | Password change happy | /settings → enter current/new/confirm → submit | Success message, form clears |
| 5 | Password change wrong current | Submit with wrong current pw | Inline error "현재 비밀번호가 일치하지 않습니다" |
| 6 | Password change too short | Type 5-char new pw | Inline error "6자 이상" |
| 7 | Password change mismatch | Confirm ≠ new | Inline error "일치하지 않습니다" |
| 8 | Password change same | New = current | Inline error "기존 비밀번호와 다른" |
| 9 | Re-login after change | Logout → login with new pw | Success |
| 10 | Forgot link | /auth/login → "비밀번호를 잊으셨나요?" → ensure pw field hidden | Form switches to email-only |
| 11 | Forgot send | Enter email → submit | Success message |
| 12 | Forgot email | Open Supabase Dashboard → Authentication → Email Logs (or check own inbox) | Reset email present |
| 13 | Reset link | Click email link → lands on `/auth/reset` | Form rendered |
| 14 | Reset session invalid | Manually visit `/auth/reset` (no recovery session) | "유효하지 않거나 만료된 링크" |
| 15 | Reset happy | Set new pw on `/auth/reset` | Redirect to /dashboard, can login with new pw |
| 16 | `/profile/me` happy | Logged-in user click NavBar pill (when nickname exists) | Goes to `/profile/{nickname}` directly (because Link is to `/profile/{nickname}` — not `/profile/me`) |
| 17 | `/profile/me` orphan | SQL Editor: `delete from user_profiles_public where user_id = '<my-uuid>';` then refresh page | NavBar shows amber "프로필 설정" pill |
| 18 | `/profile/me` self-bootstrap | Click amber pill | RPC backfills row → redirects to `/profile/user_xxxxxxxx` |
| 19 | Mobile NavBar | Resize ≤ 480px / iPhone simulator | Gear + amber pill remain visible and tappable (≥44px touch target) |

For #17 — restore is safe via the same RPC: clicking the amber pill repopulates the row.

- [ ] **Step 5: Pre-deploy operator checklist (DO NOT mark complete until all confirmed in production)**

- [ ] Supabase Dashboard → Authentication → URL Configuration → **Redirect URLs** contains `${SITE_URL}/auth/callback`
- [ ] Supabase Dashboard → Authentication → Email Templates → **Reset Password** is enabled (default template OK)
- [ ] Migration `20260508000000_ensure_my_profile_public.sql` executed in production SQL Editor
- [ ] On production, perform smoke test #4, #11→#15 with own account

- [ ] **Step 6: Push branch + open PR**

```bash
git push -u origin <branch-name>
# Use the URL printed by git push to open PR (gh CLI not always installed on Windows;
# memory: pre_done.md notes manual PR-URL handoff for Windows host).
```

PR title:
```
feat: account/profile hardening — /settings, /auth/reset, /profile/me, NavBar fallback
```

PR body (paste):
```
## Summary
- /settings (계정정보 + 비번 변경) with NavBar gear entry
- /auth/reset (forgot password completion via Supabase resetPasswordForEmail)
- /profile/me + ensure_my_profile_public RPC (idempotent backfill — handle_new_user trigger orphan safety net)
- NavBar pill null-nickname fallback: email div → amber clickable "프로필 설정" Link

## Spec
docs/superpowers/specs/2026-05-08-account-profile-hardening-design.md

## Pre-deploy operator checklist
- [ ] Supabase Redirect URLs include ${SITE_URL}/auth/callback
- [ ] Reset Password email template enabled
- [ ] Migration applied via SQL Editor

## Test plan
- [ ] Manual smoke 1-19 (see plan Task 12)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## Self-review notes

**Spec coverage:**
- ✅ /settings shell + AccountInfo + PasswordChangeForm → Tasks 4, 5, 6
- ✅ Server Action changePassword with re-auth → Task 3
- ✅ Password policy (6+, ≠ current, mismatch) → Task 2
- ✅ /auth/login mode='forgot' + reset link → Task 10
- ✅ /auth/reset page + form → Tasks 7, 8
- ✅ /auth/callback handling — already exists, verified spec via Task 12 #13
- ✅ /profile/me + RPC → Tasks 1, 9
- ✅ NavBar gear + amber CTA → Task 11
- ✅ Pre-deploy operator checklist → Task 12 Step 5
- ✅ types.ts RPC entry → Task 1 Step 3
- ✅ Migration path under `vet-exam-ai/supabase/migrations/` → Task 1 path note

**Type/identifier consistency:**
- `validateNewPassword(current, next, confirm)` — same signature in Tasks 2, 3, 4, 7
- `passwordErrorMessage(error)` — Tasks 2, 4, 7
- `changePassword(current, next, confirm)` — Tasks 3, 4 (3-arg even though server already validates — keeps client-server symmetric)
- `ensure_my_profile_public()` no-arg, returns text — Tasks 1, 9, types.ts

**No placeholders:** Every step has either complete code or a concrete shell command with expected output.
