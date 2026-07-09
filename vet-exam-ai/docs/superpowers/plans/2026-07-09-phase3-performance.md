# Phase 3 (Performance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the low-risk performance wins from the 2026-07-08 audit's Phase 3: replace the full-table category-count scan with a `GROUP BY` RPC (+ browser caching), add the one genuinely-missing FK index, and parallelize the CommentThread initial load.

**Architecture:** Three independent changes. (1) A new SECURITY INVOKER SQL RPC `questions_category_counts()` replaces the paginated full scan in `loadQuestionMeta`, with the old loop kept as a deploy-gap fallback and a `Cache-Control: private` header on the meta response. (2) A single partial index on `notifications(related_comment_id)` (the composite unique index can't serve related_comment_id-only lookups / cascade deletes). (3) Reorder `CommentThread`'s `load()` so independent Supabase calls run via `Promise.all`.

**Tech Stack:** Next.js 16 App Router (route handlers), Supabase (Postgres RPC + RLS), React 19 client component.

**Scope decisions (locked with user 2026-07-09):**
- **Item 1 (`/questions` server pagination) — DESCOPED.** Filtering is entangled across server (category/year) and client (topic/skipEasy/onlyWrong + topicOptions derivation + `allIds` nav context). True server pagination is a re-architecture with correctness risk; not worth it absent a measured bottleneck. Current sessionStorage cache stays.
- **Item 4 (next/image) — EXCLUDED.** Question images are unknown-dimension diagrams; next/image needs `fill`+aspect and adds Vercel image-optimization billing. Images already `loading="lazy"`.
- **Item 5b (`comment_reports(comment_id)` index) — DROPPED as redundant.** `comment_reports` already has `unique (comment_id, reporter_id)`, whose btree leads with `comment_id` and already serves comment_id lookups and the FK cascade delete. Adding a standalone index would only cost write throughput + storage.

**Verification note:** This repo has **no test runner** (adding one is Phase 4). So tasks verify via `typecheck` / `lint` (no NEW errors — main carries a pre-existing lint baseline) / `check:migrations`, plus a manual preview smoke. Local `next build` may fail on missing win32 native binaries (tailwind/lightningcss) — that is environment-only and not a gate; a clean `tsc` is the gate (see memory `windows_native_binary_build`).

**Deploy/runbook (from memory `audit-2026-07-08`):** Prod DB migrations are applied **manually** (NOT `supabase db push` — history is out of sync). The two new migrations here must be applied by hand to prod after merge. The RPC change ships with a runtime fallback so code can deploy before the migration without 500s.

---

### Task 1: Add `notifications(related_comment_id)` index

**Files:**
- Create: `vet-exam-ai/supabase/migrations/20260709030000_perf_notifications_related_comment_idx.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =============================================================================
-- Phase 3 (perf): index notifications.related_comment_id
-- =============================================================================
-- related_comment_id is an FK (references comments(id) on delete cascade) with
-- no dedicated index. The only index that mentions it,
-- notifications_milestone_unique (user_id, related_comment_id, payload->>'milestone'),
-- leads with user_id, so it cannot serve related_comment_id-only lookups or the
-- per-comment cascade delete (delete from notifications where related_comment_id=$1),
-- which currently seq-scans the whole table on every comment deletion.
--
-- Partial (where not null): most notifications (milestones, board events) carry a
-- NULL related_comment_id; the FK equality lookup only ever probes non-null
-- values, so excluding NULLs keeps the index small without losing coverage.
--
-- NOTE: comment_reports(comment_id) was intentionally NOT added — it is already
-- covered by the existing unique(comment_id, reporter_id) btree (comment_id leads).
create index if not exists notifications_related_comment_id_idx
  on public.notifications (related_comment_id)
  where related_comment_id is not null;
```

- [ ] **Step 2: Verify the migration guard passes**

Run: `cd vet-exam-ai && npm run check:migrations`
Expected: `migration-check: ok (N migrations; latest 20260709030000)`

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/supabase/migrations/20260709030000_perf_notifications_related_comment_idx.sql
git commit -m "perf(db): index notifications.related_comment_id for cascade/lookup"
```

- [ ] **Step 4 (deploy-time, manual): apply to prod**

Apply the `create index if not exists ...` statement to the production DB by hand (Supabase SQL Editor) as part of the merge/deploy of this phase. `if not exists` makes it idempotent. Then confirm: `select 1 from pg_indexes where indexname = 'notifications_related_comment_id_idx';` returns a row.

---

### Task 2: `questions_category_counts()` RPC + meta wiring + cache header

**Files:**
- Create: `vet-exam-ai/supabase/migrations/20260709040000_questions_category_counts_rpc.sql`
- Modify: `vet-exam-ai/app/api/questions/route.ts` (`loadQuestionMeta`, and the `metaOnly` response in `GET`)

- [ ] **Step 1: Write the RPC migration**

```sql
-- =============================================================================
-- Phase 3 (perf): questions_category_counts() RPC
-- =============================================================================
-- Replaces the client-of-DB full pagination scan in /api/questions?meta=1
-- (loadQuestionMeta looped every row selecting `category` and counted in JS).
-- A single GROUP BY does the aggregation in Postgres. SECURITY INVOKER keeps
-- questions RLS in force (questions already has an anon read policy), matching
-- the search_questions RPC pattern.
create or replace function public.questions_category_counts()
returns table (category text, count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select q.category, count(*)::bigint
  from public.questions q
  where q.is_active = true
  group by q.category;
$$;

revoke execute on function public.questions_category_counts() from public;
grant execute on function public.questions_category_counts() to anon, authenticated;
```

- [ ] **Step 2: Verify the migration guard passes**

Run: `cd vet-exam-ai && npm run check:migrations`
Expected: `migration-check: ok (N migrations; latest 20260709040000)`

- [ ] **Step 3: Rewrite `loadQuestionMeta` to call the RPC, with the paginated loop kept as fallback**

In `vet-exam-ai/app/api/questions/route.ts`, replace the body of `loadQuestionMeta` (currently the `for` loop over `PAGE_SIZE`) so it first tries the RPC and only falls back to the existing loop if the RPC errors (covers the window where code is deployed before the migration is applied). The returned shape (`{ categories, countsByCategory, total }`) is unchanged.

```typescript
  async function loadQuestionMeta(): Promise<{
    data: {
      categories: string[];
      countsByCategory: Record<string, number>;
      total: number;
    };
    error: unknown;
  }> {
    const counts = new Map<string, number>();

    const rpc = await supabase.rpc("questions_category_counts");
    if (!rpc.error && rpc.data) {
      for (const row of rpc.data as Array<{ category: string; count: number }>) {
        counts.set(row.category, Number(row.count));
      }
      return { data: buildMeta(counts), error: null };
    }

    // Fallback: RPC missing (e.g. deployed before migration applied). Fall back
    // to the paginated full scan so meta never hard-fails during a deploy gap.
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("questions")
        .select("category")
        .eq("is_active", true)
        .order("category", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return {
          data: { categories: [], countsByCategory: {}, total: 0 },
          error,
        };
      }

      const page = data ?? [];
      for (const row of page) {
        counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
      }
      if (page.length < PAGE_SIZE) break;
    }

    return { data: buildMeta(counts), error: null };
  }
```

Add this helper (module scope, next to `parseCategories` at the bottom of the file) so both paths build the identical shape:

```typescript
function buildMeta(counts: Map<string, number>): {
  categories: string[];
  countsByCategory: Record<string, number>;
  total: number;
} {
  const categories = Array.from(counts.keys()).sort((a, b) =>
    a.localeCompare(b, "ko"),
  );
  return {
    categories,
    countsByCategory: Object.fromEntries(counts),
    total: Array.from(counts.values()).reduce((sum, n) => sum + n, 0),
  };
}
```

(Delete the old inline `categories`/return block that the loop used, now that `buildMeta` owns it.)

- [ ] **Step 4: Add a browser cache header to the meta response**

In `GET`, the `metaOnly` branch currently does `return NextResponse.json(meta.data);`. Replace with a `private` browser cache (data is user-independent but we avoid CDN/shared caching because the Supabase server client may attach Set-Cookie):

```typescript
  if (metaOnly) {
    const meta = await loadQuestionMeta();
    if (meta.error) {
      return NextResponse.json(
        { error: "Failed to load question metadata" },
        { status: 500 },
      );
    }
    return NextResponse.json(meta.data, {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
      },
    });
  }
