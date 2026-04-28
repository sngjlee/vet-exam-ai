# M3 §18 admin mutations + audit (PR-B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first mutation layer to `/admin`: questions content/meta/active edit, audit log RPC infrastructure, and a read-only audit viewer.

**Architecture:** PR-A’s server-first patterns continue. New `log_admin_action` RPC + admin-only `questions UPDATE` policy land in one migration. Edit form is a Server Action with JS 0 (`<form action={updateQuestion}>`). Audit viewer reuses PR-A list/pager patterns and resolves admin nicknames + question KVLE in two follow-up queries (no embedded join). All audit payloads are diffs only.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Supabase (Postgres + RLS + RPC), TypeScript strict.

---

## File map

**Migration / types (foundation)**
- `vet-exam-ai/supabase/migrations/20260501000000_admin_pr_b.sql` — enum extension, UPDATE RLS, `log_admin_action` RPC
- `vet-exam-ai/lib/supabase/types.ts` — add `'question_update'` to `audit_action`, add `log_admin_action` to `Functions`

**Audit helper**
- `vet-exam-ai/lib/admin/audit.ts` — `logAdminAction` wrapper + `diffJson` utility (server-only)

**Edit flow**
- `vet-exam-ai/app/admin/questions/[id]/edit/page.tsx` — server form
- `vet-exam-ai/app/admin/questions/[id]/edit/_actions.ts` — `updateQuestion` server action
- `vet-exam-ai/app/admin/questions/[id]/page.tsx` (modify) — header "수정" link

**Audit viewer**
- `vet-exam-ai/app/admin/audit/page.tsx` — composition + two-query nickname/KVLE lookup
- `vet-exam-ai/app/admin/audit/_components/audit-filters.tsx` — client URL-synced filters
- `vet-exam-ai/app/admin/audit/_components/audit-table.tsx` — server row renderer
- `vet-exam-ai/app/admin/audit/_components/audit-pager.tsx` — server pager (PR-A pager sibling)
- `vet-exam-ai/app/admin/audit/_lib/parse-audit-search-params.ts` — search-params parser + URL builder

**Hub activation**
- `vet-exam-ai/app/admin/_components/admin-nav-items.ts` (modify) — un-disable "감사"
- `vet-exam-ai/app/admin/page.tsx` (modify) — un-disable "감사 로그" hub card

**Total**: 신규 8 / 수정 4 / 마이그 1.

---

## Task 0: Worktree baseline

**Files:** None (verification only)

- [ ] **Step 1: Confirm clean working tree on main**

Run:
```bash
git status
git log --oneline -3
```
Expected: clean working tree, latest commit is `2421417 spec: M3 §18 admin mutations + audit (PR-B)`.

- [ ] **Step 2: Create feature branch**

Run:
```bash
git checkout -b feat/admin-mutations-audit-prb
```
Expected: switched to new branch.

- [ ] **Step 3: Verify Next.js project root**

Run:
```bash
ls vet-exam-ai/app/admin
ls vet-exam-ai/supabase/migrations | tail -3
```
Expected: admin dir lists `_components layout.tsx page.tsx questions`. Latest migration is `20260429000000_admin_count_distinct.sql`.

---

## Task 1: Migration — enum + UPDATE policy + log_admin_action RPC

**Files:**
- Create: `vet-exam-ai/supabase/migrations/20260501000000_admin_pr_b.sql`

- [ ] **Step 1: Write migration file**

Create `vet-exam-ai/supabase/migrations/20260501000000_admin_pr_b.sql`:

```sql
-- =============================================================================
-- M3 §18 admin PR-B: questions edit + audit RPC
-- =============================================================================
-- 0. extend audit_action enum
-- 1. questions admin-only UPDATE policy
-- 2. log_admin_action RPC (security definer + admin gate)
-- =============================================================================

-- 0. enum extension (auto-commit before subsequent DDL in PG 12+)
alter type public.audit_action add value if not exists 'question_update';

-- 1. questions admin-only UPDATE policy
create policy "questions: admin update"
  on public.questions for update
  using (public.is_admin())
  with check (public.is_admin());

-- 2. log_admin_action RPC
create or replace function public.log_admin_action(
  p_action      public.audit_action,
  p_target_type text,
  p_target_id   text,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_note        text  default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_id       uuid;
begin
  v_admin_id := auth.uid();

  if v_admin_id is null
     or not exists (
       select 1 from public.profiles
       where id = v_admin_id and role = 'admin' and is_active
     ) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, before_state, after_state, note)
  values
    (v_admin_id, p_action, p_target_type, p_target_id, p_before, p_after, p_note)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.log_admin_action(
  public.audit_action, text, text, jsonb, jsonb, text
) from public, anon;
grant execute on function public.log_admin_action(
  public.audit_action, text, text, jsonb, jsonb, text
) to authenticated;
```

- [ ] **Step 2: Commit**

Run:
```bash
git add vet-exam-ai/supabase/migrations/20260501000000_admin_pr_b.sql
git commit -m "$(cat <<'EOF'
admin: PR-B migration (questions UPDATE policy + log_admin_action RPC)

- alter type audit_action add value 'question_update'
- questions: admin-only UPDATE policy
- log_admin_action(action, target_type, target_id, before, after, note)
  security definer + admin gate, authenticated-only execute

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: 1 file changed, ~50 insertions.

⚠️ **Do NOT apply this migration via Supabase Studio yet — that happens in Task 14**, after the rest of the PR is staged. The CLI `db push "up to date"` trap is irrelevant here because we'll run this in SQL Editor directly at the end.

---

## Task 2: types.ts — extend audit_action + add log_admin_action

**Files:**
- Modify: `vet-exam-ai/lib/supabase/types.ts`

- [ ] **Step 1: Add `'question_update'` to `audit_action` enum union**

Find the `audit_action:` block (around line 543) and add `"question_update"` to the union. Replace:

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
        | "role_change";
```

with:

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

