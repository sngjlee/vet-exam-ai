# Notifications MVP (M3 §17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a lightweight notifications UI — NavBar bell with unread badge (60s polling), dropdown listing the 10 most-recent notifications, click-through to a new `/questions/[id]` read-only page that auto-scrolls + ring-highlights the target comment.

**Architecture:** Backend = 4 API routes that wrap the existing `notifications` table (no SQL migrations; RLS + triggers already in place; LEFT JOIN `comments` to surface `question_id` for deep-links). Frontend = three new components under `components/notifications/` plus a new `app/questions/[id]/page.tsx` page that mounts a refactored read-only `<QuestionReadOnly>` and the existing `<CommentThread>` extended with a `highlightCommentId` prop. Polling lives in `<NotificationBell>`, count-only, visibility-aware.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Supabase (typed schema), zod, lucide-react. All already installed.

**Spec source:** `docs/superpowers/specs/2026-04-27-notifications-mvp-design.md` (commit `2d42cd3`).

**Branch:** `feat/notifications-mvp-v1` (already created off main commit `6a762db`).

**Implementer guardrails (학습 적용 — 이전 PR들의 함정 회피):**
- Run `git status` before any `git commit` — verify only intended files are staged.
- Use explicit paths (`git add path/to/file`); never `git add -A` / `git add .`.
- DO NOT `git push` from subagents. The orchestrator pushes once at the end.
- DO NOT modify files outside `vet-exam-ai/` (the Next.js app dir) unless the task explicitly says so.
- Working dir for this plan = `vet-exam-ai/` (the inner Next.js app dir, NOT repo root). Plan paths below are relative to that dir unless absolute.
- bash CWD trap: subagents that `cd vet-exam-ai` lock subsequent bash sessions inside; **always run shell commands as `cd vet-exam-ai && <cmd>` in a single line** so the cd is scoped to that one invocation. Orchestrator uses absolute paths for tool calls outside Bash.
- Typecheck command: `cd vet-exam-ai && npx tsc --noEmit; echo "EXIT=$?"` — empty output + `EXIT=0` = clean.
- Lint command (optional but useful): `cd vet-exam-ai && npm run lint`.
- LF/CRLF warning on commit (`LF will be replaced by CRLF`) is harmless on Windows.

**Codebase invariant — NO tests exist.** The project has shipped 16 PRs without a test framework. There is no `package.json` test script, no Vitest, no Jest. **Verification is via typecheck + production build + manual smoke through the running dev server.** This deviates from spec §13 (which specifies Vitest unit tests) — the spec's testing strategy is treated as a follow-up PR (`feat/test-infra-v1`) and is **explicitly out of scope for this plan**. Do NOT add a test framework as part of this plan.

---

## File Structure

| Path (relative to `vet-exam-ai/`) | Purpose | Task |
|---|---|---|
| `lib/notifications/format.ts` | NEW — pure `formatNotification(type, payload, related_comment) → { text, href }` for all 5 enum types | 1 |
| `app/api/notifications/route.ts` | NEW — `GET ?limit=10` returns notifications + JOINed comment metadata | 2 |
| `app/api/notifications/[id]/route.ts` | NEW — `PATCH` marks single notification read | 2 |
| `app/api/notifications/unread-count/route.ts` | NEW — `GET` count-only of unread | 2 |
| `app/api/notifications/mark-all-read/route.ts` | NEW — `POST` bulk mark read | 2 |
| `components/notifications/NotificationItem.tsx` | NEW — single row, unread visual cue, click → optimistic read + push | 3 |
| `components/notifications/NotificationDropdown.tsx` | NEW — popover panel, list fetch on open, mark-all-read button, outside-click + Esc close | 3 |
| `components/notifications/NotificationBell.tsx` | NEW — bell icon + badge, 60s visibility-aware polling, mounts Dropdown | 4 |
| `components/NavBar.tsx` | MODIFY — mount `<NotificationBell />` between user pill and other links | 5 |
| `components/comments/CommentItem.tsx` | MODIFY — add `id={`comment-${comment.id}`}` to root wrapper div | 6 |
| `components/comments/CommentThread.tsx` | MODIFY — accept optional `highlightCommentId` prop; effect scrolls + ring-highlights | 6 |
| `components/QuestionReadOnly.tsx` | NEW — read-only stem/choices/answer/explanation extracted from `QuestionCard` | 7 |
| `app/questions/[id]/page.tsx` | NEW — dynamic route; client component; mounts `<QuestionReadOnly>` + `<CommentThread>` | 7 |

Total: 11 new files, 3 modified.

---

## Task 0: Verify branch state

**Files:** none (git only)

- [ ] **Step 1: Confirm branch + clean tree**

```bash
git status
git rev-parse --abbrev-ref HEAD
git log -1 --oneline
```

Expected:
- `On branch feat/notifications-mvp-v1`
- working tree clean (or only the spec already committed at `2d42cd3`)
- HEAD on `2d42cd3` (spec commit) which is on top of main `6a762db`

If not on `feat/notifications-mvp-v1`, run `git switch feat/notifications-mvp-v1`. If branch missing, recreate from main: `git switch main && git pull --ff-only && git switch -c feat/notifications-mvp-v1`.

---

## Task 1: `formatNotification` pure function

**Files:**
- Create: `lib/notifications/format.ts`

**Why first:** It's a pure function with no dependencies; T3 (NotificationItem) imports it. Bug-free here removes one source of UI confusion later.

- [ ] **Step 1: Create the directory + file**

Path: `vet-exam-ai/lib/notifications/format.ts`

