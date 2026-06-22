# beta-launch-readiness-audit - Work Plan

## TL;DR (For humans)
**What you'll get:** A read-only beta launch audit that checks whether login, protected areas, public studying, operational controls, and question-bank safeguards are ready to trust. It produces an evidence-backed readiness report with pass/fail findings and residual risks.

**Why this approach:** The audit starts with automated gates, then checks real browser and HTTP behavior, then reviews database/security and content-safety controls that need staging access. That order catches cheap failures first and avoids touching production data.

**What it will NOT do:** It will not change product code. It will not mutate production data or expose secrets. It will not claim legal clearance for copyrighted material.

**Effort:** Medium
**Risk:** Medium - full confidence depends on staging Supabase access and seeded pending/approved/admin accounts.
**Decisions to sanity-check:** Missing live secrets or seeded accounts should become named residual risks, not invented proof.

Your next move: run this plan with `$omo:start-work`, or ask for high-accuracy review first. Full execution detail follows below.

---

> TL;DR (machine): Medium effort, medium risk, read-only beta-readiness audit across auth, Supabase security, CI, public quiz, admin routes, and question-bank safeguards.

## Scope
### Must have
- Audit auth/session behavior, signup-state redirects, reset/callback handling, and write-route protection.
- Audit Supabase client separation, service-role import sites, RLS/audit SQL test coverage, and migration-path controls.
- Audit CI workflow and local static/build gates.
- Audit public quiz, question, search, and smoke-test flows through HTTP and browser surfaces.
- Audit admin-only pages, admin API routes, cron authentication, and audit logging surfaces.
- Audit question-bank copyright safeguards: rewritten content flow, copyright-safe public IDs, inactive original-image rows, private original storage, replacement-image workflow, and public legal-copy sync.
- Produce evidence under `.omo/evidence/beta-launch-readiness-audit/` and a final findings report under `.omo/reports/beta-launch-readiness-audit.md`.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No edits to product code, migrations, package manifests, config files, pipeline scripts, docs, or public assets.
- No database writes except temporary/session-local SQL objects created by read-only regression scripts, and only against an explicitly approved staging database.
- No production mutation, deployment, user-account mutation, or destructive cleanup.
- No raw secrets, cookies, auth headers, reset links, signup proof paths, private exam files, or original source images in evidence.
- No legal conclusion that content is cleared; only repo safeguard evidence and residual risk.
- No broad "looks good" claims without artifact-backed evidence.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: none added. This is a read-only audit plan; verification uses existing CI scripts, SQL regression scripts, HTTP calls, browser actions, source review, and evidence capture.
- Evidence root: `.omo/evidence/beta-launch-readiness-audit/`
- Report output: `.omo/reports/beta-launch-readiness-audit.md`
- Secret policy: redact all secrets and session identifiers. Record presence/absence, status codes, row counts, and hashes/prefixes only when identity is needed.
- Live-access policy: if `DATABASE_URL`, seeded users, Supabase project access, Vercel/Sentry dashboards, or admin credentials are unavailable, mark the affected criterion `RISK: unverified live surface` with the exact missing prerequisite.
- Dev-server policy: when starting a local server, record PID/session, base URL, and teardown receipt. Do not leave ports/processes running.

