# Profile × Comment Inline Merge (PR-B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the profile feature into the existing comment thread and NavBar. After this PR: every comment author nickname is a clickable link to `/profile/[nickname]`, inline badges (운영자/검수자/인기 댓글) render next to the nickname, and the NavBar user pill links to the signed-in user's own profile.

**Architecture:** A single new component `CommentAuthorInline` replaces the inline `@nickname` text everywhere. `CommentThread` adds one extra Supabase query for badges (in `('operator', 'reviewer', 'popular_comment')` only) and threads an `authorBadges: Map<userId, BadgeType[]>` plus `authorNickname` consistently down to `CommentItem`. NavBar gains a tiny client hook `useMyNickname` that fetches the signed-in user's nickname once and wraps the existing pill in a `<Link>`. No migrations.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase, lucide-react, design tokens via inline styles.

**Spec:** `docs/superpowers/specs/2026-04-27-profile-badge-design.md`
**Predecessor PR:** PR-A (`/profile/[nickname]` page + edit + migration). PR-B builds on the badge meta + nickname URL conventions established there.

---

## File Structure

**Created:**
- `vet-exam-ai/components/comments/CommentAuthorInline.tsx` — nickname Link + inline badge chips
- `vet-exam-ai/lib/hooks/useMyNickname.ts` — fetch signed-in user's nickname for NavBar

**Modified:**
- `vet-exam-ai/components/comments/CommentThread.tsx` — add badges fetch + authorMap, prop drill `authorBadges`
- `vet-exam-ai/components/comments/CommentItem.tsx` — replace inline `@author` with `CommentAuthorInline`, accept `authorBadges` prop
- `vet-exam-ai/components/comments/CommentList.tsx` — forward `authorBadges` per-row
- `vet-exam-ai/components/comments/CommentReplyGroup.tsx` — forward `authorBadges` per-row
- `vet-exam-ai/components/NavBar.tsx` — wrap user pill in `<Link href={'/profile/' + myNickname}>` for signed-in branch

**Why this split:** `CommentAuthorInline` is the only new component because every nickname rendering now flows through it. CommentThread's badges fetch + `authorMap` build is added in one task to keep the data wiring atomic; consumer components are updated in subsequent tasks via prop chain.

---

## Notes for Implementer

- **App lives in `vet-exam-ai/`.** Use `cd vet-exam-ai && <cmd>` chained on a single line.
- **Type checker:** `cd vet-exam-ai && npx tsc --noEmit` (no `npm run typecheck`).
- **Embedded join trap:** badges fetch is its own query, stitched in JS. Do NOT try `comments.select('*, badges(*)')` — RLS won't bridge it.
- **Tailwind v4 utility runtime trap:** mirror existing comment components — inline style + CSS vars.
- **PR-A dependency:** `lib/profile/badgeMeta.ts` (BADGE_META, BadgeType type) is already in the repo. Re-import don't redefine.
- **Build break sequencing:** Tasks 4–7 form an intentionally sequential chain. T4 introduces a required prop on `CommentItem` that breaks `CommentList` (T5) and `CommentReplyGroup` (T6); T7 (`CommentThread`) supplies it. Run `npx tsc --noEmit` after each task — errors should narrow as the chain closes. Final pass should be 0 errors.
- **Subagent commit guard:** explicit-path `git add`, no force, no push.

---

## Task 0: Baseline Sanity Check

**Files:** None.

- [ ] **Step 1: Verify PR-A is merged**

Run: `git log --oneline main -1 && git log --oneline -- vet-exam-ai/lib/profile/badgeMeta.ts`
Expected: latest main commit is on or after PR-A merge; `badgeMeta.ts` exists in history.

- [ ] **Step 2: Confirm clean working tree**

Run: `git status`
Expected: `nothing to commit, working tree clean`

- [ ] **Step 3: Pull latest main**

Run: `git checkout main && git pull origin main`
Expected: `Already up to date.` or fast-forward to current main tip.

