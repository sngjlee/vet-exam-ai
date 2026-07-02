# Follow-up (P1, deferred): Internal question id exposure

Date filed: 2026-07-02
Status: PLANNED — full execution plan written at `.omo/plans/b1-internal-id-exposure-migration.md`
(2026-07-02). Blocked on staging DB + seed accounts to apply/test; not a beta blocker.
Related: `.omo/reports/beta-launch-p0-reverification-2026-07-02.md` residual item 1

## Problem

Public `/api/questions` responses include the internal `id` (e.g. `3.5_산과_63회_q011`)
alongside the copyright-safe `publicId` (e.g. `KVLE-1219`). The internal id encodes
source exam round + subject, which undermines the "never reveal round/session/year"
posture that `publicId` exists to protect.

## Why it is not a quick edit

The internal `id` is the **foreign key** used across core user data, not just a display value:

- `attempts.question_id` → references `questions.id` (see `lib/supabase/types.ts:185`)
- `wrong_notes.question_id`, `comments.question_id`, and related RPCs also key on internal id
- All write paths (`lib/hooks/useAttempts.ts`, `lib/hooks/useWrongNotes.ts`, comment repos)
  send the internal id as `questionId`
- `search_comments` RPC returns `question_public_id` for display but stores internal `question_id`

Removing `id` from the API response without migrating these would break answer history,
wrong notes, and comments.

## Feasibility

- `public_id` has 100% coverage on active questions (2,835/2,835, 0 null as of 2026-07-02),
  so it is a viable replacement identifier.

## Scope of the proper fix (for the dedicated plan)

1. DB migration: make `public_id` the join key for `attempts` / `wrong_notes` / `comments`
   (either FK swap or add `question_public_id` columns), with data backfill from existing rows.
2. Update repos/hooks to read/write by `publicId`.
3. Update RLS policies that reference `question_id`.
4. Update `/api/questions` to stop shipping internal `id` (ship `publicId` as the identifier).
5. Consider dropping `year` / `source` from public payloads (currently shipped; `year` is
   marked "INTERNAL only, never display" in `lib/questions/types.ts`).
6. Regression test attempt/wrong-note/comment round-trips before and after backfill.

## Interim risk

Low-to-moderate: provenance of rewritten content is inferable by a determined user reading
API payloads, but no raw source text/images are exposed. Acceptable for closed beta; resolve
before broad public launch.