## Execution strategy
### Parallel execution waves
- Wave 0, static and CI gates: run first; blocks all browser/HTTP claims if build cannot start.
- Wave 1, auth and route gates: can run after Wave 0 dev server is available.
- Wave 2, Supabase security boundaries: static checks can run after Wave 0; SQL checks require staging DB access.
- Wave 3, public quiz flow: runs after Wave 0 dev server is available.
- Wave 4, admin-only routes, cron, and audit: unauthenticated checks run after Wave 0; authenticated/admin checks require seeded accounts.
- Wave 5, question-bank copyright safeguards: static/pipeline dry-run checks can run after Wave 0; live DB sampling requires staging DB access.
- Final verification wave: runs only after all audit todos have terminal `PASS`, `FAIL`, or `RISK/UNVERIFIED` states.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 4, 5, 6, 7, 9, 10, 11, 12 | 2, 3 |
| 2 | none | final report | 1, 3 |
| 3 | none | 8, 13, 14 | 1, 2 |
| 4 | 1 | final report | 5, 6, 7 |
| 5 | 1 | final report | 4, 6, 7 |
| 6 | 1 | final report | 4, 5, 7 |
| 7 | 1 | final report | 4, 5, 6 |
| 8 | 3 | final report | 9, 10, 11, 12 |
| 9 | 1 | final report | 8, 10, 11, 12 |
| 10 | 1 | final report | 8, 9, 11, 12 |
| 11 | 1 | final report | 8, 9, 10, 12 |
| 12 | 1 | final report | 8, 9, 10, 11 |
| 13 | 3 | final report | 14, 15, 16, 17 |
| 14 | 3 | final report | 13, 15, 16, 17 |
| 15 | none | final report | 13, 14, 16, 17 |
| 16 | none | final report | 13, 14, 15, 17 |
| 17 | all previous todos | final verification | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. Run local CI/static gates exactly as GitHub Actions does
  What to do / Must NOT do: From `vet-exam-ai/`, run migration check, lint, typecheck, and build; capture raw exit codes and condensed logs. Do not edit files to make a gate pass.
  Parallelization: Wave 0 | Blocked by: none | Blocks: route, browser, and smoke assertions
  References (executor has NO interview context - be exhaustive): `vet-exam-ai/package.json`; `.github/workflows/ci.yml`; `vet-exam-ai/README.md`; `vet-exam-ai/scripts/check-migrations.cjs`; `AGENTS.md`; `vet-exam-ai/AGENTS.md`
  Acceptance criteria (agent-executable): `cd C:\Users\Theriogenology\Desktop\vet-exam-ai\vet-exam-ai; npm run check:migrations; npm run lint; npm run typecheck; npm run build` each exits `0`, or the final report lists the exact failing command and first actionable error.
  QA scenarios (name the exact tool + invocation): happy = `powershell.exe -Command "npm run check:migrations; npm run lint; npm run typecheck; npm run build"` from app root, PASS iff all exit `0`, evidence `.omo/evidence/beta-launch-readiness-audit/task-1-ci.log`; failure = inspect `.github/workflows/ci.yml` and `scripts/check-migrations.cjs`, PASS iff report names that CI placeholder env proves build health but not live DB policy, evidence `.omo/evidence/beta-launch-readiness-audit/task-1-ci-risk.md`
  Commit: N | no commit

- [ ] 2. Inventory migration-path and CI coverage risks
  What to do / Must NOT do: Prove new migrations belong only under `vet-exam-ai/supabase/migrations` and that CI runs the guard. Do not create fake migrations in product paths.
  Parallelization: Wave 0 | Blocked by: none | Blocks: final report
  References: `vet-exam-ai/scripts/check-migrations.cjs`; `.github/workflows/ci.yml`; `docs/operations/migration-runbook.md`; `vet-exam-ai/supabase/AGENTS.md`; root `supabase/migrations/`
  Acceptance criteria: report states active migration count, legacy migration count, latest active timestamp, latest legacy timestamp, and whether the guard is wired into `npm run ci`.
  QA scenarios: happy = `powershell.exe -Command "node scripts/check-migrations.cjs"` from app root, PASS iff output starts `migration-check: ok`, evidence `.omo/evidence/beta-launch-readiness-audit/task-2-migration-check.log`; failure = static review of `scripts/check-migrations.cjs` branches that call `fail(...)`, PASS iff report names duplicate timestamp and newer legacy migration as covered failure modes, evidence `.omo/evidence/beta-launch-readiness-audit/task-2-migration-failure-modes.md`
  Commit: N | no commit