- [ ] **Step 2: Add `log_admin_action` to `Functions` block**

Find the `get_questions_filter_options:` Function entry (around line 493). Add the new function entry **after** it, before the closing `};` of `Functions`:

```ts
      log_admin_action: {
        Args: {
          p_action:      Database["public"]["Enums"]["audit_action"];
          p_target_type: string;
          p_target_id:   string;
          p_before?:     Record<string, unknown> | null;
          p_after?:      Record<string, unknown> | null;
          p_note?:       string | null;
        };
        Returns: string;
      };
```

- [ ] **Step 3: Run typecheck**

Run:
```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean (no errors). Memory note: `npm run typecheck` script does NOT exist — use `npx tsc --noEmit` directly.

- [ ] **Step 4: Commit**

Run:
```bash
git add vet-exam-ai/lib/supabase/types.ts
git commit -m "$(cat <<'EOF'
admin: types for question_update enum + log_admin_action RPC

- audit_action gains "question_update"
- Functions gets log_admin_action signature

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: lib/admin/audit.ts — logAdminAction + diffJson

**Files:**
- Create: `vet-exam-ai/lib/admin/audit.ts`

- [ ] **Step 1: Write the helper module**

Create `vet-exam-ai/lib/admin/audit.ts`:

```ts
import { createClient } from "../supabase/server";
import type { Database } from "../supabase/types";

type AuditAction = Database["public"]["Enums"]["audit_action"];

export async function logAdminAction(args: {
  action: AuditAction;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  note?: string | null;
}): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_admin_action", {
    p_action:      args.action,
    p_target_type: args.targetType,
    p_target_id:   args.targetId,
    p_before:      args.before ?? null,
    p_after:       args.after ?? null,
    p_note:        args.note ?? null,
  });
  if (error) {
    console.error("[audit] log_admin_action failed", error);
    return null;
  }
  return (data as string) ?? null;
}

export function diffJson<T extends Record<string, unknown>>(
  before: T,
  after: T,
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  const keys = new Set<keyof T>([
    ...(Object.keys(before) as (keyof T)[]),
    ...(Object.keys(after) as (keyof T)[]),
  ]);
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k];
      a[k] = after[k];
    }
  }
  return { before: b, after: a };
}
```

- [ ] **Step 2: Run typecheck**

Run:
```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

Run:
```bash
git add vet-exam-ai/lib/admin/audit.ts
git commit -m "$(cat <<'EOF'
admin: lib/admin/audit.ts (logAdminAction wrapper + diffJson)

- logAdminAction calls log_admin_action RPC, swallows errors with
  console.error so main mutation flow stays uninterrupted.
- diffJson keeps only the changed keys; matches the diff-only audit
  payload contract.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Activate "감사" sidebar nav item

**Files:**
- Modify: `vet-exam-ai/app/admin/_components/admin-nav-items.ts`

- [ ] **Step 1: Remove `disabled: true` from the 감사 entry**

Find:
```ts
  { label: "감사",      href: "/admin/audit",      icon: History,       disabled: true },
```

Replace with:
```ts
  { label: "감사",      href: "/admin/audit",      icon: History },
```

- [ ] **Step 2: Run typecheck**

Run:
```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

Run:
```bash
git add vet-exam-ai/app/admin/_components/admin-nav-items.ts
git commit -m "$(cat <<'EOF'
admin: enable 감사 sidebar nav (sidebar + mobile drawer auto-pick up)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Activate "감사 로그" dashboard hub card

**Files:**
- Modify: `vet-exam-ai/app/admin/page.tsx`

- [ ] **Step 1: Replace the disabled audit hub card**

Find:
```tsx
          <HubCard href="#" label="감사 로그" desc="모든 운영 작업 기록." icon={History} disabled />
```

Replace with:
```tsx
          <HubCard href="/admin/audit" label="감사 로그" desc="모든 운영 작업 기록." icon={History} />
```

- [ ] **Step 2: Run typecheck**

Run:
```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

Run:
```bash
git add vet-exam-ai/app/admin/page.tsx
git commit -m "$(cat <<'EOF'
admin: activate 감사 로그 hub card → /admin/audit

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Detail page — header "수정" link

**Files:**
- Modify: `vet-exam-ai/app/admin/questions/[id]/page.tsx`

- [ ] **Step 1: Import Pencil icon**

Find the existing icon import line:
```ts
import { ArrowLeft, ExternalLink } from "lucide-react";
```

Replace with:
```ts
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";
```

- [ ] **Step 2: Add the "수정" link to the header right column**

Find the existing header:
```tsx
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/admin/questions"
          className="inline-flex items-center gap-1.5 text-xs"
          style={{ color: "var(--text-muted)", textDecoration: "none" }}
        >
          <ArrowLeft size={13} />
          목록으로
        </Link>

        <a
          href={publicHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs"
          style={{ color: "var(--teal)", textDecoration: "none" }}
        >
          공개 페이지로 이동
          <ExternalLink size={12} />
        </a>
      </div>
```

Replace with:
```tsx
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/admin/questions"
          className="inline-flex items-center gap-1.5 text-xs"
          style={{ color: "var(--text-muted)", textDecoration: "none" }}
        >
          <ArrowLeft size={13} />
          목록으로
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href={`/admin/questions/${encodeURIComponent(q.id)}/edit`}
            className="inline-flex items-center gap-1.5 text-xs"
            style={{ color: "var(--teal)", textDecoration: "none" }}
          >
            <Pencil size={12} />
            수정
          </Link>
          <a
            href={publicHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs"
            style={{ color: "var(--text-muted)", textDecoration: "none" }}
          >
            공개 페이지로 이동
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
```

- [ ] **Step 3: Run typecheck**

Run:
```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

Run:
```bash
git add vet-exam-ai/app/admin/questions/[id]/page.tsx
git commit -m "$(cat <<'EOF'
admin: detail page header gets "수정" link → edit/

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Edit server action — updateQuestion

