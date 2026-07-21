# KVLE App

Next.js App Router application for the KVLE veterinary exam learning platform.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Required Environment

Use real values in `.env.local`, Vercel Preview, and Vercel Production.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_INDEXING_ENABLED=
NEXT_PUBLIC_SENTRY_DSN=
OPENAI_API_KEY=
AI_COMMENT_GENERATION_ENABLED=false
AI_COMMENT_MODEL=gpt-5.6-terra
AI_COMMENT_PROMPT_VERSION=v1
AI_COMMENT_DAILY_LIMIT=5
AI_COMMENT_MONTHLY_REQUEST_LIMIT=150
AI_COMMENT_PENDING_LIMIT=50
AI_COMMENT_MAX_OUTPUT_TOKENS=800
```

Set `NEXT_PUBLIC_INDEXING_ENABLED=true` only for the public production launch. Keep it `false` for Preview, staging, and closed beta deployments. `NEXT_PUBLIC_SENTRY_DSN` is recommended for operations, but the app can build without it. `SENTRY_AUTH_TOKEN` is optional and only needed when uploading source maps.

`OPENAI_API_KEY` is server-only and is required only for live candidate generation. Never use a `NEXT_PUBLIC_` prefix. The default `AI_COMMENT_GENERATION_ENABLED=false` supports build, tests, and disabled deployment without a key.

## Verification

```bash
npm run check:migrations
npm run lint
npm run typecheck
npm run build
```

`npm run ci` runs all checks in the same order as GitHub Actions.

## Operations

- Admin health checks: `/admin/ops`
- Sentry smoke test: `/admin/sentry-test`
- Runbook: `../docs/operations/operations-runbook.md`
- Production checklist: `../docs/operations/production-readiness-checklist.md`
- RLS regression matrix: `../docs/operations/rls-permission-regression.md`
- Sentry event quality: `../docs/operations/sentry-event-quality.md`
- Admin audit coverage: `../docs/operations/admin-audit-coverage.md`
- Data retention schedule: `../docs/operations/data-retention-schedule.md`
- Search v1 operations: `../docs/operations/search-v1.md`
- Comment image attachments: `../docs/operations/comment-image-attachments.md`
- Question bank pipeline: `../docs/operations/question-bank-pipeline.md`
- Community comment seeding: `../docs/operations/community-comment-seeding.md`
- AI comment candidate rollout: `../docs/operations/ai-comment-generation.md`
- Migration runbook: `../docs/operations/migration-runbook.md`
## AI Comment Candidate Operations

1. Apply the candidate/reservation migration first, deploy with `AI_COMMENT_GENERATION_ENABLED=false`, and verify `/admin/ops` shows only key presence, model, enabled state, daily/monthly/pending counters, latest aggregate, and cap reason.
2. After explicit operator approval, run one authenticated staging Cron smoke. It must create one private candidate and zero public comments.
3. In `/admin/ai-comments`, reject one test candidate and verify zero comments; approve a separate candidate and verify exactly one public comment under the selected seed nickname. Double approval must not duplicate it.
4. Enable the Production schedule only after browser visual QA, administrator/non-administrator access checks, Vercel Cron plan/count checks, and the OpenAI project USD 5 budget/alerts are complete.
5. On `daily_cap` or `monthly_cap`, wait for the next UTC period. On `pending_cap`, process the approval queue. Do not automatically retry failed reservations or raise limits before checking cost and queue pressure.
6. For rollback, set `AI_COMMENT_GENERATION_ENABLED=false` and suspend only the AI candidate Cron if needed. Do not disable privacy cleanup Cron jobs, auto-publish pending candidates, or auto-delete approved comments.
7. For provider support, retrieve the request ID and UTC timestamp only from restricted internal candidate provenance. Never expose request IDs or keys on `/admin/ops`, Sentry, public APIs, or public tickets; omit prompt/response and question/comment content from support requests.