- [ ] 3. Record prerequisites and safe evidence policy
  What to do / Must NOT do: Build a prerequisite ledger for staging DB URL, seeded approved/pending/rejected/admin users, cron secret, Vercel/Sentry access, and public base URL. Do not ask for or print secret values.
  Parallelization: Wave 0 | Blocked by: none | Blocks: live DB/admin/auth success-path checks
  References: `docs/operations/launch-smoke-test.md`; `docs/operations/production-readiness-checklist.md`; `docs/operations/operations-runbook.md`; `vet-exam-ai/app/admin/ops/page.tsx`; `vet-exam-ai/README.md`
  Acceptance criteria: `.omo/evidence/beta-launch-readiness-audit/task-3-prereqs.md` exists and classifies each prerequisite as available, unavailable, or intentionally skipped; no raw secret values appear.
  QA scenarios: happy = `powershell.exe -Command "Get-ChildItem Env:NEXT_PUBLIC_SUPABASE_URL,Env:NEXT_PUBLIC_SUPABASE_ANON_KEY,Env:SUPABASE_SERVICE_ROLE_KEY,Env:CRON_SECRET,Env:DATABASE_URL -ErrorAction SilentlyContinue | Select-Object Name"` from repo root, PASS iff only names are recorded, evidence `.omo/evidence/beta-launch-readiness-audit/task-3-env-names.log`; failure = grep evidence with `rg -n "(eyJ|service_role|SUPABASE_SERVICE_ROLE_KEY=|CRON_SECRET=|DATABASE_URL=|password=)" .omo/evidence/beta-launch-readiness-audit`, PASS iff no matches, evidence `.omo/evidence/beta-launch-readiness-audit/task-3-secret-scan.log`
  Commit: N | no commit

- [ ] 4. Audit unauthenticated auth and route redirects over HTTP
  What to do / Must NOT do: Start local dev server, hit unauthenticated protected routes, and capture status/location headers. Do not log cookies or auth headers.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: final report
  References: `vet-exam-ai/proxy.ts`; `vet-exam-ai/app/auth/login/page.tsx`; `vet-exam-ai/app/auth/callback/route.ts`; `vet-exam-ai/lib/auth/signup-status.ts`; `docs/operations/launch-smoke-test.md`
  Acceptance criteria: `/dashboard`, `/settings`, and `/admin` redirect to login; `/auth/callback` without valid auth material redirects to login with `auth-callback-error`; public read routes do not redirect to login.
  QA scenarios: happy = `curl.exe -i -L --max-redirs 0 http://127.0.0.1:3000/dashboard` and `curl.exe -i -L --max-redirs 0 http://127.0.0.1:3000/admin`, PASS iff `307/308` with `Location` containing `/auth/login`, evidence `.omo/evidence/beta-launch-readiness-audit/task-4-route-redirects.http`; failure = `curl.exe -i -L --max-redirs 0 http://127.0.0.1:3000/auth/callback`, PASS iff redirect target contains `error=auth-callback-error`, evidence `.omo/evidence/beta-launch-readiness-audit/task-4-callback-failure.http`
  Commit: N | no commit

- [ ] 5. Audit browser-visible auth entry and pending-state pages
  What to do / Must NOT do: Use a real browser automation channel to open auth entry/status pages and capture screenshots/console errors. Do not enter real credentials.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: final report
  References: `vet-exam-ai/app/auth/login/page.tsx`; `vet-exam-ai/app/auth/pending-proof/page.tsx`; `vet-exam-ai/app/auth/pending-review/page.tsx`; `vet-exam-ai/app/auth/rejected/page.tsx`; `vet-exam-ai/app/auth/reset/_components/ResetPasswordForm.tsx`
  Acceptance criteria: `/auth/login` renders login/signup/reset controls without fatal console/page errors; status pages either render expected state or redirect safely based on anonymous session.
  QA scenarios: happy = Browser use via Playwright: `page.goto("http://127.0.0.1:3000/auth/login"); page.screenshot({path: ".omo/evidence/beta-launch-readiness-audit/task-5-login.png", fullPage: true})`, PASS iff page has visible email/password form and no uncaught error; failure = `page.goto("http://127.0.0.1:3000/auth/reset"); page.screenshot({path: ".omo/evidence/beta-launch-readiness-audit/task-5-reset-anon.png", fullPage: true})`, PASS iff anonymous reset page does not expose a password-change form without a valid reset session
  Commit: N | no commit