**Files:**
- Create: `vet-exam-ai/app/admin/questions/[id]/edit/_actions.ts`

- [ ] **Step 1: Write the server action**

Create `vet-exam-ai/app/admin/questions/[id]/edit/_actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../../../lib/admin/guards";
import { createClient } from "../../../../lib/supabase/server";
import { logAdminAction, diffJson } from "../../../../lib/admin/audit";
import type { Database } from "../../../../lib/supabase/types";

type QuestionUpdate = Database["public"]["Tables"]["questions"]["Update"];
type Difficulty = Database["public"]["Tables"]["questions"]["Row"]["difficulty"];

const ALLOWED_DIFFICULTIES: ReadonlyArray<NonNullable<Difficulty>> = [
  "easy",
  "medium",
  "hard",
];

function decodeMaybe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export async function updateQuestion(formData: FormData): Promise<void> {
  await requireAdmin();

  const idRaw = String(formData.get("id") ?? "");
  const id = decodeMaybe(idRaw);
  if (!id) redirect("/admin/questions?error=not_found");

  const supabase = await createClient();

  const { data: before } = await supabase
    .from("questions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!before) {
    redirect(`/admin/questions/${encodeURIComponent(id)}?error=not_found`);
  }

  const choices = [1, 2, 3, 4, 5].map((i) =>
    String(formData.get(`choice_${i}`) ?? "").trim(),
  );
  const answer = String(formData.get("answer") ?? "").trim();
  const question = String(formData.get("question") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim();
  const difficultyRaw = String(formData.get("difficulty") ?? "").trim();
  const explanation = String(formData.get("explanation") ?? "");
  const communityNotes = String(formData.get("community_notes") ?? "");
  const tagsRaw = String(formData.get("tags") ?? "");
  const isActive = formData.get("is_active") === "on";

  const errs: string[] = [];
  if (choices.some((c) => c.length === 0)) errs.push("choices_empty");
  if (!choices.includes(answer)) errs.push("answer_mismatch");
  if (!question) errs.push("question_empty");
  if (!category) errs.push("category_empty");

  if (errs.length > 0) {
    redirect(
      `/admin/questions/${encodeURIComponent(id)}/edit?error=${errs[0]}`,
    );
  }

  const difficulty: Difficulty =
    difficultyRaw && ALLOWED_DIFFICULTIES.includes(difficultyRaw as NonNullable<Difficulty>)
      ? (difficultyRaw as Difficulty)
      : null;

  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const update: QuestionUpdate = {
    question,
    choices,
    answer,
    category,
    subject: subject || null,
    topic: topic || null,
    difficulty,
    explanation,
    community_notes: communityNotes || null,
    tags,
    is_active: isActive,
  };

  const { error } = await supabase.from("questions").update(update).eq("id", id);
  if (error) {
    console.error("[admin] update question failed", error);
    redirect(
      `/admin/questions/${encodeURIComponent(id)}/edit?error=db_error`,
    );
  }

  const beforeRecord = before as unknown as Record<string, unknown>;
  const afterRecord = { ...beforeRecord, ...(update as Record<string, unknown>) };
  const { before: bDiff, after: aDiff } = diffJson(beforeRecord, afterRecord);

  if (Object.keys(aDiff).length > 0) {
    await logAdminAction({
      action: "question_update",
      targetType: "question",
      targetId: id,
      before: bDiff,
      after: aDiff,
    });
  }

  revalidatePath(`/admin/questions/${encodeURIComponent(id)}`);
  redirect(`/admin/questions/${encodeURIComponent(id)}`);
}
```

- [ ] **Step 2: Run typecheck**

Run:
```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

Run:
```bash
git add vet-exam-ai/app/admin/questions/[id]/edit/_actions.ts
git commit -m "$(cat <<'EOF'
admin: updateQuestion server action (validation + diff + audit)

- requireAdmin() re-check
- before snapshot select
- minimal validation: choices non-empty, answer ∈ choices,
  question/category non-empty
- on validation/db error: redirect with ?error=<code>
- on success: logAdminAction(question_update) with diff-only payload
  if any change, revalidatePath, redirect to detail

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Edit page — server form

**Files:**
- Create: `vet-exam-ai/app/admin/questions/[id]/edit/page.tsx`

- [ ] **Step 1: Write the page**

