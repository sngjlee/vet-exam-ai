# Beta-Launch Readiness Audit

Date: 2026-06-23
Workspace: `C:\Users\Theriogenology\Desktop\vet-exam-ai`
Scope: read-only synthesis from `.omo/plans/beta-launch-readiness-audit.md`, `.omo/start-work/ledger.jsonl`, and Task 1-17 evidence under `.omo/evidence/beta-launch-readiness-audit/`.

> **UPDATE 2026-07-02 — verdict superseded.** All four P0 blockers below were re-verified as PASS against a live Supabase instance with network access on Linux; they were environment artifacts of this audit run, not product defects. Current verdict is **GO (conditional)**. See `.omo/reports/beta-launch-p0-reverification-2026-07-02.md`. The NO-GO text below is retained as the historical 2026-06-23 record.

## Overall Verdict

**Recommendation: NO-GO for beta launch.**

The repository is not beta-launch ready on the audited evidence. The highest-risk blockers are public study functionality failures (`/api/questions` 500s, `/quiz` unable to start, public smoke failure), a failed production build in the local CI gate, and unresolved live security prerequisites for authenticated accounts and staging database policy checks. Several static security boundaries passed, but they do not compensate for broken public quiz/question flows or unavailable live RLS/admin-account proof.

This report does not modify product code, public legal files, migrations, package files, env files, or git history. It does not claim legal clearance for question-bank content. It does not claim broad secret absence beyond the specific evidence checks that were run. Live-secret, seeded-account, and staging database checks were unavailable where noted.

## Findings

### P0 - Public question API is failing

`/api/questions` returned `500 Internal Server Error` for metadata, session sample, count-clamp, and invalid-id probes. The invalid ID case did not return the expected controlled 404 JSON; it returned `500` with `{"error":"Failed to load question"}`. Because session sampling failed, the audit could not prove count clamping, inactive-row exclusion, or valid public question payload shape.

Evidence: `.omo/evidence/beta-launch-readiness-audit/task-9-questions-session.json`, `.omo/evidence/beta-launch-readiness-audit/task-9-invalid-id.http`, `.omo/evidence/beta-launch-readiness-audit/task-9-done-claim.json`.

### P0 - Public quiz cannot start

Anonymous `/quiz` opened, but question data did not load. Practice controls stayed disabled and no answer could be selected, so the core public study flow failed before a user could answer a question.

Evidence: `.omo/evidence/beta-launch-readiness-audit/task-10-quiz-console.log`, `.omo/evidence/beta-launch-readiness-audit/task-10-quiz-session.png`, `.omo/evidence/beta-launch-readiness-audit/task-10-done-claim.json`.

### P0 - Public smoke suite fails

`npm.cmd run smoke:public -- --base-url http://127.0.0.1:3000` exited `1`. The first failing assertion was `questions API session sample: status=500`, matching the question API blocker.

Evidence: `.omo/evidence/beta-launch-readiness-audit/task-12-smoke-public.log`, `.omo/evidence/beta-launch-readiness-audit/task-12-smoke-failure.md`, `.omo/evidence/beta-launch-readiness-audit/task-12-done-claim.json`.

### P0 - Production build gate fails in this environment

`npm run check:migrations`, `npm run lint`, and `npm run typecheck` passed on the authoritative rerun. `npm run build` failed with exit code `1` because `next/font` could not fetch `IBM Plex Mono` from Google Fonts during `next build`. This blocks a full local CI/static readiness pass and makes production-build reproducibility dependent on a network/font-fetch path.

Evidence: `.omo/evidence/beta-launch-readiness-audit/task-1-ci.log`, `.omo/evidence/beta-launch-readiness-audit/task-1-ci-risk.md`, `.omo/evidence/beta-launch-readiness-audit/task-1-done-claim.json`.

### P1 - Public discovery routes redirect anonymous users to login

The empty search API returned `200` JSON, but browser probes found `/questions` and `/search?q=KVLE-0001` redirecting anonymous users to `/auth/login`. If question browsing/search is intended to be public, this is a beta blocker; if it is intentionally authenticated-only, product policy and smoke expectations need to be reconciled.