- [ ] 6. Audit pending/approved/admin account flows when seeded accounts exist
  What to do / Must NOT do: If seeded test credentials are available, verify pending-proof, pending-review, rejected, approved user, and admin navigation. If not, record the exact missing accounts as residual risk. Do not store credentials in evidence.
  Parallelization: Wave 1 | Blocked by: 1, 3 | Blocks: final report
  References: `vet-exam-ai/proxy.ts`; `vet-exam-ai/lib/auth/signup-status.ts`; `vet-exam-ai/lib/admin/guards.ts`; `vet-exam-ai/app/admin/layout.tsx`; `docs/operations/launch-smoke-test.md`
  Acceptance criteria: each seeded user reaches only its allowed surfaces; non-admin approved user cannot access `/admin`; active admin can reach `/admin/ops`.
  QA scenarios: happy = Browser use via Playwright with operator-provided seeded approved/admin accounts stored outside evidence, PASS iff approved user reaches `/dashboard` and admin reaches `/admin/ops`, evidence `.omo/evidence/beta-launch-readiness-audit/task-6-authenticated-flow.md`; failure = same browser session as non-admin approved user opens `/admin`, PASS iff redirected to `/dashboard` or denied, evidence `.omo/evidence/beta-launch-readiness-audit/task-6-non-admin-denied.md`
  Commit: N | no commit

- [ ] 7. Audit Supabase client separation and service-role import inventory
  What to do / Must NOT do: Staticaly map all `createAdminClient` and `SUPABASE_SERVICE_ROLE_KEY` usages, then reconcile with admin ops documentation. Do not alter imports.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: final report
  References: `vet-exam-ai/lib/supabase/admin.ts`; `vet-exam-ai/lib/supabase/client.ts`; `vet-exam-ai/lib/supabase/server.ts`; `vet-exam-ai/app/admin/ops/page.tsx`; `docs/operations/production-readiness-checklist.md`
  Acceptance criteria: every service-role usage is server-only or script-only and appears in the readiness report; any browser/client component import is a blocking finding.
  QA scenarios: happy = `rg -n "createAdminClient|SUPABASE_SERVICE_ROLE_KEY" vet-exam-ai\app vet-exam-ai\components vet-exam-ai\lib vet-exam-ai\scripts docs`, PASS iff inventory is reconciled with allowed server/script paths, evidence `.omo/evidence/beta-launch-readiness-audit/task-7-service-role-inventory.log`; failure = `rg -n "\"use client\"[\s\S]{0,400}(createAdminClient|SUPABASE_SERVICE_ROLE_KEY)|createAdminClient" vet-exam-ai\components vet-exam-ai\app -g "*.tsx" -g "*.ts"`, PASS iff no client-shipped import/use is found or every match is proven server route/action only, evidence `.omo/evidence/beta-launch-readiness-audit/task-7-client-leak-scan.log`
  Commit: N | no commit

- [ ] 8. Audit RLS and admin-audit SQL regression coverage
  What to do / Must NOT do: Run SQL regression scripts only against an approved staging/production-like database. If no DB access exists, review scripts statically and mark live policy proof unavailable. Do not run against production without explicit operator approval.
  Parallelization: Wave 2 | Blocked by: 3 | Blocks: final report
  References: `vet-exam-ai/supabase/tests/rls-permission-regression.sql`; `vet-exam-ai/supabase/tests/admin-audit-coverage.sql`; `docs/operations/rls-permission-regression.md`; `docs/operations/admin-audit-coverage.md`; `PRD.md`
  Acceptance criteria: SQL scripts pass against staging, or report states `RISK: unverified live RLS` with missing `DATABASE_URL`; report explicitly assesses whether `attempts` and `wrong_notes` ownership are covered.
  QA scenarios: happy = `psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f vet-exam-ai/supabase/tests/rls-permission-regression.sql` and `psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f vet-exam-ai/supabase/tests/admin-audit-coverage.sql`, PASS iff both exit `0`, evidence `.omo/evidence/beta-launch-readiness-audit/task-8-sql-regression.log`; failure = static scan `rg -n "attempts|wrong_notes|wrong_notes|wrongNotes" vet-exam-ai/supabase/tests docs/operations PRD.md`, PASS iff report names covered/uncovered ownership surfaces, evidence `.omo/evidence/beta-launch-readiness-audit/task-8-coverage-gap.md`
  Commit: N | no commit