```

- [ ] **Step 5: Typecheck + lint**

Run: `cd vet-exam-ai && npm run typecheck`
Expected: exits 0 (no errors).

Run: `cd vet-exam-ai && npm run lint`
Expected: no NEW errors attributable to `route.ts` (compare against the main baseline; do not try to zero out pre-existing errors — see memory `lint_baseline_pre_existing`).

- [ ] **Step 6: Commit**

```bash
git add vet-exam-ai/supabase/migrations/20260709040000_questions_category_counts_rpc.sql vet-exam-ai/app/api/questions/route.ts
git commit -m "perf(questions): GROUP BY RPC for meta counts + browser cache header"
```

- [ ] **Step 7 (deploy-time, manual): apply RPC to prod**

Apply `20260709040000_questions_category_counts_rpc.sql` to the production DB by hand. `create or replace` + explicit grants are idempotent. Then confirm: `select count(*) from public.questions_category_counts();` returns the category count.

---

### Task 3: Parallelize CommentThread initial load

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentThread.tsx` (the `load()` function inside the first `useEffect`, ~lines 136–205)

Current sequence is fully serial: `getUser()` → (if user) profile fetch → root comments query → replies query. But the root query does not depend on the user, and the profile fetch (needs `user.id`) is independent of the replies fetch (needs `rootIds`). Reorder into two parallel batches.

