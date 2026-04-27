# §15 PR-B — Comment Report + Auto-Blind UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comment reporting (8 reasons + optional 500-char description) and surface auto-collapsed states (`hidden_by_votes`, `blinded_by_report`) in the comment thread. One DB migration reinforces existing triggers (self-vote raise + `comment_blinded` notifications). Builds on PR-A.

**Architecture:** Single endpoint `POST /api/comments/[id]/report` plus `GET /api/comments/reports-mine` for the reporter's existing reports on a question. Modal UI with radio-8 + defamation inline notice. Collapsed state rendered as a dashed-bordered row with optional expansion (votes only — reports are RLS-protected). Trigger reinforcement is backward-compatible.

**Tech Stack:** Next.js 15 app router, Supabase JS, zod, lucide-react, plpgsql.

**Spec:** `docs/superpowers/specs/2026-04-27-comment-vote-report-design.md` — read §3 (PR-B), §4.3, §4.4, §5, §6.2, §6.3, §6.5, §7, §8.

**Branch:** `feat/comment-report-blind-v1` off `main` (after PR-A merged).

**Critical reminders for implementer subagents:**
- `cd vet-exam-ai && <cmd>` as a single chained line. Orchestrator uses absolute paths.
- `git status` before any `git add`. Stage explicit paths only. Never push.
- `comment_core_done` memory: stitch with IN-clause, no embedded join.
- `notifications_mvp_done` memory: inline `style` only, no Tailwind utility runtime injection.
- `community_tables_done` memory: **Supabase CLI `db push` may report "up to date" while not applying — apply migration via SQL Editor as a fallback. Confirm with `select pg_get_functiondef('public.handle_comment_report'::regproc);` after apply.**
- `comment_replies_done` memory: optimistic delete used `setReloadKey` to avoid stale snapshot — same pattern reusable here for any failure cases.

---

## File Structure

**New files:**
- `vet-exam-ai/supabase/migrations/20260427000000_comment_vote_report_blinded_alerts.sql` — replaces `handle_comment_vote` (self-vote raise + comment_blinded notif) and `handle_comment_report` (comment_blinded notif)
- `vet-exam-ai/lib/comments/reportSchema.ts` — zod schema for report API
- `vet-exam-ai/app/api/comments/[id]/report/route.ts` — report submission
- `vet-exam-ai/app/api/comments/reports-mine/route.ts` — GET my report state for a question
- `vet-exam-ai/components/comments/CommentMenuOverflow.tsx` — ⋯ button + dropdown (신고 / 신고됨 ✓)
- `vet-exam-ai/components/comments/CommentReportModal.tsx` — 8 radios + defamation notice + 500-char textarea
- `vet-exam-ai/components/comments/CommentCollapsedRow.tsx` — dashed row for hidden_by_votes / blinded_by_report

**Modified files:**
- `vet-exam-ai/components/comments/CommentItem.tsx` — accept `status`, `isReported`, `onReport`; add ⋯ menu; expose owner/admin override
- `vet-exam-ai/components/comments/CommentList.tsx` — render collapsed row variant when `status !== 'visible'`; expansion state passes through
- `vet-exam-ai/components/comments/CommentReplyGroup.tsx` — same collapsed handling for reply rows
- `vet-exam-ai/components/comments/CommentThread.tsx` — fetch `status in ('visible','hidden_by_votes','blinded_by_report')`, fetch reports-mine, expanded-set state, vote allowed on `hidden_by_votes`, report handler

---

## Task 0: Branch + verify baseline (PR-A merged)

- [ ] **Step 1: Verify PR-A landed on main**

```bash
cd vet-exam-ai && git checkout main && git pull --ff-only origin main && git log --oneline -5
```

Expected: PR-A merge commit present (vote/sort routes and components exist).

- [ ] **Step 2: Verify baseline files present (sanity)**

```bash
cd vet-exam-ai && ls app/api/comments/[id]/vote/route.ts app/api/comments/votes-mine/route.ts components/comments/CommentVoteButton.tsx components/comments/CommentSortToggle.tsx
```

Expected: all four exist. If not, PR-A is not merged — stop and resolve before proceeding.

- [ ] **Step 3: Create feature branch**

```bash
cd vet-exam-ai && git checkout -b feat/comment-report-blind-v1 && git status
```

Expected: clean working tree, branch `feat/comment-report-blind-v1`.

- [ ] **Step 4: Typecheck baseline**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: PASS.

---

## Task 1: Migration — handle_comment_vote + handle_comment_report patches

**Files:**
- Create: `vet-exam-ai/supabase/migrations/20260427000000_comment_vote_report_blinded_alerts.sql`

This task rewrites the two trigger functions in full. The existing definitions live in `vet-exam-ai/supabase/migrations/20260425000001_community_comments.sql` lines 184-272 (`handle_comment_vote`) and 280-310 (`handle_comment_report`). The patched versions add: (a) self-vote raise with errcode `P0002` (b) `comment_blinded` notifications when the comment first transitions to `hidden_by_votes` or `blinded_by_report`. The status-guarded UPDATE serves as idempotency (only one row will return).

- [ ] **Step 1: Write the migration**