- [ ] 9. Audit public question APIs over HTTP
  What to do / Must NOT do: Hit public question/session/meta endpoints and verify active-only behavior, count clamp, invalid ID failure, and JSON shape. Do not require login.
  Parallelization: Wave 3 | Blocked by: 1 | Blocks: final report
  References: `vet-exam-ai/app/api/questions/route.ts`; `vet-exam-ai/lib/questions/types.ts`; `vet-exam-ai/app/quiz/page.tsx`; `vet-exam-ai/scripts/smoke-public.cjs`
  Acceptance criteria: `meta=1`, `session=1&count=5`, `session=1&count=999`, and invalid ID produce expected JSON/status; no inactive rows are returned.
  QA scenarios: happy = `powershell.exe -Command "$qs = Invoke-RestMethod 'http://127.0.0.1:3000/api/questions?session=1&count=999'; if ($qs.Count -gt 50) { throw 'session clamp failed' }; if (($qs | Where-Object { $_.isActive -eq $false }).Count) { throw 'inactive question leaked' }; $qs | ConvertTo-Json -Depth 4"`, PASS iff count <= 50 and no inactive rows, evidence `.omo/evidence/beta-launch-readiness-audit/task-9-questions-session.json`; failure = `curl.exe -i http://127.0.0.1:3000/api/questions?id=does-not-exist`, PASS iff HTTP status is `404` with JSON error, evidence `.omo/evidence/beta-launch-readiness-audit/task-9-invalid-id.http`
  Commit: N | no commit

- [ ] 10. Audit public quiz browser flow
  What to do / Must NOT do: Drive `/quiz` in a browser through starting a practice session and answering at least one question. Do not require login for anonymous quiz.
  Parallelization: Wave 3 | Blocked by: 1 | Blocks: final report
  References: `vet-exam-ai/app/quiz/page.tsx`; `vet-exam-ai/components/SessionSetup.tsx`; `vet-exam-ai/components/QuestionCard.tsx`; `vet-exam-ai/lib/hooks/useWrongNotes.ts`; `vet-exam-ai/lib/hooks/useAttempts.ts`
  Acceptance criteria: anonymous user can open `/quiz`, start a session, see a question with five choices, select an answer, and see answer/explanation UI without fatal console errors.
  QA scenarios: happy = Browser use via Playwright: `page.goto("http://127.0.0.1:3000/quiz"); page.getByRole("button", {name: /세션 시작|로딩 중/}).click(); page.screenshot({path: ".omo/evidence/beta-launch-readiness-audit/task-10-quiz-session.png", fullPage: true})`, PASS iff a question and choices are visible; failure = in same browser collect `page.on("pageerror")` and `console.error`, PASS iff no fatal runtime error while starting session, evidence `.omo/evidence/beta-launch-readiness-audit/task-10-quiz-console.log`
  Commit: N | no commit

- [ ] 11. Audit public search and question discovery
  What to do / Must NOT do: Verify `/questions`, `/search`, and search API behavior, including empty query and `KVLE-0001` shortcut handling. Do not alter indexing config.
  Parallelization: Wave 3 | Blocked by: 1 | Blocks: final report
  References: `vet-exam-ai/app/questions/page.tsx`; `vet-exam-ai/app/questions/[id]/page.tsx`; `vet-exam-ai/app/search/page.tsx`; `vet-exam-ai/app/api/search/route.ts`; `vet-exam-ai/lib/search/*`; `vet-exam-ai/lib/seo.ts`
  Acceptance criteria: pages render; `/api/search?q=&limit=1` returns JSON without server error; a `KVLE-0001` search either redirects/resolves or reports a controlled no-result state.
  QA scenarios: happy = Browser use via Playwright: `page.goto("http://127.0.0.1:3000/questions"); page.screenshot({path: ".omo/evidence/beta-launch-readiness-audit/task-11-questions-page.png", fullPage: true}); page.goto("http://127.0.0.1:3000/search?q=KVLE-0001")`, PASS iff pages render without fatal errors, evidence `.omo/evidence/beta-launch-readiness-audit/task-11-search-page.png`; failure = `curl.exe -i "http://127.0.0.1:3000/api/search?q=&limit=1"`, PASS iff response is JSON and not `500`, evidence `.omo/evidence/beta-launch-readiness-audit/task-11-empty-search.http`
  Commit: N | no commit