```ts
// Pure formatter for notification rows.
// Returns the display text + click-through href for each notification type.
// Both fields are always strings — caller treats href === '#' as no-op.

import type { Database } from "../supabase/types";

export type NotificationType = Database["public"]["Enums"]["notification_type"];

export type RelatedCommentLite = {
  id: string;
  question_id: string;
  parent_id: string | null;
} | null;

export type FormattedNotification = {
  text: string;
  href: string;
};

const NO_HREF = "#";

function buildCommentHref(rel: NonNullable<RelatedCommentLite>): string {
  return `/questions/${encodeURIComponent(rel.question_id)}?comment=${encodeURIComponent(rel.id)}`;
}

export function formatNotification(
  type: NotificationType,
  payload: Record<string, unknown>,
  related: RelatedCommentLite,
): FormattedNotification {
  // If the underlying comment is gone (cascade-deleted), every type degrades
  // to text-only — clicking the row does nothing.
  if (related == null) {
    return { text: textOnlyFallback(type, payload), href: NO_HREF };
  }

  const href = buildCommentHref(related);

  switch (type) {
    case "reply": {
      const nickname = stringField(payload, "actor_nickname") ?? "익명";
      return {
        text: `${nickname}님이 회원님의 댓글에 답글을 달았어요`,
        href,
      };
    }
    case "vote_milestone": {
      const milestone = numberField(payload, "milestone");
      const milestoneText = milestone != null ? String(milestone) : "여러";
      return {
        text: `회원님의 댓글이 ${milestoneText} 추천을 받았어요 🎉`,
        href,
      };
    }
    case "report_resolved": {
      const resolution = stringField(payload, "resolution");
      const text =
        resolution === "upheld"
          ? "신고하신 댓글이 처리되었어요"
          : resolution === "dismissed"
            ? "신고하신 댓글이 검토 결과 유지되었어요"
            : "신고하신 댓글의 검토가 완료되었어요";
      return { text, href };
    }
    // Triggers for these types do not exist yet — safe fallback so future
    // trigger additions render without code changes.
    case "comment_blinded":
      return { text: "회원님의 댓글이 블라인드 처리되었어요", href: NO_HREF };
    case "mention": {
      const nickname = stringField(payload, "actor_nickname") ?? "누군가";
      return { text: `${nickname}님이 회원님을 멘션했어요`, href: NO_HREF };
    }
    default: {
      // Exhaustiveness — TS surfaces this if a new enum value is added.
      const _exhaustive: never = type;
      void _exhaustive;
      return { text: "새 알림", href: NO_HREF };
    }
  }
}

function textOnlyFallback(
  type: NotificationType,
  payload: Record<string, unknown>,
): string {
  switch (type) {
    case "reply":
      return `${stringField(payload, "actor_nickname") ?? "익명"}님이 회원님의 댓글에 답글을 달았어요`;
    case "vote_milestone": {
      const milestone = numberField(payload, "milestone");
      return `회원님의 댓글이 ${milestone != null ? String(milestone) : "여러"} 추천을 받았어요 🎉`;
    }
    case "report_resolved":
      return "신고하신 댓글의 검토가 완료되었어요";
    case "comment_blinded":
      return "회원님의 댓글이 블라인드 처리되었어요";
    case "mention":
      return `${stringField(payload, "actor_nickname") ?? "누군가"}님이 회원님을 멘션했어요`;
  }
}

function stringField(o: Record<string, unknown>, k: string): string | null {
  const v = o[k];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function numberField(o: Record<string, unknown>, k: string): number | null {
  const v = o[k];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit; echo "EXIT=$?"
```

Expected: empty output, `EXIT=0`.

- [ ] **Step 3: Commit**

```bash
git status
git add vet-exam-ai/lib/notifications/format.ts
git commit -m "notifications: add formatNotification pure helper

Maps each notification_type + payload + related_comment to display text
and click-through href. comment_blinded/mention are placeholders until
their triggers ship — they render text but href='#' (no-op click)."
```

---

## Task 2: API routes (4 endpoints)

**Files:**
- Create: `app/api/notifications/route.ts` (GET list)
- Create: `app/api/notifications/[id]/route.ts` (PATCH)
- Create: `app/api/notifications/unread-count/route.ts` (GET count)
- Create: `app/api/notifications/mark-all-read/route.ts` (POST bulk)

**Why parallel-friendly:** All four routes are server-only and don't import any of the components we're building. They only depend on `lib/supabase/server.ts` and `lib/supabase/types.ts`, both already present.

- [ ] **Step 1: GET list (`route.ts`)**

Path: `vet-exam-ai/app/api/notifications/route.ts`