- [ ] **Step 4: Verify typecheck passes on main baseline**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Create branch**

Run: `git checkout -b feat/profile-comment-merge-v1`
Expected: `Switched to a new branch 'feat/profile-comment-merge-v1'`

---

## Task 1: `useMyNickname` hook

**Files:**
- Create: `vet-exam-ai/lib/hooks/useMyNickname.ts`

- [ ] **Step 1: Write hook**

Create `vet-exam-ai/lib/hooks/useMyNickname.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { createClient } from "../supabase/client";

/**
 * Fetches the signed-in user's nickname from user_profiles_public.
 * Returns null while loading or if signed out / profile missing.
 *
 * Used by NavBar to wrap the user pill in a `/profile/<nickname>` link.
 */
export function useMyNickname(): string | null {
  const [nickname, setNickname] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setNickname(null);
        return;
      }
      const { data } = await supabase
        .from("user_profiles_public")
        .select("nickname")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setNickname(data?.nickname ?? null);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return nickname;
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/hooks/useMyNickname.ts
git commit -m "navbar: add useMyNickname hook"
```

---

## Task 2: NavBar pill → profile link

**Files:**
- Modify: `vet-exam-ai/components/NavBar.tsx`

- [ ] **Step 1: Read current NavBar**

Run: `Read vet-exam-ai/components/NavBar.tsx` to confirm the user pill section (around lines 95–138 of the current file).

- [ ] **Step 2: Add hook import + nickname state**

Add at the top imports section:
```tsx
import { useMyNickname } from "../lib/hooks/useMyNickname";
```

Inside `NavBar()` body, add this after `const dueCount = useDueCountCtx();`:
```tsx
const myNickname = useMyNickname();
```

- [ ] **Step 3: Wrap the user pill in Link**

Locate the existing block:
```tsx
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
```

Replace it with:

```tsx
{myNickname ? (
  <Link
    href={`/profile/${encodeURIComponent(myNickname)}`}
    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs no-underline"
    style={{
      background: "var(--surface-raised)",
      border: "1px solid var(--border)",
      color: "var(--text-muted)",
      textDecoration: "none",
    }}
    title="내 프로필"
  >
    <User size={13} />
    <span className="truncate max-w-[120px]">{myNickname}</span>
  </Link>
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

Rationale: while nickname loads (or if profile missing for any reason), keep the email pill as fallback so the NavBar never goes blank.

- [ ] **Step 4: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add vet-exam-ai/components/NavBar.tsx
git commit -m "navbar: link user pill to /profile/<my-nickname>"
```

---

## Task 3: `CommentAuthorInline` component

**Files:**
- Create: `vet-exam-ai/components/comments/CommentAuthorInline.tsx`

- [ ] **Step 1: Write component**

Create `vet-exam-ai/components/comments/CommentAuthorInline.tsx`:

```tsx
"use client";

import Link from "next/link";
import { BADGE_META, type BadgeType } from "../../lib/profile/badgeMeta";

type Props = {
  userId: string | null;
  nickname: string;
  badges: BadgeType[];
  size?: "small" | "normal";
};

/**
 * Inline author display: nickname (linked to profile) + qualifying badges.
 * Shows only inline-eligible badges (operator/reviewer/popular_comment) per
 * BADGE_META[bt].showInline. The caller is responsible for filtering or
 * passing the full set; this component re-filters defensively.
 */
export default function CommentAuthorInline({
  userId,
  nickname,
  badges,
  size = "normal",
}: Props) {
  const inlineBadges = badges.filter((bt) => BADGE_META[bt].showInline);
  const fontSize = size === "small" ? 11 : 12;
  const iconSize = size === "small" ? 11 : 13;
  const padX = size === "small" ? 5 : 6;

  const nameNode = (
    <span style={{ color: "var(--text)", fontWeight: 600, fontSize }}>
      @{nickname}
    </span>
  );

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      {userId ? (
        <Link
          href={`/profile/${encodeURIComponent(nickname)}`}
          style={{ textDecoration: "none" }}
        >
          {nameNode}
        </Link>
      ) : (
        nameNode
      )}
      {inlineBadges.map((bt) => {
        const meta = BADGE_META[bt];
        const Icon = meta.icon;
        return (
          <span
            key={bt}
            title={meta.description}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: `1px ${padX}px`,
              borderRadius: 999,
              background: meta.background,
              color: meta.color,
              fontSize: fontSize - 1,
              fontWeight: 700,
            }}
          >
            <Icon size={iconSize} />
            {meta.label}
          </span>
        );
      })}
    </span>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/components/comments/CommentAuthorInline.tsx
git commit -m "comments: add CommentAuthorInline (linked nickname + inline badges)"
```

