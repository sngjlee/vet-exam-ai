# M3 §18 admin reports + corrections (PR-C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/admin/reports` (comment-grouped report queue, uphold/dismiss) and `/admin/corrections` (manual-apply correction queue, accept/reject) so the operator can satisfy the 24-hour 정보통신망법 cycle and clear the soft-launch blocker.

**Architecture:** Two new admin queue routes mirror PR-B's server-first patterns. Mutations flow through two new `security definer` RPCs (`resolve_comment_report`, `resolve_question_correction`) that handle status updates, comment-status branching, recipient notifications, and audit insertion in a single transaction. UI is JS-0 server forms inside `<details>` row expand. `correction_resolved` is added to `notification_type`; no other RLS changes are needed because the RPCs run as security definer.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Supabase (Postgres + RLS + RPC), TypeScript strict.

---

## File map

**Migration / types (foundation)**
- `vet-exam-ai/supabase/migrations/20260502000000_admin_pr_c.sql` — `correction_resolved` enum value, `resolve_comment_report` RPC, `resolve_question_correction` RPC
- `vet-exam-ai/lib/supabase/types.ts` — add `'correction_resolved'` to `notification_type`, add 2 RPCs to `Functions`

**Shared label maps**
- `vet-exam-ai/lib/admin/report-labels.ts` — reason / status / resolution Korean maps
- `vet-exam-ai/lib/admin/correction-labels.ts` — status / resolution Korean maps

**Reports queue (`/admin/reports`)**
- `vet-exam-ai/app/admin/reports/_lib/parse-reports-search-params.ts`
- `vet-exam-ai/app/admin/reports/_components/reports-filters.tsx` (client)
- `vet-exam-ai/app/admin/reports/_components/reports-pager.tsx`
- `vet-exam-ai/app/admin/reports/_components/report-resolve-form.tsx`
- `vet-exam-ai/app/admin/reports/_actions.ts`
- `vet-exam-ai/app/admin/reports/_components/reports-table.tsx`
- `vet-exam-ai/app/admin/reports/page.tsx`

**Corrections queue (`/admin/corrections`)**
- `vet-exam-ai/app/admin/corrections/_lib/parse-corrections-search-params.ts`
- `vet-exam-ai/app/admin/corrections/_components/corrections-filters.tsx` (client)
- `vet-exam-ai/app/admin/corrections/_components/corrections-pager.tsx`
- `vet-exam-ai/app/admin/corrections/_components/correction-resolve-form.tsx`
- `vet-exam-ai/app/admin/corrections/_actions.ts`
- `vet-exam-ai/app/admin/corrections/_components/corrections-table.tsx`
- `vet-exam-ai/app/admin/corrections/page.tsx`

**Notification routing**
- `vet-exam-ai/lib/notifications/format.ts` (modify) — add `correction_resolved` branch + tighten `report_resolved` copy

**Hub / nav activation**
- `vet-exam-ai/app/admin/_components/admin-nav-items.ts` (modify) — un-disable "신고", add "정정"
- `vet-exam-ai/app/admin/page.tsx` (modify) — split "신고/정정" into two active hub cards

**Out of scope (skipped — already complete)**
- `vet-exam-ai/app/admin/audit/_components/audit-filters.tsx` — already has all 4 PR-C audit actions in `ALL_AUDIT_ACTIONS` + `AUDIT_ACTION_LABEL`, and `comment` / `correction` already in `ALL_TARGET_TYPES` + `TARGET_TYPE_LABEL`. Nothing to add.

**Total**: 신규 16 / 수정 4 / 마이그 1 (audit-filters skipped).

---

## Task 0: Worktree baseline

**Files:** None (verification only)

- [ ] **Step 1: Confirm clean working tree on main**

Run:
```bash
git status
git log --oneline -3
```
Expected: clean working tree, latest commits include `05715e6 admin PR-C: spec self-review fixes` and `8c9f7a7 admin PR-C: spec — reports + corrections queues`.

- [ ] **Step 2: Create feature branch**

Run:
```bash
git checkout -b feat/admin-reports-corrections-prc
```
Expected: switched to new branch.

- [ ] **Step 3: Verify Next.js project root + admin scaffolding**

Run:
```bash
ls vet-exam-ai/app/admin
ls vet-exam-ai/lib/admin
ls vet-exam-ai/supabase/migrations | tail -3
```
Expected:
- admin dir lists `_components audit layout.tsx page.tsx questions`.
- `vet-exam-ai/lib/admin` lists `audit.ts filter-options.ts guards.ts` (no `report-labels.ts`/`correction-labels.ts` yet).
- Latest migration is `20260501000000_admin_pr_b.sql`.

⚠️ **Critical path note**: The repo has a nested layout — there are TWO `vet-exam-ai/` directories. Project root is `C:\Users\Theriogenology\Desktop\vet-exam-ai\vet-exam-ai\`. Specs/plans live at the outer `C:\Users\Theriogenology\Desktop\vet-exam-ai\docs\superpowers\`. All file paths in this plan are relative to the **outer** repo root (so they begin with `vet-exam-ai/`).

---

## Task 1: Migration — correction_resolved enum + 2 RPCs

**Files:**
- Create: `vet-exam-ai/supabase/migrations/20260502000000_admin_pr_c.sql`

- [ ] **Step 1: Write migration file**

Create `vet-exam-ai/supabase/migrations/20260502000000_admin_pr_c.sql`:

```sql
-- =============================================================================
-- M3 §18 admin PR-C: reports + corrections queues
-- =============================================================================
-- 0. extend notification_type enum: correction_resolved
-- 1. resolve_comment_report  RPC (security definer + admin gate)
-- 2. resolve_question_correction RPC (security definer + admin gate)
-- =============================================================================

-- 0. notification_type enum 확장 (correction 결과 알림)
alter type public.notification_type add value if not exists 'correction_resolved';

-- 1. resolve_comment_report RPC
create or replace function public.resolve_comment_report(
  p_comment_id uuid,
  p_resolution text,            -- 'upheld' | 'dismissed'
  p_note       text default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id      uuid;
  v_target_status public.report_status;
  v_audit_action  public.audit_action;
  v_owner_id      uuid;
  v_curr_status   public.comment_status;
  v_affected      int;
  v_reporter_ids  uuid[];
begin
  v_admin_id := auth.uid();
  if v_admin_id is null
     or not exists (
       select 1 from public.profiles
       where id = v_admin_id and role = 'admin' and is_active
     ) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_resolution = 'upheld' then
    v_target_status := 'upheld';
    v_audit_action  := 'report_uphold';
  elsif p_resolution = 'dismissed' then
    v_target_status := 'dismissed';
    v_audit_action  := 'report_dismiss';
  else
    raise exception 'invalid resolution' using errcode = '22023';
  end if;

  select user_id, status into v_owner_id, v_curr_status
    from public.comments where id = p_comment_id;
  if v_owner_id is null then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;

  -- 그룹 단위로 pending/reviewing 신고 일괄 갱신, reporter_ids 회수
  with updated as (
    update public.comment_reports
       set status          = v_target_status,
           resolved_by     = v_admin_id,
           resolved_at     = now(),
           resolution_note = p_note
     where comment_id = p_comment_id
       and status in ('pending', 'reviewing')
    returning reporter_id
  )
  select count(*)::int,
         array_agg(distinct reporter_id) filter (where reporter_id is not null)
    into v_affected, v_reporter_ids
    from updated;

  if coalesce(v_affected, 0) = 0 then
    return 0;     -- 다른 운영자가 이미 처리. 멱등 종료.
  end if;

  -- 댓글 status 분기 (Q9-B)
  if p_resolution = 'upheld' then
    update public.comments
       set status     = 'removed_by_admin',
           updated_at = now()
     where id = p_comment_id
       and status <> 'removed_by_admin';
  else  -- dismissed: blinded_by_report만 visible로 복원
    update public.comments
       set status     = 'visible',
           updated_at = now()
     where id = p_comment_id
       and status = 'blinded_by_report';
  end if;

  -- reporter들에게 알림
  if v_reporter_ids is not null then
    insert into public.notifications (user_id, type, related_comment_id, payload, actor_id)
    select rid,
           'report_resolved',
           p_comment_id,
           jsonb_build_object(
             'resolution', p_resolution,
             'note',       coalesce(p_note, '')
           ),
           v_admin_id
      from unnest(v_reporter_ids) rid;
  end if;

  -- audit (그룹 단위 단일 행)
  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, before_state, after_state, note)
  values
    (v_admin_id, v_audit_action, 'comment', p_comment_id::text,
     jsonb_build_object('comment_status',  v_curr_status,
                       'reports_affected', v_affected),
     jsonb_build_object('comment_status_after',
       case when p_resolution = 'upheld' then 'removed_by_admin'::text
            when v_curr_status = 'blinded_by_report' then 'visible'::text
            else v_curr_status::text end),
     p_note);

  return v_affected;