```sql
-- vet-exam-ai/supabase/migrations/20260427000000_comment_vote_report_blinded_alerts.sql

-- =============================================================================
-- §15 PR-B: comment vote / report — self-vote raise + comment_blinded notifications
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. handle_comment_vote — replace
--    (a) raise on self-vote (P0002)
--    (b) emit comment_blinded notification when comment first transitions
--        from 'visible' to 'hidden_by_votes' (status WHERE clause = idempotency)
-- ---------------------------------------------------------------------------
create or replace function public.handle_comment_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  vote_delta integer := 0;
  new_score  integer;
  comment_owner uuid;
  hidden_owner uuid;
begin
  -- (a) self-vote guard (INSERT/UPDATE only — DELETE is the user cancelling their own vote)
  if TG_OP in ('INSERT', 'UPDATE') then
    select user_id into comment_owner
      from public.comments where id = new.comment_id;
    if comment_owner is not null and comment_owner = new.user_id then
      raise exception 'Cannot vote on own comment'
        using errcode = 'P0002';
    end if;
    comment_owner := null;  -- reset; milestone block re-resolves owner from update RETURNING
  end if;

  -- counter updates (unchanged from baseline)
  if TG_OP = 'INSERT' then
    if new.value = 1 then
      update public.comments
        set upvote_count = upvote_count + 1,
            vote_score   = vote_score + 1
        where id = new.comment_id
        returning vote_score, user_id into new_score, comment_owner;
    else
      update public.comments
        set downvote_count = downvote_count + 1,
            vote_score     = vote_score - 1
        where id = new.comment_id
        returning vote_score, user_id into new_score, comment_owner;
    end if;
  elsif TG_OP = 'UPDATE' then
    if new.value != old.value then
      vote_delta := new.value - old.value;
      update public.comments
        set upvote_count   = upvote_count   + (case when new.value =  1 then 1 else -1 end),
            downvote_count = downvote_count + (case when new.value = -1 then 1 else -1 end),
            vote_score     = vote_score + vote_delta
        where id = new.comment_id
        returning vote_score, user_id into new_score, comment_owner;
    end if;
  elsif TG_OP = 'DELETE' then
    if old.value = 1 then
      update public.comments
        set upvote_count = upvote_count - 1,
            vote_score   = vote_score - 1
        where id = old.comment_id
        returning vote_score into new_score;
    else
      update public.comments
        set downvote_count = downvote_count - 1,
            vote_score     = vote_score + 1
        where id = old.comment_id
        returning vote_score into new_score;
    end if;
  end if;

  -- milestone notification + popular_comment badge (unchanged)
  if new_score in (10, 50, 100) and comment_owner is not null then
    insert into public.notifications (user_id, type, related_comment_id, payload)
    values (
      comment_owner,
      'vote_milestone',
      new.comment_id,
      jsonb_build_object('milestone', new_score, 'comment_score', new_score)
    )
    on conflict do nothing;

    if new_score = 10 then
      insert into public.badges (user_id, badge_type, reason)
      values (comment_owner, 'popular_comment', 'auto-granted on 10 upvotes')
      on conflict (user_id, badge_type) do nothing;
    end if;
  end if;

  -- (b) auto-hide at -5 + comment_blinded notification on transition only.
  --     status='visible' guard ensures the UPDATE returns at most one row,
  --     which makes the notification idempotent across repeated dips.
  if new_score is not null and new_score <= -5 then
    update public.comments
      set status = 'hidden_by_votes'
      where id = coalesce(new.comment_id, old.comment_id) and status = 'visible'
      returning user_id into hidden_owner;

    if hidden_owner is not null then
      insert into public.notifications (user_id, type, related_comment_id, payload)
      values (
        hidden_owner,
        'comment_blinded',
        coalesce(new.comment_id, old.comment_id),
        jsonb_build_object('reason', 'votes', 'score', new_score)
      );
    end if;
  end if;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. handle_comment_report — replace
--    Add: comment_blinded notification when comment first transitions
--    from 'visible' to 'blinded_by_report' (status WHERE clause = idempotency)
-- ---------------------------------------------------------------------------
create or replace function public.handle_comment_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count       smallint;
  blinded_owner   uuid;
begin
  update public.comments
    set report_count = report_count + 1
    where id = new.comment_id
    returning report_count into new_count;

  -- 3+ reports → auto-blind (transition only via status='visible' guard)
  if new_count >= 3 then
    update public.comments
      set status = 'blinded_by_report'
      where id = new.comment_id and status = 'visible'
      returning user_id into blinded_owner;

    if blinded_owner is not null then
      insert into public.notifications (user_id, type, related_comment_id, payload)
      values (
        blinded_owner,
        'comment_blinded',
        new.comment_id,
        jsonb_build_object('reason', 'reports', 'count', new_count)
      );
    end if;
  end if;

  -- defamation → 정보통신망법 30-day temporary measure (unchanged)
  if new.reason = 'defamation' then
    update public.comments
      set blinded_until = greatest(coalesce(blinded_until, now()), now() + interval '30 days')
      where id = new.comment_id;
  end if;

  return new;
end;
$$;
```

- [ ] **Step 2: Apply the migration to the remote DB**

The CLI may report "up to date" without applying changes (community_tables_done memory). Verify after either path:

Path A — CLI:
```bash
cd vet-exam-ai && SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" npx supabase db push
```

Path B (fallback) — paste the migration SQL into the Supabase Dashboard SQL Editor.

