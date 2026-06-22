# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-22
**Commit:** 057dfed
**Branch:** main

## OVERVIEW
KVLE is a veterinary licensing exam study platform: official question bank, SRS review, wrong-note tracking, statistics, and community discussion. The workspace is an umbrella repo; the runnable Next.js app is nested in `vet-exam-ai/`.

## STRUCTURE
```text
./
|-- vet-exam-ai/          # Next.js 16 App Router app; run npm commands here
|-- pipeline/             # Python/PowerShell question-bank processing tools
|-- docs/                 # public policy sources and internal operations docs
|-- supabase/             # legacy root schema/migrations; do not add new migrations here
|-- raw-exams/            # source exam material by subject
|-- PRD.md                # product requirements and positioning
`-- ROADMAP.md            # feature and launch roadmap
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| App development | `vet-exam-ai/` | Actual package root with `package.json` and lockfile |
| Routes/pages/API | `vet-exam-ai/app/` | App Router route tree |
| Shared UI | `vet-exam-ai/components/` | Reusable client/server components by feature |
| Domain logic | `vet-exam-ai/lib/` | Supabase, auth, questions, comments, search, admin helpers |
| Active DB migrations | `vet-exam-ai/supabase/migrations/` | New SQL migrations go here only |
| Legacy DB snapshot | `supabase/` | Historical root schema/migrations; guarded by `check:migrations` |
| Content pipeline | `pipeline/` | Intake, rewrite, normalization, upload scripts |
| Public legal docs | `docs/public/` | Must be copied to `vet-exam-ai/public/legal/` in the same change |
| Operations runbooks | `docs/operations/` | Internal checks, launch, RLS, Sentry, moderation |

## CODE MAP
TypeScript LSP was not active in this session; map below is based on file layout, scripts, and targeted search.

| Surface | Location | Role |
|---------|----------|------|
| Next app shell | `vet-exam-ai/app/layout.tsx` | Root metadata, providers, global chrome |
| Landing route | `vet-exam-ai/app/page.tsx` | Primary public entry |
| API routes | `vet-exam-ai/app/api/` | Search, questions, cron, comments, notifications, profile |
| Admin routes | `vet-exam-ai/app/admin/` | Operational dashboards and moderation/admin actions |
| Supabase clients | `vet-exam-ai/lib/supabase/` | Browser/server/service-role client boundaries |
| Sanitizers | `vet-exam-ai/lib/*/sanitize.ts` | Allowlist HTML rendering for UGC and search/legal output |
| Migration guard | `vet-exam-ai/scripts/check-migrations.cjs` | Enforces active migration directory and timestamp policy |

## CONVENTIONS
- Run app commands from `vet-exam-ai/`, not the workspace root.
- Use `npm`; CI uses `npm ci` with `vet-exam-ai/package-lock.json`.
- Canonical verification order: `npm run check:migrations`, `npm run lint`, `npm run typecheck`, `npm run build`.
- Keep the official-content layer and community-content layer distinct in UI, policy, and data changes.
- Treat `docs/public` as the source for public legal/policy text and `docs/operations` as internal-only.

## ANTI-PATTERNS (THIS PROJECT)
- Do not create new migrations under root `supabase/migrations/`; use `vet-exam-ai/supabase/migrations/`.
- Do not expose service-role Supabase usage to browser-shipped code.
- Do not render untrusted HTML unless it has passed through the local sanitizer helper for that domain.
- Do not set `NEXT_PUBLIC_INDEXING_ENABLED=true` for preview, staging, or closed beta.
- Do not log raw secrets, reset links, signup proof paths, service-role responses, or cron secrets.

## COMMANDS
```bash
cd vet-exam-ai
npm install
npm run dev
npm run ci
npm run smoke:public
```

## NOTES
- GitHub Actions runs from `vet-exam-ai/`, Node 22, with placeholder Supabase/cron env.
- `SENTRY_AUTH_TOKEN` is optional and only needed for source-map upload.
- `vercel.json` schedules `/api/cron/comment-image-sweep` and `/api/cron/signup-proof-purge`; cron routes must reject unauthenticated requests.
- The repo contains generated/local directories such as `.next`, `node_modules`, `.vercel`, `.uv-cache`, and pipeline outputs; do not infer source ownership from generated artifacts.
