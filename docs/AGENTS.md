# DOCS KNOWLEDGE BASE

## OVERVIEW
`docs/` separates public policy source documents from internal operations runbooks.

## STRUCTURE
```text
docs/
|-- public/               # User-facing policy source markdown
`-- operations/           # Internal runbooks, checklists, incident/launch procedures
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Terms | `public/terms-of-service.md` | Also rendered from app copy at `/terms` |
| Privacy | `public/privacy-policy.md` | Also rendered from app copy at `/privacy` |
| Community rules | `public/community-guidelines.md` | Also rendered from app copy at `/community-guidelines` |
| Launch checks | `operations/production-readiness-checklist.md`, `operations/launch-smoke-test.md` | Pre-public and smoke flow |
| Runtime operations | `operations/operations-runbook.md` | Env, cron, Sentry, incident notes |
| DB/security | `operations/migration-runbook.md`, `operations/rls-permission-regression.md` | Migration and permissions workflow |
| UGC operations | `operations/moderation-playbook.md`, `operations/comment-image-attachments.md`, `operations/community-comment-seeding.md` | Community operations |

## CONVENTIONS
- Public docs in `docs/public` must stay synchronized with `vet-exam-ai/public/legal`.
- Internal operations docs must not be linked as public app pages.
- Keep sensitive values out of screenshots, examples, logs, and runbook transcripts.
- Update operations docs in the same change that alters env requirements, service-role usage, cron behavior, Sentry behavior, or public launch gating.
- Keep legal/policy copy precise; avoid mixing internal implementation notes into public documents.

## ANTI-PATTERNS
- Do not update only the app copy of a public legal document.
- Do not place incident-only or operator-only instructions under `docs/public`.
- Do not document secrets, reset links, signup proof paths, or service-role payloads verbatim.
- Do not let migration instructions point at the legacy root migration directory.