Create `vet-exam-ai/app/admin/questions/[id]/edit/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { createClient } from "../../../../lib/supabase/server";
import { getFilterOptions } from "../../../../lib/admin/filter-options";
import { updateQuestion } from "./_actions";

export const dynamic = "force-dynamic";

type EditQuestion = {
  id: string;
  public_id: string;
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
  category: string;
  subject: string | null;
  topic: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
  community_notes: string | null;
  tags: string[] | null;
  is_active: boolean;
  round: number | null;
  session: number | null;
  year: number | null;
  created_at: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  not_found:        "문제를 찾을 수 없습니다.",
  choices_empty:    "선지가 비어 있습니다. 5개를 모두 입력하세요.",
  answer_mismatch:  "정답이 선지 중 하나와 정확히 일치해야 합니다.",
  question_empty:   "문제 본문이 비어 있습니다.",
  category_empty:   "카테고리는 필수입니다.",
  db_error:         "저장 중 오류가 발생했습니다. 다시 시도하세요.",
};

function decodeMaybe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

async function loadQuestion(rawId: string): Promise<EditQuestion | null> {
  const id = decodeMaybe(rawId);
  const supabase = await createClient();
  const { data } = await supabase
    .from("questions")
    .select(
      "id, public_id, question, choices, answer, explanation, category, subject, topic, difficulty, community_notes, tags, is_active, round, session, year, created_at",
    )
    .or(`id.eq.${id},public_id.eq.${id}`)
    .limit(1)
    .maybeSingle();
  return (data as EditQuestion | null) ?? null;
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--rule)",
  color: "var(--text)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 13,
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted)",
  marginBottom: 4,
};

const sectionStyle: React.CSSProperties = {
  background: "var(--surface-raised)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  padding: 20,
  marginBottom: 16,
};

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="grid grid-cols-[100px_1fr] gap-3 py-1.5 text-xs"
      style={{ color: "var(--text-muted)" }}
    >
      <div>{label}</div>
      <div style={{ color: "var(--text)" }}>{value ?? "—"}</div>
    </div>
  );
}

export default async function AdminQuestionEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id: rawId } = await params;
  const { error: errorCode } = await searchParams;
  const q = await loadQuestion(rawId);
  if (!q) notFound();

  const options = await getFilterOptions();
  const errorMsg =
    errorCode && ERROR_MESSAGES[errorCode] ? ERROR_MESSAGES[errorCode] : null;

  // Pad choices to length 5 so the form always renders 5 inputs
  const padded = [...q.choices];
  while (padded.length < 5) padded.push("");

  const detailHref = `/admin/questions/${encodeURIComponent(q.id)}`;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link
          href={detailHref}
          className="inline-flex items-center gap-1.5 text-xs"
          style={{ color: "var(--text-muted)", textDecoration: "none" }}
        >
          <ArrowLeft size={13} />
          상세로
        </Link>
      </div>

      <header className="mb-6">
        <div
          className="text-xs uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          문제 수정
        </div>
        <h1
          className="mt-1 text-2xl font-semibold kvle-mono"
          style={{ color: "var(--text)" }}
        >
          {q.public_id}
        </h1>
      </header>

      {errorMsg && (
        <div
          className="rounded-lg p-3 mb-4 flex items-center gap-2 text-sm"
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--danger, #c53030)",
            color: "var(--danger, #c53030)",
          }}
          role="alert"
        >
          <AlertCircle size={14} />
          {errorMsg}
        </div>
      )}

      <form action={updateQuestion}>
        <input type="hidden" name="id" value={q.id} />

        <section style={sectionStyle}>
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            잠금 (편집 불가)
          </h2>
          <MetaRow label="raw id" value={<span className="kvle-mono">{q.id}</span>} />
          <MetaRow label="회차" value={q.round != null ? `${q.round}회` : null} />
          <MetaRow label="교시" value={q.session != null ? `${q.session}교시` : null} />
          <MetaRow label="연도" value={q.year} />
          <MetaRow label="등록일" value={new Date(q.created_at).toLocaleString("ko-KR")} />
        </section>

        <section style={sectionStyle}>
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            문제
          </h2>
          <label style={labelStyle} htmlFor="question">문제 본문</label>
          <textarea
            id="question"
            name="question"
            defaultValue={q.question}
            rows={6}
            required
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </section>

        <section style={sectionStyle}>
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            선지 + 정답
          </h2>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="mb-2">
              <label style={labelStyle} htmlFor={`choice_${i + 1}`}>{i + 1}번 선지</label>
              <input
                id={`choice_${i + 1}`}
                name={`choice_${i + 1}`}
                defaultValue={padded[i]}
                style={inputStyle}
              />
            </div>
          ))}
          <div className="mt-3">
            <label style={labelStyle} htmlFor="answer">정답 (선지 본문과 정확히 일치)</label>
            <input
              id="answer"
              name="answer"
              defaultValue={q.answer}
              required
              style={inputStyle}
            />
          </div>
        </section>

        <section style={sectionStyle}>
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            해설 + 메모
          </h2>
          <label style={labelStyle} htmlFor="explanation">해설</label>
          <textarea
            id="explanation"
            name="explanation"
            defaultValue={q.explanation}
            rows={5}
            style={{ ...inputStyle, resize: "vertical", marginBottom: 12 }}
          />
          <label style={labelStyle} htmlFor="community_notes">커뮤니티 노트 (vet40)</label>
          <textarea
            id="community_notes"
            name="community_notes"
            defaultValue={q.community_notes ?? ""}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </section>

        <section style={sectionStyle}>
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            메타
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label style={labelStyle} htmlFor="category">카테고리 (필수)</label>
              <select id="category" name="category" defaultValue={q.category} required style={inputStyle}>
                {!options.categories.includes(q.category) && (
                  <option value={q.category}>{q.category}</option>
                )}
                {options.categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle} htmlFor="subject">과목</label>
              <select id="subject" name="subject" defaultValue={q.subject ?? ""} style={inputStyle}>
                <option value="">—</option>
                {q.subject && !options.subjects.includes(q.subject) && (
                  <option value={q.subject}>{q.subject}</option>
                )}
                {options.subjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle} htmlFor="topic">토픽</label>
              <input id="topic" name="topic" defaultValue={q.topic ?? ""} style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle} htmlFor="difficulty">난이도</label>
              <select id="difficulty" name="difficulty" defaultValue={q.difficulty ?? ""} style={inputStyle}>
                <option value="">—</option>
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label style={labelStyle} htmlFor="tags">태그 (쉼표로 구분)</label>
              <input
                id="tags"
                name="tags"
                defaultValue={(q.tags ?? []).join(", ")}
                style={inputStyle}
              />
            </div>
          </div>
        </section>

        <section style={sectionStyle}>
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            운영
          </h2>
          <label className="inline-flex items-center gap-2 text-sm" htmlFor="is_active">
            <input
              type="checkbox"
              id="is_active"
              name="is_active"
              defaultChecked={q.is_active}
            />
            <span style={{ color: "var(--text)" }}>활성 (체크 해제 시 공개 페이지에서 비공개)</span>
          </label>
        </section>

        <div className="flex items-center justify-end gap-2 mt-6">
          <Link
            href={detailHref}
            className="text-xs"
            style={{
              padding: "8px 16px",
              border: "1px solid var(--rule)",
              borderRadius: 6,
              color: "var(--text-muted)",
              textDecoration: "none",
            }}
          >
            취소
          </Link>
          <button
            type="submit"
            className="text-xs font-medium"
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              background: "var(--teal)",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            저장
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run:
```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