- [ ] **Step 1: Replace the serial head of `load()` with a parallel `getUser` + root query**

Replace this block:

```typescript
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

      const commentSelect =
        "id, user_id, parent_id, type, body_text, body_html, image_urls, created_at, updated_at, edit_count, status, vote_score, reply_count";

      let rootQuery = supabase
        .from("comments")
        .select(commentSelect)
        .eq("question_public_id", questionId)
        .in("status", VISIBLE_STATUSES)
        .is("parent_id", null)
        .limit(ROOT_FETCH_LIMIT);
      if (sortMode === "recent") {
        rootQuery = rootQuery.order("created_at", { ascending: false });
      } else {
        rootQuery = rootQuery
          .order("vote_score", { ascending: false })
          .order("reply_count", { ascending: false })
          .order("created_at", { ascending: false });
      }

      const { data: rootCommentRows, error } = await rootQuery;

      if (cancelled) return;
```

with:

```typescript
      const commentSelect =
        "id, user_id, parent_id, type, body_text, body_html, image_urls, created_at, updated_at, edit_count, status, vote_score, reply_count";

      // The root-comment query does not depend on the authed user, so fetch the
      // user and the root comments concurrently.
      let rootQuery = supabase
        .from("comments")
        .select(commentSelect)
        .eq("question_public_id", questionId)
        .in("status", VISIBLE_STATUSES)
        .is("parent_id", null)
        .limit(ROOT_FETCH_LIMIT);
      if (sortMode === "recent") {
        rootQuery = rootQuery.order("created_at", { ascending: false });
      } else {
        rootQuery = rootQuery
          .order("vote_score", { ascending: false })
          .order("reply_count", { ascending: false })
          .order("created_at", { ascending: false });
      }

      const [userRes, rootRes] = await Promise.all([
        supabase.auth.getUser(),
        rootQuery,
      ]);
      if (cancelled) return;

      const user = userRes.data.user;
      setCurrentUserId(user?.id ?? null);

      const { data: rootCommentRows, error } = rootRes;
```

- [ ] **Step 2: Fold the profile fetch into the replies batch (both are now downstream, and mutually independent)**

Immediately after the root `error` guard, the code computes `rootIds` and fetches replies. Replace this block:

```typescript
      let rootRows = (rootCommentRows ?? []) as CommentRow[];
      const rootIds = rootRows.map((row) => row.id);
      let replyRows: CommentRow[] = [];
      if (rootIds.length > 0) {
        const repliesRes = await supabase
          .from("comments")
          .select(commentSelect)
          .eq("question_public_id", questionId)
          .in("status", VISIBLE_STATUSES)
          .in("parent_id", rootIds)
          .order("created_at", { ascending: true })
          .limit(REPLY_FETCH_LIMIT);
        if (cancelled) return;
        if (repliesRes.error) {
          console.warn("[CommentThread] replies fetch failed", repliesRes.error);
        } else {
          replyRows = (repliesRes.data ?? []) as CommentRow[];
        }
      }
```

