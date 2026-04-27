# Profile Page + Edit (PR-A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/profile/[nickname]` route with view + inline edit + 5-badge display + paginated comment list, plus 30-day nickname change rule. Backend infrastructure (DB schema + auto-grant triggers) is already live; this PR adds the UI surface.

**Architecture:** Next.js RSC for the page (5 server-side queries stitched), client controller for the inline edit toggle. Single `PATCH /api/profile` endpoint for self-update with zod validation + 30-day enforcement. World-readable `GET /api/profile/[user_id]/comments` for pagination. Privacy masking lives in app layer (`maskPrivacy` helper) since RLS allows world-read of all columns.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase (postgres + RLS), zod, Tailwind v4 + design tokens (CSS vars), lucide-react.

**Spec:** `docs/superpowers/specs/2026-04-27-profile-badge-design.md`

---

## File Structure

**Created:**
- `supabase/migrations/20260428000000_profile_nickname_changed_at.sql` — column + 2 helper functions
- `vet-exam-ai/lib/profile/maskPrivacy.ts` — visibility-based masking
- `vet-exam-ai/lib/profile/nickname.ts` — temp nickname detection + 30-day check
- `vet-exam-ai/lib/profile/schema.ts` — zod `profileUpdateSchema`
- `vet-exam-ai/lib/profile/badgeMeta.ts` — badge label/color/icon table
- `vet-exam-ai/app/api/profile/route.ts` — PATCH self-update
- `vet-exam-ai/app/api/profile/[user_id]/comments/route.ts` — paginated comments
- `vet-exam-ai/app/profile/[nickname]/page.tsx` — RSC page
- `vet-exam-ai/app/profile/[nickname]/ProfileTempNicknameBanner.tsx` — temp banner
- `vet-exam-ai/app/profile/[nickname]/ProfileBadges.tsx` — badge grid (server component)
- `vet-exam-ai/app/profile/[nickname]/ProfileCommentList.tsx` — paginated list (client)
- `vet-exam-ai/app/profile/[nickname]/ProfileEditController.tsx` — inline edit (client)

**Modified:**
- `vet-exam-ai/lib/supabase/types.ts` — add `nickname_changed_at` column + RPC return type

**Why this split:** `page.tsx` does only data fetch + composition. Each section is its own file (banner / badges / comments / edit). `ProfileEditController` is the only "use client" piece that owns form state — others are server components or thin client wrappers.

---

## Notes for Implementer

- **App lives in `vet-exam-ai/`** (Next.js root is nested in repo root). All Next.js paths in this plan are relative to repo root, e.g. `vet-exam-ai/app/...`. Run shell commands with `cd vet-exam-ai && <cmd>` chained on a single line (bash CWD lock-in).
- **Type checker:** No `npm run typecheck` script. Use `cd vet-exam-ai && npx tsc --noEmit` instead.
- **Migration application:** Memory says CLI `db push` may report "up to date" falsely. After Step 1 of Task 1, the user will apply the migration via Supabase SQL Editor manually. Do NOT attempt CLI push from the plan; produce the SQL file and stop.
- **Embedded join trap:** `comments → user_profiles_public`, `comments → badges` etc. cannot be joined inline. Always two-query stitch. (Spec §3.2.)
- **Tailwind v4 utility runtime trap:** Some utility classes are runtime-injected and may not render. Use inline style + CSS vars (`var(--teal)`, etc.) where uncertain. Mirror existing comment components.
- **Existing nickname display fallback** in CommentItem (`익명-XXXX`) is kept untouched in PR-A (PR-B replaces it via `CommentAuthorInline`).
- **Subagent commit guard:** if dispatching subagents, instruct them to use `git add <explicit-path>` (no `git add -A`), do NOT push, and run `git status` first.

---

## Task 0: Baseline Sanity Check

**Files:** None (read-only)

- [ ] **Step 1: Verify clean working tree on main**

Run: `git status`
Expected: `On branch main` + `nothing to commit, working tree clean`

- [ ] **Step 2: Verify spec is committed**

Run: `git log --oneline -5 -- docs/superpowers/specs/2026-04-27-profile-badge-design.md`
Expected: at least one commit hash referencing the spec.

- [ ] **Step 3: Verify typecheck baseline passes on main**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: exits 0 (no errors). Record any pre-existing warnings as accepted baseline.

- [ ] **Step 4: Create branch**

Run: `git checkout -b feat/profile-page-edit-v1`
Expected: `Switched to a new branch 'feat/profile-page-edit-v1'`

---

## Task 1: Migration — `nickname_changed_at` Column + RPC

**Files:**
- Create: `supabase/migrations/20260428000000_profile_nickname_changed_at.sql`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/20260428000000_profile_nickname_changed_at.sql`:

```sql
-- =============================================================================
-- Profile §16: nickname_changed_at + helpers (M3 §16 PR-A)
-- =============================================================================
-- Adds:
--   1. user_profiles_public.nickname_changed_at — for 30-day rate-limit
--   2. is_temp_nickname(text) — checks "user_<8 hex>" pattern
--   3. get_user_total_vote_score(uuid) — sum(vote_score) over visible comments
--
-- nickname_changed_at semantics:
--   NULL  = never changed (still on auto-generated temp nickname OR migrated)
--   set   = timestamp of last successful change (incl. first temp→real change)
-- 30-day check: enforced in PATCH /api/profile, NOT in DB (allows admin override).
-- =============================================================================

