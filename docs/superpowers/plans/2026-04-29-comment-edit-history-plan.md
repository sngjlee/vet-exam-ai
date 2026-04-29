# §14 4차 — 댓글 수정 + 변경 이력 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 댓글 작성자가 본문을 수정할 수 있고, 수정 흔적은 "수정됨" 라벨 + 시간순 이력 모달로 투명하게 노출되도록 한다.

**Architecture:** PATCH 인라인 교체 composer + GET history lazy-fetch 모달. body 변경 트리거가 이미 깔려 있으므로 `edit_count` 컬럼만 추가하면 backend 동작은 자동. UI는 root는 신규 `CommentEditComposer`, 답글은 기존 `CommentReplyComposer`에 mode 분기 추가.

**Tech Stack:** Next.js 16 (App Router), Supabase, TypeScript strict, zod, marked + sanitize-html. 자동화 테스트 인프라가 없으므로 각 task는 `npx tsc --noEmit` + 필요 시 `npm run build` + 수동 smoke로 검증한다.

**Spec:** `docs/superpowers/specs/2026-04-29-comment-edit-history-design.md` (커밋 7828fe9 + fb1d6fc)

**작업 시 항상**:
- `git status`로 정리 상태 확인
- bash CWD 함정 회피 — 모든 명령은 outer (`C:\Users\Theriogenology\Desktop\vet-exam-ai\`) 기준 절대경로 또는 `cd vet-exam-ai && ...` 한 줄 묶기
- 윈도우 LF→CRLF 경고는 무시
- 마이그레이션은 `supabase db push`가 아니라 **Supabase Dashboard SQL Editor**로 적용 (CLI "up to date" 함정 회피)

---

## File Structure

| 경로 | 역할 | 변경 |
|---|---|---|
| `supabase/migrations/20260429000000_comment_edit_count.sql` | edit_count 컬럼 추가 + 트리거 갱신 | **신규** |
| `supabase/schema.sql` | 단일 진실 schema sync | 수정 |
| `vet-exam-ai/lib/supabase/types.ts` | comments Row/Insert/Update typed | 수정 |
| `vet-exam-ai/lib/comments/schema.ts` | `EditCommentSchema` zod | 수정 |
| `vet-exam-ai/app/api/comments/[id]/route.ts` | PATCH 핸들러 추가 | 수정 |
| `vet-exam-ai/app/api/comments/[id]/history/route.ts` | GET 이력 조회 | **신규** |
| `vet-exam-ai/components/comments/CommentMenuOverflow.tsx` | `canEdit` + `onEdit` 메뉴 항목 | 수정 |
| `vet-exam-ai/components/comments/CommentEditComposer.tsx` | root 댓글용 인라인 edit composer | **신규** |
| `vet-exam-ai/components/comments/CommentEditHistoryModal.tsx` | 시간순 이력 모달 | **신규** |
| `vet-exam-ai/components/comments/CommentReplyComposer.tsx` | `mode: "create" \| "edit"` 분기 | 수정 |
| `vet-exam-ai/components/comments/CommentItem.tsx` | 데이터 타입 확장, "수정됨" 라벨, edit mode 분기, props 추가 | 수정 |
| `vet-exam-ai/components/comments/CommentList.tsx` | edit/history props 전파 | 수정 |
| `vet-exam-ai/components/comments/CommentReplyGroup.tsx` | edit/history props 전파 | 수정 |
| `vet-exam-ai/components/comments/CommentThread.tsx` | fetch 확장, 상태, 핸들러, 모달 마운트 | 수정 |

---

## Task 1: DB 마이그레이션 파일 생성

**Files:**
- Create: `supabase/migrations/20260429000000_comment_edit_count.sql`

- [ ] **Step 1: 슬롯 충돌 재확인**

```bash
ls supabase/migrations/ | grep "20260429"
```

Expected: 빈 출력 (없음). 다른 timestamp 발견 시 다음 free 슬롯으로 이동 (`20260429000001` 등).

- [ ] **Step 2: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/20260429000000_comment_edit_count.sql
-- §14 4차 — comments.edit_count + handle_comment_update 트리거 갱신

alter table public.comments
  add column edit_count integer not null default 0;

create or replace function public.handle_comment_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.body_text != new.body_text or old.body_html != new.body_html then
    insert into public.comment_edit_history (comment_id, body_text, body_html, edited_at)
    values (old.id, old.body_text, old.body_html, old.updated_at);
    new.updated_at := now();
    new.edit_count := old.edit_count + 1;
  end if;
  return new;
end;
$$;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260429000000_comment_edit_count.sql
git commit -m "feat(db): add comments.edit_count + update body-change trigger"
```

---

## Task 2: 마이그레이션 원격 적용 (수동, SQL Editor)

**Files:** (없음 — DB 작업)

- [ ] **Step 1: Supabase Dashboard 열기 → SQL Editor**

URL: https://supabase.com/dashboard/project/<project-id>/sql/new

- [ ] **Step 2: Task 1 SQL을 SQL Editor에 붙여넣고 RUN**

성공 응답 예: `Success. No rows returned`.

- [ ] **Step 3: 검증 쿼리**

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_schema='public' and table_name='comments' and column_name='edit_count';
```

Expected: `edit_count | integer | 0`

```sql
select pg_get_functiondef(oid) from pg_proc where proname='handle_comment_update';
```

Expected: 함수 정의에 `new.edit_count := old.edit_count + 1;` 포함.

- [ ] **Step 4: 기존 데이터 백필 확인**

```sql
select count(*), min(edit_count), max(edit_count) from public.comments;
```

Expected: `min=0, max=0` (모든 기존 행이 default 0으로 채워짐).

---

## Task 3: schema.sql sync

**Files:**
- Modify: `supabase/schema.sql` (comments 테이블 정의 + handle_comment_update 함수)

- [ ] **Step 1: comments 테이블 정의에 edit_count 컬럼 추가**

`supabase/schema.sql`에서 `create table public.comments (` 블록을 찾아 `updated_at  timestamptz not null default now()` 다음 줄(혹은 그 위 적절한 위치)에 추가:

```sql
  edit_count  integer     not null default 0,
```

- [ ] **Step 2: handle_comment_update 함수 정의를 마이그과 동일하게 갱신**

`create or replace function public.handle_comment_update()` 블록의 `if old.body_text != new.body_text or old.body_html != new.body_html then` 분기 안에 `new.edit_count := old.edit_count + 1;` 한 줄 추가 (Task 1 SQL과 동일).

- [ ] **Step 3: Diff 검증**

```bash
git diff supabase/schema.sql
```

Expected: 두 위치만 수정됨 — comments 테이블 컬럼 1줄 추가 + 함수 1줄 추가.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "chore(db): sync schema.sql with edit_count migration"
```

---

## Task 4: lib/supabase/types.ts — comments edit_count

**Files:**
- Modify: `vet-exam-ai/lib/supabase/types.ts:239-289` (comments 테이블 typed)

- [ ] **Step 1: Row, Insert에 edit_count 추가**

`comments: { Row: { ... } }` 안 `updated_at: string;` 다음에:
```ts
          edit_count: number;
```

`Insert: { ... }` 안 `updated_at?: string;` 다음에:
```ts
          edit_count?: number;
```

`Update`는 추가 안 함 — `edit_count`는 트리거가 관리하므로 client update payload에 들어가면 안 됨.

- [ ] **Step 2: 타입체크**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: EXIT=0 (변경된 곳 없으므로 깨지면 안 됨).

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/supabase/types.ts
git commit -m "chore(types): add comments.edit_count to Database typed schema"
```

---

## Task 5: lib/comments/schema.ts — EditCommentSchema

**Files:**
- Modify: `vet-exam-ai/lib/comments/schema.ts`

- [ ] **Step 1: EditCommentSchema 추가**

파일 끝에 추가:

```ts
export const EditCommentSchema = z.object({
  body_text: z
    .string()
    .min(1, "내용을 입력해주세요")
    .max(5000, "5000자를 초과할 수 없습니다"),
});

export type EditCommentInput = z.infer<typeof EditCommentSchema>;
```

- [ ] **Step 2: 타입체크**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: EXIT=0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/comments/schema.ts
git commit -m "feat(comments): add EditCommentSchema for PATCH validation"
```

---

## Task 6: PATCH /api/comments/[id]

**Files:**
- Modify: `vet-exam-ai/app/api/comments/[id]/route.ts`

- [ ] **Step 1: PATCH 핸들러 추가**

파일 상단 import에 추가:

```ts
import { EditCommentSchema } from "../../../../lib/comments/schema";
import { renderCommentMarkdown } from "../../../../lib/comments/sanitize";
```

기존 `DELETE` 함수 아래에 PATCH 함수 추가:

```ts
export async function PATCH(
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

  const parsed = EditCommentSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const { body_text } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data: existing, error: selectErr } = await supabase
    .from("comments")
    .select("id, user_id, status, body_text, body_html, created_at, updated_at, edit_count")
    .eq("id", id)
    .maybeSingle();

  if (selectErr) {
    return NextResponse.json({ error: selectErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (existing.status !== "visible") {
    return NextResponse.json(
      { error: "이 댓글은 더 이상 수정할 수 없습니다" },
      { status: 409 }
    );
  }

  // No-op: body_text 동일 → DB update skip, 기존 row 그대로 반환
  if (existing.body_text === body_text) {
    return NextResponse.json(
      {
        id: existing.id,
        body_text: existing.body_text,
        body_html: existing.body_html,
        edit_count: existing.edit_count,
        updated_at: existing.updated_at,
        created_at: existing.created_at,
      },
      { status: 200 }
    );
  }

  const body_html = renderCommentMarkdown(body_text);

  const { data: updated, error: updateErr } = await supabase
    .from("comments")
    .update({ body_text, body_html })
    .eq("id", id)
    .select("id, body_text, body_html, edit_count, updated_at, created_at")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json(updated, { status: 200 });
}
```

- [ ] **Step 2: 타입체크**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: EXIT=0.

- [ ] **Step 3: dev 서버 띄우고 curl 검증 (일부)**

다른 터미널이 이미 띄웠을 수 있으므로 살아있는지 먼저 확인:

```bash
curl -sf http://localhost:3000 > /dev/null && echo "dev up" || echo "need start"
```

`need start`이면:
```bash
cd vet-exam-ai && npm run dev
```

다른 터미널/창에서 401 검증:

```bash
curl -i -X PATCH http://localhost:3000/api/comments/00000000-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" -d '{"body_text":"test"}'
```

Expected: `HTTP/1.1 401 Unauthorized`, body `{"error":"Authentication required"}`

422 검증:

```bash
curl -i -X PATCH http://localhost:3000/api/comments/00000000-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" -d '{}'
```

Expected: 인증 미통과 시 401이 먼저. 인증된 세션이 필요한 422는 UI smoke에서 검증.

- [ ] **Step 4: Commit**

```bash
git add vet-exam-ai/app/api/comments/[id]/route.ts
git commit -m "feat(api): PATCH /api/comments/[id] for body edits"
```

---

## Task 7: GET /api/comments/[id]/history

**Files:**
- Create: `vet-exam-ai/app/api/comments/[id]/history/route.ts`

- [ ] **Step 1: 라우트 파일 작성**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: comment, error: cErr } = await supabase
    .from("comments")
    .select("id, status, body_html, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  if (comment.status === "hidden_by_author") {
    return NextResponse.json({ error: "Comment unavailable" }, { status: 410 });
  }

  const { data: history, error: hErr } = await supabase
    .from("comment_edit_history")
    .select("body_html, edited_at")
    .eq("comment_id", id)
    .order("edited_at", { ascending: false });

  if (hErr) {
    return NextResponse.json({ error: hErr.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      current: { body_html: comment.body_html, edited_at: comment.updated_at },
      history: history ?? [],
    },
    { status: 200 }
  );
}
```

- [ ] **Step 2: 타입체크**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: EXIT=0.

- [ ] **Step 3: 404 검증 (dev 서버 가정)**

```bash
curl -i http://localhost:3000/api/comments/00000000-0000-0000-0000-000000000000/history
```

Expected: `HTTP/1.1 404`, body `{"error":"Comment not found"}`

- [ ] **Step 4: Commit**

```bash
git add vet-exam-ai/app/api/comments/[id]/history/route.ts
git commit -m "feat(api): GET /api/comments/[id]/history"
```

---

## Task 8: CommentMenuOverflow — canEdit + onEdit

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentMenuOverflow.tsx`

- [ ] **Step 1: Props 확장**

`Props` 타입에 추가:

```ts
type Props = {
  isOwner: boolean;
  isReported: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canReport: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
};
```

- [ ] **Step 2: 컴포넌트 시그니처 + early return + 메뉴 항목 추가**

`export default function CommentMenuOverflow({ ... }: Props)`의 destructuring에 `canEdit, onEdit` 추가.

`const showDelete = canDelete;` 위에 추가:
```ts
  const showEdit = canEdit;
```

`if (!showDelete && !showReport && !showReportedBadge) return null;`를:
```ts
  if (!showEdit && !showDelete && !showReport && !showReportedBadge) return null;
```

`{showDelete && ( ... )}` 블록 **위**에 (즉 메뉴 첫 항목으로):

```tsx
          {showEdit && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onEdit();
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
              수정
            </button>
          )}
```

- [ ] **Step 3: 호출처 임시 보정**

`CommentItem.tsx`의 `<CommentMenuOverflow ...>` 호출에 `canEdit={false}` + `onEdit={() => {}}` 임시 추가 (Task 12에서 실제 wiring).

`vet-exam-ai/components/comments/CommentItem.tsx`에서 `<CommentMenuOverflow` 검색해 다음과 같이 수정:

```tsx
          <CommentMenuOverflow
            isOwner={isOwner}
            isReported={isReported}
            canEdit={false}
            canDelete={canDelete}
            canReport={isAuthed && status !== "blinded_by_report"}
            onEdit={() => {}}
            onDelete={() => onDelete(comment.id)}
            onReport={() => onReport(comment.id)}
          />
```

- [ ] **Step 4: 타입체크**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: EXIT=0.

- [ ] **Step 5: Commit**

```bash
git add vet-exam-ai/components/comments/CommentMenuOverflow.tsx vet-exam-ai/components/comments/CommentItem.tsx
git commit -m "feat(comments): CommentMenuOverflow canEdit + onEdit (stubbed in CommentItem)"
```

---

## Task 9: CommentEditComposer (신규)

**Files:**
- Create: `vet-exam-ai/components/comments/CommentEditComposer.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
"use client";

import { useEffect, useState } from "react";

const MAX = 5000;
const WARN = 4500;

export type EditedCommentRow = {
  id: string;
  body_text: string;
  body_html: string;
  edit_count: number;
  updated_at: string;
  created_at: string;
};

type Props = {
  commentId: string;
  initialText: string;
  onSaved: (row: EditedCommentRow) => void;
  onCancel: () => void;
  onConflict?: () => void;
};

export default function CommentEditComposer({
  commentId,
  initialText,
  onSaved,
  onCancel,
  onConflict,
}: Props) {
  const [text, setText] = useState(initialText);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const len = text.length;
  const overLimit = len > MAX;
  const counterColor =
    overLimit ? "var(--wrong)" : len > WARN ? "var(--blue)" : "var(--text-faint)";
  const dirty = text !== initialText;
  const canSubmit = dirty && len > 0 && !overLimit && !submitting;

  function attemptCancel() {
    if (dirty) {
      const ok = window.confirm("작성 중인 내용이 사라집니다. 취소할까요?");
      if (!ok) return;
    }
    onCancel();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") attemptCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_text: text }),
      });
      if (res.status === 409) {
        if (onConflict) onConflict();
        else setError("이 댓글은 더 이상 수정할 수 없습니다");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "수정 실패. 다시 시도해주세요.");
      }
      const updated = (await res.json()) as EditedCommentRow;
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "수정 실패");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "10px 12px",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        autoFocus
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 13,
          fontFamily: "inherit",
          color: "var(--text)",
          resize: "vertical",
          minHeight: 80,
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 11, color: counterColor, fontFamily: "var(--font-mono)" }}>
          {len} / {MAX}자
        </span>
        {error && (
          <span style={{ fontSize: 11, color: "var(--wrong)" }} role="alert">
            {error}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
          <button
            type="button"
            onClick={attemptCancel}
            disabled={submitting}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              padding: "6px 14px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              background: canSubmit ? "var(--teal)" : "var(--surface-raised)",
              color: canSubmit ? "#061218" : "var(--text-faint)",
              border: "none",
              padding: "6px 16px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {submitting ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: EXIT=0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/components/comments/CommentEditComposer.tsx
git commit -m "feat(comments): CommentEditComposer (root inline edit)"
```

---

## Task 10: CommentEditHistoryModal (신규)

**Files:**
- Create: `vet-exam-ai/components/comments/CommentEditHistoryModal.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
"use client";

import { useEffect, useState } from "react";

type Version = { body_html: string; edited_at: string };
type HistoryResponse = {
  current: Version;
  history: Version[];
};

type Props = {
  commentId: string;
  editCount: number;
  onClose: () => void;
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

export default function CommentEditHistoryModal({
  commentId,
  editCount,
  onClose,
}: Props) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/comments/${commentId}/history`);
        if (!res.ok) {
          throw new Error(`불러오기 실패 (${res.status})`);
        }
        const json = (await res.json()) as HistoryResponse;
        if (cancelled) return;
        setData(json);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "불러오기 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [commentId, reloadKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "16px 18px 18px",
          maxWidth: 560,
          width: "100%",
          maxHeight: "80vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
            수정 이력 (총 {editCount}회)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            닫기
          </button>
        </div>

        {loading && (
          <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "8px 4px" }}>
            이력 불러오는 중…
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "12px 14px",
              background: "var(--wrong-dim)",
              border: "1px solid rgba(192,74,58,0.3)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--text)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            {error}
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text)",
                padding: "4px 10px",
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

        {!loading && !error && data && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { label: "[현재]", v: data.current },
              ...data.history.map((v, idx) => ({
                label:
                  idx === data.history.length - 1
                    ? "[최초 작성]"
                    : "[수정 전]",
                v,
              })),
            ].map((entry, i) => (
              <div
                key={`${entry.v.edited_at}-${i}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  paddingBottom: 10,
                  borderBottom:
                    i ===
                    (data.history.length === 0
                      ? 0
                      : data.history.length)
                      ? "none"
                      : "1px dashed var(--border)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-faint)",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                  }}
                >
                  {entry.label} {formatRelative(entry.v.edited_at)}
                </div>
                <div
                  className="kvle-prose kvle-selectable-text"
                  style={{ color: "var(--text)", fontSize: 13 }}
                  dangerouslySetInnerHTML={{ __html: entry.v.body_html }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: EXIT=0.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/components/comments/CommentEditHistoryModal.tsx
git commit -m "feat(comments): CommentEditHistoryModal — chronological versions"
```

---

## Task 11: CommentReplyComposer — mode + initialText prop

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentReplyComposer.tsx`

- [ ] **Step 1: Props 확장 + edit 분기**

기존 `Props`를:

```ts
import type { CommentItemData } from "./CommentItem";
import type { EditedCommentRow } from "./CommentEditComposer";

type CreateProps = {
  mode?: "create";
  questionId: string;
  parentId: string;
  onSubmitted: (newComment: CommentItemData) => void;
  onCancel: () => void;
};

type EditProps = {
  mode: "edit";
  commentId: string;
  initialText: string;
  onSaved: (row: EditedCommentRow) => void;
  onCancel: () => void;
  onConflict?: () => void;
};

type Props = CreateProps | EditProps;
```

함수 시그니처를 union 처리하도록 변경:

```tsx
export default function CommentReplyComposer(props: Props) {
  const isEdit = props.mode === "edit";
  const initialText = isEdit ? props.initialText : "";
  const [body, setBody] = useState(initialText);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const len = body.length;
  const overLimit = len > MAX;
  const counterColor =
    overLimit ? "var(--wrong)" : len > WARN ? "var(--blue)" : "var(--text-faint)";

  const dirty = isEdit ? body !== initialText : len > 0;
  const canSubmit = dirty && len > 0 && !overLimit && !submitting;

  function attemptCancel() {
    if (isEdit && body !== initialText) {
      const ok = window.confirm("작성 중인 내용이 사라집니다. 취소할까요?");
      if (!ok) return;
    }
    props.onCancel();
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        const res = await fetch(`/api/comments/${props.commentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body_text: body }),
        });
        if (res.status === 409) {
          if (props.onConflict) props.onConflict();
          else setError("이 댓글은 더 이상 수정할 수 없습니다");
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "수정 실패. 다시 시도해주세요.");
        }
        const updated = (await res.json()) as EditedCommentRow;
        props.onSaved(updated);
      } else {
        const res = await fetch("/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question_id: props.questionId,
            parent_id: props.parentId,
            body_text: body,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "전송 실패. 다시 시도해주세요.");
        }
        const created = await res.json();
        props.onSubmitted({
          id: created.id,
          user_id: created.user_id,
          type: created.type,
          body_text: created.body_text,
          body_html: created.body_html,
          created_at: created.created_at,
          edit_count: created.edit_count ?? 0,
          authorNickname: null,
        });
        setBody("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isEdit ? "수정 실패" : "전송 실패");
    } finally {
      setSubmitting(false);
    }
  }
```

placeholder 와 버튼 라벨 분기:

기존 `placeholder="답글을 입력하세요..."`를:
```tsx
        placeholder={isEdit ? "" : "답글을 입력하세요..."}
```

기존 cancel 버튼 `onClick={onCancel}`을:
```tsx
            onClick={attemptCancel}
```

기존 등록 버튼 라벨 `{submitting ? "전송 중..." : "등록"}`를:
```tsx
            {submitting ? (isEdit ? "저장 중..." : "전송 중...") : (isEdit ? "저장" : "등록")}
```

- [ ] **Step 2: 타입체크**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: EXIT=0. (CommentItemData에 body_text/edit_count는 Task 12에서 들어감 — 이번 task는 `created.body_text` `created.edit_count`를 그대로 prop에 흘리므로 타입체크는 Task 12 이후 정합. 만약 여기서 fail하면 Task 12 일부를 미리 가져온다.)

만약 fail이면 Step 2-bis로:

- [ ] **Step 2-bis (필요 시): CommentItem.tsx의 CommentItemData에 body_text/edit_count REQUIRED 미리 추가**

`vet-exam-ai/components/comments/CommentItem.tsx`의 `export type CommentItemData = {`를:

```ts
export type CommentItemData = {
  id: string;
  user_id: string | null;
  type: CommentType;
  body_text: string;
  body_html: string;
  created_at: string;
  edit_count: number;
  authorNickname: string | null;
};
```

이 변경으로 CommentThread의 `toItem`이 깨질 수 있음 → Task 12 본격 진행.

- [ ] **Step 3: Commit (Task 12와 묶을 수 있음)**

이 task의 변경은 후속 task와 타입 결합이 강하므로 Task 12 이후 단일 commit으로 묶어도 됨. 분리 commit하려면:

```bash
git add vet-exam-ai/components/comments/CommentReplyComposer.tsx
git commit -m "feat(comments): CommentReplyComposer mode=create|edit"
```

---

## Task 12: CommentItem — 데이터 확장 + 헤더 라벨 + edit mode 분기

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentItem.tsx`

- [ ] **Step 1: CommentItemData 확장 (Task 11에서 미리 들어갔으면 skip)**

```ts
export type CommentItemData = {
  id: string;
  user_id: string | null;
  type: CommentType;
  body_text: string;
  body_html: string;
  created_at: string;
  edit_count: number;
  authorNickname: string | null;
};
```

- [ ] **Step 2: Props 확장**

`Props` 타입에 추가:

```ts
type Props = {
  comment: CommentItemData;
  score: number;
  myVote: VoteValue | null;
  status: "visible" | "hidden_by_votes" | "blinded_by_report";
  isOwner: boolean;
  isAuthed: boolean;
  isReported: boolean;
  canDelete: boolean;
  isPinned?: boolean;
  authorBadges: BadgeType[];
  isEditing?: boolean;
  onDelete: (id: string) => void;
  onReport: (id: string) => void;
  onVoteChange: (commentId: string, value: VoteValue, prev: VoteValue | null) => void;
  onUnauthedAttempt?: () => void;
  onStartReply?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onStartEdit?: (id: string) => void;
  onCancelEdit?: () => void;
  onSaved?: (row: import("./CommentEditComposer").EditedCommentRow) => void;
  onShowHistory?: (id: string, editCount: number) => void;
  onConflict?: () => void;
  isReply?: boolean;
  isPlaceholder?: boolean;
};
```

- [ ] **Step 3: Imports 추가**

```ts
import CommentEditComposer from "./CommentEditComposer";
import CommentReplyComposer from "./CommentReplyComposer";
```

- [ ] **Step 4: 함수 시그니처 destructuring 갱신**

`isEditing`, `onStartEdit`, `onCancelEdit`, `onSaved`, `onShowHistory`, `onConflict` 추가.

- [ ] **Step 5: 헤더에 "· 수정됨" 라벨 추가**

기존 헤더 div의 `<span style={{ color: "var(--text-faint)" }}>· {formatRelative(comment.created_at)}</span>` 다음 줄에:

```tsx
        {comment.edit_count > 0 && onShowHistory && (
          <button
            type="button"
            onClick={() => onShowHistory(comment.id, comment.edit_count)}
            aria-label={`수정 이력 보기 (총 ${comment.edit_count}회 수정됨)`}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-faint)",
              cursor: "pointer",
              fontSize: 11,
              padding: 0,
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            · 수정됨
          </button>
        )}
```

- [ ] **Step 6: 메뉴 wiring 갱신**

기존 `<CommentMenuOverflow ... />`를:

```tsx
          <CommentMenuOverflow
            isOwner={isOwner}
            isReported={isReported}
            canEdit={isOwner && status === "visible" && !isEditing && !!onStartEdit}
            canDelete={canDelete}
            canReport={isAuthed && status !== "blinded_by_report"}
            onEdit={() => onStartEdit && onStartEdit(comment.id)}
            onDelete={() => onDelete(comment.id)}
            onReport={() => onReport(comment.id)}
          />
```

- [ ] **Step 7: 본문 div를 edit mode에서 composer로 교체**

기존 `<div className="kvle-prose kvle-selectable-text" ...>` 블록을:

```tsx
      {isEditing && !isPlaceholder && onCancelEdit && onSaved ? (
        isReply ? (
          <CommentReplyComposer
            mode="edit"
            commentId={comment.id}
            initialText={comment.body_text}
            onSaved={onSaved}
            onCancel={onCancelEdit}
            onConflict={onConflict}
          />
        ) : (
          <CommentEditComposer
            commentId={comment.id}
            initialText={comment.body_text}
            onSaved={onSaved}
            onCancel={onCancelEdit}
            onConflict={onConflict}
          />
        )
      ) : (
        <div
          className="kvle-prose kvle-selectable-text"
          style={{ color: "var(--text)" }}
          dangerouslySetInnerHTML={{ __html: comment.body_html }}
        />
      )}
```

- [ ] **Step 8: 타입체크**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: 이 단계에서 CommentThread의 `toItem`이 body_text/edit_count 미제공으로 fail할 수 있음. Task 14에서 잡힘 — 일단 Task 13으로 진행한 뒤 Task 14에서 통합 검증.

만약 즉시 깨끗한 typecheck가 필요하면 임시로 CommentThread.tsx의 `toItem`에 `body_text: row.body_text ?? "", edit_count: (row as any).edit_count ?? 0` 추가 후 Task 14에서 정리.

- [ ] **Step 9: Commit**

```bash
git add vet-exam-ai/components/comments/CommentItem.tsx vet-exam-ai/components/comments/CommentReplyComposer.tsx
git commit -m "feat(comments): CommentItem header 수정됨 label + edit mode dispatch"
```

---

## Task 13: CommentList + CommentReplyGroup — props 전파

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentList.tsx`
- Modify: `vet-exam-ai/components/comments/CommentReplyGroup.tsx`

- [ ] **Step 1: CommentReplyGroup Props 확장**

`type Props`에 추가:

```ts
  editingId: string | null;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaved: (row: import("./CommentEditComposer").EditedCommentRow) => void;
  onShowHistory: (id: string, editCount: number) => void;
  onConflict?: () => void;
```

함수 시그니처 destructuring에 동일 추가.

map 안 `<CommentItem ... isReply />`를 다음으로 교체:

```tsx
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
            authorBadges={
              r.user_id ? authorBadgesById.get(r.user_id) ?? [] : []
            }
            isEditing={editingId === r.id}
            onDelete={onDelete}
            onReport={onReport}
            onVoteChange={onVoteChange}
            onUnauthedAttempt={onUnauthedAttempt}
            onStartEdit={isOwner ? onStartEdit : undefined}
            onCancelEdit={onCancelEdit}
            onSaved={onSaved}
            onShowHistory={onShowHistory}
            onConflict={onConflict}
            isReply
          />
        );
```

- [ ] **Step 2: CommentList Props 확장**

`type Props`에 추가:

```ts
  editingId: string | null;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaved: (row: import("./CommentEditComposer").EditedCommentRow) => void;
  onShowHistory: (id: string, editCount: number) => void;
  onConflict?: () => void;
```

함수 시그니처 destructuring 추가.

`<CommentItem ... onTogglePin={onTogglePin} />` (root non-placeholder 블록)을:

```tsx
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
                isPinned={pinnedCommentId === root.id}
                authorBadges={
                  root.user_id ? authorBadgesById.get(root.user_id) ?? [] : []
                }
                isEditing={editingId === root.id}
                onDelete={onDelete}
                onReport={onReport}
                onVoteChange={onVoteChange}
                onUnauthedAttempt={onUnauthedAttempt}
                onStartReply={
                  currentUserId === null ? undefined : onStartReply
                }
                onTogglePin={onTogglePin}
                onStartEdit={isOwner ? onStartEdit : undefined}
                onCancelEdit={onCancelEdit}
                onSaved={onSaved}
                onShowHistory={onShowHistory}
                onConflict={onConflict}
              />
            );
```

`<CommentReplyGroup ... authorBadgesById={authorBadgesById} />`을:

```tsx
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
                  authorBadgesById={authorBadgesById}
                  editingId={editingId}
                  onStartEdit={onStartEdit}
                  onCancelEdit={onCancelEdit}
                  onSaved={onSaved}
                  onShowHistory={onShowHistory}
                  onConflict={onConflict}
                />
```

- [ ] **Step 3: 타입체크**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: CommentThread 미수정으로 fail. 다음 task로 진행.

- [ ] **Step 4: Commit (Task 14와 묶기 가능)**

```bash
git add vet-exam-ai/components/comments/CommentList.tsx vet-exam-ai/components/comments/CommentReplyGroup.tsx
git commit -m "feat(comments): propagate edit/history props through list+group"
```

---

## Task 14: CommentThread — fetch 확장, 상태, 핸들러, 모달 마운트

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentThread.tsx`

- [ ] **Step 1: Imports 추가**

상단에:

```ts
import CommentEditHistoryModal from "./CommentEditHistoryModal";
import type { EditedCommentRow } from "./CommentEditComposer";
```

- [ ] **Step 2: CommentRow 타입 확장**

```ts
type CommentRow = {
  id: string;
  user_id: string | null;
  parent_id: string | null;
  type: CommentType;
  body_text: string;
  body_html: string;
  created_at: string;
  updated_at: string;
  edit_count: number;
  status: CommentStatus;
  vote_score: number;
};
```

- [ ] **Step 3: select 절 확장 (메인 fetch)**

기존:
```ts
        .from("comments")
        .select("id, user_id, parent_id, type, body_html, created_at, status, vote_score")
```

→
```ts
        .from("comments")
        .select(
          "id, user_id, parent_id, type, body_text, body_html, created_at, updated_at, edit_count, status, vote_score"
        )
```

- [ ] **Step 4: toItem 갱신**

```ts
      const toItem = (row: CommentRow): CommentItemData => ({
        id: row.id,
        user_id: row.user_id,
        type: row.type,
        body_text: row.body_text,
        body_html: row.body_html,
        created_at: row.created_at,
        edit_count: row.edit_count,
        authorNickname: row.user_id ? nicknameById.get(row.user_id) ?? null : null,
      });
```

- [ ] **Step 5: placeholder root 객체에 누락 필드 추가**

`assembled.push({ ... isPlaceholder: true });` 블록을 다음으로:

```ts
          assembled.push({
            id: pid,
            user_id: null,
            type: "discussion",
            body_text: "",
            body_html: "",
            created_at: oldestReply.created_at,
            edit_count: 0,
            authorNickname: null,
            status: "visible",
            replies: arr.map<ReplyRow>((rr) => ({
              ...toItem(rr),
              status: rr.status,
            })),
            isPlaceholder: true,
          });
```

- [ ] **Step 6: 신규 state**

기존 `replyingToId` 옆에 추가:

```ts
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyForId, setHistoryForId] = useState<string | null>(null);
  const [historyEditCount, setHistoryEditCount] = useState<number>(0);
```

- [ ] **Step 7: handleStartReply / handleStartEdit 상호배타**

`handleStartReply` 갱신:

```ts
  function handleStartReply(id: string) {
    setEditingId(null);
    setReplyingToId(id);
  }
  function handleCancelReply() {
    setReplyingToId(null);
  }
```

새 핸들러 추가:

```ts
  function handleStartEdit(id: string) {
    setReplyingToId(null);
    setEditingId(id);
  }
  function handleCancelEdit() {
    setEditingId(null);
  }

  function applyEditToRoots(row: EditedCommentRow) {
    setRoots((prev) =>
      prev.map((root) => {
        if (root.id === row.id && !root.isPlaceholder) {
          return {
            ...root,
            body_text: row.body_text,
            body_html: row.body_html,
            edit_count: row.edit_count,
          };
        }
        if (root.replies.some((r) => r.id === row.id)) {
          return {
            ...root,
            replies: root.replies.map((r) =>
              r.id === row.id
                ? {
                    ...r,
                    body_text: row.body_text,
                    body_html: row.body_html,
                    edit_count: row.edit_count,
                  }
                : r
            ),
          };
        }
        return root;
      })
    );
  }

  function handleSaved(row: EditedCommentRow) {
    applyEditToRoots(row);
    setPinnedFallback((prev) => {
      if (!prev || prev.item.id !== row.id) return prev;
      return {
        ...prev,
        item: {
          ...prev.item,
          body_text: row.body_text,
          body_html: row.body_html,
          edit_count: row.edit_count,
        },
      };
    });
    setEditingId(null);
  }

  function handleEditConflict() {
    setEditingId(null);
    showToast("이 댓글은 더 이상 수정할 수 없습니다");
    setReloadKey((k) => k + 1);
  }

  function handleShowHistory(id: string, editCount: number) {
    setHistoryForId(id);
    setHistoryEditCount(editCount);
  }
  function handleCloseHistory() {
    setHistoryForId(null);
  }
```

- [ ] **Step 8: pinnedFromList에 body_text + edit_count 포함**

`pinnedFromList` IIFE 안 두 군데 (`item: CommentItemData = { ... }`)를 모두 다음으로:

```ts
        const item: CommentItemData = {
          id: root.id,
          user_id: root.user_id,
          type: root.type,
          body_text: root.body_text,
          body_html: root.body_html,
          created_at: root.created_at,
          edit_count: root.edit_count,
          authorNickname: root.authorNickname,
        };
```

(reply 분기도 동일하게 `reply.body_text`, `reply.edit_count`로.)

- [ ] **Step 9: pinnedFallback fetch select 확장**

기존:
```ts
      const { data, error } = await supabase
        .from("comments")
        .select("id, user_id, type, body_html, created_at, status, vote_score")
```

→
```ts
      const { data, error } = await supabase
        .from("comments")
        .select(
          "id, user_id, type, body_text, body_html, created_at, edit_count, status, vote_score"
        )
```

`setPinnedFallback({ item: { ... } })`의 객체에 다음 추가:

```ts
        item: {
          id: data.id,
          user_id: data.user_id,
          type: data.type as CommentType,
          body_text: data.body_text,
          body_html: data.body_html,
          created_at: data.created_at,
          edit_count: data.edit_count,
          authorNickname: nickname,
        },
```

- [ ] **Step 10: pinnedDisplay rendering — pinned CommentItem에도 새 prop 전달**

`<CommentItem comment={pinnedDisplay.item} ... />` (pinned 섹션) 에 다음 추가:

```tsx
                isEditing={editingId === pinnedDisplay.item.id}
                onStartEdit={
                  pinnedDisplay.item.user_id === currentUserId ? handleStartEdit : undefined
                }
                onCancelEdit={handleCancelEdit}
                onSaved={handleSaved}
                onShowHistory={handleShowHistory}
                onConflict={handleEditConflict}
```

- [ ] **Step 11: CommentList 호출에 새 prop 전달**

기존 `<CommentList ... authorBadgesById={authorBadgesById} />`에 다음 추가:

```tsx
            editingId={editingId}
            onStartEdit={handleStartEdit}
            onCancelEdit={handleCancelEdit}
            onSaved={handleSaved}
            onShowHistory={handleShowHistory}
            onConflict={handleEditConflict}
```

- [ ] **Step 12: Modal 마운트**

return문 마지막의 `{toast && ( ... )}` 위에:

```tsx
      {historyForId && (
        <CommentEditHistoryModal
          commentId={historyForId}
          editCount={historyEditCount}
          onClose={handleCloseHistory}
        />
      )}
```

- [ ] **Step 13: 타입체크 + 빌드**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: EXIT=0.

```bash
cd vet-exam-ai && npm run build
```

Expected: EXIT=0.

- [ ] **Step 14: Commit**

```bash
git add vet-exam-ai/components/comments/CommentThread.tsx
git commit -m "feat(comments): wire edit/history state + handlers in CommentThread"
```

---

## Task 15: 수동 smoke 검증 + 통합 commit

**Files:** (없음 — 수동 테스트)

dev 서버를 띄우고 (이미 떠있으면 reuse) 다음 시나리오를 차례로 확인.

브라우저: http://localhost:3000

**Setup**
- 본인 계정으로 로그인. 댓글이 한두 개 있는 문제 페이지 열기 (없으면 한 개 작성). 답글 한두 개도 작성.

- [ ] **Smoke 1: root 댓글 수정 happy path**
  - 본인 댓글 `⋯ 메뉴 → 수정` 클릭
  - 본문이 composer로 인라인 교체됨, textarea에 기존 body_text 표시
  - 글자 한 자 추가하고 `저장` 클릭
  - composer가 닫히고 본문이 새 텍스트로 갱신
  - 헤더 우측에 `· 수정됨` 노출
  - 페이지 새로고침해도 동일

- [ ] **Smoke 2: 변경 없이 저장 (no-op)**
  - 같은 댓글에서 `수정` 클릭 → 그대로 `저장` 시도
  - 버튼이 disabled (text === initialText, dirty=false)
  - `취소` 클릭 → confirm 안 뜨고 즉시 닫힘 (dirty=false)

- [ ] **Smoke 3: 취소 confirm**
  - `수정` → 텍스트 한 자 추가 → `취소`
  - confirm 다이얼로그 노출 → 취소 → composer 유지
  - 다시 `취소` → confirm 확인 → composer 닫힘, 본문 미변경

- [ ] **Smoke 4: 답글 수정**
  - 답글 `⋯ 메뉴 → 수정` (Task 12에서 reply도 menu의 canEdit가 isOwner+visible+!isEditing+onStartEdit 모두 통과해야 함)
  - 답글 본문이 CommentReplyComposer (mode=edit)로 교체
  - 텍스트 변경 후 `저장`
  - 갱신 + `· 수정됨` 노출

- [ ] **Smoke 5: 수정 이력 모달**
  - 한 댓글을 두 번 이상 수정
  - 헤더 `· 수정됨` 클릭 → 모달 오픈
  - "수정 이력 (총 N회)" 헤더, 시간순으로 `[현재] / [수정 전] / [최초 작성]` 라벨 + 본문 렌더
  - ESC, 닫기 버튼, backdrop 클릭 모두 닫힘 동작

- [ ] **Smoke 6: 비소유자 메뉴**
  - 다른 계정으로 로그인 (또는 비로그인)
  - `⋯ 메뉴`에 `수정` 미노출. `· 수정됨` 라벨은 보이고 클릭하면 모달 정상 (history는 world-read)

- [ ] **Smoke 7: editingId vs replyingToId 상호배타**
  - root 댓글에서 `답글` 클릭 → reply composer 오픈 상태에서, 본인 댓글 `수정` 클릭
  - reply composer 닫히고 edit composer 오픈 (단일 상태)

- [ ] **Smoke 8: pinned 댓글 수정**
  - 본인 댓글 `📌 고정` → 상단 핀 섹션에 노출
  - 그 댓글 수정 (목록 본체에서) → 즉시 핀 섹션도 갱신 (body_html, edit_count)

- [ ] **Smoke 9: 5000자 초과**
  - composer에 5001자 입력 시 카운터 빨간색, `저장` disabled

- [ ] **Smoke 10: 모바일 반응 (가능 시)**
  - 브라우저 devtools 375px viewport
  - composer 인라인 교체 정상, 모달 풀폭 정상

- [ ] **Step Final: 정리 commit (있는 경우)**

수동 smoke에서 발견된 사소한 문제 수정 commit. 없으면 skip.

- [ ] **Step Final 2: spec/plan 머지 commit 묶기 확인 + push**

```bash
git log --oneline | head -20
```

main 위에 ~14개 commit이 있어야 함 (T1-T14). push할지 결정 (보통 PR 작성 단계).

---

## Self-Review Notes

- **Spec coverage**: 모든 §3~§10 항목이 task에 1:1 매핑됨 — 마이그(T1~T2), schema sync(T3), typed(T4), zod(T5), PATCH(T6), GET(T7), 메뉴(T8), Composer(T9), Modal(T10), ReplyComposer ext(T11), CommentItem(T12), List/Group propagate(T13), Thread(T14), smoke(T15).
- **Placeholder scan**: TODO/TBD 없음. 모든 step에 실제 코드 또는 명령 포함.
- **Type consistency**: `EditedCommentRow` 타입은 CommentEditComposer (T9)에서 export, CommentReplyComposer (T11)와 CommentItem (T12), CommentThread (T14) 모두 import. `EditCommentSchema` (T5)와 PATCH 핸들러 (T6) 일치. `edit_count: number` 필드명 전 task 일관.
- **Optional-vs-required 결정**: `body_text` `edit_count`는 Task 11/12에서 REQUIRED로 들어감. CommentRow 임시 fallback은 Step 2-bis로 명시.