- [ ] **Step 3: Verify functions were updated**

In the Supabase SQL Editor, run:

```sql
select pg_get_functiondef('public.handle_comment_vote'::regproc);
select pg_get_functiondef('public.handle_comment_report'::regproc);
```

Expected: both definitions contain `'comment_blinded'` literal and `handle_comment_vote` contains `errcode = 'P0002'`. If not, the migration did not apply — fix before proceeding.

- [ ] **Step 4: Commit**

```bash
cd vet-exam-ai && git add supabase/migrations/20260427000000_comment_vote_report_blinded_alerts.sql && git commit -m "comments: trigger patch — self-vote raise + comment_blinded notifs"
```

---

## Task 2: Report zod schema

**Files:**
- Create: `vet-exam-ai/lib/comments/reportSchema.ts`

- [ ] **Step 1: Write the schema**

```ts
// vet-exam-ai/lib/comments/reportSchema.ts
import { z } from "zod";

export const REPORT_REASONS = [
  "spam",
  "misinformation",
  "privacy",
  "hate_speech",
  "advertising",
  "copyright",
  "defamation",
  "other",
] as const;

export const ReportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof ReportReasonSchema>;

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  spam: "스팸",
  misinformation: "오답 / 잘못된 정보 전파",
  privacy: "개인정보 노출",
  hate_speech: "욕설 / 혐오 / 차별",
  advertising: "광고 / 홍보",
  copyright: "저작권 침해",
  defamation: "명예훼손 (정보통신망법 임시조치 요청)",
  other: "기타",
};

export const ReportRequestSchema = z.object({
  reason: ReportReasonSchema,
  description: z.string().max(500, "500자를 초과할 수 없습니다").optional(),
});
export type ReportRequest = z.infer<typeof ReportRequestSchema>;
```

