# ROUTE TREE KNOWLEDGE BASE

## OVERVIEW
`app/` contains the App Router route tree, API handlers, route-local server actions, metadata, and Open Graph image routes.

## STRUCTURE
```text
app/
|-- api/                  # JSON/cron/upload/comment/notification/profile handlers
|-- admin/                # Admin operations, moderation, audit, user management
|-- auth/                 # Login, callback, signup proof, reset, pending states
|-- board/                # Announcement/suggestion board routes and actions
|-- questions/            # Question list/detail pages and OG images
|-- search/               # Search layout/page
|-- layout.tsx            # Root shell
`-- page.tsx              # Public landing route
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Global shell | `layout.tsx` | Metadata, providers, nav, root script injection |
| Public discovery | `page.tsx`, `robots.ts`, `opengraph-image.tsx` | SEO and launch-indexing behavior |
| Admin flows | `admin/**` | Server-heavy routes with guards, audit, table filters |
| Auth gating | `auth/**`, `profile/**`, `settings/**` | Signup proof, reset, account management |
| Community | `comments/**`, `board/**`, `api/comments/**` | UGC, reports, votes, pins, images |
| Study flows | `quiz/`, `review/`, `wrong-notes/`, `my-stats/`, `questions/` | Core exam practice surfaces |

## CONVENTIONS
- Keep server actions route-local when they primarily support one route family.
- Read URL search params through small parse helpers for admin/filter-heavy pages.
- API/cron routes that mutate data should authenticate first and return explicit 401/403 for rejection paths.
- Use existing domain helpers from `lib/` instead of embedding Supabase or sanitizer logic inside route components.
- Open Graph image routes are server-only; keep their data fetching bounded and metadata-safe.

## ANTI-PATTERNS
- Do not import `lib/supabase/admin.ts` or service-role helpers into files that can ship to the browser.
- Do not access `window`, `localStorage`, or `sessionStorage` from server components or route handlers.
- Do not render UGC HTML directly in route components; render sanitized fields or call the domain sanitizer first.
- Do not rely on preview deployments being indexable; `robots.ts` follows `NEXT_PUBLIC_INDEXING_ENABLED`.
