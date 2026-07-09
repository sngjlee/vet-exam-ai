# SUPABASE KNOWLEDGE BASE

## OVERVIEW
`vet-exam-ai/supabase/` is the **single authoritative** Supabase surface for KVLE:
the migration tree, project `config.toml`, `schema.sql`, and SQL regression fixtures
(the legacy root `supabase/` was consolidated into here on 2026-07-09).

## STRUCTURE
```text
supabase/
|-- config.toml           # Supabase project config (linked project)
|-- schema.sql            # Reference schema dump
|-- migrations/           # THE timestamped SQL migration tree (single source of truth)
`-- tests/                # SQL regression matrices for RLS/audit behavior
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| New schema changes | `migrations/` | Filename pattern: `YYYYMMDDHHMMSS_name.sql` |
| RLS regression | `tests/rls-permission-regression.sql` | Run against staging/production-like DB after migrations |
| Audit coverage | `tests/admin-audit-coverage.sql` | Verifies admin audit behavior |
| Migration guard | `../scripts/check-migrations.cjs` | Validates this tree; fails if a second tree reappears at root |
| Generated TS shape | `../lib/supabase/types.ts` | Keep in sync with DB schema |

## CONVENTIONS
- This is the only migration tree. Never recreate a second tree at the workspace root `supabase/migrations` (`check:migrations` fails if `.sql` reappears there).
- Use unique 14-digit timestamps; `check:migrations` rejects duplicates.
- Preserve RLS posture: client access through policies, privileged mutations through server-only service-role code.
- When adding service-role behavior, update operations docs and admin health/audit coverage where relevant.
- Include SQL tests or runbook updates when changing permissions, cron tables, audit logs, profile visibility, or UGC tables.

## ANTI-PATTERNS
- Do not disable RLS as a shortcut.
- Do not put Supabase secrets into migrations, SQL tests, logs, or comments.
- Do not assume Supabase CLI state is authoritative; operations docs note SQL Editor/manual application flows.
- Do not leave `lib/supabase/types.ts` stale after schema changes.
