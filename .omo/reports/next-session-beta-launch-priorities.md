# Next Session: Beta Launch Priorities

Date: 2026-06-23
Branch: `codex/init-deep-agents`
Audit report: `.omo/reports/beta-launch-readiness-audit.md`

## Current Verdict

Beta launch is **NO-GO** until the P0 blockers below are fixed and re-verified. The audit package itself was final-gate approved; the product was not changed during the audit.

## Start Here

1. Fix `/api/questions` returning `500`.
   - Evidence: `.omo/evidence/beta-launch-readiness-audit/task-9-questions-session.json`
   - Evidence: `.omo/evidence/beta-launch-readiness-audit/task-9-invalid-id.http`
   - Expected: `meta=1`, `session=1&count=5`, `session=1&count=999`, and invalid ID should return controlled JSON/statuses. Invalid ID should not be a `500`.
   - Likely impact: unblocks `/quiz` and `npm run smoke:public`.

2. Re-test anonymous `/quiz` after question API fix.
   - Evidence: `.omo/evidence/beta-launch-readiness-audit/task-10-quiz-console.log`
   - Expected: anonymous user can start a practice session, see a question with choices, select one answer, and see answer/explanation UI.

3. Re-run public smoke.
   - Command from app root: `npm run smoke:public -- --base-url http://127.0.0.1:3000`
   - Evidence: `.omo/evidence/beta-launch-readiness-audit/task-12-smoke-public.log`
   - Previous first failure: questions API session sample returned `500`.

4. Fix local production build reproducibility.
   - Evidence: `.omo/evidence/beta-launch-readiness-audit/task-1-ci-risk.md`
   - Previous failure: `next/font` could not fetch `IBM Plex Mono` from Google Fonts.
   - Expected: `npm run build` exits `0` without relying on an unavailable font fetch path.

5. Decide public discovery policy, then align routes/tests.
   - Evidence: `.omo/evidence/beta-launch-readiness-audit/task-11-done-claim.json`
   - Previous behavior: `/questions` and `/search?q=KVLE-0001` redirected anonymous users to login, while public audit expectations treated them as public discovery.
   - Expected: either make these public or update smoke/product policy so the redirect is intentional.

## Next After P0

6. Sync privacy policy public copy.
   - Evidence: `.omo/evidence/beta-launch-readiness-audit/task-17-legal-sync.log`
   - Drift: `docs/public/privacy-policy.md` differs from `vet-exam-ai/public/legal/privacy-policy.md`.

7. Add or run live security proof prerequisites.
   - Seeded accounts needed: pending-proof, pending-review, rejected, approved non-admin, active admin.
   - Staging DB needed: approved `DATABASE_URL` for RLS and admin-audit SQL.
   - Evidence: `.omo/evidence/beta-launch-readiness-audit/task-6-authenticated-flow.md`
   - Evidence: `.omo/evidence/beta-launch-readiness-audit/task-8-coverage-gap.md`
   - Evidence: `.omo/evidence/beta-launch-readiness-audit/task-15-admin-audit-assessment.md`

8. Tighten question-bank copyright safeguards.
   - Evidence: `.omo/evidence/beta-launch-readiness-audit/task-16-safeguards-assessment.md`
   - Gaps: `upload.py --dry-run` can print a full first-row payload; public API still exposes/falls back to internal `id`; image filename safety relies on triage.

## Useful Verification Order

From `vet-exam-ai/`:

```powershell
npm run check:migrations
npm run lint
npm run typecheck
npm run build
npm run smoke:public -- --base-url http://127.0.0.1:3000
```

Before claiming beta readiness, also rerun targeted HTTP/browser checks for:

- `/api/questions?meta=1`
- `/api/questions?session=1&count=999`
- `/api/questions?id=does-not-exist`
- `/quiz`
- `/questions`
- `/search?q=KVLE-0001`
- `/api/admin/image-replacement/upload` unauthenticated denial
- `/api/cron/comment-image-sweep` and `/api/cron/signup-proof-purge` unauthenticated denial