alter table public.user_profiles_public
  add column nickname_changed_at timestamptz;

comment on column public.user_profiles_public.nickname_changed_at is
  'NULL = 최초 임시 닉네임 상태 또는 미변경. 본 닉네임 첫 설정 시 set, 이후 매 변경마다 갱신. 30일 1회 제한 enforce용 (앱 계층).';

create or replace function public.is_temp_nickname(n text)
returns boolean
language sql
immutable
as $$
  select n ~ '^user_[0-9a-f]{8}$';
$$;

comment on function public.is_temp_nickname(text) is
  'True if nickname matches the auto-generated temp pattern from handle_new_user().';

create or replace function public.get_user_total_vote_score(uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(vote_score), 0)::integer
    from public.comments
   where user_id = uid and status = 'visible';
$$;

comment on function public.get_user_total_vote_score(uuid) is
  'Sum of vote_score over visible comments authored by uid. Used by /profile/[nickname].';
```

- [ ] **Step 2: Apply migration via Supabase SQL Editor**

Hand the SQL above to the user — they paste into Supabase Dashboard → SQL Editor → Run. After the user confirms success, proceed.

Verification queries the user runs:
```sql
-- column exists
select column_name, data_type from information_schema.columns
 where table_schema='public' and table_name='user_profiles_public'
   and column_name='nickname_changed_at';

-- helper functions exist
select proname from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('is_temp_nickname', 'get_user_total_vote_score');

-- temp nickname detector works
select public.is_temp_nickname('user_a3f9c2b1') as ok_true,
       public.is_temp_nickname('songju') as ok_false;
```

Expected: `nickname_changed_at | timestamp with time zone`, both function names returned, `ok_true=t / ok_false=f`.

- [ ] **Step 3: Commit migration**

Run:
```bash
git add supabase/migrations/20260428000000_profile_nickname_changed_at.sql
git commit -m "profile: add nickname_changed_at column + helper RPCs (M3 §16)"
```

---

## Task 2: Typed Schema Update

**Files:**
- Modify: `vet-exam-ai/lib/supabase/types.ts:175-208` (user_profiles_public block) + Functions block

- [ ] **Step 1: Read existing types file at the relevant region**

Run: `Read vet-exam-ai/lib/supabase/types.ts:175-208` then read whichever line range contains `Functions:` (search for `Functions: `).

- [ ] **Step 2: Add `nickname_changed_at` to Row, Insert, Update**

In the `user_profiles_public` block, add the field in all three sub-blocks:

```ts
user_profiles_public: {
  Row: {
    user_id: string;
    nickname: string;
    bio: string | null;
    target_round: number | null;
    university: string | null;
    target_round_visible: boolean;
    university_visible: boolean;
    nickname_changed_at: string | null;   // NEW
    created_at: string;
    updated_at: string;
  };
  Insert: {
    user_id: string;
    nickname: string;
    bio?: string | null;
    target_round?: number | null;
    university?: string | null;
    target_round_visible?: boolean;
    university_visible?: boolean;
    nickname_changed_at?: string | null;  // NEW
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    nickname?: string;
    bio?: string | null;
    target_round?: number | null;
    university?: string | null;
    target_round_visible?: boolean;
    university_visible?: boolean;
    nickname_changed_at?: string | null;  // NEW
    updated_at?: string;
  };
  Relationships: [];
};
```

- [ ] **Step 3: Add RPC entries to Functions block**

Locate the `Functions:` block (likely near end of `Database` type). Add:

```ts
is_temp_nickname: {
  Args: { n: string };
  Returns: boolean;
};
get_user_total_vote_score: {
  Args: { uid: string };
  Returns: number;
};
```

If `Functions` is empty (`{}`), replace with the object containing both entries. Otherwise append.

- [ ] **Step 4: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors (no consumer references these types yet).

- [ ] **Step 5: Commit**

```bash
git add vet-exam-ai/lib/supabase/types.ts
git commit -m "profile: typed schema for nickname_changed_at + RPCs"
```

---

## Task 3: `maskPrivacy` helper

**Files:**
- Create: `vet-exam-ai/lib/profile/maskPrivacy.ts`

- [ ] **Step 1: Write helper**

Create `vet-exam-ai/lib/profile/maskPrivacy.ts`:

```ts
import type { Database } from "../supabase/types";

export type UserProfilePublicRow =
  Database["public"]["Tables"]["user_profiles_public"]["Row"];

/**
 * Apply visibility toggles. Returns a copy with sensitive fields nulled out
 * for non-owner viewers. RLS allows world-read of all columns, so masking is
 * the app's responsibility.
 */
