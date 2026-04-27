# §15 PR-A — Comment Vote + Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add up/down vote toggles, score display, and root-comment sort (추천순/최신순) to the comment thread. No DB migration; all backend triggers/RLS already deployed.

**Architecture:** Single toggle endpoint `POST /api/comments/[id]/vote` (idempotent set — same value re-posted = cancel). Separate `GET /api/comments/votes-mine` for the current user's votes on a question (IN-clause stitch — embedded join unavailable per `comment_core_done` memory). Optimistic single-row update on the client; no full-thread refetch.

**Tech Stack:** Next.js 15 app router, Supabase JS, zod, lucide-react. Inline `style` + CSS vars (no Tailwind utilities — see `notifications_mvp_done` memory).

**Spec:** `docs/superpowers/specs/2026-04-27-comment-vote-report-design.md` — read §3 (PR-A), §4.1, §4.2, §4.5, §6.1, §6.4, §6.5, §7, §8.

**Branch:** `feat/comment-vote-sort-v1` off `main`.

**Critical reminders for implementer subagents:**
- `cd vet-exam-ai && <cmd>` as a single chained line in every bash call. Orchestrator uses absolute paths.
- Run `git status` before any `git add` — never `git add -A`. Stage explicit paths only. Never push.
- The Next.js app lives in `vet-exam-ai/` (not repo root). All paths below are relative to repo root.
- `comment_core_done` memory: `comments` ↔ `user_profiles_public` cannot be embedded-joined. Use IN-clause stitch.
- `notifications_mvp_done` memory: never `el.classList.add("ring-...")`. Use inline `style.boxShadow` or CSS vars.

---

## File Structure

**New files:**
- `vet-exam-ai/components/comments/CommentVoteButton.tsx` — `▲ score ▼` row, owner/auth gating, optimistic prop-driven
- `vet-exam-ai/components/comments/CommentSortToggle.tsx` — small dropdown above thread (`정렬 ▾` → 추천순 / 최신순)
- `vet-exam-ai/lib/comments/voteSchema.ts` — zod schema for vote API body + sort param
- `vet-exam-ai/app/api/comments/[id]/vote/route.ts` — toggle endpoint
- `vet-exam-ai/app/api/comments/votes-mine/route.ts` — GET my votes for a question

**Modified files:**
- `vet-exam-ai/components/comments/CommentItem.tsx` — accept `score`, `myVote`, `isOwner`, `isAuthed`, `onVoteChange` props; render `CommentVoteButton`; replace `user_id`-derived owner check
- `vet-exam-ai/components/comments/CommentList.tsx` — pass new props through; add sort dropdown above the list (small UI shift)
- `vet-exam-ai/components/comments/CommentReplyGroup.tsx` — pass score / myVote / vote handler to reply `CommentItem`s with `size="small"`
- `vet-exam-ai/components/comments/CommentThread.tsx` — sort state, fetch sort param, my-votes fetch, vote handler, score state on roots/replies

---

## Task 0: Branch + scratch verify

- [ ] **Step 1: Create the feature branch**

```bash
cd vet-exam-ai && git checkout main && git pull --ff-only origin main && git checkout -b feat/comment-vote-sort-v1 && git status
```

Expected: clean working tree, branch `feat/comment-vote-sort-v1`.

- [ ] **Step 2: Sanity-check existing baseline builds**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: PASS. (If broken, stop and ask — do not start on a broken baseline.)

- [ ] **Step 3: Commit empty marker — skip**

(No commit yet. Branch creation only.)

---

## Task 1: Vote zod schema

**Files:**
- Create: `vet-exam-ai/lib/comments/voteSchema.ts`

- [ ] **Step 1: Write the schema file**

```ts
// vet-exam-ai/lib/comments/voteSchema.ts
import { z } from "zod";

export const VoteValueSchema = z.union([z.literal(1), z.literal(-1)]);
export type VoteValue = z.infer<typeof VoteValueSchema>;

export const VoteRequestSchema = z.object({
  value: VoteValueSchema,
});
export type VoteRequest = z.infer<typeof VoteRequestSchema>;

export const SORT_MODES = ["score", "recent"] as const;
export const SortModeSchema = z.enum(SORT_MODES);
export type SortMode = z.infer<typeof SortModeSchema>;
```