**Two-query pattern, not embedded join.** The typed schema in `lib/supabase/types.ts` has `Relationships: []` for every table, so PostgREST embedded selects (`comments(...)`) fail the typecheck. We do two separate queries and stitch them client-side, mirroring the pattern already used for `comments → user_profiles_public` in `CommentThread.tsx` (see `project_comment_core_resume` memory).

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function GET(req: NextRequest) {
  const limitParam = req.nextUrl.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam != null) {
    const parsed = Number(limitParam);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
    }
    limit = Math.min(Math.floor(parsed), MAX_LIMIT);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // 1) Notifications for this user, newest first.
  const { data: rows, error } = await supabase
    .from("notifications")
    .select("id, type, payload, related_comment_id, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const safeRows = rows ?? [];

  // 2) Stitch related comments — batched lookup by id.
  const commentIds = Array.from(
    new Set(
      safeRows
        .map((r) => r.related_comment_id)
        .filter((v): v is string => v != null),
    ),
  );

  type RelatedComment = {
    id: string;
    question_id: string;
    parent_id: string | null;
  };

  const relatedById = new Map<string, RelatedComment>();
  if (commentIds.length > 0) {
    const { data: comments, error: commentErr } = await supabase
      .from("comments")
      .select("id, question_id, parent_id")
      .in("id", commentIds);

    if (commentErr) {
      // Don't fail the whole list — degrade related_comment to null.
      console.warn("[GET /api/notifications] comments stitch failed", commentErr);
    } else {
      for (const c of comments ?? []) {
        relatedById.set(c.id, {
          id: c.id,
          question_id: c.question_id,
          parent_id: c.parent_id,
        });
      }
    }
  }

  const items = safeRows.map((row) => ({
    id: row.id,
    type: row.type,
    payload: row.payload as Record<string, unknown>,
    read_at: row.read_at,
    created_at: row.created_at,
    related_comment:
      row.related_comment_id != null
        ? relatedById.get(row.related_comment_id) ?? null
        : null,
  }));

  return NextResponse.json({ items });
}
```

- [ ] **Step 2: PATCH single (`[id]/route.ts`)**

Path: `vet-exam-ai/app/api/notifications/[id]/route.ts`

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

type Body = { read?: boolean };

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.read !== true) {
    return NextResponse.json(
      { error: "Only { read: true } is supported" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Idempotent: matching unread row → mark read; already-read row → no-op
  // but still 200 so clients can retry safely. Different-user / missing row
  // → 404 (RLS makes the row invisible, so the .select returns 0 rows).
  const { data: existing, error: selectErr } = await supabase
    .from("notifications")
    .select("id, read_at")
    .eq("id", id)
    .maybeSingle();

  if (selectErr) {
    return NextResponse.json({ error: selectErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  if (existing.read_at != null) {
    // already read — no-op success
    return NextResponse.json({ ok: true });
  }

  const { error: updateErr } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: GET unread-count (`unread-count/route.ts`)**

Path: `vet-exam-ai/app/api/notifications/unread-count/route.ts`

```ts
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // count: 'exact' returns total without fetching rows. Hits the
  // partial index notifications_user_unread.
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
```

- [ ] **Step 4: POST mark-all-read (`mark-all-read/route.ts`)**

Path: `vet-exam-ai/app/api/notifications/mark-all-read/route.ts`

```ts
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: data?.length ?? 0 });
}
```

- [ ] **Step 5: Typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit; echo "EXIT=$?"
```

Expected: empty output, `EXIT=0`.

If a Supabase typed-client error appears for `.from("notifications")`, verify that `lib/supabase/types.ts` already has the `notifications` table (it does — see `NotificationRow` export at line 520). No regeneration needed.

- [ ] **Step 6: Commit**

```bash
git status
git add vet-exam-ai/app/api/notifications/route.ts \
        vet-exam-ai/app/api/notifications/[id]/route.ts \
        vet-exam-ai/app/api/notifications/unread-count/route.ts \
        vet-exam-ai/app/api/notifications/mark-all-read/route.ts
git commit -m "notifications: add 4 API routes (list/patch/count/mark-all)

GET /api/notifications?limit=10  list with LEFT JOIN comments
PATCH /api/notifications/[id]    single mark-read (idempotent)
GET /api/notifications/unread-count  count-only via partial index
POST /api/notifications/mark-all-read  bulk mark-read

All four require auth (401 fallthrough). RLS ensures cross-user rows
are invisible — missing rows return 404."
```

---

## Task 3: NotificationItem + NotificationDropdown components

**Files:**
- Create: `components/notifications/NotificationItem.tsx`
- Create: `components/notifications/NotificationDropdown.tsx`

**Why bundled:** Dropdown imports Item; Item is small. No tests, so the unit of meaningful verification is the rendered dropdown.

- [ ] **Step 1: Create NotificationItem**

Path: `vet-exam-ai/components/notifications/NotificationItem.tsx`

```tsx
"use client";

import {
  formatNotification,
  type RelatedCommentLite,
  type NotificationType,
} from "../../lib/notifications/format";

export type NotificationRow = {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  related_comment: RelatedCommentLite;
};

type Props = {
  notification: NotificationRow;
  onClick: (n: NotificationRow, href: string) => void;
};

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

export default function NotificationItem({ notification, onClick }: Props) {
  const { text, href } = formatNotification(
    notification.type,
    notification.payload,
    notification.related_comment,
  );
  const unread = notification.read_at == null;
  const clickable = href !== "#";

  function handleClick() {
    if (!clickable) return;
    onClick(notification, href);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!clickable}
      style={{
        width: "100%",
        textAlign: "left",
        background: unread ? "var(--teal-dim)" : "transparent",
        border: "none",
        borderLeft: unread ? "4px solid var(--teal)" : "4px solid transparent",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        cursor: clickable ? "pointer" : "default",
        opacity: clickable ? 1 : 0.6,
        transition: "background 150ms",
      }}
      onMouseEnter={(e) => {
        if (clickable) {
          (e.currentTarget as HTMLElement).style.background = unread
            ? "var(--teal-dim)"
            : "var(--surface-raised)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = unread
          ? "var(--teal-dim)"
          : "transparent";
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: unread ? "var(--text)" : "var(--text-muted)",
          fontWeight: unread ? 600 : 500,
          lineHeight: 1.4,
        }}
      >
        {text}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-faint)" }}>
        {formatRelative(notification.created_at)}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Create NotificationDropdown**

Path: `vet-exam-ai/components/notifications/NotificationDropdown.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NotificationItem, { type NotificationRow } from "./NotificationItem";

type Props = {
  open: boolean;
  onClose: () => void;
  bellRef: React.RefObject<HTMLButtonElement | null>;
  onCountChange: (next: number) => void;
};

type Status = "loading" | "ready" | "error";