- [ ] 12. Run public smoke suite against local server
  What to do / Must NOT do: Run the existing public smoke script against the local base URL; capture pass/fail. Do not change smoke expectations.
  Parallelization: Wave 3 | Blocked by: 1 | Blocks: final report
  References: `vet-exam-ai/scripts/smoke-public.cjs`; `vet-exam-ai/package.json`; `docs/operations/launch-smoke-test.md`
  Acceptance criteria: `npm run smoke:public -- --base-url http://127.0.0.1:3000` exits `0`, or report lists exact failing route/assertion.
  QA scenarios: happy = `powershell.exe -Command "npm run smoke:public -- --base-url http://127.0.0.1:3000"` from app root, PASS iff exit `0`, evidence `.omo/evidence/beta-launch-readiness-audit/task-12-smoke-public.log`; failure = if command fails, preserve the first failing route/status/body excerpt with secrets redacted, evidence `.omo/evidence/beta-launch-readiness-audit/task-12-smoke-failure.md`
  Commit: N | no commit

- [ ] 13. Audit admin-only pages and admin API denial paths
  What to do / Must NOT do: Verify unauthenticated denial for `/admin` and admin upload API; if seeded admin exists, verify admin success pages. Do not upload files or mutate storage.
  Parallelization: Wave 4 | Blocked by: 1, 3 | Blocks: final report
  References: `vet-exam-ai/app/admin/layout.tsx`; `vet-exam-ai/lib/admin/guards.ts`; `vet-exam-ai/app/api/admin/image-replacement/upload/route.ts`; `vet-exam-ai/app/admin/_components/admin-nav-items.ts`; `vet-exam-ai/app/admin/ops/page.tsx`
  Acceptance criteria: unauthenticated `/admin` redirects to login; unauthenticated admin upload returns `401`; admin success-path is verified or marked `RISK: missing seeded admin`.
  QA scenarios: happy = `curl.exe -i -X POST http://127.0.0.1:3000/api/admin/image-replacement/upload`, PASS iff HTTP status `401`, evidence `.omo/evidence/beta-launch-readiness-audit/task-13-admin-api-deny.http`; failure = Browser use unauthenticated `page.goto("http://127.0.0.1:3000/admin")`, PASS iff login redirect occurs and no admin content is visible, evidence `.omo/evidence/beta-launch-readiness-audit/task-13-admin-redirect.png`
  Commit: N | no commit

- [ ] 14. Audit cron authentication and cron route inventory
  What to do / Must NOT do: Verify unauthenticated cron routes reject and that Vercel config lists intended cron endpoints. Do not invoke cron with real bearer token unless an operator explicitly approves staging.
  Parallelization: Wave 4 | Blocked by: 3 | Blocks: final report
  References: `vet-exam-ai/vercel.json`; `vet-exam-ai/lib/cron/run.ts`; `vet-exam-ai/app/api/cron/comment-image-sweep/route.ts`; `vet-exam-ai/app/api/cron/signup-proof-purge/route.ts`; `docs/operations/operations-runbook.md`
  Acceptance criteria: `/api/cron/comment-image-sweep` and `/api/cron/signup-proof-purge` return `401` without bearer token; `vercel.json` schedules both expected endpoints.
  QA scenarios: happy = `curl.exe -i http://127.0.0.1:3000/api/cron/comment-image-sweep` and `curl.exe -i http://127.0.0.1:3000/api/cron/signup-proof-purge`, PASS iff both return `401`, evidence `.omo/evidence/beta-launch-readiness-audit/task-14-cron-deny.http`; failure = `powershell.exe -Command "Get-Content vercel.json | ConvertFrom-Json | Select-Object -ExpandProperty crons"`, PASS iff expected cron paths are present, evidence `.omo/evidence/beta-launch-readiness-audit/task-14-vercel-crons.json`
  Commit: N | no commit