Evidence: `.omo/evidence/beta-launch-readiness-audit/task-11-empty-search.http`, `.omo/evidence/beta-launch-readiness-audit/task-11-done-claim.json`.

### P1 - Authenticated user and admin success paths are unverified

Seeded pending-proof, pending-review, rejected, approved non-admin, and active-admin accounts were unavailable. No login was attempted. Static code inspection found intended signup-status and admin guard behavior, but real Supabase Auth sessions, profile rows, role/status routing, and admin success pages remain unverified.

Evidence: `.omo/evidence/beta-launch-readiness-audit/task-6-authenticated-flow.md`, `.omo/evidence/beta-launch-readiness-audit/task-6-non-admin-denied.md`, `.omo/evidence/beta-launch-readiness-audit/task-6-done-claim.json`.

### P1 - Live RLS proof is unavailable and attempts/wrong_notes coverage is missing

`DATABASE_URL` was absent, so live RLS SQL regression was not run. Static review found that `attempts` and `wrong_notes` ownership/immutability are not covered by the inspected RLS regression SQL or runbook, despite being core study-history and SRS data surfaces.

Evidence: `.omo/evidence/beta-launch-readiness-audit/task-8-sql-regression.log`, `.omo/evidence/beta-launch-readiness-audit/task-8-coverage-gap.md`, `.omo/evidence/beta-launch-readiness-audit/task-8-done-claim.json`.

### P1 - Admin audit proof is incomplete

`DATABASE_URL` was absent, so admin audit SQL was not run. Static review found gaps: admin image replacement upload/delete is outside the inspected audit matrix, SQL coverage is metadata-oriented, TS direct mutations are weaker than RPC coverage, and `/admin/audit` filter allowlist appears stale for newer board/IP actions.

Evidence: `.omo/evidence/beta-launch-readiness-audit/task-15-admin-audit-sql.log`, `.omo/evidence/beta-launch-readiness-audit/task-15-admin-audit-static.log`, `.omo/evidence/beta-launch-readiness-audit/task-15-admin-audit-assessment.md`, `.omo/evidence/beta-launch-readiness-audit/task-15-done-claim.json`.

### P1 - Public privacy policy copy is stale

Legal sync failed for `privacy-policy.md`: `docs/public/privacy-policy.md` and `vet-exam-ai/public/legal/privacy-policy.md` differ byte-for-byte. Terms of service and community guidelines matched. This is not a legal-clearance determination; it is an app-served-copy drift finding.

Evidence: `.omo/evidence/beta-launch-readiness-audit/task-17-legal-sync.log`, `.omo/evidence/beta-launch-readiness-audit/task-17-done-claim.json`.

### P1 - Question-bank copyright safeguards are present but incomplete

Static safeguards exist for inactive image-bearing rows, private original-image storage, public replacement workflow, admin triage/audit, active-row API filtering, and DB-level `public_id` assignment. Gaps remain: `pipeline/upload.py --dry-run` can print a full first-row payload, API responses still expose/fall back to internal question `id`, active question responses include image filename arrays and rely on triage to prevent private-original keys, and richer traceability is planned but not fully evidenced as enforced.

No raw question bodies, full copyrighted source material, or original image content are included in this report.

Evidence: `.omo/evidence/beta-launch-readiness-audit/task-16-copyright-static.log`, `.omo/evidence/beta-launch-readiness-audit/task-16-raw-asset-scan.log`, `.omo/evidence/beta-launch-readiness-audit/task-16-safeguards-assessment.md`, `.omo/evidence/beta-launch-readiness-audit/task-17-question-sampling.md`.

## Passed Or Partially Passed Checks