end;
$$;

revoke execute on function public.resolve_comment_report(uuid, text, text) from public, anon;
grant  execute on function public.resolve_comment_report(uuid, text, text) to authenticated;

-- 2. resolve_question_correction RPC (수동 적용 모델 — 상태만 변경)
create or replace function public.resolve_question_correction(
  p_correction_id uuid,
  p_resolution    text,            -- 'accepted' | 'rejected'
  p_note          text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id      uuid;
  v_target_status public.correction_status;
  v_audit_action  public.audit_action;
  v_proposer_id   uuid;
  v_question_id   uuid;
  v_curr_status   public.correction_status;
begin
  v_admin_id := auth.uid();
  if v_admin_id is null
     or not exists (
       select 1 from public.profiles
       where id = v_admin_id and role = 'admin' and is_active
     ) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_resolution = 'accepted' then
    v_target_status := 'accepted';
    v_audit_action  := 'correction_accept';
  elsif p_resolution = 'rejected' then
    v_target_status := 'rejected';
    v_audit_action  := 'correction_reject';
  else
    raise exception 'invalid resolution' using errcode = '22023';
  end if;

  select proposed_by, question_id, status
    into v_proposer_id, v_question_id, v_curr_status
    from public.question_corrections where id = p_correction_id;

  if v_question_id is null then
    raise exception 'correction not found' using errcode = 'P0002';
  end if;

  if v_curr_status not in ('proposed', 'reviewing') then
    return false;     -- 이미 처리됨. 멱등 종료.
  end if;

  update public.question_corrections
     set status          = v_target_status,
         resolved_by     = v_admin_id,
         resolved_at     = now(),
         resolution_note = p_note,
         updated_at      = now()
   where id = p_correction_id
     and status in ('proposed', 'reviewing');

  if v_proposer_id is not null then
    -- payload에 question public_id까지 미리 회수 → dropdown 클라에서 추가 lookup 0
    insert into public.notifications (user_id, type, payload, actor_id)
    select v_proposer_id,
           'correction_resolved',
           jsonb_build_object(
             'resolution',         p_resolution,
             'note',               coalesce(p_note, ''),
             'question_id',        v_question_id::text,
             'question_public_id', q.public_id
           ),
           v_admin_id
      from public.questions q
     where q.id = v_question_id;
  end if;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, before_state, after_state, note)
  values
    (v_admin_id, v_audit_action, 'correction', p_correction_id::text,
     jsonb_build_object('status', v_curr_status),
     jsonb_build_object('status', v_target_status),
     p_note);

  return true;
end;
$$;

revoke execute on function public.resolve_question_correction(uuid, text, text) from public, anon;
grant  execute on function public.resolve_question_correction(uuid, text, text) to authenticated;
```

- [ ] **Step 2: Commit**

Run:
```bash
git add vet-exam-ai/supabase/migrations/20260502000000_admin_pr_c.sql
git commit -m "$(cat <<'EOF'
admin: PR-C migration (reports + corrections RPC + correction_resolved enum)

- alter type notification_type add value 'correction_resolved'
- resolve_comment_report(p_comment_id, p_resolution, p_note)
  security definer + admin gate, group-update reports + branch comment
  status + notify reporters + audit, single transaction
- resolve_question_correction(p_correction_id, p_resolution, p_note)
  security definer + admin gate, status update + notify proposer
  (payload pre-resolves question public_id) + audit, single transaction

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: 1 file changed, ~180 insertions.

⚠️ **Do NOT apply this migration via Supabase Studio yet — that happens in Task 22**, after the rest of the PR is staged. Memory note: `supabase db push` is unreliable on this project (the "up to date" trap from PR #1) — always apply via SQL Editor at the end.

---

## Task 2: types.ts — extend notification_type + add 2 RPCs

**Files:**
- Modify: `vet-exam-ai/lib/supabase/types.ts`

- [ ] **Step 1: Add `'correction_resolved'` to `notification_type` enum union**

Find the `notification_type:` block (around line 547). Replace:

```ts
      notification_type:
        | "reply"
        | "vote_milestone"
        | "mention"
        | "report_resolved"
        | "comment_blinded";
```

with:

```ts
      notification_type:
        | "reply"
        | "vote_milestone"
        | "mention"
        | "report_resolved"
        | "comment_blinded"
        | "correction_resolved";
```

- [ ] **Step 2: Add `resolve_comment_report` + `resolve_question_correction` to `Functions`**

Find the `log_admin_action:` Function entry. Add the two new entries **after** it, before the closing `};` of `Functions`:

```ts
      resolve_comment_report: {
        Args: {
          p_comment_id: string;
          p_resolution: string;
          p_note?:      string | null;
        };
        Returns: number;
      };
      resolve_question_correction: {
        Args: {
          p_correction_id: string;
          p_resolution:    string;
          p_note?:         string | null;
        };
        Returns: boolean;
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
admin: types for correction_resolved enum + resolve_* RPCs

- notification_type gains "correction_resolved"
- Functions gets resolve_comment_report (returns int = affected rows)
- Functions gets resolve_question_correction (returns boolean = applied?)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: lib/admin/report-labels.ts (literal copy)

**Files:**
- Create: `vet-exam-ai/lib/admin/report-labels.ts`

- [ ] **Step 1: Write file**

```ts
import type { Database } from "../supabase/types";

type ReportReason = Database["public"]["Enums"]["report_reason"];
type ReportStatus = Database["public"]["Enums"]["report_status"];

export const REPORT_REASON_KO: Record<ReportReason, string> = {
  spam:           "스팸",
  misinformation: "허위/잘못된 정보",
  privacy:        "개인정보",
  hate_speech:    "혐오 표현",
  advertising:    "광고/홍보",
  copyright:      "저작권 침해",
  defamation:     "명예훼손",
  other:          "기타",
};

export const REPORT_STATUS_KO: Record<ReportStatus, string> = {
  pending:   "대기",
  reviewing: "검토 중",
  upheld:    "인정됨",
  dismissed: "기각됨",
};

export const REPORT_RESOLUTION_KO: Record<"upheld" | "dismissed", string> = {
  upheld:    "신고 인정",
  dismissed: "신고 기각",
};

export const ALL_REPORT_REASONS: ReadonlyArray<ReportReason> = [
  "spam",
  "misinformation",
  "privacy",
  "hate_speech",
  "advertising",
  "copyright",
  "defamation",
  "other",
];

export const ALL_REPORT_STATUSES: ReadonlyArray<ReportStatus> = [
  "pending",
  "reviewing",
  "upheld",
  "dismissed",
];
```

- [ ] **Step 2: Commit**

```bash
git add vet-exam-ai/lib/admin/report-labels.ts
git commit -m "$(cat <<'EOF'
admin: report-labels.ts (Korean reason/status/resolution maps)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: lib/admin/correction-labels.ts (literal copy)

**Files:**
- Create: `vet-exam-ai/lib/admin/correction-labels.ts`

- [ ] **Step 1: Write file**

```ts
import type { Database } from "../supabase/types";

type CorrectionStatus = Database["public"]["Enums"]["correction_status"];

export const CORRECTION_STATUS_KO: Record<CorrectionStatus, string> = {
  proposed:  "제안됨",
  reviewing: "검토 중",
  accepted:  "수락됨",
  rejected:  "거절됨",
};

export const CORRECTION_RESOLUTION_KO: Record<"accepted" | "rejected", string> = {
  accepted: "정정 수락",
  rejected: "정정 거절",
};

export const ALL_CORRECTION_STATUSES: ReadonlyArray<CorrectionStatus> = [
  "proposed",
  "reviewing",
  "accepted",
  "rejected",
];
```

- [ ] **Step 2: Commit**

```bash
git add vet-exam-ai/lib/admin/correction-labels.ts
git commit -m "$(cat <<'EOF'
admin: correction-labels.ts (Korean status/resolution maps)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: reports parse-search-params

**Files:**
- Create: `vet-exam-ai/app/admin/reports/_lib/parse-reports-search-params.ts`

- [ ] **Step 1: Write file**

```ts
import type { Database } from "../../../../lib/supabase/types";
import {
  ALL_REPORT_REASONS,
  ALL_REPORT_STATUSES,
} from "../../../../lib/admin/report-labels";

type ReportStatus = Database["public"]["Enums"]["report_status"];
type ReportReason = Database["public"]["Enums"]["report_reason"];

export type ParsedReportsSearchParams = {
  page:   number;
  status: ReportStatus | "all";
  reason: ReportReason | "all";
};

const VALID_STATUSES: ReadonlyArray<ReportStatus | "all"> = [
  ...ALL_REPORT_STATUSES,
  "all",
];
const VALID_REASONS: ReadonlyArray<ReportReason | "all"> = [
  ...ALL_REPORT_REASONS,
  "all",
];

function pickOne(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function parseReportsSearchParams(
  raw: { [k: string]: string | string[] | undefined },
): ParsedReportsSearchParams {
  const status = pickOne(raw.status) as ReportStatus | "all";
  const reason = pickOne(raw.reason) as ReportReason | "all";
  const pageRaw = parseInt(pickOne(raw.page), 10);
  return {
    page:   Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    status: VALID_STATUSES.includes(status) ? status : "pending",
    reason: VALID_REASONS.includes(reason)  ? reason : "all",
  };
}

export function buildReportsSearchString(
  current: ParsedReportsSearchParams,
  override: Partial<Record<keyof ParsedReportsSearchParams, string | number | undefined>>,
): string {
  const merged: Record<string, string> = {};

  function set(k: string, v: string | number | undefined) {
    if (v === undefined || v === "") return;
    merged[k] = String(v);
  }

  set("page",   current.page);
  set("status", current.status);
  set("reason", current.reason);

  for (const [k, v] of Object.entries(override)) {
    if (v === undefined || v === null || v === "") {
      delete merged[k];
    } else {
      merged[k] = String(v);
    }
  }

  if (merged.page   === "1")       delete merged.page;
  if (merged.status === "pending") delete merged.status;
  if (merged.reason === "all")     delete merged.reason;

  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) out.set(k, v);
  const s = out.toString();
  return s ? `?${s}` : "";
}
```

- [ ] **Step 2: Commit**

```bash
git add vet-exam-ai/app/admin/reports/_lib/parse-reports-search-params.ts
git commit -m "$(cat <<'EOF'
admin: reports search-params parser + URL builder

Defaults: page=1, status=pending, reason=all. Drops defaults from URL
to keep links short.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: reports filters component (client)

**Files:**
- Create: `vet-exam-ai/app/admin/reports/_components/reports-filters.tsx`

- [ ] **Step 1: Write file**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  ALL_REPORT_REASONS,
  ALL_REPORT_STATUSES,
  REPORT_REASON_KO,
  REPORT_STATUS_KO,
} from "../../../../lib/admin/report-labels";
import {
  buildReportsSearchString,
  type ParsedReportsSearchParams,
} from "../_lib/parse-reports-search-params";

