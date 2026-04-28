# /admin Questions Read-Only (PR-A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `/admin` console shell + read-only questions list/detail. Admins (role='admin' + is_active) can browse the question bank with full filters/sorting/pagination, view per-question admin metadata (round/session/year + KVLE), and reach the public page for QA. No mutation. RLS write policies untouched. Next PR layers create/edit on top.

**Architecture:** Next.js App Router. `app/admin/layout.tsx` is the single auth gate (`requireAdmin()`); all `/admin/*` pages render inside the gated shell. Admin metadata lives in a private `_components/` namespace to enforce the copyright guard (round/session/year never leak to public surfaces). Two new RPCs (`count_questions_distinct`, `get_questions_filter_options`) avoid the Supabase 1000-row cap on distinct queries; the latter has internal admin gating since it returns round/year values.

**Tech Stack:** Next.js 15 App Router, React 19 (cache()), TypeScript, Supabase (postgres + RLS + RPC), Tailwind v4 + design tokens (CSS vars), lucide-react.

**Spec:** `docs/superpowers/specs/2026-04-29-admin-questions-readonly-design.md`

---

## File Structure

**Created:**
- `vet-exam-ai/supabase/migrations/20260429000000_admin_count_distinct.sql` — 2 RPC functions
- `vet-exam-ai/lib/admin/guards.ts` — `requireAdmin()` server helper
- `vet-exam-ai/lib/admin/filter-options.ts` — `getFilterOptions()` cached RPC wrapper
- `vet-exam-ai/lib/hooks/useMyRole.ts` — client hook for NavBar pill
- `vet-exam-ai/app/admin/_components/admin-nav-items.ts` — shared nav config (DRY between sidebar + drawer)
- `vet-exam-ai/app/admin/_components/admin-sidebar.tsx` — desktop sidebar (client; reads `usePathname()`)
- `vet-exam-ai/app/admin/_components/admin-mobile-drawer.tsx` — mobile hamburger drawer (client)
- `vet-exam-ai/app/admin/_components/admin-questions-filters.tsx` — URL-synced filter bar (client)
- `vet-exam-ai/app/admin/_components/admin-questions-table.tsx` — list table (server)
- `vet-exam-ai/app/admin/_components/admin-questions-pager.tsx` — pagination links (server)
- `vet-exam-ai/app/admin/questions/_lib/parse-search-params.ts` — search-param normalization
- `vet-exam-ai/app/admin/layout.tsx` — auth gate + shell
- `vet-exam-ai/app/admin/page.tsx` — dashboard hub (4 counts + cards)
- `vet-exam-ai/app/admin/questions/page.tsx` — list page
- `vet-exam-ai/app/admin/questions/[id]/page.tsx` — admin-only detail

**Modified:**
- `vet-exam-ai/lib/supabase/types.ts` — add 2 RPC entries to `Functions`
- `vet-exam-ai/components/NavBar.tsx` — add admin pill (conditional on `useMyRole`)

**Why this split:** The `/admin/*` shell + dashboard + questions list/detail are discrete concerns. Each file has one responsibility. `admin-nav-items.ts` is shared because sidebar and drawer must show the *same* navigation; otherwise they drift. `_components/` lives under `app/admin/` (route-private) to make the copyright-guard boundary obvious — public routes cannot accidentally import these.

---

## Notes for Implementer