- Auth: anonymous `/dashboard`, `/settings`, and `/admin` redirected to login; empty `/auth/callback` redirected with `auth-callback-error`; `/auth/login` rendered without fatal browser errors; anonymous reset did not expose a password-change form.
- Supabase security boundaries: static service-role inventory found no `createAdminClient`, `SUPABASE_SERVICE_ROLE_KEY`, or `supabase/admin` usage inside client modules; positive usages were classified as server-only, route-only, cron helper, server action, script, ops display, or docs.
- CI/migrations: migration guard passed and is wired to the app root; active migrations are under `vet-exam-ai/supabase/migrations`. This is a path/timestamp guard, not live DB policy proof.
- Admin-only routes and cron: unauthenticated admin upload returned `401`; anonymous `/admin` redirected to login with no admin content visible; both scheduled cron routes returned `401` without bearer token; `vercel.json` schedules the expected cron paths.
- Copyright safeguards: static safeguards listed above are present, and tracked raw/generated asset exposure passed for `raw-exams` and `pipeline/output` tracked files.

## Per-Scope Checklist

| Scope | Status | Evidence |
|---|---|---|
| Auth | Partial / blocked | Anonymous redirects and auth pages passed; seeded account flows unavailable. See task 4, 5, 6 artifacts. |
| Supabase security boundaries | Partial / blocked | Static service-role client separation passed; live RLS unavailable; `attempts` and `wrong_notes` coverage gap. See task 7 and 8 artifacts. |
| CI | Fail | Migration/lint/typecheck passed; build failed on Google Fonts fetch; smoke failed on questions API 500. See task 1, 2, 12 artifacts. |
| Public quiz | Fail | `/api/questions` returned 500; `/quiz` could not start a session. See task 9 and 10 artifacts. |
| Public question flow | Fail / unresolved | Question API failed; `/questions` and `/search?q=KVLE-0001` redirected anonymous users to login; empty search API returned 200. See task 9 and 11 artifacts. |
| Admin-only routes / cron / admin audit | Partial / blocked | Anonymous denial and cron auth passed; seeded admin success unavailable; live admin-audit SQL unavailable; static audit gaps remain. See task 13, 14, 15 artifacts. |
| Copyright safeguards | Partial / no clearance claim | Static safeguards present with gaps; live question-data sampling unavailable; no legal clearance claimed. See task 16 and 17 artifacts. |

## Commands Run Summary

Representative command evidence already exists in Task 1-17 artifacts. Key outcomes:

| Area | Command or surface | CWD | Exit / result |
|---|---|---|---|
| CI | `npm.cmd run check:migrations` | `vet-exam-ai\vet-exam-ai` | `0` |
| CI | `npm.cmd run lint` | `vet-exam-ai\vet-exam-ai` | `0` |
| CI | `npm.cmd run typecheck` | `vet-exam-ai\vet-exam-ai` | `0` |
| CI | `npm.cmd run build` | `vet-exam-ai\vet-exam-ai` | `1`, Google Fonts fetch failure |
| Migration guard | `node scripts/check-migrations.cjs` | `vet-exam-ai\vet-exam-ai` | `0`, `migration-check: ok` |
| Auth HTTP | `curl.exe ... /dashboard`, `/settings`, `/admin`, `/auth/callback` | workspace/local server | Expected redirects captured |
| Public questions | `curl.exe -i ... /api/questions?...` | workspace/local server | `500` for tested question endpoints |
| Public smoke | `npm.cmd run smoke:public -- --base-url http://127.0.0.1:3000` | `vet-exam-ai\vet-exam-ai` | `1`, first failure question session sample 500 |
| Admin API | `curl.exe -i -X POST ... /api/admin/image-replacement/upload` | workspace/local server | `401` |
| Cron | `curl.exe -i ... /api/cron/comment-image-sweep`, `/api/cron/signup-proof-purge` | workspace/local server | `401` for both |
| RLS/admin audit SQL | `psql "$env:DATABASE_URL" ...` | not run | Blocked: `DATABASE_URL` absent |
| Legal sync | SHA/hash and `fc.exe /b` comparison | workspace | privacy-policy mismatch; terms/community pass |
| Copyright safeguards | `rg` and `git ls-files` static scans | workspace | safeguards mapped; gaps recorded |

## Evidence Paths