export default function NotificationDropdown({
  open,
  onClose,
  bellRef,
  onCountChange,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch on open and when reloadKey bumps (mark-all-read failure recovery).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setStatus("loading");
      try {
        const res = await fetch("/api/notifications?limit=10");
        if (!res.ok) throw new Error("fetch failed");
        const json = (await res.json()) as { items: NotificationRow[] };
        if (cancelled) return;
        setItems(json.items);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        console.warn("[NotificationDropdown] list fetch failed", err);
        setStatus("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, reloadKey]);

  // Outside click closes.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (bellRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, onClose, bellRef]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleItemClick(n: NotificationRow, href: string) {
    // Optimistic single-row read.
    const wasUnread = n.read_at == null;
    if (wasUnread) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === n.id ? { ...it, read_at: new Date().toISOString() } : it,
        ),
      );
      onCountChange(-1);

      // Fire-and-forget; don't block navigation.
      fetch(`/api/notifications/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      }).catch((err) => {
        console.warn("[NotificationDropdown] mark-read failed", err);
      });
    }

    onClose();
    router.push(href);
  }

  async function handleMarkAllRead() {
    const previous = items;
    const previousUnreadCount = items.filter((it) => it.read_at == null).length;

    // Optimistic.
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((it) => (it.read_at == null ? { ...it, read_at: now } : it)),
    );
    onCountChange(-previousUnreadCount);

    try {
      const res = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });
      if (!res.ok) throw new Error("mark-all-read failed");
    } catch (err) {
      console.warn("[NotificationDropdown] mark-all-read failed", err);
      // Refetch to recover (avoids stale-snapshot rollback wiping interim
      // updates — pattern from comment-replies delete-failure handling).
      setItems(previous);
      onCountChange(previousUnreadCount);
      setReloadKey((k) => k + 1);
    }
  }

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="알림 목록"
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        right: 0,
        width: 380,
        maxWidth: "calc(100vw - 24px)",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        zIndex: 60,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--text)",
        }}
      >
        <span>알림</span>
        {items.some((it) => it.read_at == null) && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              padding: "4px 6px",
            }}
          >
            전부 읽음
          </button>
        )}
      </div>

      {status === "loading" && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 56,
                background: "var(--surface-raised)",
                borderBottom: "1px solid var(--border)",
                opacity: 0.4,
              }}
            />
          ))}
        </div>
      )}

      {status === "error" && (
        <div
          style={{
            padding: "16px 14px",
            fontSize: 13,
            color: "var(--text-muted)",
            textAlign: "center",
          }}
        >
          알림을 불러올 수 없습니다.
        </div>
      )}

      {status === "ready" && items.length === 0 && (
        <div
          style={{
            padding: "20px 14px",
            fontSize: 13,
            color: "var(--text-muted)",
            textAlign: "center",
          }}
        >
          새 알림이 없어요
        </div>
      )}

      {status === "ready" && items.length > 0 && (
        <div
          role="list"
          style={{
            display: "flex",
            flexDirection: "column",
            maxHeight: 480,
            overflowY: "auto",
          }}
        >
          {items.map((n) => (
            <div
              key={n.id}
              role="listitem"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <NotificationItem notification={n} onClick={handleItemClick} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit; echo "EXIT=$?"
```

Expected: empty output, `EXIT=0`. If a CSS-var token error appears, the existing NavBar uses these same tokens (`var(--teal)`, `var(--teal-dim)`, etc.) so they exist.

- [ ] **Step 4: Commit**

```bash
git status
git add vet-exam-ai/components/notifications/NotificationItem.tsx \
        vet-exam-ai/components/notifications/NotificationDropdown.tsx
git commit -m "notifications: add NotificationItem + NotificationDropdown

Item renders one row with unread visual cue (left teal stripe + tinted
background + bold weight). Dropdown handles list fetch on open, outside-
click + Esc to close, optimistic single-row read on click, optimistic
mark-all-read with refetch on failure (avoids stale-snapshot wipe)."
```

---

## Task 4: NotificationBell with polling

**Files:**
- Create: `components/notifications/NotificationBell.tsx`

- [ ] **Step 1: Create NotificationBell**

Path: `vet-exam-ai/components/notifications/NotificationBell.tsx`

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "../../lib/hooks/useAuth";
import NotificationDropdown from "./NotificationDropdown";

const POLL_INTERVAL_MS = 60_000;

export default function NotificationBell() {
  const { user, loading } = useAuth();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement | null>(null);

  const fetchCount = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (!res.ok) return;
      const json = (await res.json()) as { count: number };
      setCount(typeof json.count === "number" ? json.count : 0);
    } catch {
      // silent — keep previous count
    }
  }, []);

  // Polling: only when user logged in. Pauses while tab hidden.
  useEffect(() => {
    if (loading || !user) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      void fetchCount();
      timer = setInterval(() => {
        void fetchCount();
      }, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, loading, fetchCount]);

  // Hide entirely while auth is settling or user is logged out.
  if (loading || !user) return null;

  const badgeText = count >= 100 ? "99+" : count > 0 ? String(count) : "";

  function handleClick() {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        // refresh count when opening so badge stays in sync with list
        void fetchCount();
      }
      return next;
    });
  }

  function handleClose() {
    setOpen(false);
  }

  function handleCountDelta(delta: number) {
    setCount((prev) => Math.max(0, prev + delta));
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={bellRef}
        type="button"
        onClick={handleClick}
        aria-label="알림"
        aria-expanded={open}
        style={{
          background: "none",
          border: "none",
          color: count > 0 ? "var(--text)" : "var(--text-muted)",
          cursor: "pointer",
          padding: "8px 10px",
          borderRadius: 8,
          display: "inline-flex",
          alignItems: "center",
          position: "relative",
          transition: "color 150ms, background 150ms",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <div style={{ position: "relative" }}>
          <Bell size={16} />
          {count > 0 && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: -4,
                right: -6,
                minWidth: 14,
                height: 14,
                padding: "0 4px",
                borderRadius: 999,
                background: "var(--wrong)",
                color: "#fff",
                fontSize: 9,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                lineHeight: "14px",
                textAlign: "center",
                boxShadow: "0 0 0 2px var(--bg)",
              }}
            >
              {badgeText}
            </span>
          )}
        </div>
      </button>

      <NotificationDropdown
        open={open}
        onClose={handleClose}
        bellRef={bellRef}
        onCountChange={handleCountDelta}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit; echo "EXIT=$?"
