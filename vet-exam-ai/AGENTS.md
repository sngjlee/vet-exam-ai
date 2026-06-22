# APP KNOWLEDGE BASE

## OVERVIEW
`vet-exam-ai/` is the runnable Next.js 16 App Router application for KVLE.

## STRUCTURE
```text
vet-exam-ai/
|-- app/                  # App Router routes, route handlers, server actions
|-- components/           # Shared UI components
|-- lib/                  # Domain services, hooks, schemas, Supabase clients
|-- public/legal/         # Deployed copies of public policy markdown
|-- scripts/              # CI, smoke, migration and seeding scripts
|-- supabase/             # Active migrations and SQL test fixtures
`-- docs/superpowers/     # Historical specs/plans; use as context, not source of truth
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Package scripts | `package.json` | `ci` chains migration check, lint, typecheck, build |
| Runtime config | `next.config.ts` | Supabase image patterns, Sentry tunnel/source-map behavior |
| Lint config | `eslint.config.mjs` | `react-hooks/set-state-in-effect` is intentionally disabled |
| Deployment cron | `vercel.json` | Scheduled cleanup endpoints |
| Sentry setup | `instrumentation*.ts`, `sentry.*.config.ts` | DSN-driven and safe to build without DSN |
| Smoke checks | `scripts/smoke-public.cjs` | Defaults base URL from env, then localhost |

## CONVENTIONS
- Use `npm`, not another package manager.
- Run `npm run ci` before handing off broad app changes.
- Use `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_INDEXING_ENABLED`, and `NEXT_PUBLIC_SENTRY_DSN` as the documented env surface.
- Keep `NEXT_PUBLIC_INDEXING_ENABLED=false` outside public production launch.
- Source public policy changes in `../docs/public` and update `public/legal` copies in the same commit.
- Treat `docs/superpowers` as historical implementation notes; confirm against live code before following a plan there.

## ANTI-PATTERNS
- Do not delete or broaden the lint exception in `eslint.config.mjs` without refactoring the affected hydration/storage/auth effects.
- Do not change the Sentry tunnel route casually; the opaque route is intentional.
- Do not make `smoke:public` depend on local-only secrets; it covers unauthenticated public and rejection paths.
- Do not put app-specific guidance at workspace root if it belongs in this app subtree.

## COMMANDS
```bash
npm run dev
npm run check:migrations
npm run lint
npm run typecheck
npm run build
npm run smoke:public
```