Run:
```bash
git add vet-exam-ai/app/admin/questions/[id]/edit/page.tsx
git commit -m "$(cat <<'EOF'
admin: /admin/questions/[id]/edit server form

- 12 editable fields (question, choices×5, answer, explanation,
  category, subject, topic, difficulty, tags, community_notes, is_active)
- 5 locked meta rows (id, round, session, year, created_at)
- searchParams.error → top alert with Korean message map
- <form action={updateQuestion}> JS-0 submission
- existing-but-removed category/subject options preserved as fallback

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: parse-audit-search-params

**Files:**
- Create: `vet-exam-ai/app/admin/audit/_lib/parse-audit-search-params.ts`

- [ ] **Step 1: Write the parser + URL builder**

Create `vet-exam-ai/app/admin/audit/_lib/parse-audit-search-params.ts`:

```ts
import type { Database } from "../../../../lib/supabase/types";

type AuditAction = Database["public"]["Enums"]["audit_action"];

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

export const ALL_TARGET_TYPES: ReadonlyArray<string> = [
  "question",
  "comment",
  "user",
  "correction",
  "report",
  "badge",
];

export type ParsedAuditSearchParams = {
  page: number;
  action?: AuditAction;
  target_type?: string;
  admin?: string; // nickname fuzzy
};

const ADMIN_RE = /^[\p{L}\p{N}\s\-]+$/u;