- [ ] 15. Audit admin audit-log coverage surfaces
  What to do / Must NOT do: Review admin action/RPC audit coverage and run SQL audit coverage script if staging DB access exists. Do not perform admin mutations just to create audit rows.
  Parallelization: Wave 4 | Blocked by: 3 | Blocks: final report
  References: `vet-exam-ai/supabase/tests/admin-audit-coverage.sql`; `docs/operations/admin-audit-coverage.md`; `vet-exam-ai/lib/admin/audit.ts`; `vet-exam-ai/app/admin/audit/page.tsx`; `vet-exam-ai/lib/admin/triage.ts`
  Acceptance criteria: report lists audited admin action families and any uncovered admin mutation surfaces; SQL script passes or live DB proof is marked unavailable.
  QA scenarios: happy = `psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f vet-exam-ai/supabase/tests/admin-audit-coverage.sql`, PASS iff exit `0`, evidence `.omo/evidence/beta-launch-readiness-audit/task-15-admin-audit-sql.log`; failure = static command `rg -n "log_admin_action|audit_action|admin_audit|requireAdmin\\(|createAdminClient" vet-exam-ai/app/admin vet-exam-ai/app/api/admin vet-exam-ai/lib/admin vet-exam-ai/supabase/migrations`, PASS iff report identifies coverage gaps instead of assuming coverage, evidence `.omo/evidence/beta-launch-readiness-audit/task-15-admin-audit-static.log`
  Commit: N | no commit

- [ ] 16. Audit question-bank copyright and image safeguards statically and with dry runs
  What to do / Must NOT do: Verify pipeline and DB safeguards for rewritten text, inactive image rows, private original image storage, public replacement images, and copyright-safe public IDs. Do not upload anything.
  Parallelization: Wave 5 | Blocked by: none | Blocks: final report
  References: `pipeline/README.md`; `pipeline/upload.py`; `pipeline/upload_images.py`; `pipeline/_storage_key.py`; `docs/operations/question-bank-pipeline.md`; `ROADMAP.md`; `vet-exam-ai/supabase/migrations/20260428000000_questions_public_id.sql`; `vet-exam-ai/supabase/migrations/20260506000000_image_triage.sql`; `vet-exam-ai/supabase/migrations/20260507000000_image_replacement.sql`; `pipeline/AGENTS.md`
  Acceptance criteria: report proves intended safeguards exist or flags gaps: `public_id`, `is_active=false` for image rows, private `question-images-private`, replacement image workflow, dry-run discipline, no raw private assets committed.
  QA scenarios: happy = `powershell.exe -Command "rg -n \"public_id|copyright-safe|question-images-private|question-images-public|is_active.*false|has_image|dry-run|source.*past_exam\" pipeline docs vet-exam-ai/supabase/migrations vet-exam-ai/app/api/questions/route.ts"`, PASS iff report maps each safeguard to evidence, evidence `.omo/evidence/beta-launch-readiness-audit/task-16-copyright-static.log`; failure = `powershell.exe -Command "git ls-files raw-exams pipeline/output vet-exam-ai/public/legal docs/public | Sort-Object"`, PASS iff no raw exam/pipeline output assets are tracked and legal docs are listed for sync check, evidence `.omo/evidence/beta-launch-readiness-audit/task-16-raw-asset-scan.log`
  Commit: N | no commit

- [ ] 17. Check public legal-copy sync and live question-data residual risk
  What to do / Must NOT do: Compare public policy source docs to app-served copies and, if staging DB is available, sample question rows for traceability/copyright-risk fields. Do not export raw question text into evidence; use counts/hashes/redacted excerpts only.
  Parallelization: Wave 5 | Blocked by: 3, 16 | Blocks: final verification
  References: `docs/README.md`; `docs/public/*`; `vet-exam-ai/public/legal/*`; `vet-exam-ai/lib/legal/documents.ts`; `docs/operations/question-bank-pipeline.md`; `pipeline/upload.py`; `vet-exam-ai/lib/supabase/types.ts`
  Acceptance criteria: byte comparisons for public docs pass; live/staging data sampling either proves no obvious original-image/source-text exposure indicators or records `RISK: live data not sampled`.
  QA scenarios: happy = `fc.exe /b docs\public\terms-of-service.md vet-exam-ai\public\legal\terms-of-service.md` plus privacy and community-guidelines equivalents, PASS iff all byte comparisons match, evidence `.omo/evidence/beta-launch-readiness-audit/task-17-legal-sync.log`; failure = staging SQL/API sample that returns only aggregate counts for `source`, `is_active`, image-file columns, `public_id` nulls, and traceability fields, PASS iff report contains counts not raw question bodies, evidence `.omo/evidence/beta-launch-readiness-audit/task-17-question-sampling.md`
  Commit: N | no commit