- **App lives in `vet-exam-ai/`** (Next.js root nested under repo root). Run shell from repo root with `cd vet-exam-ai && <cmd>` chained on a single line — bash CWD lock-in trap (memory).
- **Type checker:** No `npm run typecheck` script exists. Use `cd vet-exam-ai && npx tsc --noEmit`.
- **Migration application trap:** Memory says CLI `db push` may report "up to date" falsely. After Step N of Task 1, the user applies the migration via Supabase SQL Editor manually. The plan produces the SQL file and stops; do **not** run CLI push.
- **Subagent commit guard:** if dispatching subagents, instruct each to `git add <explicit-paths>` only (never `git add -A` / `git add .`), do NOT push, and run `git status` first to avoid sweeping pre-staged spec/plan docs (memory: §12 dday-widget incident).
- **Copyright guard:** `round` / `session` / `year` exposed only inside `app/admin/_components/`. Public-facing components (`QuestionCard.tsx`, etc.) MUST NOT be reused in admin routes — write fresh admin variants. The "go to public page" link uses `(public_id ?? id)` (KVLE first), never raw id.
- **Korean id decode trap (PR #30):** `useParams()` does not decode non-ASCII segments. The detail route uses `decodeURIComponent` in a try/catch. Inside admin gate, both raw id and KVLE-NNNN must resolve.
- **Tailwind v4 utility runtime trap:** Some utility classes are runtime-injected and may not render. Use inline `style={{ ... }}` with CSS vars (`var(--teal)`, `var(--bg)`, `var(--rule)`, `var(--text)`, `var(--text-muted)`, `var(--surface-raised)`, `var(--teal-dim)`) — mirror existing `NavBar.tsx` and `comments/*` components.
- **Supabase 1000-row cap trap:** `.select('round')` returns at most 1000 rows. Distinct values from this approach are **incomplete** with ~3000 questions. Use the RPCs from Task 1 instead.

---

## Task 0: Baseline Sanity Check

**Files:** None (read-only)

- [ ] **Step 1: Verify clean working tree on main**

Run: `git status`
Expected: `On branch main` + `nothing to commit, working tree clean`

- [ ] **Step 2: Verify spec is committed**

Run: `git log --oneline -5 -- docs/superpowers/specs/2026-04-29-admin-questions-readonly-design.md`
Expected: at least one commit referencing the spec.

- [ ] **Step 3: Verify typecheck baseline passes on main**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0 (no errors). Record any pre-existing warnings as accepted baseline.

- [ ] **Step 4: Confirm operator account exists**

Run: log in to Supabase Studio → SQL Editor → `select id, role, is_active from profiles where role = 'admin' and is_active = true;`
Expected: at least one row. If zero, set the operator's row before proceeding (`update profiles set role='admin', is_active=true where id='<your-uuid>';`).

- [ ] **Step 5: Create branch**

Run: `git checkout -b feat/admin-questions-readonly-pra`
Expected: `Switched to a new branch 'feat/admin-questions-readonly-pra'`

---

## Task 1: Migration + types.ts — RPC functions

**Files:**
- Create: `vet-exam-ai/supabase/migrations/20260429000000_admin_count_distinct.sql`
- Modify: `vet-exam-ai/lib/supabase/types.ts` (add 2 entries to `Functions`)

- [ ] **Step 1: Write migration SQL**

Create `vet-exam-ai/supabase/migrations/20260429000000_admin_count_distinct.sql`:

```sql
-- 1. count distinct values for a single questions column (dashboard cards 3,4)
create or replace function public.count_questions_distinct(col text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result integer;
begin
  if col not in ('round', 'category', 'subject', 'session', 'year') then
    raise exception 'invalid column: %', col;
  end if;
  execute format('select count(distinct %I) from public.questions where %I is not null', col, col)
    into result;
  return result;
end;
$$;

revoke execute on function public.count_questions_distinct(text) from public, anon;
grant execute on function public.count_questions_distinct(text) to authenticated;

-- 2. consolidated filter options (admin questions list dropdowns) — admin-only
-- copyright guard: round/year values themselves are sensitive; gate inside the function
create or replace function public.get_questions_filter_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  select role::text into caller_role
    from public.profiles
    where id = auth.uid() and is_active;

  if caller_role is null or caller_role <> 'admin' then
    raise exception 'access denied' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'rounds',     coalesce((select jsonb_agg(r order by r desc) from (select distinct round    as r from public.questions where round    is not null) s), '[]'::jsonb),
      'years',      coalesce((select jsonb_agg(r order by r desc) from (select distinct year     as r from public.questions where year     is not null) s), '[]'::jsonb),
      'sessions',   coalesce((select jsonb_agg(r order by r asc ) from (select distinct session  as r from public.questions where session  is not null) s), '[]'::jsonb),
      'subjects',   coalesce((select jsonb_agg(r order by r asc ) from (select distinct subject  as r from public.questions where subject  is not null) s), '[]'::jsonb),
      'categories', coalesce((select jsonb_agg(r order by r asc ) from (select distinct category as r from public.questions where category is not null) s), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.get_questions_filter_options() from public, anon;
grant execute on function public.get_questions_filter_options() to authenticated;
```

- [ ] **Step 2: Add RPC types to `types.ts`**

Open `vet-exam-ai/lib/supabase/types.ts` and locate the existing `Functions:` block (around line 480). Replace the block with:

```ts
    Functions: {
      is_temp_nickname: {
        Args: { n: string };
        Returns: boolean;
      };
      get_user_total_vote_score: {
        Args: { uid: string };
        Returns: number;
      };
      count_questions_distinct: {
        Args: { col: string };
        Returns: number;
      };
      get_questions_filter_options: {
        Args: Record<string, never>;
        Returns: {
          rounds: number[];
          years: number[];
          sessions: number[];
          subjects: string[];
          categories: string[];
        };
      };
    };
```

- [ ] **Step 3: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Apply migration via Supabase Studio (manual)**

The user opens Supabase Studio → SQL Editor → pastes the contents of `20260429000000_admin_count_distinct.sql` → runs.

Sanity check (run in same SQL Editor session):

```sql
select public.count_questions_distinct('round');
select public.count_questions_distinct('category');
-- the next call should error with "access denied" since SQL Editor session usually runs as service_role/postgres, not as authenticated user with profiles row.
-- Skip this check unless logged in via app, or temporarily comment out the gate to verify shape only.
```

Both `count_questions_distinct` calls should return positive integers (>= 1).

- [ ] **Step 5: Commit**

```bash
git add vet-exam-ai/supabase/migrations/20260429000000_admin_count_distinct.sql vet-exam-ai/lib/supabase/types.ts
git commit -m "admin: add count_questions_distinct + get_questions_filter_options RPCs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `requireAdmin()` server helper

**Files:**
- Create: `vet-exam-ai/lib/admin/guards.ts`

- [ ] **Step 1: Write the helper**

Create `vet-exam-ai/lib/admin/guards.ts`:

```ts
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../supabase/server";
import type { Database } from "../supabase/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * Server-side admin gate. Redirects on any failure path:
 *  - signed out → /auth/login?next=/admin
 *  - non-admin / inactive / missing profile → /dashboard (silent)
 * Returns the authenticated user + their profile on success.
 *
 * Call once in app/admin/layout.tsx; child pages inherit the gate.
 */
export async function requireAdmin(): Promise<{ user: User; profile: ProfileRow }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || !profile.is_active) {
    redirect("/dashboard");
  }

  return { user, profile };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/admin/guards.ts
git commit -m "admin: add requireAdmin() server-side gate helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `getFilterOptions()` cached RPC wrapper

**Files:**
- Create: `vet-exam-ai/lib/admin/filter-options.ts`

- [ ] **Step 1: Write the wrapper**

Create `vet-exam-ai/lib/admin/filter-options.ts`:

```ts
import { cache } from "react";
import { createClient } from "../supabase/server";

export type FilterOptions = {
  rounds: number[];
  years: number[];
  sessions: number[];
  subjects: string[];
  categories: string[];
};

const FALLBACK: FilterOptions = {
  rounds: [],
  years: [],
  sessions: [],
  subjects: [],
  categories: [],
};

/**
 * Per-request cached call to `get_questions_filter_options` RPC.
 * Returns FALLBACK (empty arrays) on RPC error so the page renders
 * even if the RPC fails — admin still sees the filter UI without options.
 */
export const getFilterOptions = cache(async (): Promise<FilterOptions> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_questions_filter_options");
  if (error || !data) return FALLBACK;
  const o = data as FilterOptions;
  return {
    rounds: o.rounds ?? [],
    years: o.years ?? [],
    sessions: o.sessions ?? [],
    subjects: o.subjects ?? [],
    categories: o.categories ?? [],
  };
});
```

- [ ] **Step 2: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/admin/filter-options.ts
git commit -m "admin: add getFilterOptions() cached RPC wrapper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Search-param parser

**Files:**
- Create: `vet-exam-ai/app/admin/questions/_lib/parse-search-params.ts`

- [ ] **Step 1: Write the parser**

Create `vet-exam-ai/app/admin/questions/_lib/parse-search-params.ts`:

```ts
export type SortKey = "recent" | "round" | "kvle";

export type ParsedSearchParams = {
  page: number;
  sort: SortKey;
  round?: number;
  year?: number;
  session?: number;
  subject?: string;
  category?: string;
  is_active?: boolean;
  q?: string;
};

const SORT_KEYS = new Set<SortKey>(["recent", "round", "kvle"]);

// Allow letters (any script, incl. Hangul/CJK), digits, hyphen, space.
const Q_RE = /^[\p{L}\p{N}\s\-]+$/u;

function int(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function nonEmpty(v: string | undefined, max = 100): string | undefined {
  if (!v) return undefined;
  const trimmed = v.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseAdminQuestionsSearchParams(
  raw: { [key: string]: string | string[] | undefined }
): ParsedSearchParams {
  const get = (k: string): string | undefined => {
    const v = raw[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const pageRaw = int(get("page")) ?? 1;
  const page = Math.max(1, pageRaw);

  const sortRaw = get("sort") as SortKey | undefined;
  const sort: SortKey = sortRaw && SORT_KEYS.has(sortRaw) ? sortRaw : "recent";

  const round = int(get("round"));
  const year = int(get("year"));
  const session = int(get("session"));
  const subject = nonEmpty(get("subject"));
  const category = nonEmpty(get("category"));

  const isActiveRaw = get("is_active");
  let is_active: boolean | undefined;
  if (isActiveRaw === "active") is_active = true;
  else if (isActiveRaw === "inactive") is_active = false;

  const qRaw = nonEmpty(get("q"));
  const q = qRaw && Q_RE.test(qRaw) ? qRaw : undefined;

  return { page, sort, round, year, session, subject, category, is_active, q };
}

/**
 * Build a query string from a partial set of params.
 * Used for filter/sort/pager links to preserve other params.
 */
export function buildSearchString(
  current: ParsedSearchParams,
  override: Partial<Record<keyof ParsedSearchParams, string | number | boolean | undefined>>
): string {
  const out = new URLSearchParams();
  const merged: Record<string, string> = {};

  function set(k: string, v: string | number | boolean | undefined) {
    if (v === undefined || v === "" ) return;
    merged[k] = String(v);
  }

  set("page", current.page);
  set("sort", current.sort);
  set("round", current.round);
  set("year", current.year);
  set("session", current.session);
  set("subject", current.subject);
  set("category", current.category);
  if (current.is_active === true) merged.is_active = "active";
  else if (current.is_active === false) merged.is_active = "inactive";
  set("q", current.q);

  for (const [k, v] of Object.entries(override)) {
    if (v === undefined || v === null || v === "") {
      delete merged[k];
    } else if (k === "is_active") {
      merged[k] = v === true ? "active" : v === false ? "inactive" : String(v);
    } else {
      merged[k] = String(v);
    }
  }

  // omit defaults to keep URLs clean
  if (merged.page === "1") delete merged.page;
  if (merged.sort === "recent") delete merged.sort;

  for (const [k, v] of Object.entries(merged)) out.set(k, v);
  const s = out.toString();
  return s ? `?${s}` : "";
}
```

- [ ] **Step 2: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/admin/questions/_lib/parse-search-params.ts
git commit -m "admin: add admin-questions search-param parser + URL builder

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Shared admin nav items config

**Files:**
- Create: `vet-exam-ai/app/admin/_components/admin-nav-items.ts`

- [ ] **Step 1: Write the shared config**

Create `vet-exam-ai/app/admin/_components/admin-nav-items.ts`:

