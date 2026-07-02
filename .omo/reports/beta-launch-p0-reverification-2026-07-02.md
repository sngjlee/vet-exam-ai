# Beta-Launch P0 Re-Verification

Date: 2026-07-02
Branch: `codex/init-deep-agents`
Supersedes verdict in: `.omo/reports/beta-launch-readiness-audit.md` (2026-06-23, NO-GO)
Prior priorities: `.omo/reports/next-session-beta-launch-priorities.md`

## New Verdict

**GO (conditional).** All four P0 blockers from the 2026-06-23 audit re-verified as **PASS** against a live Supabase instance with network access on Linux (WSL). The original P0 failures were **environment artifacts of the audit run**, not product defects.

Remaining conditions are P1/quality items (below), none of which block a closed beta.

## Environment For This Run

- Live Supabase connected via `.env.local` (REST `/questions` → 200; 2,835 active questions reachable by anon).
- Next.js dev server started on `http://127.0.0.1:3000`; production `npm run ci` run to completion.
- Platform note: the working tree lives on a Windows-mounted path (`/mnt/c`) with **Windows** native binaries. Running under WSL first failed with `Cannot find module '../lightningcss.linux-x64-gnu.node'`. Linux native binaries (`lightningcss-linux-x64-gnu`, `@tailwindcss/oxide-linux-x64-gnu`, `@next/swc-linux-x64-gnu`) were installed with `--no-save --no-package-lock`; `package.json`/`package-lock.json` were restored afterward (only CRLF→LF churn, no content change). No product code, migrations, or committed manifests were changed.

## P0 Re-Verification Results

| # | 2026-06-23 P0 finding | 2026-07-02 result | Verdict |
|---|---|---|---|
| 1 | `/api/questions` returns 500 (meta, session, clamp, invalid-id) | `meta=1`→200; `session=1&count=5`→5 rows, 0 inactive; `session=1&count=999`→**clamped to 50**, 0 inactive; `id=does-not-exist`→**404 `{"error":"Question not found"}`** | PASS |
| 2 | `/quiz` cannot start | Anonymous `/quiz`→200, renders question + choices UI; session question carries `choices`, `answer`, `explanation` | PASS |
| 3 | `npm run smoke:public` fails | **15/15 ok** against `http://127.0.0.1:3000` | PASS |
| 4 | Production build fails (`next/font` Google Fonts fetch) | `npm run ci` (check:migrations + lint + typecheck + build) → **exit 0**; build compiled + route table generated | PASS |
| P1 | `/questions`, `/search` redirect anon to login | Anon `/questions`→200, `/search?q=KVLE-0001`→200, `/api/search?q=&limit=1`→200; `/dashboard`,`/admin`→307 login (protection intact) | PASS (public discovery now intentional) |

Root cause of original P0s: audit ran without live Supabase (→ API 500 / quiz empty / smoke fail) and without network for Google Fonts (→ build fail). None reproduce in a properly provisioned environment.

## Residual Items (non-blocking, tracked)

1. **P1 — internal id exposure (copyright traceability).** Public `/api/questions` returns `publicId` (e.g. `KVLE-1219`) **and** internal `id` (e.g. `3.5_산과_63회_q011`), which leaks source exam round + subject. → move public surfaces to `publicId` only.
2. **Content quality — choice-count anomalies.** In a 1,000-row sample of active questions: 5 choices = 988, 4 = 7, 6 = 5 (~1.2%; est. ~34 of 2,835). → add `choices.length === 5` gate to upload validation and fix outliers.
3. **P1 — live security proof still pending.** Anon RLS works, but `attempts`/`wrong_notes` RLS regression coverage and seeded-account (pending/rejected/approved/admin) auth QA were not run (need staging DB + seed accounts).
4. **Minor.** 2 eslint warnings (unused `eslint-disable` in opengraph-image files). Optional: self-host IBM Plex Mono via `localFont` for offline build reproducibility.

## Required Before Full Public Launch (carry-over, not beta blockers)

- Resolve residual item 3 (live RLS + seeded-account QA).
- Resolve residual items 1 and 2 for content-safety/quality posture.