export function maskProfile(
  profile: UserProfilePublicRow,
  isOwner: boolean,
): UserProfilePublicRow {
  if (isOwner) return profile;
  return {
    ...profile,
    target_round: profile.target_round_visible ? profile.target_round : null,
    university: profile.university_visible ? profile.university : null,
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/profile/maskPrivacy.ts
git commit -m "profile: add maskPrivacy helper (visibility-based masking)"
```

---

## Task 4: Nickname helper (`isTempNickname`, `canChangeNickname`)

**Files:**
- Create: `vet-exam-ai/lib/profile/nickname.ts`

- [ ] **Step 1: Write helper**

Create `vet-exam-ai/lib/profile/nickname.ts`:

```ts
const TEMP_NICKNAME_RE = /^user_[0-9a-f]{8}$/;
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export function isTempNickname(nickname: string): boolean {
  return TEMP_NICKNAME_RE.test(nickname);
}

export type NicknameChangePolicy =
  | { canChange: true; reason: "temp" | "never_changed" | "cooldown_passed" }
  | { canChange: false; nextChangeAt: Date };

/**
 * Decide whether `currentNickname` may be changed now, based on
 * `nickname_changed_at` (NULL means never changed since signup).
 *
 * Rule: free change while still on temp nickname OR never changed.
 * Otherwise enforce 30-day cooldown.
 */
export function canChangeNickname(
  currentNickname: string,
  nicknameChangedAt: string | null,
  now: Date = new Date(),
): NicknameChangePolicy {
  if (isTempNickname(currentNickname)) {
    return { canChange: true, reason: "temp" };
  }
  if (nicknameChangedAt === null) {
    return { canChange: true, reason: "never_changed" };
  }
  const lastChange = new Date(nicknameChangedAt).getTime();
  const elapsed = now.getTime() - lastChange;
  if (elapsed >= COOLDOWN_MS) {
    return { canChange: true, reason: "cooldown_passed" };
  }
  return {
    canChange: false,
    nextChangeAt: new Date(lastChange + COOLDOWN_MS),
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/profile/nickname.ts
git commit -m "profile: add nickname helpers (temp + 30-day cooldown)"
```

---

## Task 5: Zod schema

**Files:**
- Create: `vet-exam-ai/lib/profile/schema.ts`

- [ ] **Step 1: Write schema**

Create `vet-exam-ai/lib/profile/schema.ts`:

```ts
import { z } from "zod";

const nicknameRe = /^[가-힣a-zA-Z0-9_]+$/;

export const profileUpdateSchema = z.object({
  nickname: z
    .string()
    .min(2, { message: "닉네임은 2자 이상이어야 합니다" })
    .max(16, { message: "닉네임은 16자 이하여야 합니다" })
    .regex(nicknameRe, { message: "한글, 영문, 숫자, 밑줄(_)만 사용 가능합니다" })
    .optional(),
  bio: z.string().max(500).nullable().optional(),
  target_round: z
    .number()
    .int()
    .min(1)
    .max(200)
    .nullable()
    .optional(),
  university: z.string().max(50).nullable().optional(),
  target_round_visible: z.boolean().optional(),
  university_visible: z.boolean().optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
```

- [ ] **Step 2: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/profile/schema.ts
git commit -m "profile: add zod profileUpdateSchema"
```

---

## Task 6: PATCH /api/profile

**Files:**
- Create: `vet-exam-ai/app/api/profile/route.ts`

- [ ] **Step 1: Write endpoint**

Create `vet-exam-ai/app/api/profile/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { profileUpdateSchema } from "../../../lib/profile/schema";
import { canChangeNickname } from "../../../lib/profile/nickname";
import { maskProfile } from "../../../lib/profile/maskPrivacy";

export async function PATCH(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = profileUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const update = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Fetch current row to evaluate nickname change rule.
  const { data: current, error: selectErr } = await supabase
    .from("user_profiles_public")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectErr) {
    return NextResponse.json({ error: selectErr.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Build the update payload.
  const dbUpdate: Record<string, unknown> = {};
  if (update.bio !== undefined) dbUpdate.bio = update.bio;
  if (update.target_round !== undefined) dbUpdate.target_round = update.target_round;
  if (update.university !== undefined) dbUpdate.university = update.university;
  if (update.target_round_visible !== undefined)
    dbUpdate.target_round_visible = update.target_round_visible;
  if (update.university_visible !== undefined)
    dbUpdate.university_visible = update.university_visible;

  if (update.nickname !== undefined && update.nickname !== current.nickname) {
    const policy = canChangeNickname(current.nickname, current.nickname_changed_at);
    if (!policy.canChange) {
      return NextResponse.json(
        {
          error: "nickname_change_too_soon",
          next_change_available_at: policy.nextChangeAt.toISOString(),
        },
        { status: 400 },
      );
    }
    dbUpdate.nickname = update.nickname;
    dbUpdate.nickname_changed_at = new Date().toISOString();
  }

  if (Object.keys(dbUpdate).length === 0) {
    // Nothing to change; return current masked.
    return NextResponse.json(maskProfile(current, true));
  }

  const { data: updated, error: updateErr } = await supabase
    .from("user_profiles_public")
    .update(dbUpdate)
    .eq("user_id", user.id)
    .select()
    .single();

  if (updateErr) {
    // PostgREST error code "23505" = unique violation
    if ((updateErr as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "nickname_taken" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json(maskProfile(updated, true));
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/api/profile/route.ts
git commit -m "profile: add PATCH /api/profile (zod + 30-day rule + 23505 catch)"
```

---

## Task 7: GET /api/profile/[user_id]/comments

**Files:**
- Create: `vet-exam-ai/app/api/profile/[user_id]/comments/route.ts`

- [ ] **Step 1: Write endpoint**

Create `vet-exam-ai/app/api/profile/[user_id]/comments/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

const PAGE_SIZE = 20;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ user_id: string }> },
) {
  const { user_id } = await params;
  const url = new URL(req.url);
  const offsetRaw = url.searchParams.get("offset");
  const offset = Math.max(0, parseInt(offsetRaw ?? "0", 10) || 0);

  const supabase = await createClient();

  // Peek 1 extra row to determine has_more.
  const { data: comments, error: cErr } = await supabase
    .from("comments")
    .select("id, question_id, body_text, vote_score, type, created_at")
    .eq("user_id", user_id)
    .eq("status", "visible")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE);

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const rows = comments ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  // Stitch question stems (two-query pattern; embedded join unsupported).
  const questionIds = Array.from(new Set(page.map((c) => c.question_id)));
  const stemById = new Map<string, string>();
  if (questionIds.length > 0) {
    const { data: qs, error: qErr } = await supabase
      .from("questions")
      .select("id, stem")
      .in("id", questionIds);
    if (qErr) {
      return NextResponse.json({ error: qErr.message }, { status: 500 });
    }
    for (const q of qs ?? []) {
      stemById.set(q.id, q.stem);
    }
  }

  const result = page.map((c) => ({
    id: c.id,
    question_id: c.question_id,
    question_stem_preview: (stemById.get(c.question_id) ?? "").slice(0, 80),
    body_text_preview: c.body_text.slice(0, 120),
    vote_score: c.vote_score,
    type: c.type,
    created_at: c.created_at,
  }));

  return NextResponse.json({ comments: result, has_more: hasMore });
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/api/profile/[user_id]/comments/route.ts
git commit -m "profile: add GET /api/profile/[user_id]/comments (paginated)"
```

---

## Task 8: Badge metadata

**Files:**
- Create: `vet-exam-ai/lib/profile/badgeMeta.ts`

- [ ] **Step 1: Write meta table**

Create `vet-exam-ai/lib/profile/badgeMeta.ts`:

```ts
import { Shield, BadgeCheck, Flame, Sparkles, Award } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Database } from "../supabase/types";

export type BadgeType = Database["public"]["Enums"]["badge_type"];

export type BadgeMeta = {
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;          // CSS var or hex
  background: string;     // CSS var or hex
  showInline: boolean;    // PR-B: only operator/reviewer/popular_comment
  manualGrant: boolean;   // operator/reviewer — hidden when not held
};

export const BADGE_META: Record<BadgeType, BadgeMeta> = {
  operator: {
    label: "운영자",
    description: "수의미래연구소 운영진",
    icon: Shield,
    color: "var(--teal)",
    background: "var(--teal-dim)",
    showInline: true,
    manualGrant: true,
  },
  reviewer: {
    label: "검수자",
    description: "공식 콘텐츠 검수자",
    icon: BadgeCheck,
    color: "var(--amber)",
    background: "var(--amber-dim)",
    showInline: true,
    manualGrant: true,
  },
  newbie: {
    label: "새내기",
    description: "가입 시 자동 부여",
    icon: Sparkles,
    color: "var(--text-muted)",
    background: "var(--surface-raised)",
    showInline: false,
    manualGrant: false,
  },
  first_contrib: {
    label: "첫 기여",
    description: "첫 댓글 작성 시 자동 부여",
    icon: Award,
    color: "var(--teal)",
    background: "var(--teal-dim)",
    showInline: false,
    manualGrant: false,
  },
  popular_comment: {
    label: "인기 댓글",
    description: "단일 댓글 추천 10회 이상",
    icon: Flame,
    color: "var(--wrong)",
    background: "var(--wrong-dim)",
    showInline: true,
    manualGrant: false,
  },
};

export const BADGE_DISPLAY_ORDER: BadgeType[] = [
  "operator",
  "reviewer",
  "popular_comment",
  "first_contrib",
  "newbie",
];
```

- [ ] **Step 2: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/profile/badgeMeta.ts
git commit -m "profile: add badge meta table (5 types + display order)"
```

---

## Task 9: ProfileBadges component

**Files:**
- Create: `vet-exam-ai/app/profile/[nickname]/ProfileBadges.tsx`

- [ ] **Step 1: Write component**

Create `vet-exam-ai/app/profile/[nickname]/ProfileBadges.tsx`:

```tsx
import { BADGE_META, BADGE_DISPLAY_ORDER, type BadgeType } from "../../../lib/profile/badgeMeta";

type Props = {
  ownedBadges: BadgeType[];
};

export default function ProfileBadges({ ownedBadges }: Props) {
  const owned = new Set(ownedBadges);

  // Visible chips: held badges first (in display order), then non-held auto-grant
  // badges as gray outline. Manual-grant badges hidden when not held.
  const chips = BADGE_DISPLAY_ORDER.filter((bt) => {
    if (owned.has(bt)) return true;
    return !BADGE_META[bt].manualGrant;
  });

  return (
    <section>
      <h2
        className="mb-4 font-bold"
        style={{ fontFamily: "var(--font-serif)", color: "var(--text)", fontSize: 22 }}
      >
        뱃지
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {chips.map((bt) => {
          const meta = BADGE_META[bt];
          const has = owned.has(bt);
          const Icon = meta.icon;
          return (
            <div
              key={bt}
              title={meta.description}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                background: has ? meta.background : "transparent",
                color: has ? meta.color : "var(--text-faint)",
                border: has ? "none" : "1px dashed var(--border)",
              }}
            >
              <Icon size={14} />
              {meta.label}
              {!has && <span style={{ fontSize: 11, opacity: 0.7 }}>미획득</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/profile/[nickname]/ProfileBadges.tsx
git commit -m "profile: add ProfileBadges (held + non-held auto chips)"
```

---

## Task 10: ProfileTempNicknameBanner

**Files:**
- Create: `vet-exam-ai/app/profile/[nickname]/ProfileTempNicknameBanner.tsx`

- [ ] **Step 1: Write component**

Create `vet-exam-ai/app/profile/[nickname]/ProfileTempNicknameBanner.tsx`:

```tsx
"use client";

import { Pencil } from "lucide-react";

type Props = {
  onStartEdit: () => void;
};

export default function ProfileTempNicknameBanner({ onStartEdit }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        padding: "12px 16px",
        marginBottom: 20,
        borderRadius: 10,
        background: "var(--amber-dim)",
        border: "1px solid var(--amber)",
        color: "var(--text)",
        fontSize: 14,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <strong style={{ color: "var(--amber)" }}>닉네임을 설정해 주세요</strong>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
          임시 닉네임으로 작성한 댓글에는{" "}
          <code style={{ fontFamily: "var(--font-mono, monospace)" }}>user_xxxxxxxx</code>로
          표시됩니다.
        </span>
      </div>
      <button
        type="button"
        onClick={onStartEdit}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          background: "var(--amber)",
          color: "#080D1A",
          border: "none",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <Pencil size={14} />
        편집
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/profile/[nickname]/ProfileTempNicknameBanner.tsx
git commit -m "profile: add ProfileTempNicknameBanner"
```

---

## Task 11: ProfileCommentList (client paginated)

**Files:**
- Create: `vet-exam-ai/app/profile/[nickname]/ProfileCommentList.tsx`

- [ ] **Step 1: Write component**

Create `vet-exam-ai/app/profile/[nickname]/ProfileCommentList.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import type { Database } from "../../../lib/supabase/types";

type CommentType = Database["public"]["Enums"]["comment_type"];

type CommentRow = {
  id: string;
  question_id: string;
  question_stem_preview: string;
  body_text_preview: string;
  vote_score: number;
  type: CommentType;
  created_at: string;
};

type Props = {
  userId: string;
  initialComments: CommentRow[];
  initialHasMore: boolean;
};

const TYPE_LABEL: Record<CommentType, string> = {
  memorization: "💡 암기법",
  correction: "⚠ 정정",
  explanation: "📘 추가설명",
  question: "❓ 질문",
  discussion: "💬 토론",
};

export default function ProfileCommentList({
  userId,
  initialComments,
  initialHasMore,
}: Props) {
  const [comments, setComments] = useState<CommentRow[]>(initialComments);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      const offset = comments.length;
      const res = await fetch(
        `/api/profile/${encodeURIComponent(userId)}/comments?offset=${offset}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { comments: CommentRow[]; has_more: boolean };
      setComments((prev) => [...prev, ...data.comments]);
      setHasMore(data.has_more);
    } catch (e) {
      setError("댓글을 불러오지 못했습니다.");
      console.error("[ProfileCommentList]", e);
    } finally {
      setLoading(false);
    }
  }

  if (comments.length === 0) {
    return (
      <section>
        <h2
          className="mb-4 font-bold"
          style={{ fontFamily: "var(--font-serif)", color: "var(--text)", fontSize: 22 }}
        >
          작성한 댓글
        </h2>
        <div
          style={{
            padding: "20px 16px",
            textAlign: "center",
            color: "var(--text-faint)",
            fontSize: 13,
            border: "1px dashed var(--border)",
            borderRadius: 10,
          }}
        >
          아직 작성한 댓글이 없습니다.
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2
        className="mb-4 font-bold"
        style={{ fontFamily: "var(--font-serif)", color: "var(--text)", fontSize: 22 }}
      >
        작성한 댓글
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {comments.map((c) => (
          <Link
            key={c.id}
            href={`/questions/${c.question_id}#comment-${c.id}`}
            style={{
              display: "block",
              padding: "12px 14px",
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--surface)",
              textDecoration: "none",
              color: "var(--text)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              <span>{TYPE_LABEL[c.type]}</span>
              <span>·</span>
              <span>추천 {c.vote_score}</span>
              <span>·</span>
              <span>{new Date(c.created_at).toLocaleDateString("ko-KR")}</span>
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: 4,
              }}
            >
              {c.question_stem_preview}
              {c.question_stem_preview.length === 80 ? "…" : ""}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {c.body_text_preview}
              {c.body_text_preview.length === 120 ? "…" : ""}
            </div>
          </Link>
        ))}
      </div>
      {error && (
        <div style={{ color: "var(--wrong)", fontSize: 12, marginTop: 8 }}>{error}</div>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          style={{
            marginTop: 14,
            width: "100%",
            padding: "10px",
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            color: "var(--text-muted)",
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "불러오는 중…" : "더 보기 ▾"}
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/profile/[nickname]/ProfileCommentList.tsx
git commit -m "profile: add ProfileCommentList (client paginated)"
```

---

## Task 12: ProfileEditController (inline edit)

**Files:**
- Create: `vet-exam-ai/app/profile/[nickname]/ProfileEditController.tsx`

- [ ] **Step 1: Write component**

Create `vet-exam-ai/app/profile/[nickname]/ProfileEditController.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { canChangeNickname } from "../../../lib/profile/nickname";
import ProfileTempNicknameBanner from "./ProfileTempNicknameBanner";
import type { UserProfilePublicRow } from "../../../lib/profile/maskPrivacy";

type Props = {
  profile: UserProfilePublicRow;
  joinedLabel: string;       // "가입 N개월차" or absolute date
};

type FormState = {
  nickname: string;
  bio: string;
  target_round: string;       // input value (string for empty)
  university: string;
  target_round_visible: boolean;
  university_visible: boolean;
};

function toForm(p: UserProfilePublicRow): FormState {
  return {
    nickname: p.nickname,
    bio: p.bio ?? "",
    target_round: p.target_round?.toString() ?? "",
    university: p.university ?? "",
    target_round_visible: p.target_round_visible,
    university_visible: p.university_visible,
  };
}

export default function ProfileEditController({ profile, joinedLabel }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => toForm(profile));
  const [nicknameUnlocked, setNicknameUnlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nicknameRef = useRef<HTMLInputElement>(null);

  const policy = canChangeNickname(profile.nickname, profile.nickname_changed_at);

  useEffect(() => {
    if (editing && nicknameUnlocked) nicknameRef.current?.focus();
  }, [editing, nicknameUnlocked]);

  function startEdit() {
    setForm(toForm(profile));
    setError(null);
    setNicknameUnlocked(false);
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
    setError(null);
    setNicknameUnlocked(false);
  }

  async function save() {
    setSubmitting(true);
    setError(null);
    const update: Record<string, unknown> = {
      bio: form.bio || null,
      target_round: form.target_round ? Number(form.target_round) : null,
      university: form.university || null,
      target_round_visible: form.target_round_visible,
      university_visible: form.university_visible,
    };
    if (nicknameUnlocked && form.nickname !== profile.nickname) {
      update.nickname = form.nickname;
    }

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          next_change_available_at?: string;
        };
        if (data.error === "nickname_taken") {
          setError("이미 사용 중인 닉네임입니다.");
        } else if (data.error === "nickname_change_too_soon") {
          const next = data.next_change_available_at
            ? new Date(data.next_change_available_at).toLocaleDateString("ko-KR")
            : "";
          setError(`닉네임은 30일에 한 번만 변경할 수 있습니다. (다음 변경 가능: ${next})`);
        } else {
          setError("저장에 실패했습니다.");
        }
        return;
      }
      const updated = (await res.json()) as UserProfilePublicRow;
      // If nickname changed, navigate to new URL; else refresh in place.
      if (updated.nickname !== profile.nickname) {
        router.push(`/profile/${encodeURIComponent(updated.nickname)}`);
      } else {
        router.refresh();
        setEditing(false);
        setNicknameUnlocked(false);
      }
    } catch (e) {
      console.error("[ProfileEditController] save failed", e);
      setError("저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  // Banner shown above the editable card when on temp nickname.
  // Banner click → enters edit mode and unlocks nickname automatically.
  function startEditFromBanner() {
    startEdit();
    setNicknameUnlocked(true);
  }

  return (
    <div>
      {policy.canChange && policy.reason === "temp" && !editing && (
        <ProfileTempNicknameBanner onStartEdit={startEditFromBanner} />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <FieldGroup
              form={form}
              setForm={setForm}
              policy={policy}
              nicknameUnlocked={nicknameUnlocked}
              setNicknameUnlocked={setNicknameUnlocked}
              currentNickname={profile.nickname}
              nicknameRef={nicknameRef}
            />
          ) : (
            <ReadOnly profile={profile} joinedLabel={joinedLabel} />
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {editing ? (
            <>
              <button type="button" onClick={cancelEdit} disabled={submitting} style={btnSecondary}>
                취소
              </button>
              <button type="button" onClick={save} disabled={submitting} style={btnPrimary}>
                {submitting ? "저장 중…" : "저장"}
              </button>
            </>
          ) : (
            <button type="button" onClick={startEdit} style={btnGhost}>
              <Pencil size={14} /> 편집
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "var(--wrong-dim)",
            color: "var(--wrong)",
            border: "1px solid var(--wrong)",
            borderRadius: 8,
            fontSize: 13,
          }}
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: "8px 16px",
  background: "var(--teal)",
  color: "#080D1A",
  border: "none",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 16px",
  background: "var(--surface-raised)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  background: "transparent",
  color: "var(--text-muted)",
  border: "1px solid var(--border)",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

function ReadOnly({
  profile,
  joinedLabel,
}: {
  profile: UserProfilePublicRow;
  joinedLabel: string;
}) {
  const meta = [
    profile.target_round ? `${profile.target_round}회 준비` : null,
    profile.university,
    joinedLabel,
  ].filter(Boolean);
  return (
    <>
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          color: "var(--text)",
          fontSize: 34,
          lineHeight: 1.15,
          fontWeight: 800,
          margin: 0,
        }}
      >
        {profile.nickname}
      </h1>
      {profile.bio && (
        <p
          style={{
            color: "var(--text)",
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          {profile.bio}
        </p>
      )}
      {meta.length > 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8, marginBottom: 0 }}>
          {meta.join(" · ")}
        </p>
      )}
    </>
  );
}

function FieldGroup({
  form,
  setForm,
  policy,
  nicknameUnlocked,
  setNicknameUnlocked,
  currentNickname,
  nicknameRef,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  policy: ReturnType<typeof canChangeNickname>;
  nicknameUnlocked: boolean;
  setNicknameUnlocked: (v: boolean) => void;
  currentNickname: string;
  nicknameRef: React.RefObject<HTMLInputElement | null>;
}) {
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
    marginBottom: 4,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg)",
    color: "var(--text)",
    fontSize: 14,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Nickname */}
      <div>
        <label htmlFor="nickname" style={labelStyle}>닉네임</label>
        {policy.canChange ? (
          <>
            {nicknameUnlocked ? (
              <input
                id="nickname"
                ref={nicknameRef}
                type="text"
                value={form.nickname}
                onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                maxLength={16}
                style={inputStyle}
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input value={currentNickname} disabled style={{ ...inputStyle, opacity: 0.7 }} />
                <button
                  type="button"
                  onClick={() => setNicknameUnlocked(true)}
                  style={btnGhost}
                >
                  변경
                </button>
              </div>
            )}
            <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
              변경 후 30일 동안 다시 바꿀 수 없습니다. 한글/영문/숫자/밑줄 2~16자.
            </p>
          </>
        ) : (
          <>
            <input value={currentNickname} disabled style={{ ...inputStyle, opacity: 0.7 }} />
            <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
              다음 변경 가능: {policy.nextChangeAt.toLocaleDateString("ko-KR")}
            </p>
          </>
        )}
      </div>

      {/* Bio */}
      <div>
        <label htmlFor="bio" style={labelStyle}>자기소개</label>
        <textarea
          id="bio"
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          maxLength={500}
          rows={3}
          style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
        />
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
          {form.bio.length}/500
        </p>
      </div>

      {/* Target round */}
      <div>
        <label htmlFor="round" style={labelStyle}>준비 회차</label>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            id="round"
            type="number"
            min={1}
            max={200}
            value={form.target_round}
            onChange={(e) => setForm({ ...form, target_round: e.target.value })}
            style={{ ...inputStyle, width: 120 }}
          />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
            <input
              type="checkbox"
              checked={form.target_round_visible}
              onChange={(e) => setForm({ ...form, target_round_visible: e.target.checked })}
            />
            공개
          </label>
        </div>
      </div>

      {/* University */}
      <div>
        <label htmlFor="uni" style={labelStyle}>대학</label>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            id="uni"
            type="text"
            value={form.university}
            onChange={(e) => setForm({ ...form, university: e.target.value })}
            maxLength={50}
            style={{ ...inputStyle, flex: 1 }}
          />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
            <input
              type="checkbox"
              checked={form.university_visible}
              onChange={(e) => setForm({ ...form, university_visible: e.target.checked })}
            />
            공개
          </label>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/profile/[nickname]/ProfileEditController.tsx
git commit -m "profile: add ProfileEditController (inline edit + nickname lock)"
```

---

## Task 13: Profile page (RSC)

**Files:**
- Create: `vet-exam-ai/app/profile/[nickname]/page.tsx`

- [ ] **Step 1: Write page**

Create `vet-exam-ai/app/profile/[nickname]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { maskProfile } from "../../../lib/profile/maskPrivacy";
import type { BadgeType } from "../../../lib/profile/badgeMeta";
import ProfileBadges from "./ProfileBadges";
import ProfileCommentList from "./ProfileCommentList";
import ProfileEditController from "./ProfileEditController";

const PAGE_SIZE = 20;

function joinedLabel(createdAt: string): string {
  const created = new Date(createdAt);
  const now = new Date();
  const months =
    (now.getFullYear() - created.getFullYear()) * 12 +
    (now.getMonth() - created.getMonth());
  if (months < 1) return "이번 달 가입";
  if (months < 12) return `가입 ${months}개월차`;
  const years = Math.floor(months / 12);
  return `가입 ${years}년차`;
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname: rawNickname } = await params;
  const nickname = decodeURIComponent(rawNickname);
  const supabase = await createClient();

  // 1. Profile by nickname
  const { data: profile, error: pErr } = await supabase
    .from("user_profiles_public")
    .select("*")
    .eq("nickname", nickname)
    .maybeSingle();

  if (pErr) {
    throw new Error(`Profile fetch failed: ${pErr.message}`);
  }
  if (!profile) {
    notFound();
  }

  // 2. Owner check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = !!user && user.id === profile.user_id;

  // 3. Badges
  const { data: badgeRows } = await supabase
    .from("badges")
    .select("badge_type")
    .eq("user_id", profile.user_id);
  const ownedBadges: BadgeType[] = (badgeRows ?? []).map((b) => b.badge_type);

  // 4. Comments page 1 (peek-21)
  const { data: commentsRaw } = await supabase
    .from("comments")
    .select("id, question_id, body_text, vote_score, type, created_at")
    .eq("user_id", profile.user_id)
    .eq("status", "visible")
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE);

  const allComments = commentsRaw ?? [];
  const hasMore = allComments.length > PAGE_SIZE;
  const pageComments = hasMore ? allComments.slice(0, PAGE_SIZE) : allComments;

  // 5. Question stems
  const questionIds = Array.from(new Set(pageComments.map((c) => c.question_id)));
  const stemById = new Map<string, string>();
  if (questionIds.length > 0) {
    const { data: qs } = await supabase
      .from("questions")
      .select("id, stem")
      .in("id", questionIds);
    for (const q of qs ?? []) stemById.set(q.id, q.stem);
  }

  const initialComments = pageComments.map((c) => ({
    id: c.id,
    question_id: c.question_id,
    question_stem_preview: (stemById.get(c.question_id) ?? "").slice(0, 80),
    body_text_preview: c.body_text.slice(0, 120),
    vote_score: c.vote_score,
    type: c.type,
    created_at: c.created_at,
  }));

  // 6. Total vote score (RPC)
  const { data: totalScoreRaw } = await supabase.rpc(
    "get_user_total_vote_score",
    { uid: profile.user_id },
  );
  const totalVoteScore = typeof totalScoreRaw === "number" ? totalScoreRaw : 0;

  // 7. Comment count (head, count exact)
  const { count: commentCount } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.user_id)
    .eq("status", "visible");

  const masked = maskProfile(profile, isOwner);
  const joined = joinedLabel(profile.created_at);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      {/* Header — owner sees edit controller, others see read-only */}
      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 22,
        }}
      >
        {isOwner ? (
          <ProfileEditController profile={masked} joinedLabel={joined} />
        ) : (
          <ReadOnlyHeader profile={masked} joinedLabel={joined} />
        )}
      </section>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-4">
        <StatCard label="작성 댓글" value={commentCount ?? 0} />
        <StatCard label="받은 추천" value={totalVoteScore} />
        <StatCard
          label="가입일"
          value={new Date(profile.created_at).toLocaleDateString("ko-KR")}
        />
      </section>

      {/* Badges */}
      <ProfileBadges ownedBadges={ownedBadges} />

      {/* Comments */}
      <ProfileCommentList
        userId={profile.user_id}
        initialComments={initialComments}
        initialHasMore={hasMore}
      />
    </main>
  );
}

function ReadOnlyHeader({
  profile,
  joinedLabel,
}: {
  profile: ReturnType<typeof maskProfile>;
  joinedLabel: string;
}) {
  const meta = [
    profile.target_round ? `${profile.target_round}회 준비` : null,
    profile.university,
    joinedLabel,
  ].filter(Boolean);
  return (
    <div>
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          color: "var(--text)",
          fontSize: 34,
          lineHeight: 1.15,
          fontWeight: 800,
          margin: 0,
        }}
      >
        {profile.nickname}
      </h1>
      {profile.bio && (
        <p
          style={{
            color: "var(--text)",
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          {profile.bio}
        </p>
      )}
      {meta.length > 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>
          {meta.join(" · ")}
        </p>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderTop: "3px solid var(--teal)",
        borderRadius: 12,
        padding: "1.35rem",
      }}
    >
      <span
        className="kvle-label"
        style={{ color: "var(--teal)", fontSize: 12 }}
      >
        {label}
      </span>
      <p
        className="mt-2 font-bold kvle-mono"
        style={{ color: "var(--teal)", fontSize: 28, lineHeight: 1 }}
      >
        {value}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/profile/[nickname]/page.tsx
git commit -m "profile: add /profile/[nickname] RSC page (5 queries stitched)"
```

---

## Task 14: Smoke test + push

**Files:** None (manual / shell only)

- [ ] **Step 1: Boot the dev server**

Run: `cd vet-exam-ai && npm run dev`
Wait for `Ready in ...`.

- [ ] **Step 2: Manual smoke checklist**

Open `http://localhost:3000/profile/<my-nickname>` in browser. Verify:

- [ ] Page loads (no 404)
- [ ] Nickname shown at top
- [ ] If on temp nickname (`user_xxxxxxxx`), banner is visible
- [ ] Stats grid: 작성 댓글 / 받은 추천 / 가입일
- [ ] Badges section: at minimum [새내기] held + 미획득 chips for first_contrib/popular_comment
- [ ] Comments list: 작성한 댓글 either populated or empty-state shown
- [ ] Click 편집 → form expands inline
- [ ] Edit bio + save → reflected without page reload
- [ ] Edit target_round_visible toggle off → save → log out → revisit own profile (logged out, viewing as stranger) → 회차 not shown
- [ ] Click "변경" next to nickname (assuming temp) → input enabled → enter new nickname → save → URL changes to new nickname
- [ ] Re-edit nickname immediately → 30-day error message shown
- [ ] Visit `/profile/존재하지않는닉네임` → 404 page

- [ ] **Step 3: Final typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Push branch**

Run: `git push -u origin feat/profile-page-edit-v1`
Expected: branch published.

- [ ] **Step 5: Hand off PR creation to user**

Tell the user: "PR-A 푸시 완료. https://github.com/sngjlee/vet-exam-ai/pull/new/feat/profile-page-edit-v1 에서 PR 생성해 주세요."

---

## Self-review checklist

- [x] Spec §3.2 (RSC fetch) — Task 13 (5 queries: profile/auth/badges/comments+stems/RPC + count = actually 6)
- [x] Spec §4 (layout) — Task 13 page structure + Tasks 9/10/11/12 components
- [x] Spec §5 (nickname rule) — Task 1 (column) + Task 4 (helper) + Task 6 (PATCH enforce)
- [x] Spec §6 (API) — Task 6 (PATCH) + Task 7 (GET comments) + Task 13 (RSC fetch)
- [x] Spec §6.4 (maskPrivacy) — Task 3
- [x] Spec §8 (errors) — Task 6 (23505, nickname_change_too_soon), Task 13 (notFound), Task 11 (empty state)
- [x] Spec §9 (security) — Task 6 (RLS owner-only via auth.uid)
- [x] Spec §11 (operator can be on Seongju after PR-A merge — yes, page exposes self-edit)
- [x] All file paths absolute & exact
- [x] Every code step has full code (no placeholders)
- [x] Type names consistent across tasks (BadgeType / UserProfilePublicRow / canChangeNickname signature)
- [x] No `any` introduced