- [ ] **Step 2: Typecheck**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd vet-exam-ai && git add lib/comments/voteSchema.ts && git commit -m "comments: add vote + sort zod schemas"
```

---

## Task 2: POST /api/comments/[id]/vote — toggle endpoint

**Files:**
- Create: `vet-exam-ai/app/api/comments/[id]/vote/route.ts`

- [ ] **Step 1: Write the route**

```ts
// vet-exam-ai/app/api/comments/[id]/vote/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { VoteRequestSchema } from "../../../../../lib/comments/voteSchema";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = VoteRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const { value } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // 1) load comment for owner / status checks
  const { data: comment, error: commentErr } = await supabase
    .from("comments")
    .select("user_id, status")
    .eq("id", id)
    .maybeSingle();

  if (commentErr) {
    return NextResponse.json({ error: commentErr.message }, { status: 500 });
  }
  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  if (comment.user_id === user.id) {
    return NextResponse.json(
      { error: "Cannot vote on own comment" },
      { status: 403 }
    );
  }
  if (comment.status !== "visible" && comment.status !== "hidden_by_votes") {
    return NextResponse.json(
      { error: "Voting is not available on this comment" },
      { status: 409 }
    );
  }

  // 2) load existing vote (if any) — toggle decision
  const { data: existing, error: existingErr } = await supabase
    .from("comment_votes")
    .select("value")
    .eq("comment_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  if (!existing) {
    const { error: insertErr } = await supabase
      .from("comment_votes")
      .insert({ comment_id: id, user_id: user.id, value });
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    return NextResponse.json({ vote: value }, { status: 201 });
  }

  if (existing.value === value) {
    const { error: deleteErr } = await supabase
      .from("comment_votes")
      .delete()
      .eq("comment_id", id)
      .eq("user_id", user.id);
    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }
    return NextResponse.json({ vote: null }, { status: 200 });
  }

  const { error: updateErr } = await supabase
    .from("comment_votes")
    .update({ value })
    .eq("comment_id", id)
    .eq("user_id", user.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  return NextResponse.json({ vote: value }, { status: 200 });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd vet-exam-ai && git add app/api/comments/[id]/vote/route.ts && git commit -m "comments: add POST /api/comments/[id]/vote toggle endpoint"
```

---

## Task 3: GET /api/comments/votes-mine

**Files:**
- Create: `vet-exam-ai/app/api/comments/votes-mine/route.ts`

- [ ] **Step 1: Write the route**

```ts
// vet-exam-ai/app/api/comments/votes-mine/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const questionId = url.searchParams.get("question_id");
  if (!questionId) {
    return NextResponse.json({ error: "question_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({}, { status: 200 });
  }

  // step 1: collect comment ids on this question (root + reply)
  const { data: ids, error: idsErr } = await supabase
    .from("comments")
    .select("id")
    .eq("question_id", questionId)
    .limit(200);

  if (idsErr) {
    return NextResponse.json({ error: idsErr.message }, { status: 500 });
  }
  if (!ids || ids.length === 0) {
    return NextResponse.json({}, { status: 200 });
  }

  // step 2: my votes within those comment ids
  const commentIds = ids.map((r) => r.id);
  const { data: votes, error: votesErr } = await supabase
    .from("comment_votes")
    .select("comment_id, value")
    .eq("user_id", user.id)
    .in("comment_id", commentIds);

  if (votesErr) {
    return NextResponse.json({ error: votesErr.message }, { status: 500 });
  }

  const map: Record<string, 1 | -1> = {};
  for (const v of votes ?? []) {
    map[v.comment_id] = v.value === 1 ? 1 : -1;
  }
  return NextResponse.json(map, { status: 200 });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd vet-exam-ai && git add app/api/comments/votes-mine/route.ts && git commit -m "comments: add GET /api/comments/votes-mine"
```

---

## Task 4: CommentVoteButton component

**Files:**
- Create: `vet-exam-ai/components/comments/CommentVoteButton.tsx`

- [ ] **Step 1: Write the component**

```tsx
// vet-exam-ai/components/comments/CommentVoteButton.tsx
"use client";

import { ChevronUp, ChevronDown } from "lucide-react";

type VoteValue = 1 | -1;

type Props = {
  commentId: string;
  score: number;
  myVote: VoteValue | null;
  isOwner: boolean;
  isAuthed: boolean;
  size?: "normal" | "small";
  onVoteChange: (commentId: string, value: VoteValue, prev: VoteValue | null) => void;
  onUnauthedAttempt?: () => void;
};

export default function CommentVoteButton({
  commentId,
  score,
  myVote,
  isOwner,
  isAuthed,
  size = "normal",
  onVoteChange,
  onUnauthedAttempt,
}: Props) {
  const iconSize = size === "small" ? 14 : 16;
  const fontSize = size === "small" ? 11 : 12;
  const padding = size === "small" ? 2 : 3;
  const disabled = isOwner;

  function handleClick(value: VoteValue) {
    if (disabled) return;
    if (!isAuthed) {
      onUnauthedAttempt?.();
      return;
    }
    onVoteChange(commentId, value, myVote);
  }

  const upActive = myVote === 1;
  const downActive = myVote === -1;
  const baseColor = "var(--text-faint)";
  const upColor = upActive ? "var(--teal)" : baseColor;
  const downColor = downActive ? "var(--wrong)" : baseColor;
  const scoreColor = upActive
    ? "var(--teal)"
    : downActive
    ? "var(--wrong)"
    : "var(--text)";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
      aria-label="추천 / 비추천"
      title={isOwner ? "본인 댓글에는 투표할 수 없습니다" : undefined}
    >
      <button
        type="button"
        onClick={() => handleClick(1)}
        aria-label={upActive ? "추천 취소" : "추천"}
        aria-pressed={upActive}
        disabled={disabled}
        style={{
          background: "transparent",
          border: "none",
          padding,
          cursor: disabled ? "not-allowed" : "pointer",
          color: upColor,
          opacity: disabled ? 0.4 : 1,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <ChevronUp size={iconSize} strokeWidth={upActive ? 2.5 : 2} />
      </button>
      <span
        style={{
          fontSize,
          fontWeight: 600,
          minWidth: 16,
          textAlign: "center",
          color: scoreColor,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {score}
      </span>
      <button
        type="button"
        onClick={() => handleClick(-1)}
        aria-label={downActive ? "비추천 취소" : "비추천"}
        aria-pressed={downActive}
        disabled={disabled}
        style={{
          background: "transparent",
          border: "none",
          padding,
          cursor: disabled ? "not-allowed" : "pointer",
          color: downColor,
          opacity: disabled ? 0.4 : 1,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <ChevronDown size={iconSize} strokeWidth={downActive ? 2.5 : 2} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd vet-exam-ai && git add components/comments/CommentVoteButton.tsx && git commit -m "comments: add CommentVoteButton (▲ score ▼)"
```

---

## Task 5: CommentSortToggle component

**Files:**
- Create: `vet-exam-ai/components/comments/CommentSortToggle.tsx`

- [ ] **Step 1: Write the component**

```tsx
// vet-exam-ai/components/comments/CommentSortToggle.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { SortMode } from "../../lib/comments/voteSchema";

type Props = {
  value: SortMode;
  onChange: (mode: SortMode) => void;
};

const LABEL: Record<SortMode, string> = {
  score: "추천순",
  recent: "최신순",
};

export default function CommentSortToggle({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(mode: SortMode) {
    onChange(mode);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-faint)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          padding: "4px 8px",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {LABEL[value]} <ChevronDown size={12} />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            minWidth: 100,
            zIndex: 10,
            overflow: "hidden",
          }}
        >
          {(Object.keys(LABEL) as SortMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="menuitemradio"
              aria-checked={mode === value}
              onClick={() => pick(mode)}
              style={{
                display: "block",
                width: "100%",
                background: mode === value ? "var(--surface-raised)" : "transparent",
                border: "none",
                padding: "8px 12px",
                textAlign: "left",
                fontSize: 12,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              {LABEL[mode]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd vet-exam-ai && git add components/comments/CommentSortToggle.tsx && git commit -m "comments: add CommentSortToggle dropdown"
```

---

## Task 6: CommentItem accepts vote props + renders button

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentItem.tsx`

- [ ] **Step 1: Replace the entire file**

The new file extends the existing CommentItem with vote props and renders `CommentVoteButton` in the meta row. Other behaviors (placeholder, type chip, reply button, delete) are preserved.

```tsx
// vet-exam-ai/components/comments/CommentItem.tsx
"use client";

import { Trash2, MessageCircle } from "lucide-react";
import type { CommentType } from "../../lib/comments/schema";
import CommentVoteButton from "./CommentVoteButton";

type VoteValue = 1 | -1;

export type CommentItemData = {
  id: string;
  user_id: string | null;
  type: CommentType;
  body_html: string;
  created_at: string;
  authorNickname: string | null;
};

type Props = {
  comment: CommentItemData;
  score: number;
  myVote: VoteValue | null;
  isOwner: boolean;
  isAuthed: boolean;
  canDelete: boolean;
  onDelete: (id: string) => void;
  onVoteChange: (commentId: string, value: VoteValue, prev: VoteValue | null) => void;
  onUnauthedAttempt?: () => void;
  onStartReply?: (id: string) => void;
  isReply?: boolean;
  isPlaceholder?: boolean;
};

const TYPE_META: Record<CommentType, { label: string; color: string; bg: string }> = {
  memorization: { label: "💡 암기법", color: "#B45309", bg: "#FEF3C7" },
  correction: { label: "⚠ 정정", color: "#9F1239", bg: "#FFE4E6" },
  explanation: { label: "📘 추가설명", color: "#075985", bg: "#E0F2FE" },
  question: { label: "❓ 질문", color: "#5B21B6", bg: "#EDE9FE" },
  discussion: { label: "💬 토론", color: "#334155", bg: "#E2E8F0" },
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

export default function CommentItem({
  comment,
  score,
  myVote,
  isOwner,
  isAuthed,
  canDelete,
  onDelete,
  onVoteChange,
  onUnauthedAttempt,
  onStartReply,
  isReply,
  isPlaceholder,
}: Props) {
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

  const meta = TYPE_META[comment.type];
  const author =
    comment.user_id === null
      ? "탈퇴한 사용자"
      : comment.authorNickname ?? `익명-${comment.user_id.slice(-4)}`;

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
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
        {!isReply && (
          <span
            style={{
              background: meta.bg,
              color: meta.color,
              borderRadius: 999,
              padding: "2px 8px",
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            {meta.label}
          </span>
        )}
        <span style={{ color: "var(--text)", fontWeight: 600 }}>@{author}</span>
        <span style={{ color: "var(--text-faint)" }}>· {formatRelative(comment.created_at)}</span>
        <div style={{ marginLeft: "auto", display: "inline-flex", gap: 4, alignItems: "center" }}>
          <CommentVoteButton
            commentId={comment.id}
            score={score}
            myVote={myVote}
            isOwner={isOwner}
            isAuthed={isAuthed}
            size={isReply ? "small" : "normal"}
            onVoteChange={onVoteChange}
            onUnauthedAttempt={onUnauthedAttempt}
          />
          {!isReply && onStartReply && (
            <button
              type="button"
              onClick={() => onStartReply(comment.id)}
              aria-label="답글 달기"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-faint)",
                cursor: "pointer",
                padding: 4,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <MessageCircle size={14} />
              답글
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(comment.id)}
              aria-label="댓글 삭제"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-faint)",
                cursor: "pointer",
                padding: 4,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          fontSize: 13,
          color: "var(--text)",
          lineHeight: 1.7,
        }}
        dangerouslySetInnerHTML={{ __html: comment.body_html }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck — expected to FAIL until callers updated**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: errors in `CommentList.tsx` and `CommentReplyGroup.tsx` (missing `score` / `myVote` / `isOwner` / `isAuthed` / `onVoteChange` props). This is intentional — Tasks 7/8 fix them.

- [ ] **Step 3: Commit (intentional broken state, fixed by Task 7/8)**

```bash
cd vet-exam-ai && git add components/comments/CommentItem.tsx && git commit -m "comments: CommentItem accepts score/myVote/vote props (callers pending)"
```

---

## Task 7: CommentReplyGroup forwards vote props

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentReplyGroup.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
// vet-exam-ai/components/comments/CommentReplyGroup.tsx
"use client";

import CommentItem, { type CommentItemData } from "./CommentItem";
import CommentReplyComposer from "./CommentReplyComposer";

type VoteValue = 1 | -1;

type Props = {
  questionId: string;
  parentId: string;
  replies: CommentItemData[];
  scoreById: Map<string, number>;
  myVoteById: Map<string, VoteValue>;
  currentUserId: string | null;
  isComposerOpen: boolean;
  onSubmitReply: (parentId: string, newComment: CommentItemData) => void;
  onCancelReply: () => void;
  onDelete: (id: string) => void;
  onVoteChange: (commentId: string, value: VoteValue, prev: VoteValue | null) => void;
  onUnauthedAttempt?: () => void;
};

export default function CommentReplyGroup({
  questionId,
  parentId,
  replies,
  scoreById,
  myVoteById,
  currentUserId,
  isComposerOpen,
  onSubmitReply,
  onCancelReply,
  onDelete,
  onVoteChange,
  onUnauthedAttempt,
}: Props) {
  return (
    <div
      style={{
        marginLeft: 0,
        paddingLeft: 20,
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginTop: 8,
      }}
    >
      {replies.map((r) => (
        <CommentItem
          key={r.id}
          comment={r}
          score={scoreById.get(r.id) ?? 0}
          myVote={myVoteById.get(r.id) ?? null}
          isOwner={currentUserId !== null && r.user_id === currentUserId}
          isAuthed={currentUserId !== null}
          canDelete={currentUserId !== null && r.user_id === currentUserId}
          onDelete={onDelete}
          onVoteChange={onVoteChange}
          onUnauthedAttempt={onUnauthedAttempt}
          isReply
        />
      ))}
      {isComposerOpen && (
        <CommentReplyComposer
          questionId={questionId}
          parentId={parentId}
          onSubmitted={(c) => onSubmitReply(parentId, c)}
          onCancel={onCancelReply}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck — still expected to FAIL on CommentList.tsx**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: errors only in `CommentList.tsx`. ReplyGroup itself OK.

- [ ] **Step 3: Commit**

```bash
cd vet-exam-ai && git add components/comments/CommentReplyGroup.tsx && git commit -m "comments: ReplyGroup forwards score/myVote/vote handler"
```

---

## Task 8: CommentList sort header + forwards vote props

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentList.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
// vet-exam-ai/components/comments/CommentList.tsx
"use client";

import CommentItem, { type CommentItemData } from "./CommentItem";
import CommentReplyGroup from "./CommentReplyGroup";
import CommentSortToggle from "./CommentSortToggle";
import type { SortMode } from "../../lib/comments/voteSchema";

type VoteValue = 1 | -1;

export type RootWithReplies = CommentItemData & {
  replies: CommentItemData[];
  isPlaceholder?: boolean;
};

type Props = {
  questionId: string;
  roots: RootWithReplies[];
  scoreById: Map<string, number>;
  myVoteById: Map<string, VoteValue>;
  currentUserId: string | null;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  replyingToId: string | null;
  onStartReply: (id: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (parentId: string, newComment: CommentItemData) => void;
  onDelete: (id: string) => void;
  onVoteChange: (commentId: string, value: VoteValue, prev: VoteValue | null) => void;
  onUnauthedAttempt?: () => void;
};

export default function CommentList({
  questionId,
  roots,
  scoreById,
  myVoteById,
  currentUserId,
  sortMode,
  onSortChange,
  replyingToId,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onDelete,
  onVoteChange,
  onUnauthedAttempt,
}: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          minHeight: 24,
        }}
      >
        {roots.length > 0 && (
          <CommentSortToggle value={sortMode} onChange={onSortChange} />
        )}
      </div>

      {roots.length === 0 ? (
        <div
          style={{
            padding: "20px 16px",
            textAlign: "center",
            color: "var(--text-faint)",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          아직 의견이 없습니다.
          <br />첫 댓글을 남겨보세요.
        </div>
      ) : (
        roots.map((root) => {
          const composerOpenForRoot = replyingToId === root.id;
          const showGroup = root.replies.length > 0 || composerOpenForRoot;
          const canDeleteRoot =
            !root.isPlaceholder &&
            currentUserId !== null &&
            root.user_id === currentUserId;
          return (
            <div
              key={root.id}
              style={{ display: "flex", flexDirection: "column", gap: 0 }}
            >
              <CommentItem
                comment={root}
                score={scoreById.get(root.id) ?? 0}
                myVote={myVoteById.get(root.id) ?? null}
                isOwner={
                  currentUserId !== null && root.user_id === currentUserId
                }
                isAuthed={currentUserId !== null}
                canDelete={canDeleteRoot}
                onDelete={onDelete}
                onVoteChange={onVoteChange}
                onUnauthedAttempt={onUnauthedAttempt}
                onStartReply={
                  root.isPlaceholder || currentUserId === null
                    ? undefined
                    : onStartReply
                }
                isPlaceholder={root.isPlaceholder}
              />
              {showGroup && (
                <CommentReplyGroup
                  questionId={questionId}
                  parentId={root.id}
                  replies={root.replies}
                  scoreById={scoreById}
                  myVoteById={myVoteById}
                  currentUserId={currentUserId}
                  isComposerOpen={composerOpenForRoot}
                  onSubmitReply={onSubmitReply}
                  onCancelReply={onCancelReply}
                  onDelete={onDelete}
                  onVoteChange={onVoteChange}
                  onUnauthedAttempt={onUnauthedAttempt}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck — expected to fail on CommentThread.tsx (caller)**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: errors only in `CommentThread.tsx` (Task 9 fixes).

- [ ] **Step 3: Commit**

```bash
cd vet-exam-ai && git add components/comments/CommentList.tsx && git commit -m "comments: CommentList sort header + forwards vote props"
```

---

## Task 9: CommentThread — fetch sort + my-votes + vote handler + score map

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentThread.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
// vet-exam-ai/components/comments/CommentThread.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import CommentList, { type RootWithReplies } from "./CommentList";
import CommentComposer from "./CommentComposer";
import type { CommentItemData } from "./CommentItem";
import type { CommentType } from "../../lib/comments/schema";
import type { SortMode } from "../../lib/comments/voteSchema";

type VoteValue = 1 | -1;

type Props = {
  questionId: string;
  highlightCommentId?: string;
};

type Status = "loading" | "ready" | "error";

type CommentRow = {
  id: string;
  user_id: string | null;
  parent_id: string | null;
  type: CommentType;
  body_html: string;
  created_at: string;
  status: string;
  vote_score: number;
};

export default function CommentThread({ questionId, highlightCommentId }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [roots, setRoots] = useState<RootWithReplies[]>([]);
  const [scoreById, setScoreById] = useState<Map<string, number>>(new Map());
  const [myVoteById, setMyVoteById] = useState<Map<string, VoteValue>>(new Map());
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserNickname, setCurrentUserNickname] = useState<string | null>(null);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  function showToast(msg: string) {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }

  // Fetch comments + roots/replies grouping
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus("loading");
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setCurrentUserId(user?.id ?? null);

      if (user) {
        const { data: profile } = await supabase
          .from("user_profiles_public")
          .select("nickname")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        setCurrentUserNickname(profile?.nickname ?? null);
      } else {
        setCurrentUserNickname(null);
      }

      const orderColumn = sortMode === "score" ? "vote_score" : "created_at";
      let query = supabase
        .from("comments")
        .select("id, user_id, parent_id, type, body_html, created_at, status, vote_score")
        .eq("question_id", questionId)
        .eq("status", "visible")
        .limit(50);
      if (sortMode === "score") {
        query = query
          .order("vote_score", { ascending: false })
          .order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const { data: commentRows, error } = await query;

      if (cancelled) return;
      if (error) {
        console.error("[CommentThread] comments fetch failed", error);
        setStatus("error");
        return;
      }
      const rows = (commentRows ?? []) as CommentRow[];

      // Build score map (denormalized vote_score from each row)
      const newScores = new Map<string, number>();
      for (const r of rows) newScores.set(r.id, r.vote_score ?? 0);
      setScoreById(newScores);
      // Suppress unused-var lint by referencing orderColumn (we already used it implicitly)
      void orderColumn;

      // Nickname stitch — embedded join unavailable.
      const userIds = Array.from(
        new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v))
      );
      const nicknameById = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles, error: profileErr } = await supabase
          .from("user_profiles_public")
          .select("user_id, nickname")
          .in("user_id", userIds);
        if (cancelled) return;
        if (profileErr) {
          console.warn("[CommentThread] profile fetch failed", profileErr);
        } else {
          for (const p of profiles ?? []) {
            nicknameById.set(p.user_id, p.nickname);
          }
        }
      }

      const toItem = (row: CommentRow): CommentItemData => ({
        id: row.id,
        user_id: row.user_id,
        type: row.type,
        body_html: row.body_html,
        created_at: row.created_at,
        authorNickname: row.user_id ? nicknameById.get(row.user_id) ?? null : null,
      });

      const rootRows = rows.filter((r) => r.parent_id === null);
      const replyRows = rows.filter((r) => r.parent_id !== null);

      const repliesByParent = new Map<string, CommentRow[]>();
      for (const r of replyRows) {
        const pid = r.parent_id as string;
        const arr = repliesByParent.get(pid) ?? [];
        arr.push(r);
        repliesByParent.set(pid, arr);
      }
      for (const [pid, arr] of repliesByParent) {
        arr.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        repliesByParent.set(pid, arr);
      }

      const knownRootIds = new Set(rootRows.map((r) => r.id));
      const assembled: RootWithReplies[] = rootRows.map((row) => ({
        ...toItem(row),
        replies: (repliesByParent.get(row.id) ?? []).map(toItem),
      }));

      for (const [pid, arr] of repliesByParent) {
        if (!knownRootIds.has(pid)) {
          const oldestReply = arr[0];
          assembled.push({
            id: pid,
            user_id: null,
            type: "discussion",
            body_html: "",
            created_at: oldestReply.created_at,
            authorNickname: null,
            replies: arr.map(toItem),
            isPlaceholder: true,
          });
        }
      }

      // Apply sort to roots in-memory (placeholders also sorted in)
      if (sortMode === "score") {
        assembled.sort((a, b) => {
          const sa = newScores.get(a.id) ?? 0;
          const sb = newScores.get(b.id) ?? 0;
          if (sb !== sa) return sb - sa;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      } else {
        assembled.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }

      setRoots(assembled);
      setStatus("ready");
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [questionId, sortMode, reloadKey]);

  // Fetch my-votes — independent of sortMode (votes don't change with sort)
  useEffect(() => {
    let cancelled = false;
    async function loadVotes() {
      if (!currentUserId) {
        setMyVoteById(new Map());
        return;
      }
      try {
        const res = await fetch(
          `/api/comments/votes-mine?question_id=${encodeURIComponent(questionId)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, 1 | -1>;
        if (cancelled) return;
        const m = new Map<string, VoteValue>();
        for (const [id, value] of Object.entries(data)) {
          if (value === 1 || value === -1) m.set(id, value);
        }
        setMyVoteById(m);
      } catch {
        // silent — votes optional
      }
    }
    loadVotes();
    return () => {
      cancelled = true;
    };
  }, [questionId, currentUserId, reloadKey]);

  // highlightCommentId scroll effect (existing — preserved)
  const highlightedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightCommentId) {
      highlightedRef.current = null;
      return;
    }
    if (highlightedRef.current === highlightCommentId) return;
    if (status !== "ready") return;
    const el = document.getElementById(`comment-${highlightCommentId}`);
    if (!el) return;

    highlightedRef.current = highlightCommentId;
    el.scrollIntoView({ block: "center", behavior: "smooth" });

    const prev = el.style.boxShadow;
    const prevTransition = el.style.transition;
    el.style.transition = "box-shadow 200ms ease-out";
    el.style.boxShadow = "0 0 0 2px var(--teal)";
    const timer = window.setTimeout(() => {
      el.style.boxShadow = prev;
      el.style.transition = prevTransition;
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [highlightCommentId, status, roots]);

  function handleRootSubmitted(newComment: CommentItemData) {
    setRoots((prev) => [
      {
        ...newComment,
        authorNickname: currentUserNickname,
        replies: [],
      },
      ...prev,
    ]);
    setScoreById((prev) => {
      const next = new Map(prev);
      next.set(newComment.id, 0);
      return next;
    });
  }

  function handleSubmitReply(parentId: string, newComment: CommentItemData) {
    setRoots((prev) =>
      prev.map((root) =>
        root.id === parentId
          ? {
              ...root,
              replies: [
                ...root.replies,
                { ...newComment, authorNickname: currentUserNickname },
              ],
            }
          : root
      )
    );
    setScoreById((prev) => {
      const next = new Map(prev);
      next.set(newComment.id, 0);
      return next;
    });
    setReplyingToId(null);
  }

  function handleStartReply(id: string) {
    setReplyingToId(id);
  }

  function handleCancelReply() {
    setReplyingToId(null);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("이 댓글을 삭제하시겠습니까?")) return;
    setRoots((prev) => {
      if (prev.some((r) => r.id === id && !r.isPlaceholder)) {
        return prev.filter((r) => r.id !== id);
      }
      return prev.map((root) => ({
        ...root,
        replies: root.replies.filter((rep) => rep.id !== id),
      }));
    });
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
    } catch {
      setReloadKey((k) => k + 1);
      window.alert("댓글 삭제에 실패했습니다. 다시 시도해주세요.");
    }
  }

  function handleUnauthedAttempt() {
    showToast("로그인하면 투표할 수 있습니다");
  }

  async function handleVoteChange(
    commentId: string,
    value: VoteValue,
    prev: VoteValue | null
  ) {
    // optimistic — myVote and score
    const prevScore = scoreById.get(commentId) ?? 0;
    let optimisticVote: VoteValue | null;
    let scoreDelta: number;
    if (prev === value) {
      optimisticVote = null;
      scoreDelta = -value;
    } else {
      optimisticVote = value;
      scoreDelta = value - (prev ?? 0);
    }

    setMyVoteById((m) => {
      const next = new Map(m);
      if (optimisticVote === null) next.delete(commentId);
      else next.set(commentId, optimisticVote);
      return next;
    });
    setScoreById((m) => {
      const next = new Map(m);
      next.set(commentId, prevScore + scoreDelta);
      return next;
    });

    try {
      const res = await fetch(`/api/comments/${commentId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        throw new Error(`vote failed: ${res.status}`);
      }
      const data = (await res.json()) as { vote: 1 | -1 | null };
      // Reconcile if server result diverges (e.g. race)
      setMyVoteById((m) => {
        const next = new Map(m);
        if (data.vote === null) next.delete(commentId);
        else next.set(commentId, data.vote);
        return next;
      });
    } catch {
      // rollback both
      setMyVoteById((m) => {
        const next = new Map(m);
        if (prev === null) next.delete(commentId);
        else next.set(commentId, prev);
        return next;
      });
      setScoreById((m) => {
        const next = new Map(m);
        next.set(commentId, prevScore);
        return next;
      });
      showToast("투표 처리에 실패했습니다.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "relative" }}>
      {status === "loading" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 64,
                background: "var(--surface-raised)",
                borderRadius: 10,
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
            background: "var(--wrong-dim)",
            border: "1px solid rgba(192,74,58,0.3)",
            borderRadius: 10,
            fontSize: 13,
            color: "var(--text)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          댓글을 불러올 수 없습니다.
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text)",
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      )}

      {status === "ready" && (
        <>
          <CommentList
            questionId={questionId}
            roots={roots}
            scoreById={scoreById}
            myVoteById={myVoteById}
            currentUserId={currentUserId}
            sortMode={sortMode}
            onSortChange={setSortMode}
            replyingToId={replyingToId}
            onStartReply={handleStartReply}
            onCancelReply={handleCancelReply}
            onSubmitReply={handleSubmitReply}
            onDelete={handleDelete}
            onVoteChange={handleVoteChange}
            onUnauthedAttempt={handleUnauthedAttempt}
          />
          {currentUserId ? (
            <CommentComposer questionId={questionId} onSubmitted={handleRootSubmitted} />
          ) : (
            <div
              style={{
                padding: "14px 16px",
                background: "var(--bg)",
                border: "1px dashed var(--border)",
                borderRadius: 10,
                fontSize: 13,
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              로그인하면 의견을 남길 수 있습니다.
            </div>
          )}
        </>
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--text)",
            color: "var(--bg)",
            padding: "10px 18px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            zIndex: 50,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck — should now PASS**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Build**

```bash
cd vet-exam-ai && npm run build
```

Expected: PASS (no warnings introduced).

- [ ] **Step 4: Commit**

```bash
cd vet-exam-ai && git add components/comments/CommentThread.tsx && git commit -m "comments: CommentThread sort/my-votes/vote handler + score state"
```

---

## Task 10: Manual smoke test on dev server

- [ ] **Step 1: Start dev server**

```bash
cd vet-exam-ai && npm run dev
```

- [ ] **Step 2: Smoke checklist (per spec §10)** — open a question with comments, sign in:
  - Click ▲ on a foreign comment → score +1, arrow teal. Click again → arrow neutral, score -1 (back to baseline).
  - Click ▼ on the same comment → arrow red, score -1. Click ▲ → score +2 delta (e.g. -1 → +1).
  - Hover ▲/▼ on your own comment → buttons disabled, tooltip "본인 댓글에는 투표할 수 없습니다".
  - Sign out, click ▲ → bottom toast "로그인하면 투표할 수 있습니다", no score change.
  - Sort dropdown right-aligned above thread → toggle 추천순 ↔ 최신순 → reordering occurs, replies stay asc.
  - Reply: vote on a reply works (smaller buttons).
  - Reload page → myVote state restored on the same comments.

If any item fails, fix it and re-run typecheck + build before continuing.

- [ ] **Step 3: Stop dev server (Ctrl+C in its terminal)**

- [ ] **Step 4: No commit needed unless smoke fixes were made.**

---

## Task 11: Push branch + create PR (manual)

- [ ] **Step 1: Push the branch**

```bash
cd vet-exam-ai && git push -u origin feat/comment-vote-sort-v1
```

- [ ] **Step 2: User creates PR via GitHub web UI** (gh CLI not installed per `dday_widget_done` memory).

PR title: `comments: vote + sort (M3 §15 PR-A)`
PR body should reference spec at `docs/superpowers/specs/2026-04-27-comment-vote-report-design.md` (§3 PR-A).

---

## Self-Review Notes

- Spec §3 PR-A coverage: T1 (schema) + T2 (vote endpoint) + T3 (votes-mine) + T4-5 (UI primitives) + T6-9 (integration) + T10 smoke. ✓
- Spec §4.1 vote flow: T2 (server) + T9 `handleVoteChange` (optimistic + reconcile + rollback). ✓
- Spec §4.2 sort: T9 `sortMode` state, server `order`, in-memory root sort with placeholder. ✓
- Spec §4.5 my-votes fetch: T3 endpoint + T9 useEffect with `currentUserId / reloadKey` deps (sort excluded — votes don't change with sort). ✓
- Spec §6.1 CommentVoteButton signature: T4. ✓ (matches T9 caller).
- Spec §6.4 sort dropdown: T5 + T8 placement. ✓
- Spec §6.5 CommentItem props: T6. ✓
- Spec §8 errors: T2 401/403/404/409/422/500 all handled. ✓
- Out of scope (§13) — none of these tasks touch trigger/migration, status≠visible fetch, report, blinded UI, or admin. ✓
- Type consistency: `(commentId, value, prev)` used uniformly across CommentVoteButton / CommentItem / CommentReplyGroup / CommentList / CommentThread. ✓
