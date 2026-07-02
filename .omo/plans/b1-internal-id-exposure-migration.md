# B1 — Internal question id exposure: migration plan

Status: **PLAN (not yet executed)** · Requires staging `DATABASE_URL` + seed accounts to apply/test
Filed: 2026-07-02 · Branch (intended): dedicated, e.g. `b1/public-id-canonical`
Supersedes: `.omo/reports/followup-internal-id-exposure.md` (which deferred this)
Related: `.omo/reports/beta-launch-p0-reverification-2026-07-02.md` residual item 1

## 1. Goal

Stop the public API from leaking the internal `questions.id` (e.g. `3.5_산과_63회_q011`),
which encodes exam **round + subject** and undermines the copyright posture that
`public_id` (`KVLE-1219`) exists to protect. The internal id stays as the private
primary key; it just must never leave the server.

Leak point today: `vet-exam-ai/app/api/questions/route.ts:50` and `:71`
(`toQuestion` maps `id: row.id`). `loadQuestionById` already looks up by `public_id`
(`route.ts:227`).

## 2. Verified current state (2026-07-02)

| Table | `question_id` role | FK → `questions.id`? | Write path | RLS references `question_id`? |
|---|---|---|---|---|
| `attempts` | immutable answer log | **YES** (`references questions(id)`, `initial_schema.sql:133`) | **client-direct** (`lib/attempts/supabaseRepo.ts:24`) | No (`auth.uid() = user_id`) |
| `wrong_notes` | denormalized snapshot + dedup key | **NO** — FK dropped (`20260314000001_drop_wrong_notes_question_fk.sql`) | **client-direct** (`lib/wrongNotes/supabaseRepo.ts`) | No |
| `comments` | thread key | **YES** (`references questions(id) on delete cascade`, `20260425000001_community_comments.sql:41`) | server route (`app/api/comments/route.ts`) | No |

Key enablers:
- `questions.public_id`: `NOT NULL`, `UNIQUE` (`questions_public_id_key`), auto-issued by
  trigger `trg_questions_assign_public_id`, 100% coverage
  (`20260428000000_questions_public_id.sql`). → **valid FK target**.
- **No RLS policy references `question_id`** on any table (all use `user_id` / `status` /
  `is_admin()`). → the FK swap needs **zero RLS policy changes**; the existing
  `attempts`/`wrong_notes` regression coverage in
  `vet-exam-ai/supabase/tests/rls-permission-regression.sql` stays valid.
- `search_comments` RPC already joins `qs.id = c.question_id` and returns
  `question_public_id` (`20260608000000_search_comments_rpc.sql:66-77`).
- `wrong_notes` is fully denormalized (stores `question_text`, `choices`,
  `correct_answer`, `selected_answer`, `explanation`), so its `question_id` is only an
  identity/dedup key — no join needed for display.

Blast radius: ~181 references across ~38 files (see `grep -rn question_id`), but most are
mechanical: they consume whatever identifier the question object carries.

## 3. Chosen approach — A: `public_id` as the canonical external identifier

The client only ever sees/sends `public_id`. FK columns store `public_id` and reference
`questions(public_id)`. The internal `id` remains the private PK, never serialized to the
client.

Rejected alternative (Approach B — server-resolve): keep FKs on internal id, move
`attempts`/`wrong_notes` writes behind server routes that translate `publicId`→internal id.
Avoids a data migration but abandons the client-direct + RLS model for two tables and adds
new server endpoints + latency. Approach A is the cleaner long-term posture and keeps
client-direct writes intact.

## 4. Migration — expand / contract (zero-downtime ordering)

Do **not** do a single in-place `UPDATE ... SET question_id = public_id` + re-point FK:
that opens a window where the FK is violated on a live system. Use expand→cutover→contract.

### Phase 0 — precheck (fail fast, read-only)
```sql
-- coverage + uniqueness (expect 0)
select count(*) from public.questions where public_id is null;
-- orphans that would break the new FK (expect 0 for both)
select count(*) from public.attempts a
  left join public.questions q on q.id = a.question_id where q.id is null;
select count(*) from public.comments c
  left join public.questions q on q.id = c.question_id where q.id is null;
```
If any orphan rows exist, resolve them before proceeding (they already violate the current
FK for attempts/comments, so should be 0 — but wrong_notes may have historical internal ids
pointing at rows that no longer exist; those are display-safe because the snapshot is stored,
but they cannot be mapped — see §7 open items).

### Phase 1 — DB expand (additive, reversible)  → migration file `..._b1_add_question_public_id.sql`
```sql
-- attempts: new column + backfill from join, then FK + index
alter table public.attempts add column if not exists question_public_id text;
update public.attempts a set question_public_id = q.public_id
  from public.questions q where q.id = a.question_id and a.question_public_id is null;
-- comments
alter table public.comments add column if not exists question_public_id text;
update public.comments c set question_public_id = q.public_id
  from public.questions q where q.id = c.question_id and c.question_public_id is null;
-- wrong_notes (no FK): new column + best-effort backfill (internal ids that still resolve)
alter table public.wrong_notes add column if not exists question_public_id text;
update public.wrong_notes w set question_public_id = q.public_id
  from public.questions q where q.id = w.question_id and w.question_public_id is null;

-- indexes mirroring the existing question_id indexes
create index if not exists attempts_user_question_public
  on public.attempts (user_id, question_public_id);
create index if not exists comments_question_public_created
  on public.comments (question_public_id, created_at desc) where status = 'visible';

-- FKs on the new columns (public_id is unique → valid target)
alter table public.attempts
  add constraint attempts_question_public_id_fkey
  foreign key (question_public_id) references public.questions (public_id);
alter table public.comments
  add constraint comments_question_public_id_fkey
  foreign key (question_public_id) references public.questions (public_id) on delete cascade;
```
The backfill runs as the migration role (service/superuser) so the `attempts` immutability
policy (no UPDATE for owners) does not block it.
Leave the new columns nullable until Phase 3; do **not** set NOT NULL yet.