```ts
import {
  LayoutDashboard,
  FileText,
  Users,
  GraduationCap,
  Flag,
  History,
  type LucideIcon,
} from "lucide-react";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
};

// Keep this in sync between desktop sidebar and mobile drawer.
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { label: "대시보드", href: "/admin",            icon: LayoutDashboard },
  { label: "문제",      href: "/admin/questions",  icon: FileText },
  { label: "회원",      href: "/admin/users",      icon: Users,         disabled: true },
  { label: "시험",      href: "/admin/exams",      icon: GraduationCap, disabled: true },
  { label: "신고",      href: "/admin/moderation", icon: Flag,          disabled: true },
  { label: "감사",      href: "/admin/audit",      icon: History,       disabled: true },
];

export function isAdminNavActive(activeHref: string, itemHref: string): boolean {
  if (activeHref === itemHref) return true;
  // /admin must not match every /admin/* — only exact
  if (itemHref === "/admin") return false;
  return activeHref.startsWith(itemHref);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/admin/_components/admin-nav-items.ts
git commit -m "admin: shared nav items config (sidebar + drawer DRY)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Desktop sidebar

**Files:**
- Create: `vet-exam-ai/app/admin/_components/admin-sidebar.tsx`

- [ ] **Step 1: Write the sidebar**

Create `vet-exam-ai/app/admin/_components/admin-sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ADMIN_NAV_ITEMS, isAdminNavActive } from "./admin-nav-items";

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden md:flex md:flex-col md:w-56 md:shrink-0"
      style={{
        borderRight: "1px solid var(--rule)",
        background: "var(--bg)",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      <div className="px-4 py-5">
        <div
          className="text-xs uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          운영자 콘솔
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        {ADMIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isAdminNavActive(pathname, item.href);

          if (item.disabled) {
            return (
              <span
                key={item.href}
                aria-disabled
                title="다음 단계에서 활성화됩니다"
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm cursor-not-allowed opacity-50"
                style={{ color: "var(--text-muted)" }}
              >
                <Icon size={15} />
                {item.label}
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors"
              style={{
                color: active ? "var(--teal)" : "var(--text-muted)",
                background: active ? "var(--teal-dim)" : "transparent",
                textDecoration: "none",
              }}
            >
              <Icon size={15} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div
        className="mt-auto p-3"
        style={{ borderTop: "1px solid var(--rule)" }}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-xs"
          style={{ color: "var(--text-muted)", textDecoration: "none" }}
        >
          <ArrowLeft size={13} />
          일반 사이트로
        </Link>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/admin/_components/admin-sidebar.tsx
git commit -m "admin: desktop sidebar (client; usePathname for active state)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Mobile drawer

**Files:**
- Create: `vet-exam-ai/app/admin/_components/admin-mobile-drawer.tsx`

- [ ] **Step 1: Write the drawer**

Create `vet-exam-ai/app/admin/_components/admin-mobile-drawer.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowLeft } from "lucide-react";
import { ADMIN_NAV_ITEMS, isAdminNavActive } from "./admin-nav-items";

export function AdminMobileDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center justify-center"
        style={{
          width: "44px",
          height: "44px",
          color: "var(--text-muted)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
        aria-label="운영 메뉴 열기"
      >
        <Menu size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute left-0 top-0 bottom-0 w-64 flex flex-col"
            style={{ background: "var(--bg)", borderRight: "1px solid var(--rule)" }}
          >
            <div className="flex items-center justify-between px-4 py-4">
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--text)" }}
              >
                운영자 콘솔
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex flex-col gap-0.5 px-2">
              {ADMIN_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isAdminNavActive(pathname, item.href);

                if (item.disabled) {
                  return (
                    <span
                      key={item.href}
                      aria-disabled
                      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm cursor-not-allowed opacity-50"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <Icon size={15} />
                      {item.label}
                    </span>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium"
                    style={{
                      color: active ? "var(--teal)" : "var(--text-muted)",
                      background: active ? "var(--teal-dim)" : "transparent",
                      textDecoration: "none",
                    }}
                  >
                    <Icon size={15} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div
              className="mt-auto p-3"
              style={{ borderTop: "1px solid var(--rule)" }}
            >
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-xs"
                style={{ color: "var(--text-muted)", textDecoration: "none" }}
              >
                <ArrowLeft size={13} />
                일반 사이트로
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/admin/_components/admin-mobile-drawer.tsx
git commit -m "admin: mobile hamburger drawer (client component)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `/admin` layout — auth gate + shell

**Files:**
- Create: `vet-exam-ai/app/admin/layout.tsx`

- [ ] **Step 1: Write the layout**

Create `vet-exam-ai/app/admin/layout.tsx`:

```tsx
import { requireAdmin } from "../../lib/admin/guards";
import { AdminSidebar } from "./_components/admin-sidebar";
import { AdminMobileDrawer } from "./_components/admin-mobile-drawer";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      <AdminSidebar />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile-only top bar with hamburger */}
        <header
          className="flex md:hidden items-center justify-between px-4 py-2"
          style={{ borderBottom: "1px solid var(--rule)", background: "var(--bg)" }}
        >
          <AdminMobileDrawer />
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--text)" }}
          >
            운영자 콘솔
          </span>
          <span style={{ width: 44 }} aria-hidden />
        </header>

        <main className="flex-1 min-w-0 px-4 md:px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
```

> Both `<AdminSidebar />` and `<AdminMobileDrawer />` are client components that call `usePathname()` directly for active state. The layout itself stays a server component (so `requireAdmin()` runs server-side); it only mounts the two client islands.

- [ ] **Step 2: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/admin/layout.tsx
git commit -m "admin: layout with requireAdmin gate + sidebar/drawer shell

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `/admin` dashboard hub page

**Files:**
- Create: `vet-exam-ai/app/admin/page.tsx`

- [ ] **Step 1: Write the dashboard**

Create `vet-exam-ai/app/admin/page.tsx`:

```tsx
import Link from "next/link";
import { FileText, Layers, Hash, CheckCircle2, Users, GraduationCap, Flag, History } from "lucide-react";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

type CountResult = number | null;

async function loadCounts(): Promise<{
  total: CountResult;
  active: CountResult;
  rounds: CountResult;
  categories: CountResult;
}> {
  const supabase = await createClient();

  const [total, active, rounds, categories] = await Promise.all([
    supabase.from("questions").select("*", { count: "exact", head: true }),
    supabase.from("questions").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.rpc("count_questions_distinct", { col: "round" }),
    supabase.rpc("count_questions_distinct", { col: "category" }),
  ]);

  return {
    total: total.error ? null : total.count ?? 0,
    active: active.error ? null : active.count ?? 0,
    rounds: rounds.error ? null : (rounds.data as number | null) ?? 0,
    categories: categories.error ? null : (categories.data as number | null) ?? 0,
  };
}

function CountCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: CountResult;
  icon: React.ComponentType<{ size?: number }>;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
    >
      <div
        className="flex items-center gap-2 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <Icon size={13} />
        {label}
      </div>
      <div
        className="mt-2 text-2xl font-semibold kvle-mono"
        style={{ color: value == null ? "var(--text-muted)" : "var(--text)" }}
      >
        {value == null ? "—" : value.toLocaleString("ko-KR")}
      </div>
    </div>
  );
}

function HubCard({
  href,
  label,
  desc,
  icon: Icon,
  disabled,
}: {
  href: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number }>;
  disabled?: boolean;
}) {
  const inner = (
    <div
      className="rounded-lg p-4 h-full"
      style={{
        background: "var(--surface-raised)",
        border: "1px solid var(--rule)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <div
        className="flex items-center gap-2 text-sm font-semibold"
        style={{ color: disabled ? "var(--text-muted)" : "var(--text)" }}
      >
        <Icon size={15} />
        {label}
      </div>
      <p
        className="mt-2 text-xs leading-relaxed"
        style={{ color: "var(--text-muted)" }}
      >
        {desc}
      </p>
      {disabled && (
        <span
          className="mt-3 inline-block text-[10px] uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          다음 단계 예정
        </span>
      )}
    </div>
  );

  if (disabled) return <div aria-disabled>{inner}</div>;
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      {inner}
    </Link>
  );
}

export default async function AdminDashboardPage() {
  const counts = await loadCounts();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          대시보드
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          오늘의 운영 점검
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CountCard label="총 문제"     value={counts.total}      icon={FileText} />
        <CountCard label="활성 문제"   value={counts.active}     icon={CheckCircle2} />
        <CountCard label="회차"         value={counts.rounds}     icon={Hash} />
        <CountCard label="카테고리"     value={counts.categories} icon={Layers} />
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-muted)" }}>
          관리 영역
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <HubCard
            href="/admin/questions"
            label="문제 관리"
            desc="문제 은행 둘러보기, 회차/과목/카테고리 필터, KVLE-ID 검색."
            icon={FileText}
          />
          <HubCard href="#" label="회원 관리" desc="역할/활성 상태 변경, 뱃지 부여." icon={Users} disabled />
          <HubCard href="#" label="시험 회차" desc="회차별 문제 수/공개 상태 집계." icon={GraduationCap} disabled />
          <HubCard href="#" label="신고/정정" desc="댓글 신고 큐, 문제 정정 제안 처리." icon={Flag} disabled />
          <HubCard href="#" label="감사 로그" desc="모든 운영 작업 기록." icon={History} disabled />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/admin/page.tsx
git commit -m "admin: dashboard hub (4 counts + entry cards)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Admin questions filters bar

**Files:**
- Create: `vet-exam-ai/app/admin/_components/admin-questions-filters.tsx`

- [ ] **Step 1: Write the filters component**

Create `vet-exam-ai/app/admin/_components/admin-questions-filters.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import type { FilterOptions } from "../../../lib/admin/filter-options";
import {
  buildSearchString,
  type ParsedSearchParams,
  type SortKey,
} from "../questions/_lib/parse-search-params";

export function AdminQuestionsFilters({
  current,
  options,
}: {
  current: ParsedSearchParams;
  options: FilterOptions;
}) {
  const router = useRouter();
  const [qInput, setQInput] = useState(current.q ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local input when URL q changes (e.g., back/forward).
  useEffect(() => {
    setQInput(current.q ?? "");
  }, [current.q]);

  function navigate(override: Partial<Record<keyof ParsedSearchParams, string | number | boolean | undefined>>) {
    // Reset page to 1 whenever filter/sort/search changes.
    const next = buildSearchString(current, { ...override, page: 1 });
    router.replace(`/admin/questions${next}`);
  }

  function onQChange(v: string) {
    setQInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      navigate({ q: v.trim() === "" ? undefined : v.trim() });
    }, 300);
  }

  function reset() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQInput("");
    router.replace("/admin/questions");
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--bg)",
    border: "1px solid var(--rule)",
    color: "var(--text)",
    borderRadius: "6px",
    padding: "6px 10px",
    fontSize: "13px",
    minWidth: "120px",
  };

  return (
    <div
      className="rounded-lg p-3 mb-4 flex flex-wrap items-center gap-2"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
    >
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search size={13} style={{ position: "absolute", left: 10, top: 9, color: "var(--text-muted)" }} />
        <input
          type="text"
          value={qInput}
          onChange={(e) => onQChange(e.target.value)}
          placeholder="KVLE-ID 또는 문제 본문 검색"
          aria-label="검색"
          style={{ ...inputStyle, paddingLeft: 28, width: "100%" }}
        />
      </div>

      <select
        value={current.round ?? ""}
        onChange={(e) => navigate({ round: e.target.value || undefined })}
        aria-label="회차"
        style={inputStyle}
      >
        <option value="">회차</option>
        {options.rounds.map((r) => (
          <option key={r} value={r}>{r}회</option>
        ))}
      </select>

      <select
        value={current.year ?? ""}
        onChange={(e) => navigate({ year: e.target.value || undefined })}
        aria-label="연도"
        style={inputStyle}
      >
        <option value="">연도</option>
        {options.years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      <select
        value={current.session ?? ""}
        onChange={(e) => navigate({ session: e.target.value || undefined })}
        aria-label="교시"
        style={inputStyle}
      >
        <option value="">교시</option>
        {options.sessions.map((s) => (
          <option key={s} value={s}>{s}교시</option>
        ))}
      </select>

      <select
        value={current.subject ?? ""}
        onChange={(e) => navigate({ subject: e.target.value || undefined })}
        aria-label="과목"
        style={inputStyle}
      >
        <option value="">과목</option>
        {options.subjects.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <select
        value={current.category ?? ""}
        onChange={(e) => navigate({ category: e.target.value || undefined })}
        aria-label="카테고리"
        style={inputStyle}
      >
        <option value="">카테고리</option>
        {options.categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <select
        value={
          current.is_active === true
            ? "active"
            : current.is_active === false
            ? "inactive"
            : ""
        }
        onChange={(e) => navigate({ is_active: e.target.value || undefined })}
        aria-label="활성 상태"
        style={inputStyle}
      >
        <option value="">활성 상태</option>
        <option value="active">활성</option>
        <option value="inactive">비활성</option>
      </select>

      <select
        value={current.sort}
        onChange={(e) => navigate({ sort: e.target.value as SortKey })}
        aria-label="정렬"
        style={inputStyle}
      >
        <option value="recent">등록일 ↓</option>
        <option value="round">회차 ↑</option>
        <option value="kvle">KVLE-ID ↑</option>
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

- [ ] **Step 2: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/admin/_components/admin-questions-filters.tsx
git commit -m "admin: questions filters bar (URL-synced, 300ms debounce)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Admin questions table

**Files:**
- Create: `vet-exam-ai/app/admin/_components/admin-questions-table.tsx`

- [ ] **Step 1: Write the table**

Create `vet-exam-ai/app/admin/_components/admin-questions-table.tsx`:

```tsx
import Link from "next/link";

export type AdminQuestionRow = {
  id: string;
  public_id: string;
  round: number | null;
  session: number | null;
  year: number | null;
  subject: string | null;
  category: string;
  question: string;
  answer: string;
  choices: string[];
  is_active: boolean;
  created_at: string;
};

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

function formatRoundSession(round: number | null, session: number | null): string {
  if (round == null && session == null) return "—";
  const r = round == null ? "" : `${round}회`;
  const s = session == null ? "" : `${session}교시`;
  return [r, s].filter(Boolean).join(" · ");
}

function answerNumber(answer: string, choices: string[]): string {
  // answer is the literal correct choice string; render as 1..N + first 30 chars.
  const idx = choices.findIndex((c) => c === answer);
  if (idx < 0) return truncate(answer, 30);
  return `${idx + 1}. ${truncate(answer, 28)}`;
}

function formatKoreanDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AdminQuestionsTable({ rows }: { rows: AdminQuestionRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg p-10 text-center text-sm"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)", color: "var(--text-muted)" }}
      >
        조건에 맞는 문제가 없습니다.{" "}
        <Link href="/admin/questions" style={{ color: "var(--teal)", textDecoration: "underline" }}>
          필터 초기화
        </Link>
      </div>
    );
  }

  const cell: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: "13px",
    borderBottom: "1px solid var(--rule)",
    verticalAlign: "top",
  };

  const head: React.CSSProperties = {
    ...cell,
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    background: "var(--surface-raised)",
    borderBottom: "1px solid var(--rule)",
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
            <th style={head}>KVLE-ID</th>
            <th style={head}>회차/교시</th>
            <th style={head}>과목</th>
            <th style={head}>카테고리</th>
            <th style={head}>문제</th>
            <th style={head}>정답</th>
            <th style={head}>활성</th>
            <th style={head}>등록일</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ background: "var(--bg)" }}>
              <td style={{ ...cell, whiteSpace: "nowrap" }}>
                <Link
                  href={`/admin/questions/${encodeURIComponent(r.id)}`}
                  className="kvle-mono"
                  style={{ color: "var(--teal)", textDecoration: "none" }}
                >
                  {r.public_id}
                </Link>
              </td>
              <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                {formatRoundSession(r.round, r.session)}
              </td>
              <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                {r.subject ?? "—"}
              </td>
              <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                {r.category}
              </td>
              <td style={{ ...cell, color: "var(--text)" }}>{truncate(r.question, 80)}</td>
              <td style={{ ...cell, color: "var(--text-muted)" }}>
                {answerNumber(r.answer, r.choices)}
              </td>
              <td style={{ ...cell, whiteSpace: "nowrap" }}>
                <span
                  className="inline-block rounded-full text-[10px] font-medium"
                  style={{
                    padding: "2px 8px",
                    background: r.is_active ? "var(--teal-dim)" : "var(--surface-raised)",
                    color: r.is_active ? "var(--teal)" : "var(--text-muted)",
                    border: r.is_active ? "none" : "1px solid var(--rule)",
                  }}
                >
                  {r.is_active ? "활성" : "비활성"}
                </span>
              </td>
              <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                {formatKoreanDate(r.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/admin/_components/admin-questions-table.tsx
git commit -m "admin: questions table (server component)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Admin questions pager

**Files:**
- Create: `vet-exam-ai/app/admin/_components/admin-questions-pager.tsx`

- [ ] **Step 1: Write the pager**

Create `vet-exam-ai/app/admin/_components/admin-questions-pager.tsx`:

```tsx
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildSearchString,
  type ParsedSearchParams,
} from "../questions/_lib/parse-search-params";

export function AdminQuestionsPager({
  current,
  totalPages,
}: {
  current: ParsedSearchParams;
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

  const prevHref = `/admin/questions${buildSearchString(current, { page: prev })}`;
  const nextHref = `/admin/questions${buildSearchString(current, { page: next })}`;

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

- [ ] **Step 2: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/admin/_components/admin-questions-pager.tsx
git commit -m "admin: questions pager (URL-preserving prev/next)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: `/admin/questions` list page

**Files:**
- Create: `vet-exam-ai/app/admin/questions/page.tsx`

- [ ] **Step 1: Write the list page**

Create `vet-exam-ai/app/admin/questions/page.tsx`:

```tsx
import { createClient } from "../../../lib/supabase/server";
import { getFilterOptions } from "../../../lib/admin/filter-options";
import { AdminQuestionsFilters } from "../_components/admin-questions-filters";
import { AdminQuestionsTable, type AdminQuestionRow } from "../_components/admin-questions-table";
import { AdminQuestionsPager } from "../_components/admin-questions-pager";
import {
  parseAdminQuestionsSearchParams,
  type ParsedSearchParams,
  type SortKey,
} from "./_lib/parse-search-params";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const SORT_MAP: Record<SortKey, { col: string; ascending: boolean }> = {
  recent: { col: "created_at", ascending: false },
  round:  { col: "round",      ascending: true  },
  kvle:   { col: "public_id",  ascending: true  },
};

async function loadQuestions(
  sp: ParsedSearchParams
): Promise<{ rows: AdminQuestionRow[]; total: number }> {
  const supabase = await createClient();
  let q = supabase
    .from("questions")
    .select(
      "id, public_id, round, session, year, subject, category, question, answer, choices, is_active, created_at",
      { count: "exact" }
    );

  if (sp.round != null)    q = q.eq("round",    sp.round);
  if (sp.year != null)     q = q.eq("year",     sp.year);
  if (sp.session != null)  q = q.eq("session",  sp.session);
  if (sp.subject)          q = q.eq("subject",  sp.subject);
  if (sp.category)         q = q.eq("category", sp.category);
  if (sp.is_active != null) q = q.eq("is_active", sp.is_active);
  if (sp.q) {
    // sp.q is already sanitized (alnum/Korean/space/hyphen, max 100 chars).
    q = q.or(`public_id.ilike.%${sp.q}%,question.ilike.%${sp.q}%`);
  }

  const { col, ascending } = SORT_MAP[sp.sort];
  const offset = (sp.page - 1) * PAGE_SIZE;
  const { data, count, error } = await q
    .order(col, { ascending })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error || !data) return { rows: [], total: 0 };
  return { rows: data as AdminQuestionRow[], total: count ?? 0 };
}

export default async function AdminQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = await searchParams;
  const sp = parseAdminQuestionsSearchParams(raw);

  const [options, { rows, total }] = await Promise.all([
    getFilterOptions(),
    loadQuestions(sp),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Clamp current page if it exceeded totalPages (e.g., last item deleted on prior tab).
  const clampedPage = Math.min(sp.page, totalPages);
  const currentClamped: ParsedSearchParams = { ...sp, page: clampedPage };

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
            문제 관리
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            총 {total.toLocaleString("ko-KR")}건
          </p>
        </div>
      </header>

      <AdminQuestionsFilters current={currentClamped} options={options} />
      <AdminQuestionsTable rows={rows} />
      <AdminQuestionsPager current={currentClamped} totalPages={totalPages} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/admin/questions/page.tsx
git commit -m "admin: /admin/questions list page (filters + table + pager)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: `/admin/questions/[id]` detail page

**Files:**
- Create: `vet-exam-ai/app/admin/questions/[id]/page.tsx`

- [ ] **Step 1: Write the detail page**

Create `vet-exam-ai/app/admin/questions/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

function decodeMaybe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

type QuestionFull = {
  id: string;
  public_id: string;
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
  category: string;
  subject: string | null;
  topic: string | null;
  difficulty: string | null;
  source: string | null;
  year: number | null;
  session: number | null;
  round: number | null;
  community_notes: string | null;
  tags: string[] | null;
  is_active: boolean;
  created_at: string;
};

async function loadQuestion(rawId: string): Promise<QuestionFull | null> {
  const id = decodeMaybe(rawId);
  const supabase = await createClient();
  const { data } = await supabase
    .from("questions")
    .select("*")
    .or(`id.eq.${id},public_id.eq.${id}`)
    .limit(1)
    .maybeSingle();
  return (data as QuestionFull | null) ?? null;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="grid grid-cols-[120px_1fr] gap-3 py-2 text-sm"
      style={{ borderBottom: "1px solid var(--rule)" }}
    >
      <div style={{ color: "var(--text-muted)" }}>{label}</div>
      <div style={{ color: "var(--text)" }}>{value ?? "—"}</div>
    </div>
  );
}

export default async function AdminQuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const q = await loadQuestion(rawId);
  if (!q) notFound();

  const publicHref = `/questions/${encodeURIComponent(q.public_id ?? q.id)}`;

  const correctIndex = q.choices.findIndex((c) => c === q.answer);

  return (
    <div className="mx-auto max-w-3xl">
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

      <header className="mb-6">
        <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          문제 상세
        </div>
        <h1 className="mt-1 text-2xl font-semibold kvle-mono" style={{ color: "var(--text)" }}>
          {q.public_id}
        </h1>
      </header>

      <section
        className="rounded-lg p-5 mb-4"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
      >
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          운영 메타
        </h2>
        <MetaRow label="raw id" value={<span className="kvle-mono text-xs">{q.id}</span>} />
        <MetaRow label="회차" value={q.round != null ? `${q.round}회` : null} />
        <MetaRow label="교시" value={q.session != null ? `${q.session}교시` : null} />
        <MetaRow label="연도" value={q.year} />
        <MetaRow label="과목" value={q.subject} />
        <MetaRow label="카테고리" value={q.category} />
        <MetaRow label="토픽" value={q.topic} />
        <MetaRow label="난이도" value={q.difficulty} />
        <MetaRow label="출처" value={q.source} />
        <MetaRow label="태그" value={q.tags && q.tags.length > 0 ? q.tags.join(", ") : null} />
        <MetaRow
          label="상태"
          value={q.is_active ? <span style={{ color: "var(--teal)" }}>활성</span> : <span style={{ color: "var(--text-muted)" }}>비활성</span>}
        />
        <MetaRow label="등록일" value={new Date(q.created_at).toLocaleString("ko-KR")} />
      </section>

      <section
        className="rounded-lg p-5 mb-4"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
      >
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          문제
        </h2>
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text)" }}>
          {q.question}
        </p>
      </section>

      <section
        className="rounded-lg p-5 mb-4"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
      >
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          선지
        </h2>
        <ol className="space-y-1.5 text-sm" style={{ color: "var(--text)" }}>
          {q.choices.map((c, i) => {
            const isCorrect = i === correctIndex;
            return (
              <li
                key={i}
                className="rounded px-3 py-2 flex items-start gap-2"
                style={{
                  background: isCorrect ? "var(--teal-dim)" : "transparent",
                  border: isCorrect ? "1px solid var(--teal)" : "1px solid var(--rule)",
                }}
              >
                <span
                  className="kvle-mono text-xs"
                  style={{ color: isCorrect ? "var(--teal)" : "var(--text-muted)", minWidth: 20 }}
                >
                  {i + 1}.
                </span>
                <span style={{ color: "var(--text)" }}>{c}</span>
                {isCorrect && (
                  <span
                    className="ml-auto text-[10px] font-medium"
                    style={{ color: "var(--teal)" }}
                  >
                    정답
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section
        className="rounded-lg p-5 mb-4"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
      >
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          해설
        </h2>
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text)" }}>
          {q.explanation || "—"}
        </p>
      </section>

      {q.community_notes && (
        <section
          className="rounded-lg p-5"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
        >
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            커뮤니티 노트 (vet40)
          </h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>
            {q.community_notes}
          </p>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/admin/questions/[id]/page.tsx
git commit -m "admin: /admin/questions/[id] detail page (full operator view)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: `useMyRole` client hook

**Files:**
- Create: `vet-exam-ai/lib/hooks/useMyRole.ts`

- [ ] **Step 1: Write the hook**

Create `vet-exam-ai/lib/hooks/useMyRole.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { createClient } from "../supabase/client";

type Role = "user" | "reviewer" | "admin";

export type MyRoleState = { role: Role; isActive: boolean } | null;

/**
 * Fetches the signed-in user's role + active flag from `profiles`.
 * Returns null while loading, signed out, or if the profile row is missing.
 *
 * Used by NavBar to gate the admin pill.
 */
export function useMyRole(): MyRoleState {
  const [state, setState] = useState<MyRoleState>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setState(null);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setState(null);
        return;
      }
      setState({ role: data.role, isActive: data.is_active });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/hooks/useMyRole.ts
git commit -m "admin: useMyRole client hook (NavBar pill gate)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: NavBar admin pill

**Files:**
- Modify: `vet-exam-ai/components/NavBar.tsx`

- [ ] **Step 1: Add imports**

In `vet-exam-ai/components/NavBar.tsx`, locate the existing import block (top of file). Update the import for `useMyNickname` to also bring in `useMyRole`, and add `Shield` to the lucide-react import:

Change:
```ts
import { useMyNickname } from "../lib/hooks/useMyNickname";
import { LogOut, BookOpen, BarChart3, RotateCcw, PenTool, User, CirclePlay, ListChecks } from "lucide-react";
```

to:
```ts
import { useMyNickname } from "../lib/hooks/useMyNickname";
import { useMyRole } from "../lib/hooks/useMyRole";
import { LogOut, BookOpen, BarChart3, RotateCcw, PenTool, User, CirclePlay, ListChecks, Shield } from "lucide-react";
```

- [ ] **Step 2: Read role inside component**

In `NavBar()` body, locate `const myNickname = useMyNickname();` and add immediately below:

```ts
const myRole = useMyRole();
const isAdmin = myRole?.role === "admin" && myRole.isActive;
```

- [ ] **Step 3: Insert admin pill before the user nickname pill**

Locate the block that renders the user nickname/email pill. It looks like:

```tsx
{!loading && (
  user ? (
    <div className="flex items-center gap-2">
      {myNickname ? (
        <Link
          href={`/profile/${encodeURIComponent(myNickname)}`}
          ...
```

Insert an admin pill **inside** the `<div className="flex items-center gap-2">` block, **before** the existing `{myNickname ? ... : ...}` ternary:

```tsx
{isAdmin && (
  <Link
    href="/admin"
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold no-underline"
    style={{
      background: "var(--teal-dim)",
      color: "var(--teal)",
      border: "1px solid var(--teal)",
      textDecoration: "none",
    }}
    title="운영자 콘솔"
  >
    <Shield size={13} />
    <span>운영</span>
  </Link>
)}
```

The final structure of that block should be:

```tsx
<div className="flex items-center gap-2">
  {isAdmin && (
    <Link href="/admin" ...> ... 운영 ... </Link>
  )}
  {myNickname ? (
    <Link ...>...</Link>
  ) : (
    <div ...>...</div>
  )}
  <button onClick={handleSignOut} ...>...</button>
</div>
```

- [ ] **Step 4: Typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add vet-exam-ai/components/NavBar.tsx
git commit -m "navbar: admin pill (visible only for active admins)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Build + manual smoke pass

**Files:** None (verification)

- [ ] **Step 1: Full typecheck pass**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0 (no new errors compared to Task 0 baseline).

- [ ] **Step 2: Full build**

Run: `cd vet-exam-ai && npm run build`
Expected: build succeeds. Note any new warnings.

- [ ] **Step 3: Dev server smoke**

Run: `cd vet-exam-ai && npm run dev` (in a separate terminal)

Open http://localhost:3000 in browser. Run through this checklist (record pass/fail for each):

- [ ] Logged-out user navigates to `/admin` → redirects to `/auth/login?next=/admin`
- [ ] After logging in as a non-admin user → `/admin` → redirects to `/dashboard`
- [ ] After logging in as admin (operator account) → `/admin` shows the dashboard with 4 count cards filled in
- [ ] Admin sees "운영" pill in NavBar; non-admin does not
- [ ] `/admin/questions` shows 50 rows + "총 N건" + filters bar
- [ ] Pick a category from the filter dropdown → URL updates to `?category=…`, list reloads
- [ ] Pick a round → URL `?round=…&category=…`, list reloads
- [ ] Toggle sort to "회차 ↑" → URL `?sort=round`, ordering changes
- [ ] Type "KVLE" in search → 300ms later URL `?q=KVLE…`, list reloads
- [ ] Click "초기화" → URL becomes `/admin/questions`, all filters clear
- [ ] Click pager "다음" → URL `?page=2`, second page loads
- [ ] Click a row → `/admin/questions/{id}` detail loads with full meta + 회차/교시/연도 visible
- [ ] Click "공개 페이지로 이동" → opens `/questions/{public_id}` in new tab
- [ ] Click "← 목록으로" → returns to `/admin/questions` (filters preserved via browser history)
- [ ] Resize to narrow viewport → sidebar hidden, hamburger button visible
- [ ] Tap hamburger → drawer slides in; tap a nav item → drawer closes; ESC also closes
- [ ] Click a disabled nav item (회원/시험/신고/감사) → no navigation, cursor "not-allowed"
- [ ] Open `/admin/questions/{korean-raw-id}` (e.g., `2.4_공보_57회_q001`) — manually URL-encoded if the browser doesn't auto-encode → loads same row as KVLE counterpart

If any item fails, fix in place + add a verification commit before continuing.

- [ ] **Step 4: Final commit (only if hot-fixes were applied during smoke)**

```bash
# only if changes were made during Step 3
git add <changed files>
git commit -m "admin: PR-A smoke pass fixes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Push branch + open PR

**Files:** None (release)

- [ ] **Step 1: Verify clean tree**

Run: `git status`
Expected: clean working tree on `feat/admin-questions-readonly-pra`.

- [ ] **Step 2: Push branch**

Run: `git push -u origin feat/admin-questions-readonly-pra`
Expected: branch published, no errors.

- [ ] **Step 3: Open PR**

Run:
```bash
gh pr create --title "M3 §18 admin questions read-only (PR-A)" --body "$(cat <<'EOF'
## Summary

- `/admin` 운영자 콘솔 1차 PR. 권한 게이트 + 사이드바 셸 + 대시보드 hub + 문제 목록(필터/정렬/페이지네이션) + 어드민 전용 상세 (모두 read-only).
- 마이그레이션 1건: `count_questions_distinct` + `get_questions_filter_options` RPC. 후자는 함수 내부 admin 체크로 회차/연도 누설 방지.
- NavBar에 admin 전용 "운영" pill 추가 (`useMyRole` 훅).

## Out of scope (PR-B 이후)

- 문제 생성/수정 form, RLS write 정책, `admin_audit_logs` 기록 헬퍼
- 정정 제안 카운트/처리 큐, 회원/시험/신고/감사 페이지

## Test plan

- [ ] 비로그인 → /admin → /auth/login 리다이렉트
- [ ] user/reviewer → /admin → /dashboard 리다이렉트 (silent)
- [ ] admin → /admin 대시보드 카운트 4 표시
- [ ] admin NavBar에만 "운영" pill 노출
- [ ] /admin/questions 필터/정렬/페이지네이션 URL 동기화
- [ ] /admin/questions/[id] KVLE + raw 한글 id 양쪽 매치
- [ ] "공개 페이지로 이동" → KVLE 라우트 새 탭
- [ ] 모바일 햄버거 drawer 열림/닫힘/ESC

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 4: Apply migration on production (manual)**

The user opens Supabase Studio (production project) → SQL Editor → pastes contents of `vet-exam-ai/supabase/migrations/20260429000000_admin_count_distinct.sql` → runs → confirms no errors.

> Optional: if Vercel preview is configured to use a dedicated DB, apply the migration there too before merging.

- [ ] **Step 5: Hand-off note**

Print the PR URL to the user. Note that merging requires the migration step (4) to be done first.

---

## Self-Review Notes (author)

**Spec coverage check:**
- Decisions 1-8 from spec → Tasks 8 (layout), 9 (dashboard), 13 (questions list), 14 (detail), 15-16 (NavBar pill) ✓
- Migration RPCs → Task 1 ✓
- `requireAdmin` → Task 2 ✓
- `getFilterOptions` (React cache) → Task 3 ✓
- Search-param sanitize + URL builder → Task 4 ✓
- Sidebar/drawer DRY config → Task 5 ✓
- Sidebar (server) → Task 6 ✓
- Mobile drawer (client) → Task 7 ✓
- Filter bar URL sync + 300ms debounce → Task 10 ✓
- Table (KVLE link, truncate, status chip, Korean date) → Task 11 ✓
- Pager URL-preserving → Task 12 ✓
- Detail decode + or() match + public link → Task 14 ✓
- Verification scenarios → Task 17 ✓
- Migration application via SQL Editor (CLI db push trap) → Tasks 1, 18 ✓

**Type consistency:** `ParsedSearchParams`, `SortKey`, `FilterOptions`, `AdminQuestionRow`, `MyRoleState` are each defined once and imported by their consumers — no drift.

**Placeholder scan:** No "TBD"/"TODO" found. Every code step has full code.

**File budget delivered:** 15 created + 2 modified + 1 migration = matches spec budget (slightly above the brainstorm's 14 task estimate — extra task came from the shared `admin-nav-items.ts` to keep sidebar/drawer in sync).