---

## Task 4: `CommentItem` accepts `authorBadges`, uses `CommentAuthorInline`

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentItem.tsx`

- [ ] **Step 1: Read current CommentItem**

Run: `Read vet-exam-ai/components/comments/CommentItem.tsx` to see the current author render (around lines 94–130).

- [ ] **Step 2: Add import + extend type**

Add to imports:
```tsx
import CommentAuthorInline from "./CommentAuthorInline";
import type { BadgeType } from "../../lib/profile/badgeMeta";
```

Extend `Props`:
```tsx
type Props = {
  comment: CommentItemData;
  score: number;
  myVote: VoteValue | null;
  status: "visible" | "hidden_by_votes" | "blinded_by_report";
  isOwner: boolean;
  isAuthed: boolean;
  isReported: boolean;
  canDelete: boolean;
  authorBadges: BadgeType[];   // NEW
  onDelete: (id: string) => void;
  onReport: (id: string) => void;
  onVoteChange: (commentId: string, value: VoteValue, prev: VoteValue | null) => void;
  onUnauthedAttempt?: () => void;
  onStartReply?: (id: string) => void;
  isReply?: boolean;
  isPlaceholder?: boolean;
};
```

Add `authorBadges` to the destructuring at the top of `CommentItem(...)`.

- [ ] **Step 3: Replace author display**

Locate the existing block (around line 94 / 129):

```tsx
const author =
  comment.user_id === null
    ? "탈퇴한 사용자"
    : comment.authorNickname ?? `익명-${comment.user_id.slice(-4)}`;
```

Keep this block (it computes the nickname text). Then in the JSX, find the existing inline author span:

```tsx
<span style={{ color: "var(--text)", fontWeight: 600 }}>@{author}</span>
```

Replace with:

```tsx
<CommentAuthorInline
  userId={comment.user_id}
  nickname={author}
  badges={authorBadges}
  size={isReply ? "small" : "normal"}
/>
```

- [ ] **Step 4: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: ERRORS about missing `authorBadges` in `CommentList.tsx` (passing `<CommentItem ... />`) and `CommentReplyGroup.tsx`. This is intentional — the next two tasks close the chain.

Record the exact error file paths from output to verify correct narrowing in T5/T6.

- [ ] **Step 5: Commit**

```bash
git add vet-exam-ai/components/comments/CommentItem.tsx
git commit -m "comments: CommentItem uses CommentAuthorInline (build break: callers pending)"
```

---

## Task 5: `CommentList` forwards `authorBadges`

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentList.tsx`

- [ ] **Step 1: Read current file**

Run: `Read vet-exam-ai/components/comments/CommentList.tsx`.

- [ ] **Step 2: Extend Props with `authorBadgesById`**

Add import:
```tsx
import type { BadgeType } from "../../lib/profile/badgeMeta";
```

Extend `Props`:
```tsx
type Props = {
  // ... existing fields ...
  authorBadgesById: Map<string, BadgeType[]>;   // NEW
};
```

Add `authorBadgesById` to destructuring.

- [ ] **Step 3: Forward to CommentItem**