- Plan: `.omo/plans/beta-launch-readiness-audit.md`
- Ledger: `.omo/start-work/ledger.jsonl`
- Task 1 CI/static: `.omo/evidence/beta-launch-readiness-audit/task-1-*`
- Task 2 migrations: `.omo/evidence/beta-launch-readiness-audit/task-2-*`
- Task 3 prerequisites/secret-safety: `.omo/evidence/beta-launch-readiness-audit/task-3-*`
- Task 4-6 auth: `.omo/evidence/beta-launch-readiness-audit/task-4-*`, `task-5-*`, `task-6-*`
- Task 7-8 Supabase/RLS: `.omo/evidence/beta-launch-readiness-audit/task-7-*`, `task-8-*`
- Task 9-12 public quiz/question/search/smoke: `.omo/evidence/beta-launch-readiness-audit/task-9-*`, `task-10-*`, `task-11-*`, `task-12-*`
- Task 13-15 admin/cron/audit: `.omo/evidence/beta-launch-readiness-audit/task-13-*`, `task-14-*`, `task-15-*`
- Task 16-17 copyright/legal/live-data: `.omo/evidence/beta-launch-readiness-audit/task-16-*`, `task-17-*`
- Task 18 synthesis/verification: `.omo/evidence/beta-launch-readiness-audit/task-18-report-shape.log`, `.omo/evidence/beta-launch-readiness-audit/task-18-no-product-diff.log`, `.omo/evidence/beta-launch-readiness-audit/task-18-done-claim.json`

## Unavailable Prerequisites

- Seeded pending-proof account: unavailable.
- Seeded pending-review account: unavailable.
- Seeded rejected account: unavailable.
- Seeded approved non-admin account: unavailable.
- Seeded active admin account: unavailable.
- Approved staging `DATABASE_URL`: unavailable; live RLS and admin-audit SQL not run.
- Staging-named DB/API source for question-data sampling: unavailable; live aggregate sampling not run.
- Live secret values: intentionally not requested or printed.
- Authorized cron bearer probe: not run; unauthenticated denial only was tested.
- Vercel/Sentry dashboard verification: not evidenced in Task 1-17 artifacts.

## Residual Risk

- Public question API failures may mask additional content-safety, inactive-row, count-clamp, and JSON-shape defects that could only be checked after API recovery.
- Static service-role separation does not prove staging RLS policy behavior or protect against policy drift without running SQL regression against an approved staging database.
- Static admin guards do not prove seeded account/profile/status correctness, deployment cookie behavior, or live admin mutation denial for non-admin users.
- The secret scan was conservative and evidence-limited; it does not prove every generated, local, ignored, or external system is secret-free.
- The audit did not provide legal clearance for question-bank text, images, rewrites, or licensing. It only reports repository safeguards and gaps visible in the evidence.
- Local build failure is tied to Google Fonts fetch in this environment; a network-enabled CI may differ, but beta readiness still requires a reproducible build path.
- Privacy-policy drift means the app-served legal copy may not reflect the current public source until synchronized and reviewed.

## Required Before Beta

1. Fix or make reproducible the production build path, including the `next/font` Google Fonts dependency.
2. Restore `/api/questions` success behavior, including invalid ID returning controlled 404 JSON, count clamp, and inactive-row exclusion.
3. Verify anonymous `/quiz` can start, show choices, accept an answer, and show answer/explanation UI.
4. Re-run `npm run smoke:public` and require it to pass.
5. Decide whether `/questions` and `/search` are public; then align routing, product policy, and smoke expectations.
6. Provide safe seeded accounts for pending, rejected, approved non-admin, and active-admin live browser QA.
7. Provide an approved staging `DATABASE_URL` and run live RLS plus admin-audit SQL; add regression coverage for `attempts` and `wrong_notes`.
8. Address admin audit static gaps or document accepted exceptions.
9. Sync `privacy-policy.md` from `docs/public` to `vet-exam-ai/public/legal` in a product/doc change.
10. Tighten question-bank safeguards: redact dry-run row output, complete public-id-only public surfaces, and prove active image filenames cannot expose private originals.

