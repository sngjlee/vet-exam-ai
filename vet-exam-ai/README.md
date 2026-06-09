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
```

Set `NEXT_PUBLIC_INDEXING_ENABLED=true` only for the public production launch. Keep it `false` for Preview, staging, and closed beta deployments. `NEXT_PUBLIC_SENTRY_DSN` is recommended for operations, but the app can build without it. `SENTRY_AUTH_TOKEN` is optional and only needed when uploading source maps.

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
- Migration runbook: `../docs/operations/migration-runbook.md`