export function ReportsFilters({
  current,
}: {
  current: ParsedReportsSearchParams;
}) {
  const router = useRouter();

  function navigate(
    override: Partial<Record<keyof ParsedReportsSearchParams, string | number | undefined>>,
  ) {
    const next = buildReportsSearchString(current, { ...override, page: 1 });
    router.replace(`/admin/reports${next}`);
  }

  function reset() {
    router.replace("/admin/reports");
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
      <select
        value={current.status}
        onChange={(e) => navigate({ status: e.target.value })}
        aria-label="처리 상태"
        style={inputStyle}
      >
        {ALL_REPORT_STATUSES.map((s) => (
          <option key={s} value={s}>{REPORT_STATUS_KO[s]}</option>
        ))}
        <option value="all">전체</option>
      </select>

      <select
        value={current.reason}
        onChange={(e) => navigate({ reason: e.target.value })}
        aria-label="신고 사유"
        style={inputStyle}
      >
        <option value="all">전체 사유</option>
        {ALL_REPORT_REASONS.map((r) => (
          <option key={r} value={r}>{REPORT_REASON_KO[r]}</option>
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

- [ ] **Step 2: Commit**

```bash
git add vet-exam-ai/app/admin/reports/_components/reports-filters.tsx
git commit -m "$(cat <<'EOF'
admin: reports filters (status / reason, URL-synced)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: reports pager

**Files:**
- Create: `vet-exam-ai/app/admin/reports/_components/reports-pager.tsx`

- [ ] **Step 1: Write file**

```tsx
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildReportsSearchString,
  type ParsedReportsSearchParams,
} from "../_lib/parse-reports-search-params";

export function ReportsPager({
  current,
  totalPages,
}: {
  current: ParsedReportsSearchParams;
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

  const prevHref = `/admin/reports${buildReportsSearchString(current, { page: prev })}`;
  const nextHref = `/admin/reports${buildReportsSearchString(current, { page: next })}`;

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

- [ ] **Step 2: Commit**

```bash
git add vet-exam-ai/app/admin/reports/_components/reports-pager.tsx
git commit -m "$(cat <<'EOF'
admin: reports pager (PR-B audit-pager sibling, /admin/reports base)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: reports `_actions.ts` (server action)

**Files:**
- Create: `vet-exam-ai/app/admin/reports/_actions.ts`

- [ ] **Step 1: Write file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../../lib/admin/guards";
import { createClient } from "../../../lib/supabase/server";

export async function resolveReport(formData: FormData) {
  await requireAdmin();
  const commentId  = String(formData.get("comment_id") ?? "");
  const resolution = String(formData.get("resolution") ?? "");
  const noteRaw    = String(formData.get("note") ?? "").trim();
  const note       = noteRaw ? noteRaw.slice(0, 200) : null;

  if (!commentId) redirect("/admin/reports?error=missing_target");
  if (resolution !== "upheld" && resolution !== "dismissed") {
    redirect("/admin/reports?error=invalid_resolution");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_comment_report", {
    p_comment_id: commentId,
    p_resolution: resolution,
    p_note:       note,
  });
  if (error) {
    console.error("[resolveReport]", error);
    redirect("/admin/reports?error=db_error");
  }

  revalidatePath("/admin/reports");
  redirect("/admin/reports");
}
```

- [ ] **Step 2: Commit**

```bash
git add vet-exam-ai/app/admin/reports/_actions.ts
git commit -m "$(cat <<'EOF'
admin: reports server action (resolveReport → resolve_comment_report RPC)

requireAdmin() re-check + form validation + RPC call + revalidate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: report-resolve-form component (server)

**Files:**
- Create: `vet-exam-ai/app/admin/reports/_components/report-resolve-form.tsx`

- [ ] **Step 1: Write file**

```tsx
import { resolveReport } from "../_actions";

export function ReportResolveForm({
  commentId,
  currentCommentStatus,
}: {
  commentId: string;
  currentCommentStatus: string;
}) {
  const dismissHint =
    currentCommentStatus === "blinded_by_report" ? " (자동 블라인드 해제)" : "";

  return (
    <form action={resolveReport} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="comment_id" value={commentId} />
      <fieldset className="flex flex-wrap gap-3" style={{ border: 0, padding: 0 }}>
        <legend className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
          처리 결과
        </legend>
        <label className="text-sm flex items-center gap-1.5">
          <input type="radio" name="resolution" value="upheld" required />
          신고 인정 (댓글 제거)
        </label>
        <label className="text-sm flex items-center gap-1.5">
          <input type="radio" name="resolution" value="dismissed" required />
          신고 기각{dismissHint}
        </label>
      </fieldset>
      <textarea
        name="note"
        maxLength={200}
        rows={2}
        placeholder="처리 사유 (선택, 200자 이내) — 신고자에게 함께 전달됩니다"
        className="text-sm rounded p-2"
        style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
      />
      <button
        type="submit"
        className="self-start text-sm px-3 py-1.5 rounded"
        style={{ background: "var(--teal)", color: "white", border: 0, cursor: "pointer" }}
      >
        처리 저장
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add vet-exam-ai/app/admin/reports/_components/report-resolve-form.tsx
git commit -m "$(cat <<'EOF'
admin: report-resolve-form (server, JS 0)

Radio uphold/dismiss + 200-char note textarea + submit. Dismiss hint
shows '자동 블라인드 해제' only when current comment status is
blinded_by_report.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: reports table component (server)

**Files:**
- Create: `vet-exam-ai/app/admin/reports/_components/reports-table.tsx`

- [ ] **Step 1: Write file**

```tsx
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import {
  REPORT_REASON_KO,
  REPORT_STATUS_KO,
} from "../../../../lib/admin/report-labels";
import { ReportResolveForm } from "./report-resolve-form";

export type ReportGroupRow = {
  comment_id:   string;
  report_count: number;
  reasons:      string[];
  first_reported_at: string;
};

export type RawReportRow = {
  id:          string;
  comment_id:  string;
  reporter_id: string | null;
  reason:      string;
  description: string | null;
  status:      string;
  created_at:  string;
};

export type CommentLite = {
  id:        string;
  body_html: string;
  body_text: string;
  status:    string;
  user_id:   string;
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

export function ReportsTable({
  groups,
  commentMap,
  rawMap,
  nicknameMap,
}: {
  groups:      ReportGroupRow[];
  commentMap:  Record<string, CommentLite>;
  rawMap:      Record<string, RawReportRow[]>;
  nicknameMap: Record<string, string | null>;
}) {
  if (groups.length === 0) {
    return (
      <div
        className="rounded-lg p-8 text-center text-sm"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)", color: "var(--text-muted)" }}
      >
        처리할 신고가 없습니다
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => {
        const comment = commentMap[g.comment_id];
        if (!comment) return null;          // skip removed/hidden_by_author
        const raws = rawMap[g.comment_id] ?? [];
        const authorNick = nicknameMap[comment.user_id] ?? "탈퇴한 사용자";
        const preview = comment.body_text.slice(0, 40) + (comment.body_text.length > 40 ? "…" : "");
        const reasonChips = Array.from(new Set(g.reasons))
          .map((r) => REPORT_REASON_KO[r as keyof typeof REPORT_REASON_KO] ?? r);
        const isPending = raws.some((r) => r.status === "pending" || r.status === "reviewing");

        return (
          <details
            key={g.comment_id}
            className="rounded-lg"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
          >
            <summary
              className="flex items-center gap-3 px-3 py-2 cursor-pointer text-sm"
              style={{ listStyle: "none" }}
            >
              <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />
              <span className="flex-1 truncate" style={{ color: "var(--text)" }}>{preview}</span>
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                {authorNick}
              </span>
              <span
                className="kvle-mono"
                style={{ color: "var(--text-muted)", fontSize: 11 }}
              >
                {g.report_count}건 · {reasonChips.join(", ")}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                {formatRelative(g.first_reported_at)}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  background: comment.status === "blinded_by_report" ? "var(--teal-dim)" : "transparent",
                  border: "1px solid var(--rule)",
                  color: "var(--text-muted)",
                }}
              >
                {comment.status === "blinded_by_report" ? "자동 블라인드" : "표시 중"}
              </span>
            </summary>

            <div className="px-3 pb-3 pt-1 flex flex-col gap-3" style={{ borderTop: "1px solid var(--rule)" }}>
              <div
                className="rounded p-2 text-sm"
                style={{ background: "var(--bg)", border: "1px solid var(--rule)", maxHeight: 200, overflow: "auto" }}
                dangerouslySetInnerHTML={{ __html: comment.body_html }}
              />

              <Link
                href={`/profile/${encodeURIComponent(authorNick)}`}
                className="text-xs"
                style={{ color: "var(--teal)" }}
              >
                작성자 프로필 →
              </Link>

              <ul className="flex flex-col gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {raws.map((r) => {
                  const reporterNick = r.reporter_id ? (nicknameMap[r.reporter_id] ?? "탈퇴한 사용자") : "익명";
                  const reasonKo = REPORT_REASON_KO[r.reason as keyof typeof REPORT_REASON_KO] ?? r.reason;
                  const statusKo = REPORT_STATUS_KO[r.status as keyof typeof REPORT_STATUS_KO] ?? r.status;
                  return (
                    <li key={r.id} className="flex flex-wrap gap-2">
                      <span style={{ color: "var(--text)" }}>{reporterNick}</span>
                      <span>·</span>
                      <span>{reasonKo}</span>
                      <span>·</span>
                      <span>{statusKo}</span>
                      <span>·</span>
                      <span>{formatRelative(r.created_at)}</span>
                      {r.description && (
                        <span className="block w-full mt-0.5" style={{ color: "var(--text)" }}>
                          “{r.description}”
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {isPending ? (
                <ReportResolveForm
                  commentId={g.comment_id}
                  currentCommentStatus={comment.status}
                />
              ) : (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  이 그룹의 모든 신고는 이미 처리되었습니다.
                </p>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add vet-exam-ai/app/admin/reports/_components/reports-table.tsx
git commit -m "$(cat <<'EOF'
admin: reports-table (server, <details> expand + body_html + raw list)

- group row: comment preview / author nick / N건 + reason chips / status
- expand: full body_html (sanitized) + reporter list + ReportResolveForm
- empty state '처리할 신고가 없습니다'
- comment 없으면(removed_by_admin/hidden_by_author) 스킵

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: reports page.tsx (server, composition + 4-step fetch)

**Files:**
- Create: `vet-exam-ai/app/admin/reports/page.tsx`

⚠️ **Use sonnet for this task — fetch composition is non-trivial (4 separate queries, embedded-join trap from PR #14, group-by + count-distinct).**

- [ ] **Step 1: Write file**

```tsx
import { createClient } from "../../../lib/supabase/server";
import { parseReportsSearchParams } from "./_lib/parse-reports-search-params";
import { ReportsFilters } from "./_components/reports-filters";
import {
  ReportsTable,
  type ReportGroupRow,
  type RawReportRow,
  type CommentLite,
} from "./_components/reports-table";
import { ReportsPager } from "./_components/reports-pager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

async function loadPage(sp: ReturnType<typeof parseReportsSearchParams>): Promise<{
  groups:      ReportGroupRow[];
  totalPages:  number;
  commentMap:  Record<string, CommentLite>;
  rawMap:      Record<string, RawReportRow[]>;
  nicknameMap: Record<string, string | null>;
}> {
  const supabase = await createClient();

  // Step 1: comment_ids matching filters (oldest-pending first).
  // Supabase JS doesn't support group-by directly, so we paginate by comment_id
  // using a "select distinct comment_id" pattern via filters + dedup.

  let raw = supabase
    .from("comment_reports")
    .select("comment_id, reason, status, created_at", { count: "exact" });

  if (sp.status !== "all") raw = raw.eq("status", sp.status);
  if (sp.reason !== "all") raw = raw.eq("reason", sp.reason);

  const { data: rawAll, error: rawErr } = await raw
    .order("created_at", { ascending: true })
    .limit(2000);          // hard cap; PR-D will revisit if backlog grows past this

  if (rawErr || !rawAll) {
    return {
      groups:      [],
      totalPages:  1,
      commentMap:  {},
      rawMap:      {},
      nicknameMap: {},
    };
  }

  // group raw rows by comment_id (preserve oldest-first order)
  const seen = new Set<string>();
  const ordered: string[] = [];
  const grouped: Record<string, ReportGroupRow> = {};
  for (const r of rawAll) {
    const cid = r.comment_id as string;
    if (!seen.has(cid)) {
      seen.add(cid);
      ordered.push(cid);
      grouped[cid] = {
        comment_id:        cid,
        report_count:      0,
        reasons:           [],
        first_reported_at: r.created_at as string,
      };
    }
    grouped[cid].report_count += 1;
    grouped[cid].reasons.push(r.reason as string);
  }

  const totalGroups = ordered.length;
  const totalPages  = Math.max(1, Math.ceil(totalGroups / PAGE_SIZE));
  const offset      = (Math.min(sp.page, totalPages) - 1) * PAGE_SIZE;
  const pageIds     = ordered.slice(offset, offset + PAGE_SIZE);

  if (pageIds.length === 0) {
    return {
      groups:      [],
      totalPages,
      commentMap:  {},
      rawMap:      {},
      nicknameMap: {},
    };
  }

  // Step 2: comments lookup (filter out removed_by_admin / hidden_by_author).
  const { data: comments } = await supabase
    .from("comments")
    .select("id, body_html, body_text, status, user_id")
    .in("id", pageIds)
    .not("status", "in", "(removed_by_admin,hidden_by_author)");

  const commentMap: Record<string, CommentLite> = {};
  for (const c of comments ?? []) {
    commentMap[c.id as string] = {
      id:        c.id as string,
      body_html: (c.body_html as string) ?? "",
      body_text: (c.body_text as string) ?? "",
      status:    c.status as string,
      user_id:   c.user_id as string,
    };
  }

  // Step 3: raw report rows for the visible groups (full detail per row).
  const visibleIds = pageIds.filter((id) => commentMap[id]);
  const { data: rawRows } = await supabase
    .from("comment_reports")
    .select("id, comment_id, reporter_id, reason, description, status, created_at")
    .in("comment_id", visibleIds)
    .order("created_at", { ascending: true });

  const rawMap: Record<string, RawReportRow[]> = {};
  for (const r of rawRows ?? []) {
    const cid = r.comment_id as string;
    if (!rawMap[cid]) rawMap[cid] = [];
    rawMap[cid].push({
      id:          r.id as string,
      comment_id:  cid,
      reporter_id: (r.reporter_id as string | null) ?? null,
      reason:      r.reason as string,
      description: (r.description as string | null) ?? null,
      status:      r.status as string,
      created_at:  r.created_at as string,
    });
  }

  // Step 4: nickname lookup (separate query — embedded join trap, PR #14).
  const userIds = new Set<string>();
  for (const id of visibleIds) {
    const c = commentMap[id];
    if (c) userIds.add(c.user_id);
  }
  for (const rs of Object.values(rawMap)) {
    for (const r of rs) if (r.reporter_id) userIds.add(r.reporter_id);
  }
  const nicknameMap: Record<string, string | null> = {};
  if (userIds.size > 0) {
    const { data: profs } = await supabase
      .from("user_profiles_public")
      .select("user_id, nickname")
      .in("user_id", Array.from(userIds));
    for (const p of profs ?? []) {
      if (p.user_id) nicknameMap[p.user_id as string] = (p.nickname as string | null) ?? null;
    }
  }

  const groups: ReportGroupRow[] = visibleIds.map((id) => grouped[id]);

  return { groups, totalPages, commentMap, rawMap, nicknameMap };
}

const ERROR_LABELS: Record<string, string> = {
  missing_target:     "대상 댓글이 지정되지 않았습니다",
  invalid_resolution: "올바른 처리 결과를 선택하세요",
  db_error:           "저장 중 오류가 발생했습니다. 다시 시도하세요",
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = await searchParams;
  const sp  = parseReportsSearchParams(raw);

  const { groups, totalPages, commentMap, rawMap, nicknameMap } = await loadPage(sp);
  const clamped = { ...sp, page: Math.min(sp.page, totalPages) };

  const errorRaw = Array.isArray(raw.error) ? raw.error[0] : raw.error;
  const errorMsg = errorRaw && ERROR_LABELS[errorRaw] ? ERROR_LABELS[errorRaw] : null;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          신고 큐
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          댓글 신고를 24시간 이내 검토하여 임시조치 결정을 내립니다.
        </p>
      </header>

      {errorMsg && (
        <div
          role="alert"
          className="mb-3 rounded p-3 text-sm"
          style={{ background: "var(--rose-dim)", border: "1px solid var(--rose)", color: "var(--rose)" }}
        >
          {errorMsg}
        </div>
      )}

      <ReportsFilters current={clamped} />
      <ReportsTable
        groups={groups}
        commentMap={commentMap}
        rawMap={rawMap}
        nicknameMap={nicknameMap}
      />
      <ReportsPager current={clamped} totalPages={totalPages} />
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/admin/reports/page.tsx
git commit -m "$(cat <<'EOF'
admin: /admin/reports page (4-step fetch + group + filters + pager)

- Step 1: comment_reports filtered + ordered, app-side group by comment_id
- Step 2: comments lookup (excludes removed_by_admin / hidden_by_author)
- Step 3: per-comment raw report rows
- Step 4: nickname map (separate query — embedded join trap, PR #14)

error redirect codes mapped to Korean alert.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: corrections parse-search-params

**Files:**
- Create: `vet-exam-ai/app/admin/corrections/_lib/parse-corrections-search-params.ts`

- [ ] **Step 1: Write file**

```ts
import type { Database } from "../../../../lib/supabase/types";
import { ALL_CORRECTION_STATUSES } from "../../../../lib/admin/correction-labels";

type CorrectionStatus = Database["public"]["Enums"]["correction_status"];

export type ParsedCorrectionsSearchParams = {
  page:   number;
  status: CorrectionStatus | "all";
};

const VALID_STATUSES: ReadonlyArray<CorrectionStatus | "all"> = [
  ...ALL_CORRECTION_STATUSES,
  "all",
];

function pickOne(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function parseCorrectionsSearchParams(
  raw: { [k: string]: string | string[] | undefined },
): ParsedCorrectionsSearchParams {
  const status = pickOne(raw.status) as CorrectionStatus | "all";
  const pageRaw = parseInt(pickOne(raw.page), 10);
  return {
    page:   Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    status: VALID_STATUSES.includes(status) ? status : "proposed",
  };
}

export function buildCorrectionsSearchString(
  current: ParsedCorrectionsSearchParams,
  override: Partial<Record<keyof ParsedCorrectionsSearchParams, string | number | undefined>>,
): string {
  const merged: Record<string, string> = {};

  function set(k: string, v: string | number | undefined) {
    if (v === undefined || v === "") return;
    merged[k] = String(v);
  }

  set("page",   current.page);
  set("status", current.status);

  for (const [k, v] of Object.entries(override)) {
    if (v === undefined || v === null || v === "") {
      delete merged[k];
    } else {
      merged[k] = String(v);
    }
  }

  if (merged.page   === "1")        delete merged.page;
  if (merged.status === "proposed") delete merged.status;

  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) out.set(k, v);
  const s = out.toString();
  return s ? `?${s}` : "";
}
```

- [ ] **Step 2: Commit**

```bash
git add vet-exam-ai/app/admin/corrections/_lib/parse-corrections-search-params.ts
git commit -m "$(cat <<'EOF'
admin: corrections search-params parser + URL builder

Defaults: page=1, status=proposed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: corrections filters component (client)

**Files:**
- Create: `vet-exam-ai/app/admin/corrections/_components/corrections-filters.tsx`

- [ ] **Step 1: Write file**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  ALL_CORRECTION_STATUSES,
  CORRECTION_STATUS_KO,
} from "../../../../lib/admin/correction-labels";
import {
  buildCorrectionsSearchString,
  type ParsedCorrectionsSearchParams,
} from "../_lib/parse-corrections-search-params";

export function CorrectionsFilters({
  current,
}: {
  current: ParsedCorrectionsSearchParams;
}) {
  const router = useRouter();

  function navigate(
    override: Partial<Record<keyof ParsedCorrectionsSearchParams, string | number | undefined>>,
  ) {
    const next = buildCorrectionsSearchString(current, { ...override, page: 1 });
    router.replace(`/admin/corrections${next}`);
  }

  function reset() {
    router.replace("/admin/corrections");
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
      <select
        value={current.status}
        onChange={(e) => navigate({ status: e.target.value })}
        aria-label="처리 상태"
        style={inputStyle}
      >
        {ALL_CORRECTION_STATUSES.map((s) => (
          <option key={s} value={s}>{CORRECTION_STATUS_KO[s]}</option>
        ))}
        <option value="all">전체</option>
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

- [ ] **Step 2: Commit**

```bash
git add vet-exam-ai/app/admin/corrections/_components/corrections-filters.tsx
git commit -m "$(cat <<'EOF'
admin: corrections filters (status only, URL-synced)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: corrections pager

**Files:**
- Create: `vet-exam-ai/app/admin/corrections/_components/corrections-pager.tsx`

- [ ] **Step 1: Write file** (sibling of `reports-pager.tsx` with route + type swapped)

```tsx
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildCorrectionsSearchString,
  type ParsedCorrectionsSearchParams,
} from "../_lib/parse-corrections-search-params";

export function CorrectionsPager({
  current,
  totalPages,
}: {
  current: ParsedCorrectionsSearchParams;
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

  const prevHref = `/admin/corrections${buildCorrectionsSearchString(current, { page: prev })}`;
  const nextHref = `/admin/corrections${buildCorrectionsSearchString(current, { page: next })}`;

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

- [ ] **Step 2: Commit**

```bash
git add vet-exam-ai/app/admin/corrections/_components/corrections-pager.tsx
git commit -m "$(cat <<'EOF'
admin: corrections pager (/admin/corrections base, sibling of reports-pager)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: corrections `_actions.ts` (server action)

**Files:**
- Create: `vet-exam-ai/app/admin/corrections/_actions.ts`

- [ ] **Step 1: Write file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../../lib/admin/guards";
import { createClient } from "../../../lib/supabase/server";

export async function resolveCorrection(formData: FormData) {
  await requireAdmin();
  const correctionId = String(formData.get("correction_id") ?? "");
  const resolution   = String(formData.get("resolution") ?? "");
  const noteRaw      = String(formData.get("note") ?? "").trim();
  const note         = noteRaw ? noteRaw.slice(0, 200) : null;

  if (!correctionId) redirect("/admin/corrections?error=missing_target");
  if (resolution !== "accepted" && resolution !== "rejected") {
    redirect("/admin/corrections?error=invalid_resolution");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_question_correction", {
    p_correction_id: correctionId,
    p_resolution:    resolution,
    p_note:          note,
  });
  if (error) {
    console.error("[resolveCorrection]", error);
    redirect("/admin/corrections?error=db_error");
  }

  revalidatePath("/admin/corrections");
  redirect("/admin/corrections");
}
```

- [ ] **Step 2: Commit**

```bash
git add vet-exam-ai/app/admin/corrections/_actions.ts
git commit -m "$(cat <<'EOF'
admin: corrections server action (resolveCorrection → resolve_question_correction)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: correction-resolve-form component (server)

**Files:**
- Create: `vet-exam-ai/app/admin/corrections/_components/correction-resolve-form.tsx`

- [ ] **Step 1: Write file**

```tsx
import { resolveCorrection } from "../_actions";

export function CorrectionResolveForm({
  correctionId,
}: {
  correctionId: string;
}) {
  return (
    <form action={resolveCorrection} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="correction_id" value={correctionId} />
      <fieldset className="flex flex-wrap gap-3" style={{ border: 0, padding: 0 }}>
        <legend className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
          처리 결과
        </legend>
        <label className="text-sm flex items-center gap-1.5">
          <input type="radio" name="resolution" value="accepted" required />
          정정 수락 (수동 적용)
        </label>
        <label className="text-sm flex items-center gap-1.5">
          <input type="radio" name="resolution" value="rejected" required />
          정정 거절
        </label>
      </fieldset>
      <textarea
        name="note"
        maxLength={200}
        rows={2}
        placeholder="처리 사유 (선택, 200자 이내) — 제안자에게 함께 전달됩니다"
        className="text-sm rounded p-2"
        style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
      />
      <button
        type="submit"
        className="self-start text-sm px-3 py-1.5 rounded"
        style={{ background: "var(--teal)", color: "white", border: 0, cursor: "pointer" }}
      >
        처리 저장
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add vet-exam-ai/app/admin/corrections/_components/correction-resolve-form.tsx
git commit -m "$(cat <<'EOF'
admin: correction-resolve-form (server, JS 0)

Accept hint reminds the operator that 적용은 수동 (다음 단계: edit 페이지).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: corrections table component (server)

**Files:**
- Create: `vet-exam-ai/app/admin/corrections/_components/corrections-table.tsx`

⚠️ **Use sonnet — diff calculation + KVLE link + status branching makes this a non-trivial render.**

- [ ] **Step 1: Write file**

```tsx
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { CORRECTION_STATUS_KO } from "../../../../lib/admin/correction-labels";
import { CorrectionResolveForm } from "./correction-resolve-form";

export type CorrectionRow = {
  id:                 string;
  question_id:        string;
  proposed_by:        string | null;
  proposed_change:    Record<string, unknown>;
  status:             string;
  resolved_by:        string | null;
  resolved_at:        string | null;
  resolution_note:    string | null;
  created_at:         string;
};

export type QuestionLite = {
  id:        string;
  public_id: string | null;
  question:  string;
  answer:    string;
  category:  string | null;
  subject:   string | null;
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

function shortJson(v: unknown, max = 80): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (s == null) return "null";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export function CorrectionsTable({
  rows,
  questionMap,
  nicknameMap,
}: {
  rows:        CorrectionRow[];
  questionMap: Record<string, QuestionLite>;
  nicknameMap: Record<string, string | null>;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg p-8 text-center text-sm"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)", color: "var(--text-muted)" }}
      >
        처리할 정정 제안이 없습니다
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => {
        const q = questionMap[row.question_id];
        const proposerNick = row.proposed_by ? (nicknameMap[row.proposed_by] ?? "탈퇴한 사용자") : "탈퇴한 사용자";
        const resolverNick = row.resolved_by ? (nicknameMap[row.resolved_by] ?? null) : null;
        const kvle = q?.public_id ?? row.question_id;

        const changeKeys = Object.keys(row.proposed_change ?? {});
        const summary =
          changeKeys.length === 0
            ? "(빈 제안)"
            : changeKeys.slice(0, 2).join(", ") + (changeKeys.length > 2 ? ` …+${changeKeys.length - 2}` : "");

        const isPending = row.status === "proposed" || row.status === "reviewing";
        const isAccepted = row.status === "accepted";

        return (
          <details
            key={row.id}
            className="rounded-lg"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
          >
            <summary
              className="flex items-center gap-3 px-3 py-2 cursor-pointer text-sm"
              style={{ listStyle: "none" }}
            >
              <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />
              <span className="kvle-mono" style={{ color: "var(--text)" }}>{kvle}</span>
              <span className="flex-1 truncate" style={{ color: "var(--text-muted)" }}>
                {summary}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                {proposerNick}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                {formatRelative(row.created_at)}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{ border: "1px solid var(--rule)", color: "var(--text-muted)" }}
              >
                {CORRECTION_STATUS_KO[row.status as keyof typeof CORRECTION_STATUS_KO] ?? row.status}
              </span>
            </summary>

            <div
              className="px-3 pb-3 pt-1 flex flex-col gap-3"
              style={{ borderTop: "1px solid var(--rule)" }}
            >
              {q && (
                <div className="text-sm" style={{ color: "var(--text)" }}>
                  <div className="line-clamp-3">{q.question}</div>
                  <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    현재 정답: {q.answer}{q.category ? ` · ${q.category}` : ""}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  제안된 변경
                </div>
                <ul className="flex flex-col gap-0.5 text-xs kvle-mono" style={{ color: "var(--text-muted)" }}>
                  {changeKeys.length === 0 && <li>(없음)</li>}
                  {changeKeys.map((k) => {
                    const before = q ? (q as unknown as Record<string, unknown>)[k] : undefined;
                    const after  = (row.proposed_change as Record<string, unknown>)[k];
                    return (
                      <li key={k} className="flex flex-wrap gap-1">
                        <span style={{ color: "var(--text)" }}>{k}:</span>
                        <span>{shortJson(before)}</span>
                        <span>→</span>
                        <span style={{ color: "var(--text)" }}>{shortJson(after)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {isPending && <CorrectionResolveForm correctionId={row.id} />}

              {!isPending && (
                <div
                  className="rounded p-2 text-xs"
                  style={{ background: "var(--bg)", border: "1px solid var(--rule)", color: "var(--text-muted)" }}
                >
                  <div>
                    {resolverNick ?? "운영자"} · {row.resolved_at ? formatRelative(row.resolved_at) : "—"} ·{" "}
                    {CORRECTION_STATUS_KO[row.status as keyof typeof CORRECTION_STATUS_KO] ?? row.status}
                  </div>
                  {row.resolution_note && (
                    <div className="mt-1" style={{ color: "var(--text)" }}>“{row.resolution_note}”</div>
                  )}
                  {isAccepted && (
                    <div className="mt-2">
                      <Link
                        href={`/admin/questions/${encodeURIComponent(row.question_id)}/edit`}
                        style={{ color: "var(--teal)" }}
                      >
                        수정하러 가기 →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add vet-exam-ai/app/admin/corrections/_components/corrections-table.tsx
git commit -m "$(cat <<'EOF'
admin: corrections-table (server, <details> + diff list + accept link)

- summary: KVLE / change-key summary / proposer / time / status badge
- expand: question preview + diff list (key: before → after, 80-char cap)
- pending → CorrectionResolveForm
- accepted → '수정하러 가기 → /admin/questions/{id}/edit' link + resolved info
- rejected → resolved info only

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: corrections page.tsx (server, composition + 3-step fetch)

**Files:**
- Create: `vet-exam-ai/app/admin/corrections/page.tsx`

⚠️ **Use sonnet — questions JOIN + KVLE map + nickname union (proposer + resolver) need attention.**

- [ ] **Step 1: Write file**

```tsx
import { createClient } from "../../../lib/supabase/server";
import { parseCorrectionsSearchParams } from "./_lib/parse-corrections-search-params";
import { CorrectionsFilters } from "./_components/corrections-filters";
import {
  CorrectionsTable,
  type CorrectionRow,
  type QuestionLite,
} from "./_components/corrections-table";
import { CorrectionsPager } from "./_components/corrections-pager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

async function loadPage(sp: ReturnType<typeof parseCorrectionsSearchParams>): Promise<{
  rows:        CorrectionRow[];
  totalPages:  number;
  questionMap: Record<string, QuestionLite>;
  nicknameMap: Record<string, string | null>;
}> {
  const supabase = await createClient();

  // Step 1: corrections page (created_at ASC, oldest pending first)
  let q = supabase
    .from("question_corrections")
    .select("*", { count: "exact" });
  if (sp.status !== "all") q = q.eq("status", sp.status);

  const offset = (sp.page - 1) * PAGE_SIZE;
  const { data, count } = await q
    .order("created_at", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  const rows = (data ?? []).map((r) => ({
    id:              r.id as string,
    question_id:     r.question_id as string,
    proposed_by:     (r.proposed_by as string | null) ?? null,
    proposed_change: (r.proposed_change as Record<string, unknown>) ?? {},
    status:          r.status as string,
    resolved_by:     (r.resolved_by as string | null) ?? null,
    resolved_at:     (r.resolved_at as string | null) ?? null,
    resolution_note: (r.resolution_note as string | null) ?? null,
    created_at:      r.created_at as string,
  })) as CorrectionRow[];

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  if (rows.length === 0) {
    return { rows, totalPages, questionMap: {}, nicknameMap: {} };
  }

  // Step 2: questions lookup
  const qIds = Array.from(new Set(rows.map((r) => r.question_id)));
  const { data: qs } = await supabase
    .from("questions")
    .select("id, public_id, question, answer, category, subject")
    .in("id", qIds);

  const questionMap: Record<string, QuestionLite> = {};
  for (const item of qs ?? []) {
    questionMap[item.id as string] = {
      id:        item.id as string,
      public_id: (item.public_id as string | null) ?? null,
      question:  (item.question as string) ?? "",
      answer:    (item.answer as string) ?? "",
      category:  (item.category as string | null) ?? null,
      subject:   (item.subject as string | null) ?? null,
    };
  }

  // Step 3: nickname map (proposer ∪ resolver)
  const userIds = new Set<string>();
  for (const r of rows) {
    if (r.proposed_by) userIds.add(r.proposed_by);
    if (r.resolved_by) userIds.add(r.resolved_by);
  }
  const nicknameMap: Record<string, string | null> = {};
  if (userIds.size > 0) {
    const { data: profs } = await supabase
      .from("user_profiles_public")
      .select("user_id, nickname")
      .in("user_id", Array.from(userIds));
    for (const p of profs ?? []) {
      if (p.user_id) nicknameMap[p.user_id as string] = (p.nickname as string | null) ?? null;
    }
  }

  return { rows, totalPages, questionMap, nicknameMap };
}

const ERROR_LABELS: Record<string, string> = {
  missing_target:     "대상 정정이 지정되지 않았습니다",
  invalid_resolution: "올바른 처리 결과를 선택하세요",
  db_error:           "저장 중 오류가 발생했습니다. 다시 시도하세요",
};

export default async function AdminCorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = await searchParams;
  const sp  = parseCorrectionsSearchParams(raw);

  const { rows, totalPages, questionMap, nicknameMap } = await loadPage(sp);
  const clamped = { ...sp, page: Math.min(sp.page, totalPages) };

  const errorRaw = Array.isArray(raw.error) ? raw.error[0] : raw.error;
  const errorMsg = errorRaw && ERROR_LABELS[errorRaw] ? ERROR_LABELS[errorRaw] : null;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          정정 큐
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          사용자 정정 제안을 검토하고 수락/거절합니다. 수락은 별도로 직접 수정해야 적용됩니다.
        </p>
      </header>

      {errorMsg && (
        <div
          role="alert"
          className="mb-3 rounded p-3 text-sm"
          style={{ background: "var(--rose-dim)", border: "1px solid var(--rose)", color: "var(--rose)" }}
        >
          {errorMsg}
        </div>
      )}

      <CorrectionsFilters current={clamped} />
      <CorrectionsTable rows={rows} questionMap={questionMap} nicknameMap={nicknameMap} />
      <CorrectionsPager current={clamped} totalPages={totalPages} />
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/admin/corrections/page.tsx
git commit -m "$(cat <<'EOF'
admin: /admin/corrections page (3-step fetch + diff render + status branch)

- Step 1: question_corrections with status filter + ASC order
- Step 2: questions lookup → KVLE/category/answer map
- Step 3: nickname map (proposer ∪ resolver)

수동 적용 모델 (수락 → 직접 edit) — header 카피로 명시.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: notification format — add correction_resolved + tighten report_resolved

**Files:**
- Modify: `vet-exam-ai/lib/notifications/format.ts`

⚠️ **Use sonnet — exhaustiveness `never` check + payload field discipline.**

- [ ] **Step 1: Update `buildCommentHref` to support comment-less notifications + add helper**

Open `vet-exam-ai/lib/notifications/format.ts`. Replace the entire file contents with:

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

function buildQuestionHref(payload: Record<string, unknown>): string {
  const pub = stringField(payload, "question_public_id");
  if (pub) return `/questions/${encodeURIComponent(pub)}`;
  const qid = stringField(payload, "question_id");
  if (qid) return `/questions/${encodeURIComponent(qid)}`;
  return NO_HREF;
}

export function formatNotification(
  type: NotificationType,
  payload: Record<string, unknown>,
  related: RelatedCommentLite,
): FormattedNotification {
  // correction_resolved is independent of comments — handle first.
  if (type === "correction_resolved") {
    const resolution = stringField(payload, "resolution");
    const text =
      resolution === "accepted"
        ? "정정 제안이 수락되었어요"
        : resolution === "rejected"
          ? "정정 제안이 거절되었어요"
          : "정정 제안의 검토가 완료되었어요";
    return { text, href: buildQuestionHref(payload) };
  }

  // If the underlying comment is gone (cascade-deleted), every comment-bound
  // type degrades to text-only.
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
          ? "신고하신 댓글이 운영자 검토 후 제거되었어요"
          : resolution === "dismissed"
            ? "신고하신 댓글이 검토 결과 위반이 아닌 것으로 판단되었어요"
            : "신고하신 댓글의 검토가 완료되었어요";
      return { text, href };
    }
    case "comment_blinded":
      return { text: "회원님의 댓글이 블라인드 처리되었어요", href: NO_HREF };
    case "mention": {
      const nickname = stringField(payload, "actor_nickname") ?? "누군가";
      return { text: `${nickname}님이 회원님을 멘션했어요`, href: NO_HREF };
    }
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return { text: "새 알림", href: NO_HREF };
    }
  }
}

function textOnlyFallback(
  type: Exclude<NotificationType, "correction_resolved">,
  payload: Record<string, unknown>,
): string {
  switch (type) {
    case "reply":
      return `${stringField(payload, "actor_nickname") ?? "익명"}님이 회원님의 댓글에 답글을 달았어요`;
    case "vote_milestone": {
      const milestone = numberField(payload, "milestone");
      return `회원님의 댓글이 ${milestone != null ? String(milestone) : "여러"} 추천을 받았어요 🎉`;
    }
    case "report_resolved": {
      const resolution = stringField(payload, "resolution");
      return resolution === "upheld"
        ? "신고하신 댓글이 운영자 검토 후 제거되었어요"
        : resolution === "dismissed"
          ? "신고하신 댓글이 검토 결과 위반이 아닌 것으로 판단되었어요"
          : "신고하신 댓글의 검토가 완료되었어요";
    }
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

- [ ] **Step 2: Run typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean. The `_exhaustive: never` guard ensures the formatter still compiles after adding `correction_resolved`.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/notifications/format.ts
git commit -m "$(cat <<'EOF'
notifications: format correction_resolved + tighten report_resolved copy

- new branch: correction_resolved → '정정 제안이 수락/거절되었어요'
  href = /questions/{question_public_id ?? question_id} (RPC pre-resolves
  KVLE in payload — no client lookup)
- report_resolved copy aligned to spec: '제거되었어요' / '위반이 아닌 것으로 판단되었어요'
- textOnlyFallback signature excludes correction_resolved (handled
  before the comment-required guard)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: admin nav — un-disable 신고 + add 정정

**Files:**
- Modify: `vet-exam-ai/app/admin/_components/admin-nav-items.ts`

- [ ] **Step 1: Replace nav-items file contents**

Open `vet-exam-ai/app/admin/_components/admin-nav-items.ts`. Replace the `ADMIN_NAV_ITEMS` array (and add `GitPullRequest` import) so the file becomes:

```ts
import {
  LayoutDashboard,
  FileText,
  Users,
  GraduationCap,
  Flag,
  GitPullRequest,
  History,
  type LucideIcon,
} from "lucide-react";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { label: "대시보드", href: "/admin",             icon: LayoutDashboard },
  { label: "문제",      href: "/admin/questions",   icon: FileText },
  { label: "회원",      href: "/admin/users",       icon: Users,           disabled: true },
  { label: "시험",      href: "/admin/exams",       icon: GraduationCap,   disabled: true },
  { label: "신고",      href: "/admin/reports",     icon: Flag },
  { label: "정정",      href: "/admin/corrections", icon: GitPullRequest },
  { label: "감사",      href: "/admin/audit",       icon: History },
];

export function isAdminNavActive(activeHref: string, itemHref: string): boolean {
  if (activeHref === itemHref) return true;
  if (itemHref === "/admin") return false;
  return activeHref.startsWith(itemHref);
}
```

Notes:
- 신고 nav: `href` changed from old placeholder `/admin/moderation` to `/admin/reports`, `disabled: true` removed.
- 정정 nav: new entry with `GitPullRequest` icon.

- [ ] **Step 2: Commit**

```bash
git add vet-exam-ai/app/admin/_components/admin-nav-items.ts
git commit -m "$(cat <<'EOF'
admin: nav — activate 신고 (/admin/reports) + add 정정 (/admin/corrections)

GitPullRequest icon for 정정. 회원/시험 stay disabled (PR-D scope).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: admin dashboard hub — split 신고/정정 into two active cards

**Files:**
- Modify: `vet-exam-ai/app/admin/page.tsx`

- [ ] **Step 1: Replace the `<HubCard>` row**

Open `vet-exam-ai/app/admin/page.tsx`. Find the dashboard hub `<div>` containing the cards (around line 146). Replace the existing card list:

```tsx
          <HubCard
            href="/admin/questions"
            label="문제 관리"
            desc="문제 은행 둘러보기, 회차/과목/카테고리 필터, KVLE-ID 검색."
            icon={FileText}
          />
          <HubCard href="#" label="회원 관리" desc="역할/활성 상태 변경, 뱃지 부여." icon={Users} disabled />
          <HubCard href="#" label="시험 회차" desc="회차별 문제 수/공개 상태 집계." icon={GraduationCap} disabled />
          <HubCard href="#" label="신고/정정" desc="댓글 신고 큐, 문제 정정 제안 처리." icon={Flag} disabled />
          <HubCard href="/admin/audit" label="감사 로그" desc="모든 운영 작업 기록." icon={History} />
```

with:

```tsx
          <HubCard
            href="/admin/questions"
            label="문제 관리"
            desc="문제 은행 둘러보기, 회차/과목/카테고리 필터, KVLE-ID 검색."
            icon={FileText}
          />
          <HubCard href="#" label="회원 관리" desc="역할/활성 상태 변경, 뱃지 부여." icon={Users} disabled />
          <HubCard href="#" label="시험 회차" desc="회차별 문제 수/공개 상태 집계." icon={GraduationCap} disabled />
          <HubCard
            href="/admin/reports"
            label="신고"
            desc="댓글 신고 큐. 24시간 임시조치 결정."
            icon={Flag}
          />
          <HubCard
            href="/admin/corrections"
            label="정정"
            desc="문제 정정 제안 처리."
            icon={GitPullRequest}
          />
          <HubCard href="/admin/audit" label="감사 로그" desc="모든 운영 작업 기록." icon={History} />
```

- [ ] **Step 2: Add `GitPullRequest` to the lucide-react import line at top**

Find the existing import (around line 2):

```tsx
import { FileText, Layers, Hash, CheckCircle2, Users, GraduationCap, Flag, History } from "lucide-react";
```

Replace with:

```tsx
import {
  FileText,
  Layers,
  Hash,
  CheckCircle2,
  Users,
  GraduationCap,
  Flag,
  GitPullRequest,
  History,
} from "lucide-react";
```

- [ ] **Step 3: Run typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add vet-exam-ai/app/admin/page.tsx
git commit -m "$(cat <<'EOF'
admin: dashboard hub — activate 신고 + 정정 cards (split from disabled)

Two active hub cards replace the single disabled '신고/정정' card.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: typecheck + lint + build + apply migration + manual verification

**Files:** None (verification + migration apply)

- [ ] **Step 1: Final typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 2: Lint baseline check**

```bash
cd vet-exam-ai && npm run lint 2>&1 | tail -30
```
Expected: warning count unchanged from `main` baseline (or ≤ baseline + 1, project status quo per PR-B note). New PR-C files should not introduce new errors.

- [ ] **Step 3: Production build**

```bash
cd vet-exam-ai && npm run build 2>&1 | tail -50
```
Expected: build succeeds. New routes `/admin/reports` and `/admin/corrections` show up in the route map.

- [ ] **Step 4: Apply migration via Supabase Studio SQL Editor**

User action (the agent does NOT run this):
1. Open Supabase Studio → SQL Editor → new query.
2. Paste full contents of `vet-exam-ai/supabase/migrations/20260502000000_admin_pr_c.sql`.
3. Run.
4. Sanity:
   ```sql
   -- enum updated
   select unnest(enum_range(null::public.notification_type));
   -- correction_resolved should appear in the result list

   -- function exists + restricted
   select has_function_privilege('authenticated',
     'public.resolve_comment_report(uuid, text, text)', 'execute');
   -- expect: t

   select has_function_privilege('anon',
     'public.resolve_comment_report(uuid, text, text)', 'execute');
   -- expect: f

   -- gate works (admin user)
   select public.resolve_comment_report(
     '00000000-0000-0000-0000-000000000000', 'dismissed', 'sanity'
   );
   -- expect: ERROR P0002 'comment not found' (gate passed; lookup failed = correct)
   ```
5. Repeat for the second RPC:
   ```sql
   select public.resolve_question_correction(
     '00000000-0000-0000-0000-000000000000', 'rejected', 'sanity'
   );
   -- expect: ERROR P0002 'correction not found'
   ```

- [ ] **Step 5: Manual UI smoke (browser, dev server)**

Run:
```bash
cd vet-exam-ai && npm run dev
```

Then walk through:
1. Sign in as admin (current user).
2. Navigate to `/admin` — confirm "신고" + "정정" hub cards are active (no `disabled` styling), sidebar nav has both entries, "신고" `href=/admin/reports`.
3. Click "신고" → reach `/admin/reports`. If empty, "처리할 신고가 없습니다" shows.
4. (Manually create a test report row in SQL Editor):
   ```sql
   -- pick any existing comment id
   insert into public.comment_reports (comment_id, reporter_id, reason, description)
   values (
     (select id from public.comments where status = 'visible' limit 1),
     auth.uid(),
     'spam',
     'sanity test'
   );
   ```
5. Refresh `/admin/reports` — see one group row.
6. Expand → see body + "내 신고 1건" + form.
7. Choose "신고 기각" + leave note empty + submit. Redirects back. Group disappears (status=pending filter default).
8. Toggle filter "기각됨" — group reappears, expand shows resolved info, no form.
9. Visit `/admin/audit` — see one new `report_dismiss` row with the comment KVLE / target type "댓글".
10. Sign out + sign in as a non-admin → `/admin/reports` redirects to `/dashboard`.
11. Repeat similar smoke for `/admin/corrections` (insert a `question_corrections` row in SQL Editor with `proposed_change = '{"answer": "test"}'::jsonb`, expand → diff shows).

- [ ] **Step 6: Push branch + open PR**

```bash
git push -u origin feat/admin-reports-corrections-prc
```

Open PR via the auto-link printed by Git. PR title: `admin: PR-C reports + corrections queues (§18)`.

PR body (template):
```markdown
## Summary
- `/admin/reports` 댓글별 그룹 큐 + uphold/dismiss
- `/admin/corrections` 정정 큐 + accept/reject (수동 적용 모델)
- 두 큐 모두 RPC 단일 트랜잭션 (status + 댓글 + 알림 + audit)
- `correction_resolved` notification_type enum 1줄 추가
- 사이드바 + 대시보드 hub 활성화 (정정 nav 신규)
- NavBar dropdown 알림 라우팅 (`report_resolved` 카피 정렬, `correction_resolved` 신규)

소프트 런칭 차단 요인 (정보통신망법 24h 임시조치 결정 사이클) 봉합.

## Test plan
- [ ] 비-admin이 `/admin/reports` / `/admin/corrections` 진입 → `/dashboard` redirect
- [ ] 비-admin RPC 직접 호출 → 42501
- [ ] 댓글 1건에 신고 3건 생성 → 큐에 1행
- [ ] uphold 처리 → 댓글 `removed_by_admin` + 신고자 알림 + audit
- [ ] dismiss 처리 → `blinded_by_report` → `visible` 복원 (다른 status는 무손상)
- [ ] 두 운영자 동시 처리 → 두 번째는 silent OK
- [ ] correction accept → 알림 + audit + "수정하러 가기" 링크 노출
- [ ] correction reject → resolved 정보 표시
- [ ] 알림 dropdown에서 `report_resolved` / `correction_resolved` 클릭 라우팅 확인

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## Manual verification checklist (cross-reference with spec §Verification)

After merge, walk through the full spec verification block (~30 items) once more in production. Open `docs/superpowers/specs/2026-04-28-admin-pr-c-reports-corrections-design.md` § "Verification (수동 검증 시나리오)".

---

## Memory addendum (post-merge)

Once merged, update `MEMORY.md` with a new entry pointing to a fresh `project_admin_prc_done.md` summarizing:
- PR # + commit SHA + scope
- Subagent-driven dispatch pattern reused (~22 task)
- Notable traps caught (RPC signature drift / nicknameMap union / KVLE pre-resolve in payload)
- Next session 첫 액션 = 시딩 §20 본격화 또는 §14 4차 (수정+이력)