function int(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function nonEmpty(v: string | undefined, max = 50): string | undefined {
  if (!v) return undefined;
  const trimmed = v.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseAuditSearchParams(
  raw: { [key: string]: string | string[] | undefined },
): ParsedAuditSearchParams {
  const get = (k: string): string | undefined => {
    const v = raw[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const pageRaw = int(get("page")) ?? 1;
  const page = Math.max(1, pageRaw);

  const actionRaw = get("action");
  const action: AuditAction | undefined =
    actionRaw && (ALL_AUDIT_ACTIONS as readonly string[]).includes(actionRaw)
      ? (actionRaw as AuditAction)
      : undefined;

  const ttRaw = get("target_type");
  const target_type: string | undefined =
    ttRaw && ALL_TARGET_TYPES.includes(ttRaw) ? ttRaw : undefined;

  const adminRaw = nonEmpty(get("admin"));
  const admin = adminRaw && ADMIN_RE.test(adminRaw) ? adminRaw : undefined;

  return { page, action, target_type, admin };
}

export function buildAuditSearchString(
  current: ParsedAuditSearchParams,
  override: Partial<Record<keyof ParsedAuditSearchParams, string | number | undefined>>,
): string {
  const merged: Record<string, string> = {};

  function set(k: string, v: string | number | undefined) {
    if (v === undefined || v === "") return;
    merged[k] = String(v);
  }

  set("page", current.page);
  set("action", current.action);
  set("target_type", current.target_type);
  set("admin", current.admin);

  for (const [k, v] of Object.entries(override)) {
    if (v === undefined || v === null || v === "") {
      delete merged[k];
    } else {
      merged[k] = String(v);
    }
  }

  if (merged.page === "1") delete merged.page;

  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) out.set(k, v);
  const s = out.toString();
  return s ? `?${s}` : "";
}

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

export const TARGET_TYPE_LABEL: Record<string, string> = {
  question:    "문제",
  comment:     "댓글",
  user:        "회원",
  correction:  "정정",
  report:      "신고",
  badge:       "뱃지",
};
```

- [ ] **Step 2: Run typecheck**

Run:
```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

Run:
```bash
git add vet-exam-ai/app/admin/audit/_lib/parse-audit-search-params.ts
git commit -m "$(cat <<'EOF'
admin: parse-audit-search-params (URL parser + builder + label maps)

Mirrors PR-A's parse-search-params pattern:
- whitelist enum/target validation, silent drop on bad input
- admin nickname: 50 char cap + Unicode letter/number/space/hyphen regex
- buildAuditSearchString preserves filters when toggling page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: AuditPager

**Files:**
- Create: `vet-exam-ai/app/admin/audit/_components/audit-pager.tsx`

- [ ] **Step 1: Write the pager**

Create `vet-exam-ai/app/admin/audit/_components/audit-pager.tsx`:

```tsx
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildAuditSearchString,
  type ParsedAuditSearchParams,
} from "../_lib/parse-audit-search-params";

export function AuditPager({
  current,
  totalPages,
}: {
  current: ParsedAuditSearchParams;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const prev = Math.max(1, current.page - 1);
  const next = Math.min(totalPages, current.page + 1);

  const linkStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 12px",
    border: "1px solid var(--rule)",
    borderRadius: 6,
    fontSize: 13,
    color: "var(--text)",
    textDecoration: "none",
    background: "var(--bg)",
  };

  const disabledStyle: React.CSSProperties = {
    ...linkStyle,
    opacity: 0.4,
    pointerEvents: "none",
    cursor: "not-allowed",
  };

  const prevHref = `/admin/audit${buildAuditSearchString(current, { page: prev })}`;
  const nextHref = `/admin/audit${buildAuditSearchString(current, { page: next })}`;

  return (
    <nav
      className="mt-4 flex items-center justify-between"
      aria-label="페이지 네비게이션"
    >
      <Link
        href={prevHref}
        aria-label="이전 페이지"
        style={current.page <= 1 ? disabledStyle : linkStyle}
      >
        <ChevronLeft size={14} />
        이전
      </Link>

      <span className="text-xs kvle-mono" style={{ color: "var(--text-muted)" }}>
        {current.page} / {totalPages}
      </span>

      <Link
        href={nextHref}
        aria-label="다음 페이지"
        style={current.page >= totalPages ? disabledStyle : linkStyle}
      >
        다음
        <ChevronRight size={14} />
      </Link>
    </nav>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run:
```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

Run:
```bash
git add vet-exam-ai/app/admin/audit/_components/audit-pager.tsx
git commit -m "$(cat <<'EOF'
admin: AuditPager (sibling of AdminQuestionsPager, /admin/audit base)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: AuditFilters (client)

**Files:**
- Create: `vet-exam-ai/app/admin/audit/_components/audit-filters.tsx`

- [ ] **Step 1: Write the client component**

Create `vet-exam-ai/app/admin/audit/_components/audit-filters.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import {
  ALL_AUDIT_ACTIONS,
  ALL_TARGET_TYPES,
  AUDIT_ACTION_LABEL,
  TARGET_TYPE_LABEL,
  buildAuditSearchString,
  type ParsedAuditSearchParams,
} from "../_lib/parse-audit-search-params";

export function AuditFilters({
  current,
}: {
  current: ParsedAuditSearchParams;
}) {
  const router = useRouter();
  const [adminInput, setAdminInput] = useState(current.admin ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAdminInput(current.admin ?? "");
  }, [current.admin]);

  function navigate(
    override: Partial<Record<keyof ParsedAuditSearchParams, string | number | undefined>>,
  ) {
    const next = buildAuditSearchString(current, { ...override, page: 1 });
    router.replace(`/admin/audit${next}`);
  }

  function onAdminChange(v: string) {
    setAdminInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      navigate({ admin: v.trim() === "" ? undefined : v.trim() });
    }, 300);
  }

  function reset() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAdminInput("");
    router.replace("/admin/audit");
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--bg)",
    border: "1px solid var(--rule)",
    color: "var(--text)",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13,
    minWidth: 120,
  };

  return (
    <div
      className="rounded-lg p-3 mb-4 flex flex-wrap items-center gap-2"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
    >
      <div className="relative flex-1 min-w-[200px]">
        <Search
          size={13}
          style={{ position: "absolute", left: 10, top: 9, color: "var(--text-muted)" }}
        />
        <input
          type="text"
          value={adminInput}
          onChange={(e) => onAdminChange(e.target.value)}
          placeholder="운영자 닉네임 검색"
          aria-label="운영자 검색"
          style={{ ...inputStyle, paddingLeft: 28, width: "100%" }}
        />
      </div>

      <select
        value={current.action ?? ""}
        onChange={(e) => navigate({ action: e.target.value || undefined })}
        aria-label="액션"
        style={inputStyle}
      >
        <option value="">전체 액션</option>
        {ALL_AUDIT_ACTIONS.map((a) => (
          <option key={a} value={a}>{AUDIT_ACTION_LABEL[a]}</option>
        ))}
      </select>

      <select
        value={current.target_type ?? ""}
        onChange={(e) => navigate({ target_type: e.target.value || undefined })}
        aria-label="대상"
        style={inputStyle}
      >
        <option value="">전체 대상</option>
        {ALL_TARGET_TYPES.map((t) => (
          <option key={t} value={t}>{TARGET_TYPE_LABEL[t] ?? t}</option>
        ))}
      </select>

      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-1.5 text-xs"
        style={{
          color: "var(--text-muted)",
          background: "transparent",
          border: "1px solid var(--rule)",
          borderRadius: 6,
          padding: "6px 10px",
          cursor: "pointer",
        }}
        aria-label="필터 초기화"
      >
        <X size={13} />
        초기화
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run:
```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

Run:
```bash
git add vet-exam-ai/app/admin/audit/_components/audit-filters.tsx
git commit -m "$(cat <<'EOF'
admin: AuditFilters (client; URL-synced action/target_type/admin)

- mirrors AdminQuestionsFilters pattern
- 300ms debounce on admin nickname search
- toggle resets page=1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: AuditTable (server)

**Files:**
- Create: `vet-exam-ai/app/admin/audit/_components/audit-table.tsx`

- [ ] **Step 1: Write the table**

Create `vet-exam-ai/app/admin/audit/_components/audit-table.tsx`:

```tsx
import Link from "next/link";
import type { Database } from "../../../../lib/supabase/types";
import { AUDIT_ACTION_LABEL, TARGET_TYPE_LABEL } from "../_lib/parse-audit-search-params";

type AuditAction = Database["public"]["Enums"]["audit_action"];

export type AuditRow = {
  id: string;
  admin_id: string | null;
  action: AuditAction;
  target_type: string;
  target_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function summarizeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string {
  if (!after) return "—";
  const keys = Object.keys(after);
  if (keys.length === 0) return "—";

  const summarize = (v: unknown): string => {
    if (v === null || v === undefined) return "∅";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return String(v);
    if (typeof v === "string") return v.length > 24 ? `${v.slice(0, 24)}…` : v;
    if (Array.isArray(v)) return `[${v.length}]`;
    return "{…}";
  };

  const parts = keys.slice(0, 2).map((k) => {
    const b = before?.[k];
    const a = after[k];
    return `${k}: ${summarize(b)} → ${summarize(a)}`;
  });
  if (keys.length > 2) parts.push(`…+${keys.length - 2}`);
  return parts.join(", ");
}

export function AuditTable({
  rows,
  adminMap,
  questionMap,
}: {
  rows: AuditRow[];
  adminMap: Record<string, { nickname: string | null }>;
  questionMap: Record<string, { public_id: string | null }>;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg p-10 text-center text-sm"
        style={{
          background: "var(--surface-raised)",
          border: "1px solid var(--rule)",
          color: "var(--text-muted)",
        }}
      >
        감사 로그가 없습니다.
      </div>
    );
  }

  const cell: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 13,
    borderBottom: "1px solid var(--rule)",
    verticalAlign: "top",
  };
  const head: React.CSSProperties = {
    ...cell,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    background: "var(--surface-raised)",
    textAlign: "left",
    whiteSpace: "nowrap",
  };

  return (
    <div
      className="overflow-x-auto rounded-lg"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={head}>시각</th>
            <th style={head}>운영자</th>
            <th style={head}>액션</th>
            <th style={head}>대상</th>
            <th style={head}>변경 요약</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const adminLabel = r.admin_id
              ? adminMap[r.admin_id]?.nickname ?? `(닉네임 없음)`
              : "탈퇴한 운영자";

            const targetLabel = TARGET_TYPE_LABEL[r.target_type] ?? r.target_type;

            let targetCell: React.ReactNode = (
              <span style={{ color: "var(--text-muted)" }}>
                {targetLabel} · <span className="kvle-mono">{r.target_id.slice(0, 8)}…</span>
              </span>
            );
            if (r.target_type === "question") {
              const pub = questionMap[r.target_id]?.public_id;
              targetCell = (
                <Link
                  href={`/admin/questions/${encodeURIComponent(r.target_id)}`}
                  className="kvle-mono"
                  style={{ color: "var(--teal)", textDecoration: "none" }}
                >
                  {pub ?? r.target_id.slice(0, 12) + "…"}
                </Link>
              );
            }

            return (
              <tr key={r.id} style={{ background: "var(--bg)" }}>
                <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                  {formatTimestamp(r.created_at)}
                </td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>
                  {r.admin_id && adminMap[r.admin_id]?.nickname ? (
                    <Link
                      href={`/profile/${encodeURIComponent(adminMap[r.admin_id]!.nickname!)}`}
                      style={{ color: "var(--teal)", textDecoration: "none" }}
                    >
                      {adminLabel}
                    </Link>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>{adminLabel}</span>
                  )}
                </td>
                <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--text)" }}>
                  {AUDIT_ACTION_LABEL[r.action] ?? r.action}
                </td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>{targetCell}</td>
                <td style={{ ...cell, color: "var(--text-muted)" }}>
                  {summarizeDiff(r.before_state, r.after_state)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run:
```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

Run:
```bash
git add vet-exam-ai/app/admin/audit/_components/audit-table.tsx
git commit -m "$(cat <<'EOF'
admin: AuditTable (server; admin nickname + KVLE link + diff summary)

- summarizeDiff prints first 2 keys "k: before → after", "…+N" if more
- target_type=question links to admin detail with KVLE label
- admin_id null → "탈퇴한 운영자", nickname missing → fallback string
- profile link via /profile/{nickname}

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Audit page composition

**Files:**
- Create: `vet-exam-ai/app/admin/audit/page.tsx`

- [ ] **Step 1: Write the audit page**

Create `vet-exam-ai/app/admin/audit/page.tsx`:

```tsx
import { createClient } from "../../../lib/supabase/server";
import { parseAuditSearchParams } from "./_lib/parse-audit-search-params";
import { AuditFilters } from "./_components/audit-filters";
import { AuditTable, type AuditRow } from "./_components/audit-table";
import { AuditPager } from "./_components/audit-pager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

async function loadPage(sp: ReturnType<typeof parseAuditSearchParams>): Promise<{
  rows: AuditRow[];
  totalPages: number;
  adminMap: Record<string, { nickname: string | null }>;
  questionMap: Record<string, { public_id: string | null }>;
}> {
  const supabase = await createClient();

  // Step 1: optionally resolve nickname filter to admin_id set
  let adminIdFilter: string[] | null = null;
  if (sp.admin) {
    const { data: matches } = await supabase
      .from("user_profiles_public")
      .select("user_id, nickname")
      .ilike("nickname", `%${sp.admin}%`)
      .limit(50);
    adminIdFilter = (matches ?? [])
      .map((m) => m.user_id as string)
      .filter((id): id is string => Boolean(id));
    if (adminIdFilter.length === 0) {
      return { rows: [], totalPages: 1, adminMap: {}, questionMap: {} };
    }
  }

  // Step 2: main audit query
  let q = supabase
    .from("admin_audit_logs")
    .select("*", { count: "exact" });

  if (sp.action) q = q.eq("action", sp.action);
  if (sp.target_type) q = q.eq("target_type", sp.target_type);
  if (adminIdFilter) q = q.in("admin_id", adminIdFilter);

  const offset = (sp.page - 1) * PAGE_SIZE;
  const { data, count } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const rows = (data ?? []) as AuditRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // Step 3: nickname lookup (separate query — no embedded join, PR #14 trap)
  const adminIds = Array.from(
    new Set(rows.map((r) => r.admin_id).filter((v): v is string => Boolean(v))),
  );
  const adminMap: Record<string, { nickname: string | null }> = {};
  if (adminIds.length > 0) {
    const { data: profs } = await supabase
      .from("user_profiles_public")
      .select("user_id, nickname")
      .in("user_id", adminIds);
    for (const p of profs ?? []) {
      if (p.user_id) adminMap[p.user_id] = { nickname: p.nickname };
    }
  }

  // Step 4: question KVLE lookup for question targets
  const questionIds = Array.from(
    new Set(
      rows
        .filter((r) => r.target_type === "question")
        .map((r) => r.target_id),
    ),
  );
  const questionMap: Record<string, { public_id: string | null }> = {};
  if (questionIds.length > 0) {
    const { data: qs } = await supabase
      .from("questions")
      .select("id, public_id")
      .in("id", questionIds);
    for (const q of qs ?? []) {
      questionMap[q.id] = { public_id: q.public_id };
    }
  }

  return { rows, totalPages, adminMap, questionMap };
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = await searchParams;
  const sp = parseAuditSearchParams(raw);

  const { rows, totalPages, adminMap, questionMap } = await loadPage(sp);
  const clamped: typeof sp = {
    ...sp,
    page: Math.min(sp.page, totalPages),
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          감사 로그
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          모든 운영자 액션은 자동으로 기록됩니다.
        </p>
      </header>

      <AuditFilters current={clamped} />
      <AuditTable rows={rows} adminMap={adminMap} questionMap={questionMap} />
      <AuditPager current={clamped} totalPages={totalPages} />
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run:
```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

Run:
```bash
git add vet-exam-ai/app/admin/audit/page.tsx
git commit -m "$(cat <<'EOF'
admin: /admin/audit page (filters + table + pager)

- 50/page server query, count: exact for totalPages
- nickname filter resolves to admin_id set first, empty result short-circuits
- nickname + KVLE lookups via separate queries (PR #14 embedded-join trap)
- target_type=question rows join question.public_id for KVLE label

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Verification, migration apply, push, PR

**Files:** None (verification + delivery)

- [ ] **Step 1: Final typecheck + lint**

Run:
```bash
cd vet-exam-ai && npx tsc --noEmit
cd vet-exam-ai && npm run lint
```
Expected: both clean.

- [ ] **Step 2: Build dry-run**

Run:
```bash
cd vet-exam-ai && npm run build
```
Expected: build succeeds. If failure, fix and re-commit before continuing.

- [ ] **Step 3: Apply migration via Supabase Studio SQL Editor**

Open Supabase Studio → SQL Editor. Paste the contents of `vet-exam-ai/supabase/migrations/20260501000000_admin_pr_b.sql` and run.

Sanity check (run as authenticated admin user via Studio with `set local role authenticated; set local "request.jwt.claims" to '{"sub":"<your-admin-uuid>"}'` OR test via the app after deploy):
```sql
-- Direct SQL Editor sanity (runs as superuser, bypasses RLS — only verifies syntax)
select proname from pg_proc where proname = 'log_admin_action';
-- expected: 1 row

select * from pg_policy where polname = 'questions: admin update';
-- expected: 1 row

select unnest(enum_range(null::public.audit_action));
-- expected: 12 rows including 'question_update'
```

End-to-end RPC sanity will happen during Step 5 manual testing.

- [ ] **Step 4: Push branch**

Run:
```bash
git push -u origin feat/admin-mutations-audit-prb
```
Expected: push succeeds, GitHub returns the PR creation URL (memory: gh CLI not installed, use the printed URL).

- [ ] **Step 5: Manual verification scenarios (logged in as admin)**

Open the deployed preview (or localhost dev) and verify each:

- [ ] non-admin → `/admin/questions/{any}/edit` redirects to `/dashboard`
- [ ] admin → `/admin/questions/{KVLE}/edit` loads form with all fields prefilled
- [ ] choices 5번 비우고 submit → URL has `?error=choices_empty`, alert shown
- [ ] answer를 임의 텍스트로 → `?error=answer_mismatch`
- [ ] 본문 비우고 submit → `?error=question_empty`
- [ ] 정상 수정 (선지 1번 텍스트 변경) → 상세 페이지 redirect, 변경 반영
- [ ] is_active 토글만 변경 → 상세 페이지에서 활성 chip 변경 + 감사 1행 추가
- [ ] 변경 0인 채로 submit → 정상 redirect, 감사 미기록
- [ ] `/admin/audit` 진입 → 위 두 액션이 행으로 보임
- [ ] 감사 행의 KVLE 링크 → 해당 문제 admin 상세로 진입
- [ ] 감사 필터 액션 셀렉트(예: "문제 수정") → URL `?action=question_update` 동기화
- [ ] 운영자 닉네임 검색 input → 300ms 후 URL `?admin=...` 동기화
- [ ] 페이지 1→2→1 (50건 이상일 때) → 다른 필터 보존
- [ ] edit 페이지에 `round`/`session`/`year` input 없음 (잠금 strip만 보임)
- [ ] 사이드바 "감사" nav 활성, 모바일 햄버거에서도 동일
- [ ] 대시보드 "감사 로그" hub card 활성, 클릭 시 `/admin/audit`

If any scenario fails, fix and add a fixup commit. Re-run typecheck/build after each fix.

- [ ] **Step 6: Create PR via GitHub web**

Open the URL printed by Step 4 (`https://github.com/sngjlee/vet-exam-ai/pull/new/feat/admin-mutations-audit-prb`).

Title: `M3 §18 admin mutations + audit (PR-B)`

Body:
```
## Summary
- questions content/meta/active edit (12 fields editable, 5 locked)
- log_admin_action RPC (security definer + admin gate)
- /admin/audit read-only viewer (filters + table + pager)
- enum extension: audit_action gains 'question_update'
- questions admin-only UPDATE policy

## Test plan
- [ ] Non-admin redirects from /admin/questions/{id}/edit
- [ ] All 5 validation error codes surface as Korean alerts
- [ ] Successful edit redirects to detail and writes audit row
- [ ] No-op edit does NOT write audit row
- [ ] is_active toggle flows end-to-end
- [ ] /admin/audit lists rows with admin nickname + KVLE link
- [ ] Filter (action / target_type / admin) URL-sync works
- [ ] Pager preserves filters
- [ ] Lock strip hides round/session/year from edit form

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 7: Merge after review**

Once CI green and review approves: merge via GitHub web (squash or merge — match prior PRs).

- [ ] **Step 8: Sync local main**

Run:
```bash
git checkout main
git pull
git log --oneline -3
```
Expected: latest commit is the merge of PR-B. Working tree clean.

---

## Notes / known traps (for executor)

- **Migration timestamp**: `20260501000000` is one second after PR-A's `20260429000000_admin_count_distinct.sql`. If a newer dated migration exists in `vet-exam-ai/supabase/migrations/` by the time you start, bump to e.g. `20260501000001_…`.
- **Two `supabase/` directories**: root-level `supabase/migrations/` is **legacy/stale** — only edit migrations under `vet-exam-ai/supabase/migrations/`.
- **CWD trap**: prior bash sessions have lost `cd vet-exam-ai` between commands. Use absolute paths or `cd vet-exam-ai && <cmd>` chained per call.
- **db push trap**: do NOT run `supabase db push` for this migration — Studio SQL Editor only.
- **embedded join trap (PR #14)**: never `.select("*, user_profiles_public(...)")` against `admin_audit_logs` — always two queries.
- **literal-copy bias**: per PR-A learning, this plan is heavy on direct file writes. Inline execution typically faster than subagent dispatch (PR-A: 16 commits ~30 min, subagent 0).
- **typecheck command**: there is NO `npm run typecheck` script — always `npx tsc --noEmit` from `vet-exam-ai/`.