- [ ] 18. Synthesize beta-readiness report with findings-first review format
  What to do / Must NOT do: Produce the final audit report from all evidence. Lead with blocking findings ordered by severity, then residual risks, then passed checks. Do not smooth over unavailable live checks.
  Parallelization: Final synthesis | Blocked by: 1-17 terminal states | Blocks: final verification wave
  References: all evidence artifacts; user objective; this plan; `docs/operations/production-readiness-checklist.md`; `docs/operations/launch-smoke-test.md`
  Acceptance criteria: `.omo/reports/beta-launch-readiness-audit.md` exists and includes: overall verdict, severity-ordered findings, per-scope checklist, commands run, evidence paths, unavailable prerequisites, no product-code modifications, and clear beta-go/no-go recommendation.
  QA scenarios: happy = `powershell.exe -Command "Test-Path .omo/reports/beta-launch-readiness-audit.md; rg -n \"Overall Verdict|Auth|Supabase|CI|Public quiz|Admin|Copyright|Evidence|Residual risk\" .omo/reports/beta-launch-readiness-audit.md"`, PASS iff all required sections are present, evidence `.omo/evidence/beta-launch-readiness-audit/task-18-report-shape.log`; failure = `git diff --name-only -- ':!/.omo/**'`, PASS iff empty, proving no product-code edits occurred, evidence `.omo/evidence/beta-launch-readiness-audit/task-18-no-product-diff.log`
  Commit: N | no commit

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: verify every task has references, acceptance criteria, exact QA invocation, evidence path, and commit line; command `powershell.exe -Command "$patterns = @([char]60 + '...', [char]60 + 'title' + [char]62, [char]60 + 'fill', 'task-' + [char]60 + 'N' + [char]62, 'TO' + 'DO'); foreach ($p in $patterns) { rg -n --fixed-strings $p .omo/plans/beta-launch-readiness-audit.md }"` must return no unresolved placeholders.
- [ ] F2. Code/product-scope review: verify no product files changed; command `git diff --name-only -- ':!/.omo/**'` must be empty and `git status --short` must show only `.omo/` planning/evidence/report artifacts.
- [ ] F3. Real manual QA audit: verify report evidence includes at least one command or browser/API artifact per requested focus area: auth, Supabase security boundaries, CI, public quiz flow, admin-only routes, and question-bank copyright safeguards.
- [ ] F4. Scope fidelity: verify final report states no product code modifications, no legal clearance claim, no secret leakage, and all unavailable live-secret/seed-account checks as residual risks.

## Commit strategy
- Do not auto-commit. User asked for an audit without product-code modification, not a commit.
- If the user later asks to commit planning/audit artifacts, use one docs-style commit: `docs(audit): add beta launch readiness audit plan` for `.omo/plans`, `.omo/drafts`, evidence, and report artifacts only.
- Never include secrets, raw private source material, screenshots with credentials, cookies, or original exam assets in a commit.

## Success criteria
- The final report proves every requested focus area was audited or explicitly marks the exact prerequisite that prevented proof.
- The audit includes current-state evidence from files, commands, HTTP responses, browser screenshots/logs, and SQL/static checks where appropriate.
- No product code, migration, config, package, pipeline, legal public docs, or app assets are modified.
- All evidence is stored under `.omo/evidence/beta-launch-readiness-audit/`.
- Final findings are ordered by severity and distinguish blocking beta risks from residual/unverified risks.
- Secret and private-content scan of `.omo/evidence/beta-launch-readiness-audit/` has no matches for raw secrets or private source assets.