### Phase 2 — code cutover (deploy)  — files grouped by concern
1. **Questions API** (`app/api/questions/route.ts`): ship `id: row.public_id` (or drop `id`
   and rename `publicId`→the sole identifier); remove internal `id` from the select/response;
   also drop `year` and `source` from the public payload (`year` is marked
   "INTERNAL only, never display" in `lib/questions/types.ts`). `loadQuestionById` already
   keys on `public_id`.
2. **attempts** (`lib/attempts/supabaseRepo.ts`): insert `question_public_id = payload.questionId`
   (now a KVLE id). Analytics reads (`attempt_stats_summary` RPC,
   `20260605000000_attempt_stats_summary_rpc.sql`) that group by `question_id` → switch to
   `question_public_id`.
3. **wrong_notes** (`lib/wrongNotes/supabaseRepo.ts`): read/write/delete/updateReview keyed on
   `question_public_id`; change upsert `onConflict` to `user_id,question_public_id`; update the
   unique constraint accordingly (drop old `(user_id,question_id)`, add
   `(user_id,question_public_id)`). `migrateGuestNotes.ts` too.
4. **comments** (`app/api/comments/*`, `lib/comments/schema.ts`, `lib/cron/comment-seeding.ts`):
   write/query `question_public_id`; update `search_comments` RPC to join/key on
   `qs.public_id = c.question_public_id` (it already exposes `question_public_id`).
5. **Admin + display** (`app/admin/corrections/*`, `app/admin/image-questions/*`,
   `app/admin/quality/page.tsx`, `lib/admin/triage.ts`,
   `app/api/admin/image-replacement/upload/route.ts`, `lib/notifications/format.ts`,
   `lib/og/fetch-meta.ts`, `app/profile/[nickname]/*`, `app/api/profile/[user_id]/comments`):
   switch to `question_public_id`. **Admin tools legitimately may still see internal id
   server-side** — scope the removal to *client-facing* payloads, not admin server queries.
6. **Types** (`lib/supabase/types.ts`): add `question_public_id` to Row/Insert/Update for
   `attempts`/`wrong_notes`/`comments`.

### Phase 3 — DB contract (separate migration, after burn-in)  — `..._b1_drop_internal_question_id_columns.sql`
- Take a DB snapshot first (point of no return).
- `alter table ... alter column question_public_id set not null;` (after verifying full backfill).
- Drop old `question_id` columns / FKs / indexes on `attempts`, `comments`, and
  `wrong_notes`. Optionally rename `question_public_id`→`question_id` to minimize long-term
  naming churn (optional; adds a rename migration).

## 5. RLS
No changes. Confirmed no policy references `question_id`. Existing regression coverage
(`rls-permission-regression.sql`, 59 asserts) remains valid.

## 6. Test plan (needs staging DB + seed accounts)
- Phase 0 prechecks return 0 orphans / 0 null public_id.
- Post-Phase 1: `question_public_id` non-null count == row count for attempts & comments
  (wrong_notes may have unmappable legacy rows — see §7).
- Post-Phase 2 on staging:
  - Round-trips: answer → `attempts.question_public_id` correct; wrong answer → wrong_note by
    public id; correct retry deletes it; comment create/read/search by public id;
    notification deep-link resolves; profile comment list + OG meta render.
  - `/api/questions` returns **no** internal `id`, no `year`, no `source`; `smoke:public` 15/15.
  - `psql "$DATABASE_URL" -f vet-exam-ai/supabase/tests/rls-permission-regression.sql` passes.
  - Multi-user: A cannot read B's attempts/wrong_notes.
  - `npm run ci` (check:migrations + lint + typecheck + build) green.

## 7. Open items to resolve during execution
- **Question detail / deep-link route param**: confirm the question route + comment share
  links already use `public_id` (search does). If any route param is the internal id, include
  it in Phase 2.
- **wrong_notes legacy rows** whose `question_id` no longer resolves to a live question:
  display is safe (snapshot stored) but they get a null `question_public_id`. Decide: keep
  nullable for wrong_notes, or synthesize. Recommendation: keep `wrong_notes.question_public_id`
  **nullable** (no FK anyway) and dedup on `coalesce(question_public_id, question_id)` during
  transition, or accept that unmappable legacy notes may duplicate once.
- **Drop `year`/`source` from public payload**: recommended; verify no client component reads
  them for display before removing.
- Keep internal `id` server-side for admin/pipeline; only client payloads change.

## 8. Effort / prerequisites
- Phase 1: 1 migration file. Phase 2: ~38 files, mostly mechanical identifier rename +
  types. Phase 3: 1 migration after burn-in.
- Blocked on: staging `DATABASE_URL` (service key is a PostgREST JWT, not a Postgres
  password) and seed accounts (pending/rejected/approved/admin) for the round-trip + RLS QA.
- Not a beta blocker (interim risk low-to-moderate per followup doc); resolve before broad
  public launch.
