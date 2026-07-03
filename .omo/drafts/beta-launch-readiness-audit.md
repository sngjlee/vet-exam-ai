---
slug: beta-launch-readiness-audit
status: plan-written
intent: clear
pending-action: write .omo/plans/beta-launch-readiness-audit.md
approach: Plan a read-only beta-launch readiness audit across auth, Supabase security boundaries, CI, public quiz flow, admin-only routes, and question-bank copyright safeguards. No product code changes.
---

# Draft: beta-launch-readiness-audit

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| A | Auth/session/signup-state routes are mapped and auditable | active | `proxy.ts`, `app/auth/**`, `lib/auth/signup-status.ts` |
| B | Admin-only routes and service-role/admin boundaries are mapped and auditable | active | `app/admin/layout.tsx`, `lib/admin/guards.ts`, `app/api/admin/**` |
| C | Supabase RLS/migration/security boundaries are auditable without live-secret leakage | active | `vet-exam-ai/supabase/tests/*.sql`, `scripts/check-migrations.cjs` |
| D | CI and public smoke gates are executable and tied to launch-readiness evidence | active | `.github/workflows/ci.yml`, `package.json`, `scripts/smoke-public.cjs` |
| E | Public quiz/question/search flow has browser and HTTP audit scenarios | active | `app/quiz/page.tsx`, `app/api/questions/route.ts`, `app/search/**` |
| F | Question-bank copyright/source-image safeguards are auditable from pipeline, migrations, and admin triage | active | `pipeline/**`, `docs/operations/question-bank-pipeline.md`, `supabase/migrations/*image*` |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| Output shape | Produce a plan for an evidence-driven audit, not an immediate audit report | User invoked `omo:ulw-plan`; skill is planning-only and must not implement | reversible |
| Code changes | No product code modifications; `.omo` planning artifacts only | User explicitly said "Do not modify product code" | yes |
| Live secrets | Treat missing Supabase/Vercel secrets as audit constraints; never require exposing or logging them | Security-sensitive beta readiness work | yes |
| Test strategy | No new tests in the planning phase; execution plan will include agent-run commands, HTTP checks, browser checks, and SQL review/check steps | Planning-only phase and no product edits | yes |
| External research | No external legal advice; audit verifies repo safeguards and flags legal review needs as risks | Copyright readiness is high-stakes, but repo audit cannot replace counsel | yes |

## Findings (cited - path:lines)
- `vet-exam-ai/package.json` defines `check:migrations`, `lint`, `typecheck`, `build`, `smoke:public`, and `ci`; CI chains migration check, lint, typecheck, build.
- `.github/workflows/ci.yml` runs from `vet-exam-ai/`, uses Node 22, `npm ci`, and `npm run ci` on PRs and pushes to `main`.
- `vet-exam-ai/proxy.ts` refreshes Supabase sessions, gates write paths, allows read-only public browsing, and redirects non-approved users to status-specific auth pages.
- `vet-exam-ai/app/admin/layout.tsx` calls `requireAdmin()`, and `vet-exam-ai/lib/admin/guards.ts` redirects signed-out users to login and non-admin/inactive users to `/dashboard`.
- `vet-exam-ai/lib/supabase/admin.ts` is documented as server-only and bypasses RLS; service-role import sites include cron, account deletion, signup approval, admin user actions, image replacement upload, comment upload/delete, and correction status.
- `vet-exam-ai/scripts/check-migrations.cjs` enforces active migration location under `vet-exam-ai/supabase/migrations` and rejects newer legacy root migrations.
- `vet-exam-ai/supabase/tests/rls-permission-regression.sql` and `vet-exam-ai/supabase/tests/admin-audit-coverage.sql` exist as SQL regression evidence for permissions/audit behavior.
- `vet-exam-ai/app/api/questions/route.ts` exposes active public question data, session loading, metadata, summaries, and lookup by `public_id` first.
- `pipeline/upload.py` sets `source='past_exam'`, tags image rows, and marks image-question rows inactive; `pipeline/upload_images.py` uploads to `question-images-private`.
- `docs/operations/question-bank-pipeline.md` requires dry-run/limit/filter preview, private raw assets, image triage, and rollback discipline.
- Subagent evidence: CI/public-flow/copyright explorer completed with concrete commands and URLs. Auth/admin explorer completed with guard and route matrix. Planner lane completed with a six-wave audit plan: CI/static gates, auth/route gates, Supabase boundaries, public quiz flow, admin/cron/audit, and question-bank copyright safeguards.

## Decisions (with rationale)
- Audit plan will be organized as six independently verifiable surfaces: auth, admin/service-role, Supabase/RLS, CI/smoke, public quiz/API/browser flow, and question-bank copyright safeguards.
- Execution will start with read-only/static checks, then local CI/build checks, then HTTP/browser surface checks, then optional live/staging checks that require existing env/secrets but never print secret values.
- Any route or SQL check requiring real authenticated admin/pending/approved users will be planned with fixtures or operator-provided test accounts; no test account credentials will be embedded in artifacts.
- Copyright readiness will be framed as "repo safeguard evidence and residual risk", not as legal clearance.
- Planner wave order adopted: Wave 0 CI/static gates, Wave 1 auth/route gates, Wave 2 Supabase security boundaries, Wave 3 public quiz flow, Wave 4 admin-only/cron/audit, Wave 5 question-bank copyright safeguards.
- Explicit risk to include in plan: live/staging secrets and seeded accounts are required for complete RLS, pending/approved/admin, and production-data copyright sampling; absent access is a residual risk, not a reason to fake proof.
- Explicit audit gap to include in plan: `attempts` and `wrong_notes` ownership should receive focused RLS/security review because planner evidence flagged them as PRD-critical surfaces not clearly covered by current SQL regression.

## Scope IN
- Read-only audit plan for beta launch readiness.
- Auth, signup-state, session refresh, reset/callback, and route redirect behavior.
- Supabase client separation, service-role usage, RLS/audit SQL tests, migration-path guard.
- CI and smoke command readiness.
- Public quiz/question/search happy and failure paths through HTTP and browser scenarios.
- Admin-only route guard and admin API/service-role checks.
- Question-bank content provenance, public IDs, private original images, replacement-image flow, inactive image-question guard, and pipeline dry-run discipline.

## Scope OUT (Must NOT have)
- No edits to product code, migrations, configs, or pipeline behavior.
- No destructive database operations.
- No secret dumps, credential echoing, or raw private source exam/image publication.
- No claim of legal clearance for copyrighted materials.
- No deployment or production data mutation.

## Open questions
- None blocking. Recommended default: write the read-only audit plan using the evidence above, then execute only if the user later invokes a start-work/execution step.

## Approval gate
status: approved; plan-written
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