Find every `<CommentItem ... />` invocation in this file. For each, add the prop:

```tsx
<CommentItem
  // ... existing props ...
  authorBadges={
    root.user_id ? authorBadgesById.get(root.user_id) ?? [] : []
  }
/>
```

- [ ] **Step 4: Forward to `<CommentReplyGroup>` if invoked here**

Find `<CommentReplyGroup ... />` if present in this file and add:
```tsx
authorBadgesById={authorBadgesById}
```

- [ ] **Step 5: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: errors should now be confined to `CommentReplyGroup.tsx` (uses CommentItem) and `CommentThread.tsx` (calls CommentList without `authorBadgesById`).

- [ ] **Step 6: Commit**

```bash
git add vet-exam-ai/components/comments/CommentList.tsx
git commit -m "comments: CommentList forwards authorBadgesById"
```

---

## Task 6: `CommentReplyGroup` forwards `authorBadges`

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentReplyGroup.tsx`

- [ ] **Step 1: Read current file**

Run: `Read vet-exam-ai/components/comments/CommentReplyGroup.tsx`.

- [ ] **Step 2: Extend Props**

Add import:
```tsx
import type { BadgeType } from "../../lib/profile/badgeMeta";
```

Extend `Props`:
```tsx
type Props = {
  // ... existing fields ...
  authorBadgesById: Map<string, BadgeType[]>;   // NEW
};
```

Add `authorBadgesById` to destructuring.

- [ ] **Step 3: Forward to CommentItem**

Find each `<CommentItem ... />` invocation and add:
```tsx
authorBadges={
  reply.user_id ? authorBadgesById.get(reply.user_id) ?? [] : []
}
```
(Use the actual variable name in scope — the reply row object — wherever this loop renders.)

- [ ] **Step 4: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: errors now confined to `CommentThread.tsx` (does not yet build / pass `authorBadgesById`).

- [ ] **Step 5: Commit**

```bash
git add vet-exam-ai/components/comments/CommentReplyGroup.tsx
git commit -m "comments: CommentReplyGroup forwards authorBadgesById"
```

---

## Task 7: `CommentThread` fetches badges + builds `authorBadgesById`

**Files:**
- Modify: `vet-exam-ai/components/comments/CommentThread.tsx`

This is the final task that closes the chain. Adds one extra Supabase query for badges (filtered to inline-eligible types), builds `Map<userId, BadgeType[]>`, and passes it to `<CommentList>`.

- [ ] **Step 1: Read current file**

Run: `Read vet-exam-ai/components/comments/CommentThread.tsx` paying attention to:
- Profiles fetch around lines 114–131
- `useState` block at top
- `<CommentList ... />` invocation in render

- [ ] **Step 2: Add import + state**

Add import:
```tsx
import type { BadgeType } from "../../lib/profile/badgeMeta";
```

Add new state:
```tsx
const [authorBadgesById, setAuthorBadgesById] = useState<Map<string, BadgeType[]>>(
  new Map()
);
```

- [ ] **Step 3: Fetch badges alongside profiles**

In the `useEffect` that builds `nicknameById` (around lines 117–131), after the existing `profiles` fetch, add a parallel badges fetch. Replace the existing block:

```tsx
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
```

with:

```tsx
const nicknameById = new Map<string, string>();
const badgesByUser = new Map<string, BadgeType[]>();
if (userIds.length > 0) {
  const [profilesRes, badgesRes] = await Promise.all([
    supabase
      .from("user_profiles_public")
      .select("user_id, nickname")
      .in("user_id", userIds),
    supabase
      .from("badges")
      .select("user_id, badge_type")
      .in("user_id", userIds)
      .in("badge_type", ["operator", "reviewer", "popular_comment"]),
  ]);
  if (cancelled) return;
  if (profilesRes.error) {
    console.warn("[CommentThread] profile fetch failed", profilesRes.error);
  } else {
    for (const p of profilesRes.data ?? []) {
      nicknameById.set(p.user_id, p.nickname);
    }
  }
  if (badgesRes.error) {
    console.warn("[CommentThread] badges fetch failed", badgesRes.error);
  } else {
    for (const b of badgesRes.data ?? []) {
      const arr = badgesByUser.get(b.user_id) ?? [];
      arr.push(b.badge_type as BadgeType);
      badgesByUser.set(b.user_id, arr);
    }
  }
}
```

- [ ] **Step 4: Persist badges map to state**

After the existing `setRoots(assembled)` / `setStatus("ready")`, add:
```tsx
setAuthorBadgesById(badgesByUser);
```

(Place it just before `setStatus("ready")`.)

- [ ] **Step 5: Pass to CommentList**

Find the `<CommentList ... />` invocation in render and add:
```tsx
authorBadgesById={authorBadgesById}
```

- [ ] **Step 6: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors. Build chain closed.

- [ ] **Step 7: Commit**

```bash
git add vet-exam-ai/components/comments/CommentThread.tsx
git commit -m "comments: CommentThread fetches badges + threads authorBadgesById"
```

---

## Task 8: Smoke test + push

**Files:** None.

- [ ] **Step 1: Boot dev server**

Run: `cd vet-exam-ai && npm run dev`
Wait for `Ready in ...`.

- [ ] **Step 2: Manual smoke checklist**

Open a question with existing comments (e.g., a question seeded with a Seongju comment). Verify:

- [ ] NavBar user pill text reads the nickname (not email) when signed in
- [ ] Click NavBar pill → routes to `/profile/<my-nickname>`
- [ ] Comment author `@<nickname>` is a clickable link → `/profile/<nickname>`
- [ ] If author has `operator` badge, [운영자] chip renders next to nickname (Shield icon, teal)
- [ ] If author has `reviewer` badge, [검수자] chip renders (BadgeCheck icon, amber)
- [ ] If a comment has `vote_score >= 10`, author has `popular_comment` badge → [인기 댓글] chip renders (Flame icon, wrong red)
- [ ] `newbie` and `first_contrib` badges do NOT render inline (only on profile page)
- [ ] Reply (size=small) badges look proportionally smaller
- [ ] Anonymous comment (`user_id NULL` due to author deletion) shows "탈퇴한 사용자" plain text — no link, no badges
- [ ] Sign out → comment nicknames remain links, NavBar pill replaced with 로그인 button

- [ ] **Step 3: Manual badge grant for testing (if needed)**

If no test data exists for operator badge, run via Supabase SQL Editor:
```sql
insert into public.badges (user_id, badge_type, awarded_by)
values ('<your-user-id>', 'operator', '<your-user-id>')
on conflict (user_id, badge_type) do nothing;
```

Reload comments page and verify [운영자] chip appears next to your nickname.

- [ ] **Step 4: Final typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Push branch**

Run: `git push -u origin feat/profile-comment-merge-v1`
Expected: branch published.

- [ ] **Step 6: Hand off PR creation to user**

Tell the user: "PR-B 푸시 완료. https://github.com/sngjlee/vet-exam-ai/pull/new/feat/profile-comment-merge-v1 에서 PR 생성해 주세요."

---

## Self-review checklist

- [x] Spec §7.1 (CommentAuthorInline) — Task 3
- [x] Spec §7.2 (CommentThread fetch boost) — Task 7
- [x] Spec §7.3 (NavBar pill) — Task 2
- [x] Spec §7.4 (anonymous comment) — Task 3 (no link if userId null) + Task 4 (kept author fallback)
- [x] Spec §5 inline badge filter (operator/reviewer/popular_comment) — Task 7 query + Task 3 defensive filter
- [x] Build break sequence T4 → T5 → T6 → T7 documented and intentional
- [x] All file paths absolute & exact
- [x] Type names consistent (BadgeType from same import path everywhere)
- [x] No migrations (PR-A already shipped them)
- [x] No `any` introduced