with:

```typescript
      let rootRows = (rootCommentRows ?? []) as CommentRow[];
      const rootIds = rootRows.map((row) => row.id);
      let replyRows: CommentRow[] = [];

      // Profile (needs user.id) and replies (needs rootIds) are independent —
      // run them together.
      const [profileRes, repliesRes] = await Promise.all([
        user
          ? supabase
              .from("user_profiles_public")
              .select("nickname")
              .eq("user_id", user.id)
              .maybeSingle()
          : Promise.resolve(null),
        rootIds.length > 0
          ? supabase
              .from("comments")
              .select(commentSelect)
              .eq("question_public_id", questionId)
              .in("status", VISIBLE_STATUSES)
              .in("parent_id", rootIds)
              .order("created_at", { ascending: true })
              .limit(REPLY_FETCH_LIMIT)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;

      setCurrentUserNickname(profileRes?.data?.nickname ?? null);

      if (repliesRes) {
        if (repliesRes.error) {
          console.warn("[CommentThread] replies fetch failed", repliesRes.error);
        } else {
          replyRows = (repliesRes.data ?? []) as CommentRow[];
        }
      }
```

- [ ] **Step 3: Typecheck + lint**

Run: `cd vet-exam-ai && npm run typecheck`
Expected: exits 0. (Watch for the `Promise.resolve(null)` union widening the awaited types — `profileRes`/`repliesRes` are `... | null`, which the `?.`/`if (repliesRes)` guards already handle.)

Run: `cd vet-exam-ai && npm run lint`
Expected: no NEW errors in `CommentThread.tsx`.

- [ ] **Step 4: Commit**

```bash
git add vet-exam-ai/components/comments/CommentThread.tsx
git commit -m "perf(comments): parallelize CommentThread initial load (user+root, profile+replies)"
```

---

### Task 4: Manual smoke verification (preview)

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server and exercise the changed surfaces**

Because the migrations are applied manually to prod but the code has a fallback, the meta path works locally with or without the RPC — but to smoke the RPC itself, apply both migrations to the local/linked dev DB first (or rely on the fallback locally and validate the RPC only against prod in Step 7 of Tasks 1–2).

Verify in preview:
1. `/dashboard` and `/quiz` load (both consume `useQuestionMeta` → `?meta=1`); category counts render and match reality.
2. A question detail page with comments (`/questions/<public_id>`): the comment thread loads, roots + replies + pinned all render, sort toggle works, current-user nickname shows on own comments.
3. Network tab: `GET /api/questions?meta=1` returns `Cache-Control: private, max-age=300, stale-while-revalidate=600`; a second navigation serves it from disk cache (no new 200 within 5 min).

- [ ] **Step 2: Full CI gate**

Run: `cd vet-exam-ai && npm run check:migrations && npm run typecheck && npm run lint`
Expected: check:migrations ok; typecheck exits 0; lint shows no NEW errors. (`npm run build` optional locally — may fail on win32 native binaries, not a gate.)

---

## Self-Review

- **Spec coverage:** Audit Phase 3 bullets → (a) `/questions` server pagination = descoped by user; (b) questions caching + meta GROUP BY count RPC = Task 2; (c) CommentThread root query Promise.all = Task 3; (d) images next/image = excluded by user; (e) indexes `notifications(related_comment_id)` = Task 1, `comment_reports(comment_id)` = dropped as redundant (documented). All bullets accounted for.
- **Placeholder scan:** none — every code step has full code.
- **Type consistency:** `buildMeta` returns the exact `{ categories, countsByCategory, total }` used by both RPC and fallback paths and matches `loadQuestionMeta`'s declared return `data`. `questions_category_counts` returns `(category text, count bigint)`; the TS cast reads `{ category: string; count: number }` and wraps with `Number(row.count)` (bigint serializes to number/string over PostgREST — `Number()` normalizes both). `user`, `rootRes`, `profileRes`, `repliesRes` names are consistent across Task 3 steps.
