# SUPABASE KNOWLEDGE BASE

## OVERVIEW
`vet-exam-ai/supabase/` is the active database change surface for KVLE migrations and SQL regression fixtures.

## STRUCTURE
```text
supabase/
|-- migrations/           # Active timestamped SQL migrations
`-- tests/                # SQL regression matrices for RLS/audit behavior
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| New schema changes | `migrations/` | Filename pattern: `YYYYMMDDHHMMSS_name.sql` |
| RLS regression | `tests/rls-permission-regression.sql` | Run against staging/production-like DB after migrations |
| Audit coverage | `tests/admin-audit-coverage.sql` | Verifies admin audit behavior |
| Migration guard | `../scripts/check-migrations.cjs` | Compares active and legacy directories |
| Generated TS shape | `../lib/supabase/types.ts` | Keep in sync with DB schema |

## CONVENTIONS
- Create new migrations only in this directory, not the workspace root `supabase/migrations`.
- Use unique 14-digit timestamps; `check:migrations` rejects duplicates.
- Preserve RLS posture: client access through policies, privileged mutations through server-only service-role code.
- When adding service-role behavior, update operations docs and admin health/audit coverage where relevant.
- Include SQL tests or runbook updates when changing permissions, cron tables, audit logs, profile visibility, or UGC tables.

## ANTI-PATTERNS
- Do not disable RLS as a shortcut.
- Do not put Supabase secrets into migrations, SQL tests, logs, or comments.
- Do not assume Supabase CLI state is authoritative; operations docs note SQL Editor/manual application flows.
- Do not leave `lib/supabase/types.ts` stale after schema changes.
