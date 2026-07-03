# Live Security Proof — attempts / wrong_notes

Date: 2026-07-02
Addresses: audit residual P1 "Live RLS proof unavailable; attempts/wrong_notes coverage missing"
(`.omo/reports/beta-launch-readiness-audit.md`)

## What was closed this session

### 1. RLS regression coverage gap (code) — CLOSED

`vet-exam-ai/supabase/tests/rls-permission-regression.sql` previously covered comments,
reports, notifications, admin/cron logs, signup, storage, profiles, ip_bans, and
mock_exam_sessions — but **not** `attempts` or `wrong_notes`. Added:

- `attempts RLS enabled`
- `attempts: owner read` (SELECT, `auth.uid() = user_id`)
- `attempts: owner insert` (INSERT, `auth.uid() = user_id`)
- `attempts is immutable` — asserts **no** UPDATE/DELETE/ALL policy exists (immutable answer log)
- `wrong_notes RLS enabled`
- `wrong_notes: owner read / insert / update / delete`, each scoped to `auth.uid() = user_id`
- `wrong_notes has no table-wide ALL policy`

Policy names/contracts taken from `supabase/migrations/20260314000000_initial_schema.sql`
(lines 129–255). Runbook matrix updated: `docs/operations/rls-permission-regression.md`.

Total assertions in the script: 59.

### 2. Live RLS boundary (read-only, no seeded accounts needed) — VERIFIED

Against live Supabase with the anon key:

| Surface | Probe | Result | Meaning |
|---|---|---|---|
| `attempts` | anon SELECT | `200 []` | RLS on; owner filter yields nothing for anon |
| `wrong_notes` | anon SELECT | `200 []` | RLS on; owner filter yields nothing for anon |
| `attempts` | anon INSERT (spoofed user_id) | `401` | write rejected |
| `wrong_notes` | anon INSERT (spoofed user_id) | `401` | write rejected |

## Still open (needs staging DB + seeded accounts — carry-over)

- **Run** the SQL regression: needs `DATABASE_URL` (not present; the service-role key is a
  PostgREST JWT, not a Postgres password). `psql` is also absent in this environment.
  → run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f vet-exam-ai/supabase/tests/rls-permission-regression.sql`
  in an environment that has the staging connection string.
- **Authenticated multi-user proof**: confirm user A cannot read/modify user B's attempts or
  wrong_notes via a real logged-in session, and that owner UPDATE/DELETE on `attempts` is
  denied. Needs seeded accounts (pending / rejected / approved non-admin / admin).

These two remain residual exactly as the original audit stated; the coverage that makes the
run meaningful is now in place.