- [ ] **Step 2: Typecheck**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd vet-exam-ai && git add lib/comments/reportSchema.ts && git commit -m "comments: add report zod schema + labels"
```

---

## Task 3: POST /api/comments/[id]/report

**Files:**
- Create: `vet-exam-ai/app/api/comments/[id]/report/route.ts`

- [ ] **Step 1: Write the route**

```ts
// vet-exam-ai/app/api/comments/[id]/report/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { ReportRequestSchema } from "../../../../../lib/comments/reportSchema";

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

  const parsed = ReportRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const { reason, description } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

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
      { error: "Cannot report own comment" },
      { status: 403 }
    );
  }
  if (comment.status === "removed_by_admin") {
    return NextResponse.json(
      { error: "Comment is no longer available" },
      { status: 410 }
    );
  }

  const insertPayload = {
    comment_id: id,
    reporter_id: user.id,
    reason,
    description: description ?? null,
  };

  const { error: insertErr } = await supabase
    .from("comment_reports")
    .insert(insertPayload);

  if (insertErr) {
    // unique (comment_id, reporter_id) violation → already reported
    if (insertErr.code === "23505") {
      return NextResponse.json(
        { error: "Already reported" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd vet-exam-ai && git add app/api/comments/[id]/report/route.ts && git commit -m "comments: add POST /api/comments/[id]/report"
```

---

## Task 4: GET /api/comments/reports-mine

**Files:**
- Create: `vet-exam-ai/app/api/comments/reports-mine/route.ts`

- [ ] **Step 1: Write the route**

```ts
// vet-exam-ai/app/api/comments/reports-mine/route.ts
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
    return NextResponse.json([], { status: 200 });
  }

  // step 1: comment ids on this question (RLS lets us read all on visible comments)
  const { data: ids, error: idsErr } = await supabase
    .from("comments")
    .select("id")
    .eq("question_id", questionId)
    .limit(200);

  if (idsErr) {
    return NextResponse.json({ error: idsErr.message }, { status: 500 });
  }
  if (!ids || ids.length === 0) {
    return NextResponse.json([], { status: 200 });
  }

  // step 2: my reports within those ids — RLS already restricts to reporter_id = auth.uid()
  const commentIds = ids.map((r) => r.id);
  const { data: reports, error: reportsErr } = await supabase
    .from("comment_reports")
    .select("comment_id")
    .eq("reporter_id", user.id)
    .in("comment_id", commentIds);

  if (reportsErr) {
    return NextResponse.json({ error: reportsErr.message }, { status: 500 });
  }

  const reported = (reports ?? []).map((r) => r.comment_id);
  return NextResponse.json(reported, { status: 200 });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd vet-exam-ai && git add app/api/comments/reports-mine/route.ts && git commit -m "comments: add GET /api/comments/reports-mine"
```

---

## Task 5: CommentReportModal component

**Files:**
- Create: `vet-exam-ai/components/comments/CommentReportModal.tsx`

- [ ] **Step 1: Write the component**

```tsx
// vet-exam-ai/components/comments/CommentReportModal.tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  REPORT_REASONS,
  REPORT_REASON_LABEL,
  type ReportReason,
} from "../../lib/comments/reportSchema";

type Props = {
  commentId: string;
  open: boolean;
  onClose: () => void;
  onSubmitted: (commentId: string) => void;
  onAlreadyReported: (commentId: string) => void;
};

export default function CommentReportModal({
  commentId,
  open,
  onClose,
  onSubmitted,
  onAlreadyReported,
}: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setReason(null);
      setDescription("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const charCount = description.length;
  const overLimit = charCount > 500;
  const canSubmit = reason !== null && !overLimit && !submitting;

  async function handleSubmit() {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/comments/${commentId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          ...(description.length > 0 ? { description } : {}),
        }),
      });
      if (res.status === 201) {
        onSubmitted(commentId);
        onClose();
        return;
      }
      if (res.status === 409) {
        onAlreadyReported(commentId);
        onClose();
        return;
      }
      if (res.status === 403) {
        setError("본인 댓글은 신고할 수 없습니다.");
      } else if (res.status === 410) {
        setError("이미 처리된 댓글입니다.");
      } else if (res.status === 422) {
        setError("입력값이 올바르지 않습니다.");
      } else {
        setError("신고 처리에 실패했습니다. 다시 시도해주세요.");
      }
    } catch {
      setError("네트워크 오류로 신고에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="댓글 신고"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--bg)",
          borderRadius: 12,
          boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <strong style={{ fontSize: 14, color: "var(--text)" }}>댓글 신고</strong>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-faint)",
              padding: 4,
              display: "inline-flex",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            overflow: "auto",
          }}
        >
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            신고 사유를 선택해주세요.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {REPORT_REASONS.map((r) => (
              <label
                key={r}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "8px 10px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: reason === r ? "var(--surface-raised)" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  style={{ marginTop: 2 }}
                />
                <span style={{ fontSize: 13, color: "var(--text)" }}>
                  {REPORT_REASON_LABEL[r]}
                </span>
              </label>
            ))}
          </div>

          {reason === "defamation" && (
            <div
              role="note"
              style={{
                marginTop: 4,
                padding: "10px 12px",
                background: "var(--wrong-dim)",
                border: "1px solid rgba(192,74,58,0.3)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--text)",
                lineHeight: 1.6,
              }}
            >
              이 신고는 정보통신망법 제44조의2에 따른 임시조치 요청입니다.
              30일간 비공개 처리되며, 작성자에게 이의제기 기회가 부여됩니다.
            </div>
          )}

          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
              부가 설명 (선택)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="추가로 알려주실 내용이 있으면 입력해주세요."
              style={{
                width: "100%",
                resize: "vertical",
                padding: "8px 10px",
                fontSize: 13,
                background: "var(--bg)",
                border: `1px solid ${overLimit ? "var(--wrong)" : "var(--border)"}`,
                borderRadius: 8,
                color: "var(--text)",
                fontFamily: "inherit",
              }}
            />
            <div
              style={{
                fontSize: 11,
                color: overLimit ? "var(--wrong)" : "var(--text-faint)",
                textAlign: "right",
              }}
            >
              {charCount} / 500
            </div>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                padding: "8px 10px",
                background: "var(--wrong-dim)",
                border: "1px solid rgba(192,74,58,0.3)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--text)",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text)",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              background: canSubmit ? "var(--wrong)" : "var(--surface-raised)",
              border: "none",
              color: canSubmit ? "#fff" : "var(--text-faint)",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {submitting ? "제출 중..." : "신고하기"}
          </button>
        </div>
      </div>
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
cd vet-exam-ai && git add components/comments/CommentReportModal.tsx && git commit -m "comments: add CommentReportModal (8 reasons + defamation notice)"
```

---

## Task 6: CommentMenuOverflow component

**Files:**
- Create: `vet-exam-ai/components/comments/CommentMenuOverflow.tsx`

- [ ] **Step 1: Write the component**

```tsx
// vet-exam-ai/components/comments/CommentMenuOverflow.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

type Props = {
  isOwner: boolean;
  isReported: boolean;
  canDelete: boolean;
  canReport: boolean;
  onDelete: () => void;
  onReport: () => void;
};

export default function CommentMenuOverflow({
  isOwner,
  isReported,
  canDelete,
  canReport,
  onDelete,
  onReport,
}: Props) {
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

  // Don't render if no actions are available. (After hooks — React rules-of-hooks.)
  const showDelete = canDelete;
  const showReport = !isOwner && canReport && !isReported;
  const showReportedBadge = !isOwner && isReported;
  if (!showDelete && !showReport && !showReportedBadge) return null;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="더보기"
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
        <MoreHorizontal size={14} />
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
            minWidth: 120,
            zIndex: 20,
            overflow: "hidden",
          }}
        >
          {showDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              style={{
                display: "block",
                width: "100%",
                background: "transparent",
                border: "none",
                padding: "8px 12px",
                textAlign: "left",
                fontSize: 12,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              삭제
            </button>
          )}
          {showReport && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onReport();
              }}
              style={{
                display: "block",
                width: "100%",
                background: "transparent",
                border: "none",
                padding: "8px 12px",
                textAlign: "left",
                fontSize: 12,
                color: "var(--wrong)",
                cursor: "pointer",
              }}
            >
              신고
            </button>
          )}
          {showReportedBadge && (
            <span
              role="menuitem"
              aria-disabled="true"
              style={{
                display: "block",
                width: "100%",
                padding: "8px 12px",
                textAlign: "left",
                fontSize: 12,
                color: "var(--text-faint)",
                cursor: "not-allowed",
              }}
            >
              신고됨 ✓
            </span>
          )}
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
cd vet-exam-ai && git add components/comments/CommentMenuOverflow.tsx && git commit -m "comments: add CommentMenuOverflow (delete / report / reported badge)"
```

---

## Task 7: CommentCollapsedRow component

**Files:**
- Create: `vet-exam-ai/components/comments/CommentCollapsedRow.tsx`

- [ ] **Step 1: Write the component**

```tsx
// vet-exam-ai/components/comments/CommentCollapsedRow.tsx
"use client";