```

Expected: empty output, `EXIT=0`.

- [ ] **Step 3: Commit**

```bash
git status
git add vet-exam-ai/components/notifications/NotificationBell.tsx
git commit -m "notifications: add NotificationBell with 60s polling

Bell + unread badge (red dot, capped 99+). Polls
GET /api/notifications/unread-count every 60s; pauses while tab is
hidden via visibilitychange. Mounts NotificationDropdown on click.
Hidden entirely when not authed."
```

---

## Task 5: NavBar integration

**Files:**
- Modify: `components/NavBar.tsx`

- [ ] **Step 1: Read current NavBar**

```bash
cat vet-exam-ai/components/NavBar.tsx | head -20
```

Confirm the file structure matches expectations (lucide imports, useAuth hook, sticky header).

- [ ] **Step 2: Add import + mount the bell**

Edit `vet-exam-ai/components/NavBar.tsx`:

Find:

```tsx
import { LogOut, BookOpen, BarChart3, RotateCcw, PenTool, User, CirclePlay } from "lucide-react";
```

Leave that line unchanged. Add this import line right after it:

```tsx
import NotificationBell from "./notifications/NotificationBell";
```

Then, locate the divider that separates user-only links from the auth pill:

```tsx
          <div className="h-6 w-px mx-2" style={{ background: "var(--border)" }}></div>

          {!loading && (
            user ? (
```

Replace **that single divider** line and the `{!loading && (` block opening with:

```tsx
          {!loading && user && (
            <NotificationBell />
          )}

          <div className="h-6 w-px mx-2" style={{ background: "var(--border)" }}></div>

          {!loading && (
            user ? (
```

The bell sits inside the nav, just before the divider, only when the user is logged in. (Note: `<NotificationBell />` itself returns null when unauthed, but gating it here too keeps the divider placement clean when user is null.)

- [ ] **Step 3: Typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit; echo "EXIT=$?"
```

Expected: empty output, `EXIT=0`.

- [ ] **Step 4: Smoke test in dev**

```bash
cd vet-exam-ai && npm run dev
```

Open `http://localhost:3000/dashboard` while logged in. Verify:
- Bell icon visible to the right of the existing nav links
- No console errors
- Clicking the bell opens an empty dropdown ("새 알림이 없어요" or actual notifications if any rows exist)
- Clicking outside closes the dropdown
- Pressing Esc closes the dropdown

Stop the dev server with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git status
git add vet-exam-ai/components/NavBar.tsx
git commit -m "navbar: mount NotificationBell when authed

Bell sits between user nav links and the divider. Hidden when not
authed (the bell component itself also returns null in that case)."
```

---

## Task 6: CommentThread/CommentItem highlight support

**Files:**
- Modify: `components/comments/CommentItem.tsx`
- Modify: `components/comments/CommentThread.tsx`

**Why before T7:** The page in T7 imports `CommentThread` and passes `highlightCommentId`. That prop must exist first.

- [ ] **Step 1: Add id wrapper to CommentItem**

Edit `vet-exam-ai/components/comments/CommentItem.tsx`:

Find the placeholder return (around line 53):

```tsx
  if (isPlaceholder) {
    return (
      <div
        style={{
          background: "var(--bg)",
          border: "1px dashed var(--border)",
          borderRadius: 10,
          padding: "12px 14px",
          fontSize: 12,
          color: "var(--text-faint)",
          fontStyle: "italic",
        }}
      >
        [작성자에 의해 삭제된 댓글]
      </div>
    );
  }
```

Add `id={`comment-${comment.id}`}` to that div:

```tsx
  if (isPlaceholder) {
    return (
      <div
        id={`comment-${comment.id}`}
        style={{
          background: "var(--bg)",
          border: "1px dashed var(--border)",
          borderRadius: 10,
          padding: "12px 14px",
          fontSize: 12,
          color: "var(--text-faint)",
          fontStyle: "italic",
        }}
      >
        [작성자에 의해 삭제된 댓글]
      </div>
    );
  }
```

Then find the main return wrapper (around line 76):

```tsx
  return (
    <div
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
```

Replace with:

```tsx
  return (
    <div
      id={`comment-${comment.id}`}
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
```

- [ ] **Step 2: Add highlightCommentId prop to CommentThread**

Edit `vet-exam-ai/components/comments/CommentThread.tsx`:

Find the `Props` type (around line 10):

```tsx
type Props = {
  questionId: string;
};
```

Replace with:

```tsx
type Props = {
  questionId: string;
  highlightCommentId?: string;
};
```

Then update the function signature (around line 26):

```tsx
export default function CommentThread({ questionId }: Props) {
```

Replace with:

```tsx
export default function CommentThread({ questionId, highlightCommentId }: Props) {
```

Then add a new effect immediately AFTER the existing data-load `useEffect` (which ends around line 160 with `}, [questionId, reloadKey]);`). Insert this block:

```tsx
  // Scroll to + ring-highlight a target comment after roots are populated.
  // Used when arriving via a notification deep-link (?comment=<id>).
  useEffect(() => {
    if (!highlightCommentId) return;
    if (status !== "ready") return;
    const el = document.getElementById(`comment-${highlightCommentId}`);
    if (!el) return; // blinded / removed / not in last 50 — silent

    el.scrollIntoView({ block: "center", behavior: "smooth" });

    const RING_CLASSES = ["ring-2", "ring-[var(--teal)]"];
    el.classList.add(...RING_CLASSES);
    const timer = window.setTimeout(() => {
      el.classList.remove(...RING_CLASSES);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [highlightCommentId, status, roots]);
```

The dependency on `roots` ensures we re-attempt the scroll once the data finishes loading, even if `highlightCommentId` was passed before fetch resolved. Adding `status` lets us only run after the data is `ready`, avoiding unnecessary lookups during loading.

- [ ] **Step 3: Typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit; echo "EXIT=$?"
```

Expected: empty output, `EXIT=0`.

- [ ] **Step 4: Smoke test (regression check)**

Start dev server, navigate to a quiz session, answer a question, switch to "커뮤니티 토론" tab. Verify:
- Existing comment thread still loads
- Posting a new root comment still works
- Nothing broken visually

The new highlight effect only runs when `highlightCommentId` is passed (which doesn't happen in the existing flow), so no regression should be possible. This step is a sanity check.

- [ ] **Step 5: Commit**

```bash
git status
git add vet-exam-ai/components/comments/CommentItem.tsx \
        vet-exam-ai/components/comments/CommentThread.tsx
git commit -m "comments: add highlightCommentId scroll/ring effect

CommentItem root wrapper gets id='comment-<uuid>' (both real and
placeholder branches). CommentThread accepts an optional
highlightCommentId; on data-ready, scrolls the matching element into
view and adds a 1.5s teal ring. Silent if the target row is missing
(blinded / removed / outside the last-50 window)."
```

---

## Task 7: QuestionReadOnly + dynamic /questions/[id] page

**Files:**
- Create: `components/QuestionReadOnly.tsx`
- Create: `app/questions/[id]/page.tsx`

**Auth pattern note:** The spec §10 calls for a server component with `redirect("/auth/login")`. Every other page in this codebase is a client component using `useAuth()`. We **follow the existing pattern** for consistency — this is a deliberate deviation from spec. RLS remains the security boundary; the auth gate here is purely UX.

- [ ] **Step 1: Create QuestionReadOnly**

Path: `vet-exam-ai/components/QuestionReadOnly.tsx`

```tsx
"use client";

import { CheckCircle2, HelpCircle } from "lucide-react";
import type { Question } from "../lib/questions";

const SUBJECT_COLORS: Record<string, string> = {
  "약리학": "#9B6FD4",
  "내과학": "#1ea7bb",
  "외과학": "#4A7FA8",
  "생화학": "#C8895A",
  "병리학": "#2D9F6B",
};

function SubjectChip({ subject }: { subject: string }) {
  const color = SUBJECT_COLORS[subject] ?? "#4A7FA8";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: `${color}18`,
        border: `1px solid ${color}40`,
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 700,
        color,
        letterSpacing: "0.04em",
        flexShrink: 0,
      }}
    >
      {subject}
    </span>
  );
}

type Props = {
  question: Question;
};

export default function QuestionReadOnly({ question }: Props) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: "4px solid var(--teal)",
        borderRadius: 14,
        padding: "28px 32px",
      }}
    >
      {/* Meta row */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 18 }}>
        <SubjectChip subject={question.category} />
        <span
          style={{
            fontSize: 10,
            color: "var(--text-faint)",
            fontWeight: 600,
            letterSpacing: "0.1em",
            fontFamily: "var(--font-mono)",
          }}
        >
          {question.id}
        </span>
      </div>

      {/* Question stem */}
      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1.5,
          color: "var(--text)",
          margin: "0 0 24px",
        }}
      >
        {question.question}
      </h2>

      {/* Choices — read-only, correct answer pre-revealed */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {question.choices.map((choice, idx) => {
          const isCorrect = choice === question.answer;
          const letter = String.fromCharCode(65 + idx);
          return (
            <div
              key={choice}
              style={{
                background: isCorrect ? "var(--correct-dim)" : "var(--bg)",
                border: `1px solid ${isCorrect ? "rgba(45,159,107,0.5)" : "var(--border)"}`,
                color: isCorrect ? "var(--text)" : "var(--text-muted)",
                opacity: isCorrect ? 1 : 0.85,
                borderRadius: 12,
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  background: isCorrect ? "var(--correct)" : "var(--surface-raised)",
                  color: isCorrect ? "#fff" : "var(--text-muted)",
                  width: 28,
                  height: 28,
                  flexShrink: 0,
                  borderRadius: 8,
                  display: "grid",
                  placeItems: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {letter}
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{choice}</span>
              {isCorrect && (
                <CheckCircle2 size={18} style={{ color: "var(--correct)", flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Explanation */}
      <div
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          padding: "14px 16px",
          borderRadius: 10,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <HelpCircle
            size={16}
            style={{ color: "var(--blue)", marginTop: 2, flexShrink: 0 }}
          />
          <div>
            <span className="kvle-label" style={{ color: "var(--blue)" }}>
              해설
            </span>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                lineHeight: 1.7,
                margin: "6px 0 0",
              }}
            >
              {question.explanation}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create /questions/[id] page**

Path: `vet-exam-ai/app/questions/[id]/page.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { useAuth } from "../../../lib/hooks/useAuth";
import LoadingSpinner from "../../../components/LoadingSpinner";
import QuestionReadOnly from "../../../components/QuestionReadOnly";
import CommentThread from "../../../components/comments/CommentThread";
import type { Question } from "../../../lib/questions";

type Status = "loading" | "ready" | "not_found" | "error";

type QuestionDbRow = {
  id: string;
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
  category: string;
};

export default function QuestionDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const questionId = params?.id ?? "";
  const highlightCommentId = search?.get("comment") ?? undefined;

  const [status, setStatus] = useState<Status>("loading");
  const [question, setQuestion] = useState<Question | null>(null);

  // Auth gate (UX only — RLS is the real boundary).
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/auth/login");
    }
  }, [user, authLoading, router]);

  // Fetch the question.
  useEffect(() => {
    if (authLoading || !user || !questionId) return;
    let cancelled = false;
    async function load() {
      setStatus("loading");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("questions")
        .select("id, question, choices, answer, explanation, category")
        .eq("id", questionId)
        .maybeSingle<QuestionDbRow>();

      if (cancelled) return;
      if (error) {
        console.error("[QuestionDetailPage] question fetch failed", error);
        setStatus("error");
        return;
      }
      if (!data) {
        setStatus("not_found");
        return;
      }
      setQuestion({
        id: data.id,
        question: data.question,
        choices: data.choices,
        answer: data.answer,
        explanation: data.explanation,
        category: data.category,
      });
      setStatus("ready");
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [questionId, user, authLoading]);

  if (authLoading || !user) {
    return (
      <div style={{ padding: "48px 24px", display: "grid", placeItems: "center" }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <main
      style={{
        maxWidth: 880,
        margin: "0 auto",
        padding: "32px 24px 80px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {status === "loading" && (
        <div style={{ padding: "48px 24px", display: "grid", placeItems: "center" }}>
          <LoadingSpinner />
        </div>
      )}

      {status === "error" && (
        <div
          style={{
            padding: "20px 18px",
            background: "var(--wrong-dim)",
            border: "1px solid rgba(192,74,58,0.3)",
            borderRadius: 12,
            color: "var(--text)",
            fontSize: 14,
          }}
        >
          문제를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.
        </div>
      )}

      {status === "not_found" && (
        <div
          style={{
            padding: "20px 18px",
            background: "var(--bg)",
            border: "1px dashed var(--border)",
            borderRadius: 12,
            color: "var(--text-muted)",
            fontSize: 14,
            textAlign: "center",
          }}
        >
          해당 문제를 찾을 수 없습니다.
        </div>
      )}

      {status === "ready" && question && (
        <>
          <QuestionReadOnly question={question} />
          <section
            aria-label="커뮤니티 토론"
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
              }}
            >
              커뮤니티 토론
            </h3>
            <CommentThread
              questionId={question.id}
              highlightCommentId={highlightCommentId}
            />
          </section>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit; echo "EXIT=$?"
```

Expected: empty output, `EXIT=0`.

- [ ] **Step 4: Production build**

```bash
cd vet-exam-ai && npm run build
```

Expected: build succeeds. The new dynamic route should appear in the build output as `λ /questions/[id]` (Server, lambda) — though since the page is `"use client"`, it'll prerender as a client-render endpoint.

- [ ] **Step 5: Smoke test in dev**

```bash
cd vet-exam-ai && npm run dev
```

Manually grab a real question id from the database (e.g., from a quiz session — the URL in `QuestionCard`'s `question.id` value is shown in dev logs, or run a Supabase select). Then visit:

- `http://localhost:3000/questions/<real-id>` — renders question + comments
- `http://localhost:3000/questions/<real-id>?comment=<comment-uuid>` — scrolls to + rings the matching comment for 1.5s
- `http://localhost:3000/questions/nonexistent` — shows "해당 문제를 찾을 수 없습니다."
- Logged out → redirected to `/auth/login`

Stop with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git status
git add vet-exam-ai/components/QuestionReadOnly.tsx \
        vet-exam-ai/app/questions/[id]/page.tsx
git commit -m "questions: add /questions/[id] read-only page

Standalone page for notification click-through and future share/SEO
links. Mounts QuestionReadOnly (extracted from QuestionCard's
post-submit panel — answer + explanation pre-revealed) and
CommentThread with highlightCommentId from ?comment=<id>.

Client-side auth gate (matches existing pattern); RLS is the real
boundary."
```

---

## Task 8: Final verification + memory update

**Files:** none (verification + memory only)

- [ ] **Step 1: Full typecheck + build**

```bash
cd vet-exam-ai && npx tsc --noEmit; echo "EXIT=$?"
cd vet-exam-ai && npm run build; echo "BUILD_EXIT=$?"
cd vet-exam-ai && npm run lint; echo "LINT_EXIT=$?"
```

All three should exit 0. Lint warnings are acceptable; lint errors are not.

- [ ] **Step 2: End-to-end manual smoke**

Start the dev server (`cd vet-exam-ai && npm run dev`).

Test path 1 — generate a real notification:
1. Sign in as user A in one browser; sign in as user B in a different browser/incognito.
2. As user A: go through a quiz, post a comment on any question.
3. As user B: go through the same quiz, post a **reply** to user A's comment.
4. Wait ≤ 60 seconds in user A's tab.

Verify in user A's tab:
- [ ] Bell shows red badge with `1`
- [ ] Click bell → dropdown opens with `"<B의 닉네임>님이 회원님의 댓글에 답글을 달았어요"` row, marked unread (teal stripe + tinted background)
- [ ] Click the row → navigates to `/questions/<id>?comment=<reply-id>`, scrolls to and rings the reply for ~1.5s
- [ ] Bell badge now shows nothing (or `0` decremented)
- [ ] Open bell again → row no longer highlighted as unread

Test path 2 — mark-all-read:
1. Generate at least 2 unread notifications (repeat the reply trick).
2. Open dropdown → "전부 읽음" button visible.
3. Click "전부 읽음" → all rows turn read; bell badge clears immediately.
4. Reload → state persists (rows still read).

Test path 3 — visibility-aware polling:
1. Open user A's tab with bell visible. Open DevTools → Network → filter "unread-count".
2. Switch to a different browser tab for 2 minutes.
3. Switch back. Verify: while away, no `unread-count` requests fired. On return, an immediate request fires + interval resumes.

Test path 4 — edge cases:
1. Visit `/questions/nonexistent-id` → "해당 문제를 찾을 수 없습니다."
2. Visit `/questions/<real-id>?comment=nonexistent` → page renders, no scroll/ring (silent).
3. Sign out, visit `/questions/<id>` → redirected to `/auth/login`.

- [ ] **Step 3: Update memory**

Add a memory file at `C:\Users\Theriogenology\.claude\projects\C--Users-Theriogenology-Desktop-vet-exam-ai\memory\project_notifications_mvp_done.md`:

```markdown
---
name: notifications_mvp_done
description: M3 §17 알림 UI MVP 머지 완료. NavBar 벨 + 60s 폴링 + 드롭다운 + click-through.
type: project
---
# M3 §17 — 알림 UI MVP 완료 (2026-04-27)

**상태**: PR 머지 완료 (또는 PR 생성 + 사용자 승인 대기 — 실제 상황에 맞춰 갱신).

## 머지된 커밋

(git log --oneline main..HEAD --reverse 결과 붙여넣기)

## 결정 요약 (spec §2)

1. 스코프 = 벨 + 드롭다운 + click-through
2. Click-through 도착지 = 신규 /questions/[id] read-only
3. 갱신 = 60s 폴링 (visibility-aware)
4. 읽음 = 행 클릭 단건 + 전부 읽음 버튼
5. 드롭다운 한도 = 10개 (전체 페이지 follow-up)
6. 문구 = reply / vote_milestone (🎉) / report_resolved
7. 도착 페이지 = bare-minimum
8. API = 전용 라우트 4개

## 함정 / 학습

- **Auth pattern 일치**: spec은 server component redirect를 명시했지만 기존 페이지가 모두 client useAuth 패턴이라 일치시켰음. RLS가 실제 보안 경계.
- **No tests**: project 전체에 vitest/jest 없음. typecheck + 빌드 + 수동 스모크로 검증. spec §13 단위 테스트는 별도 follow-up PR(`feat/test-infra-v1`).
- **mark-all-read 실패 복구**: optimistic + setReloadKey(k+1) 패턴 (comment-replies delete failure 학습 그대로 reuse).
- **Embedded join**: notifications.related_comment_id → comments는 FK 있음. spec의 `comments!notifications_related_comment_id_fkey(...)` 문법이 통한다 (이는 user_profiles_public 함정과 다른 케이스 — 거기는 FK 없어서 실패함).

## Follow-up 큐 (V2 / 향후)

- Supabase Realtime
- /notifications 전체 페이지
- 토스트
- 이메일 다이제스트
- @멘션 / comment_blinded 트리거 추가 시 자동 합류 (format 함수가 이미 5종 지원)
- 테스트 인프라 (별도 PR)
- 알림 설정 페이지 (유형별 on/off)
- next param 처리 (로그아웃 상태 deep-link)
```

Then add this line to `C:\Users\Theriogenology\.claude\projects\C--Users-Theriogenology-Desktop-vet-exam-ai\memory\MEMORY.md` under the `## Project` section:

```markdown
- [notifications_mvp_done.md](./project_notifications_mvp_done.md) — 2026-04-27 M3 §17 알림 UI MVP 머지 완료. 벨 + 60s 폴링 + 드롭다운 + click-through.
```

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin feat/notifications-mvp-v1
```

Since `gh` CLI is not installed, the orchestrator opens the PR in the GitHub web UI. Title: `Notifications MVP (M3 §17)`. Body: link the spec + plan, paste the manual verify checklist outcomes.

---

## Self-Review Notes

**Spec coverage:**
- §1 (problem) → addressed by T1–T7 collectively
- §2 decisions 1–8 → all reflected in tasks
- §3 architecture → T1 (format) / T2 (API) / T3–T4 (Bell+Dropdown) / T5 (NavBar) / T6 (highlight) / T7 (page)
- §4 API routes → T2 (all 4)
- §5 deep-link logic → T1 (formatNotification handles all 5 types)
- §6 scroll/highlight → T6
- §7 polling → T4
- §8 dropdown behavior → T3
- §9 read processing → T3 (single + mark-all-read)
- §10 auth → T2 (API 401), T4 (Bell hidden when unauthed), T7 (page redirect — deviated to client-side, called out)
- §11 visual → T3, T4 (matches spec tokens)
- §12 migrations → T0 verifies clean; no migration files created
- §13 testing → **deviated**: no test framework exists in repo, replaced with typecheck + build + manual verify; spec testing is follow-up
- §14 task split → mirrors plan T1–T8 (with T3+T4 swapped order to avoid forward import in Bell)
- §15 risks → addressed inline (idempotency, race-free design, JOIN safety)
- §16 out-of-scope → respected; not implemented

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "appropriate error handling" placeholders. Every step contains the actual content.

**Type consistency:**
- `NotificationType` exported from `lib/notifications/format.ts`, re-imported by `NotificationItem`. Same identifier throughout.
- `RelatedCommentLite` defined once in format.ts, re-used in NotificationItem.
- `NotificationRow` (UI shape) defined in NotificationItem.tsx, re-imported by NotificationDropdown.
- API response shape (`{ items: ... }`) matches what `NotificationDropdown` parses.
- `formatNotification` signature: `(type, payload, related)` — same in definition and callers.

**Known deviations from spec, surfaced for reviewer:**
1. **Auth pattern**: client-side auth in `/questions/[id]` instead of server-side redirect. Matches every other page.
2. **No unit tests**: spec §13 calls for Vitest tests; project has no test framework. Tests are follow-up.
3. **Task ordering**: spec lists Bell (T3) before Dropdown (T4); plan inverts to avoid Bell importing an undefined Dropdown.
