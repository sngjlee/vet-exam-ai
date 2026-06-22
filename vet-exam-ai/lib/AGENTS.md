# LIB KNOWLEDGE BASE

## OVERVIEW
`lib/` is the domain and integration layer for KVLE: Supabase clients, schemas, sanitizers, hooks, storage, cron helpers, search, questions, comments, admin, and profile logic.

## STRUCTURE
```text
lib/
|-- supabase/             # client/server/admin clients plus generated types
|-- comments/             # comment schemas, list logic, sanitization, moderation helpers
|-- board/                # board labels, storage keys, post sanitization
|-- questions/            # question bank access, filters, categories, formatting
|-- hooks/                # client hooks for auth, questions, review, stats, search
|-- admin/                # admin labels, guards, audit, triage helpers
|-- search/               # query parsing, recent searches, ts_headline sanitization
|-- cron/                 # cron auth/run helpers
`-- legal/                # markdown loading/sanitized legal document output
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Privileged Supabase | `supabase/admin.ts` | Server-only service-role entry point |
| SSR/browser clients | `supabase/server.ts`, `supabase/client.ts` | Keep client boundary explicit |
| Sanitized HTML | `comments/sanitize.ts`, `board/sanitize.ts`, `search/sanitize.ts`, `legal/documents.ts` | Domain-specific allowlists |
| Question flows | `questions/**`, `attempts/**`, `wrongNotes/**`, `review/**` | Study state and SRS behavior |
| Client state | `hooks/**`, `context/**` | Several hooks initialize from storage/auth/URL in effects |
| Cron auth | `cron/run.ts` | Bearer token check against `CRON_SECRET` |

## CONVENTIONS
- Add shared behavior here only when at least two routes/components need the boundary.
- Keep schemas and parser helpers near the domain that owns the payload.
- Update `supabase/types.ts` when migrations change generated DB shape.
- Use sanitizer wrappers as the only path into `dangerouslySetInnerHTML`.
- Keep service-role responses server-side and strip sensitive metadata before returning UI state.

## ANTI-PATTERNS
- Do not import `supabase/admin.ts` into `"use client"` modules.
- Do not bypass `cron/run.ts` for cron authentication.
- Do not duplicate category/subject labels in components when `lib` already owns them.
- Do not replace the storage/auth initialization pattern with server-only assumptions; guest-to-member migration is part of the product.