import { ChevronDown } from "lucide-react";

type Props = {
  commentId: string;
  reason: "votes" | "reports";
  score?: number;
  canExpand: boolean;
  onExpand?: (id: string) => void;
};

export default function CommentCollapsedRow({
  commentId,
  reason,
  score,
  canExpand,
  onExpand,
}: Props) {
  const label =
    reason === "votes"
      ? `누적 비추천으로 접힘${typeof score === "number" ? ` (${score})` : ""}`
      : "신고로 임시 비공개된 댓글입니다";

  return (
    <div
      id={`comment-${commentId}`}
      style={{
        background: "var(--bg)",
        border: "1px dashed var(--border)",
        borderRadius: 10,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        fontSize: 12,
        color: "var(--text-faint)",
      }}
    >
      <span>{label}</span>
      {canExpand && onExpand && (
        <button
          type="button"
          onClick={() => onExpand(commentId)}
          aria-label="댓글 펼치기"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-faint)",
            cursor: "pointer",
            padding: 4,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          펼치기 <ChevronDown size={12} />
        </button>
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
cd vet-exam-ai && git add components/comments/CommentCollapsedRow.tsx && git commit -m "comments: add CommentCollapsedRow (votes/reports collapsed display)"
```

---

## Task 8: CommentItem replaces Trash2 with overflow menu + status awareness

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentItem.tsx`

CommentItem keeps its existing layout but routes delete/report through `CommentMenuOverflow`. The `Trash2` import is removed; menu is rendered after the vote button. New props: `status`, `isReported`, `onReport`. The collapsed-state branch (votes/reports) is rendered by the parent — CommentItem assumes the row is being shown in full.

- [ ] **Step 1: Replace the entire file**

```tsx
// vet-exam-ai/components/comments/CommentItem.tsx
"use client";

import { MessageCircle } from "lucide-react";
import type { CommentType } from "../../lib/comments/schema";
import CommentVoteButton from "./CommentVoteButton";
import CommentMenuOverflow from "./CommentMenuOverflow";

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
  status: "visible" | "hidden_by_votes" | "blinded_by_report";
  isOwner: boolean;
  isAuthed: boolean;
  isReported: boolean;
  canDelete: boolean;
  onDelete: (id: string) => void;
  onReport: (id: string) => void;
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
  status,
  isOwner,
  isAuthed,
  isReported,
  canDelete,
  onDelete,
  onReport,
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

  // Voting allowed on visible and hidden_by_votes (when expanded). Disabled on blinded_by_report.
  const voteDisabled = status === "blinded_by_report";

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
        {status === "blinded_by_report" && isOwner && (
          <span
            style={{
              background: "var(--wrong-dim)",
              color: "var(--wrong)",
              borderRadius: 999,
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            신고로 임시 비공개됨
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "inline-flex", gap: 4, alignItems: "center" }}>
          <CommentVoteButton
            commentId={comment.id}
            score={score}
            myVote={myVote}
            isOwner={isOwner || voteDisabled}
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
          <CommentMenuOverflow
            isOwner={isOwner}
            isReported={isReported}
            canDelete={canDelete}
            canReport={isAuthed && status !== "blinded_by_report"}
            onDelete={() => onDelete(comment.id)}
            onReport={() => onReport(comment.id)}
          />
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

- [ ] **Step 2: Typecheck — expected to FAIL on callers**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: errors in `CommentList.tsx` and `CommentReplyGroup.tsx` (missing `status` / `isReported` / `onReport`). Tasks 9/10 fix.

- [ ] **Step 3: Commit (intentional broken state)**

```bash
cd vet-exam-ai && git add components/comments/CommentItem.tsx && git commit -m "comments: CommentItem overflow menu + status/isReported props"
```

---

## Task 9: CommentReplyGroup forwards new props

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentReplyGroup.tsx`

ReplyGroup also needs to render `CommentCollapsedRow` for replies whose status is `hidden_by_votes` or `blinded_by_report`. We extend `replies` rows to carry their `status` and let ReplyGroup branch.

- [ ] **Step 1: Replace the entire file**

```tsx
// vet-exam-ai/components/comments/CommentReplyGroup.tsx
"use client";

import CommentItem, { type CommentItemData } from "./CommentItem";
import CommentReplyComposer from "./CommentReplyComposer";
import CommentCollapsedRow from "./CommentCollapsedRow";

type VoteValue = 1 | -1;
type CommentStatus = "visible" | "hidden_by_votes" | "blinded_by_report";

export type ReplyRow = CommentItemData & { status: CommentStatus };

type Props = {
  questionId: string;
  parentId: string;
  replies: ReplyRow[];
  scoreById: Map<string, number>;
  myVoteById: Map<string, VoteValue>;
  reportedIds: Set<string>;
  expandedIds: Set<string>;
  currentUserId: string | null;
  isComposerOpen: boolean;
  onSubmitReply: (parentId: string, newComment: CommentItemData) => void;
  onCancelReply: () => void;
  onDelete: (id: string) => void;
  onReport: (id: string) => void;
  onVoteChange: (commentId: string, value: VoteValue, prev: VoteValue | null) => void;
  onUnauthedAttempt?: () => void;
  onExpand: (id: string) => void;
};

export default function CommentReplyGroup({
  questionId,
  parentId,
  replies,
  scoreById,
  myVoteById,
  reportedIds,
  expandedIds,
  currentUserId,
  isComposerOpen,
  onSubmitReply,
  onCancelReply,
  onDelete,
  onReport,
  onVoteChange,
  onUnauthedAttempt,
  onExpand,
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
      {replies.map((r) => {
        const isOwner = currentUserId !== null && r.user_id === currentUserId;
        const expanded = expandedIds.has(r.id);

        if (r.status === "hidden_by_votes" && !expanded && !isOwner) {
          return (
            <CommentCollapsedRow
              key={r.id}
              commentId={r.id}
              reason="votes"
              score={scoreById.get(r.id)}
              canExpand
              onExpand={onExpand}
            />
          );
        }
        if (r.status === "blinded_by_report" && !isOwner) {
          return (
            <CommentCollapsedRow
              key={r.id}
              commentId={r.id}
              reason="reports"
              canExpand={false}
            />
          );
        }
        return (
          <CommentItem
            key={r.id}
            comment={r}
            score={scoreById.get(r.id) ?? 0}
            myVote={myVoteById.get(r.id) ?? null}
            status={r.status}
            isOwner={isOwner}
            isAuthed={currentUserId !== null}
            isReported={reportedIds.has(r.id)}
            canDelete={isOwner}
            onDelete={onDelete}
            onReport={onReport}
            onVoteChange={onVoteChange}
            onUnauthedAttempt={onUnauthedAttempt}
            isReply
          />
        );
      })}
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

- [ ] **Step 2: Typecheck — should narrow errors to CommentList.tsx**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: errors only in `CommentList.tsx` and `CommentThread.tsx`. ReplyGroup itself OK.

- [ ] **Step 3: Commit**

```bash
cd vet-exam-ai && git add components/comments/CommentReplyGroup.tsx && git commit -m "comments: ReplyGroup renders collapsed rows + forwards report props"
```

---

## Task 10: CommentList renders root collapsed rows

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentList.tsx`

`RootWithReplies` gains a `status` field, replies are typed as `ReplyRow`. The list renders a collapsed row for non-`visible` non-expanded roots, and otherwise hands off to `CommentItem`. Replies under a collapsed root still render normally (per spec §4.4).

- [ ] **Step 1: Replace the entire file**

```tsx
// vet-exam-ai/components/comments/CommentList.tsx
"use client";

import CommentItem, { type CommentItemData } from "./CommentItem";
import CommentReplyGroup, { type ReplyRow } from "./CommentReplyGroup";
import CommentSortToggle from "./CommentSortToggle";
import CommentCollapsedRow from "./CommentCollapsedRow";
import type { SortMode } from "../../lib/comments/voteSchema";

type VoteValue = 1 | -1;
type CommentStatus = "visible" | "hidden_by_votes" | "blinded_by_report";

export type RootWithReplies = CommentItemData & {
  status: CommentStatus;
  replies: ReplyRow[];
  isPlaceholder?: boolean;
};

type Props = {
  questionId: string;
  roots: RootWithReplies[];
  scoreById: Map<string, number>;
  myVoteById: Map<string, VoteValue>;
  reportedIds: Set<string>;
  expandedIds: Set<string>;
  currentUserId: string | null;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  replyingToId: string | null;
  onStartReply: (id: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (parentId: string, newComment: CommentItemData) => void;
  onDelete: (id: string) => void;
  onReport: (id: string) => void;
  onVoteChange: (commentId: string, value: VoteValue, prev: VoteValue | null) => void;
  onUnauthedAttempt?: () => void;
  onExpand: (id: string) => void;
};

export default function CommentList({
  questionId,
  roots,
  scoreById,
  myVoteById,
  reportedIds,
  expandedIds,
  currentUserId,
  sortMode,
  onSortChange,
  replyingToId,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onDelete,
  onReport,
  onVoteChange,
  onUnauthedAttempt,
  onExpand,
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
          const isOwner =
            currentUserId !== null && root.user_id === currentUserId;
          const expanded = expandedIds.has(root.id);

          let rootDisplay: React.ReactNode;
          if (root.isPlaceholder) {
            // Existing hidden_by_author placeholder — handled by CommentItem.
            rootDisplay = (
              <CommentItem
                comment={root}
                score={scoreById.get(root.id) ?? 0}
                myVote={myVoteById.get(root.id) ?? null}
                status="visible"
                isOwner={false}
                isAuthed={currentUserId !== null}
                isReported={false}
                canDelete={false}
                onDelete={onDelete}
                onReport={onReport}
                onVoteChange={onVoteChange}
                onUnauthedAttempt={onUnauthedAttempt}
                onStartReply={undefined}
                isPlaceholder
              />
            );
          } else if (root.status === "hidden_by_votes" && !expanded && !isOwner) {
            rootDisplay = (
              <CommentCollapsedRow
                commentId={root.id}
                reason="votes"
                score={scoreById.get(root.id)}
                canExpand
                onExpand={onExpand}
              />
            );
          } else if (root.status === "blinded_by_report" && !isOwner) {
            rootDisplay = (
              <CommentCollapsedRow
                commentId={root.id}
                reason="reports"
                canExpand={false}
              />
            );
          } else {
            const canDeleteRoot = isOwner;
            rootDisplay = (
              <CommentItem
                comment={root}
                score={scoreById.get(root.id) ?? 0}
                myVote={myVoteById.get(root.id) ?? null}
                status={root.status}
                isOwner={isOwner}
                isAuthed={currentUserId !== null}
                isReported={reportedIds.has(root.id)}
                canDelete={canDeleteRoot}
                onDelete={onDelete}
                onReport={onReport}
                onVoteChange={onVoteChange}
                onUnauthedAttempt={onUnauthedAttempt}
                onStartReply={
                  currentUserId === null ? undefined : onStartReply
                }
              />
            );
          }

          return (
            <div
              key={root.id}
              style={{ display: "flex", flexDirection: "column", gap: 0 }}
            >
              {rootDisplay}
              {showGroup && (
                <CommentReplyGroup
                  questionId={questionId}
                  parentId={root.id}
                  replies={root.replies}
                  scoreById={scoreById}
                  myVoteById={myVoteById}
                  reportedIds={reportedIds}
                  expandedIds={expandedIds}
                  currentUserId={currentUserId}
                  isComposerOpen={composerOpenForRoot}
                  onSubmitReply={onSubmitReply}
                  onCancelReply={onCancelReply}
                  onDelete={onDelete}
                  onReport={onReport}
                  onVoteChange={onVoteChange}
                  onUnauthedAttempt={onUnauthedAttempt}
                  onExpand={onExpand}
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

- [ ] **Step 2: Typecheck — expected error only in CommentThread.tsx**

```bash
cd vet-exam-ai && npm run typecheck
```

Expected: errors only in `CommentThread.tsx`. List & ReplyGroup OK.

- [ ] **Step 3: Commit**

```bash
cd vet-exam-ai && git add components/comments/CommentList.tsx && git commit -m "comments: CommentList renders root collapsed rows + forwards"
```

---

## Task 11: CommentThread — fetch 3 statuses + reports + expansion + report flow

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentThread.tsx`

This expands the existing fetch to 3 statuses, threads `status` through to `RootWithReplies` / `ReplyRow`, fetches reports-mine, owns `expandedIds` and `reportedIds` state, and renders `CommentReportModal` at the bottom keyed by a `reportingId`.

- [ ] **Step 1: Replace the entire file**

```tsx
// vet-exam-ai/components/comments/CommentThread.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import CommentList, { type RootWithReplies } from "./CommentList";
import type { ReplyRow } from "./CommentReplyGroup";
import CommentComposer from "./CommentComposer";
import CommentReportModal from "./CommentReportModal";
import type { CommentItemData } from "./CommentItem";
import type { CommentType } from "../../lib/comments/schema";
import type { SortMode } from "../../lib/comments/voteSchema";

type VoteValue = 1 | -1;
type CommentStatus = "visible" | "hidden_by_votes" | "blinded_by_report";

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
  status: CommentStatus;
  vote_score: number;
};

const VISIBLE_STATUSES: CommentStatus[] = [
  "visible",
  "hidden_by_votes",
  "blinded_by_report",
];

export default function CommentThread({ questionId, highlightCommentId }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [roots, setRoots] = useState<RootWithReplies[]>([]);
  const [scoreById, setScoreById] = useState<Map<string, number>>(new Map());
  const [myVoteById, setMyVoteById] = useState<Map<string, VoteValue>>(new Map());
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserNickname, setCurrentUserNickname] = useState<string | null>(null);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  function showToast(msg: string) {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }

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

      let query = supabase
        .from("comments")
        .select("id, user_id, parent_id, type, body_html, created_at, status, vote_score")
        .eq("question_id", questionId)
        .in("status", VISIBLE_STATUSES)
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

      const newScores = new Map<string, number>();
      for (const r of rows) newScores.set(r.id, r.vote_score ?? 0);
      setScoreById(newScores);

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
        status: row.status,
        replies: (repliesByParent.get(row.id) ?? []).map<ReplyRow>((rr) => ({
          ...toItem(rr),
          status: rr.status,
        })),
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
            status: "visible",
            replies: arr.map<ReplyRow>((rr) => ({
              ...toItem(rr),
              status: rr.status,
            })),
            isPlaceholder: true,
          });
        }
      }

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
        /* silent */
      }
    }
    loadVotes();
    return () => {
      cancelled = true;
    };
  }, [questionId, currentUserId, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadReports() {
      if (!currentUserId) {
        setReportedIds(new Set());
        return;
      }
      try {
        const res = await fetch(
          `/api/comments/reports-mine?question_id=${encodeURIComponent(questionId)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as string[];
        if (cancelled) return;
        setReportedIds(new Set(data));
      } catch {
        /* silent */
      }
    }
    loadReports();
    return () => {
      cancelled = true;
    };
  }, [questionId, currentUserId, reloadKey]);

  // Highlight effect (existing — preserved)
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
        status: "visible",
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
                {
                  ...newComment,
                  status: "visible",
                  authorNickname: currentUserNickname,
                },
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
      setMyVoteById((m) => {
        const next = new Map(m);
        if (data.vote === null) next.delete(commentId);
        else next.set(commentId, data.vote);
        return next;
      });
    } catch {
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

  function handleReport(id: string) {
    if (!currentUserId) {
      showToast("로그인하면 신고할 수 있습니다");
      return;
    }
    setReportingId(id);
  }

  function handleReportSubmitted(id: string) {
    setReportedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    showToast("신고가 접수되었습니다.");
  }

  function handleAlreadyReported(id: string) {
    setReportedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    showToast("이미 신고하신 댓글입니다.");
  }

  function handleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
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
            reportedIds={reportedIds}
            expandedIds={expandedIds}
            currentUserId={currentUserId}
            sortMode={sortMode}
            onSortChange={setSortMode}
            replyingToId={replyingToId}
            onStartReply={handleStartReply}
            onCancelReply={handleCancelReply}
            onSubmitReply={handleSubmitReply}
            onDelete={handleDelete}
            onReport={handleReport}
            onVoteChange={handleVoteChange}
            onUnauthedAttempt={handleUnauthedAttempt}
            onExpand={handleExpand}
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

      {reportingId && (
        <CommentReportModal
          commentId={reportingId}
          open={!!reportingId}
          onClose={() => setReportingId(null)}
          onSubmitted={handleReportSubmitted}
          onAlreadyReported={handleAlreadyReported}
        />
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

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd vet-exam-ai && git add components/comments/CommentThread.tsx && git commit -m "comments: CommentThread 3-status fetch + reports + expansion + report modal"
```

---

## Task 12: Manual smoke test on dev server

- [ ] **Step 1: Start dev server**

```bash
cd vet-exam-ai && npm run dev
```

- [ ] **Step 2: Smoke checklist (per spec §10 PR-B)** — sign in:
  - Click ⋯ on a foreign comment → menu shows "신고". Click → modal opens.
  - Modal: select "명예훼손 (정보통신망법 임시조치 요청)" → red inline notice appears.
  - Type 501 chars in 부가 설명 → counter goes red, submit button disabled.
  - Submit valid report (e.g., "스팸") → modal closes, toast "신고가 접수되었습니다", ⋯ menu now shows "신고됨 ✓" disabled.
  - Re-open ⋯ on the same comment → "신고" item not shown, "신고됨 ✓" badge.
  - SQL Editor: insert two more reports for the same comment from other test users (or three in a fresh comment) → verify status flips to `blinded_by_report` and a `comment_blinded` notification row was created.
  - On a non-owner session, the blinded comment shows a dashed "신고로 임시 비공개된 댓글입니다" row, no expand.
  - As the comment author, the blinded comment shows the full body with a "신고로 임시 비공개됨" badge.
  - SQL Editor: drive a comment to vote_score = -5 via inserts → row shows dashed "누적 비추천으로 접힘 (-5) 펼치기 ▾". Click 펼치기 → full body + vote/report active.
  - Replies under a collapsed root still render normally (per spec §4.4).
  - Click ⋯ on your own comment → menu shows "삭제" only (no 신고).

If any item fails, fix it and re-run typecheck + build.

- [ ] **Step 3: Stop dev server.**

- [ ] **Step 4: No commit unless smoke fixes were made.**

---

## Task 13: Push branch + create PR (manual)

- [ ] **Step 1: Push the branch**

```bash
cd vet-exam-ai && git push -u origin feat/comment-report-blind-v1
```

- [ ] **Step 2: User creates PR via GitHub web UI.**

PR title: `comments: report + auto-blind UI (M3 §15 PR-B)`
PR body should reference `docs/superpowers/specs/2026-04-27-comment-vote-report-design.md` (§3 PR-B) and call out the migration: applied to remote in Task 1 Step 2.

---

## Self-Review Notes

- Spec §3 PR-B coverage: T1 (migration) + T2 (schema) + T3 (report endpoint) + T4 (reports-mine) + T5-7 (UI primitives) + T8-11 (integration) + T12 smoke. ✓
- Spec §4.3 report flow: T3 server (auth/owner/status/UNIQUE) + T5 modal (defamation notice/limit/error states). ✓
- Spec §4.4 collapsed display rules: T7 + T9 + T10 (votes expandable, reports not, owner sees full + badge, replies under collapsed root render normally). ✓
- Spec §5 trigger reinforcement: T1 — both functions replaced in full, status='visible' guard preserves idempotency. ✓
- Spec §6.2 / §6.3 / §6.5 component shapes: T6 / T5 / T8. ✓
- Spec §8 errors: T3 401/403/404/409/410/422/500 all handled. T5 maps these to user-facing messages. ✓
- Type consistency: `CommentStatus` defined identically in CommentItem / CommentReplyGroup / CommentList / CommentThread. `ReplyRow` exported from CommentReplyGroup, imported by CommentList. `RootWithReplies` includes `status` and `replies: ReplyRow[]`. ✓
- Idempotency safeguards: trigger uses `status='visible'` guarded UPDATE; client uses `reportedIds` Set to prevent re-submission. ✓
- Out of scope (§13): no admin UI, no edit history, no image attachment, no realtime. ✓
