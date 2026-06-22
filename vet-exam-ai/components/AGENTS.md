# COMPONENTS KNOWLEDGE BASE

## OVERVIEW
`components/` holds reusable UI pieces shared by routes: navigation, questions, sessions, comments, board, dashboard, notifications, legal pages, and dialogs.

## STRUCTURE
```text
components/
|-- board/                # Board post/comment cards, composer, votes, reports
|-- comments/             # Comment thread UI, composer, image attachments, menus
|-- dashboard/            # Dashboard banners/widgets
|-- notifications/        # Notification bell, dropdown, item rendering
`-- *.tsx                 # Cross-feature components used by study and legal flows
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Navigation | `NavBar.tsx`, `ConditionalNavBar.tsx` | Auth-aware shell controls |
| Question UI | `QuestionCard.tsx`, `QuestionReadOnly.tsx`, `QuestionImageGallery.tsx` | Study and read-only surfaces |
| Session UI | `SessionSetup.tsx`, `SessionProgress.tsx`, `SubjectChipGroup.tsx` | Quiz/review setup and progress |
| UGC UI | `comments/**`, `board/**` | Uses sanitized HTML from domain data |
| Operations UI | `dashboard/**`, `notifications/**` | User-facing status and update surfaces |

## CONVENTIONS
- Prefer domain helpers from `lib/` for labels, permissions, sanitization, and formatting.
- Keep client components explicit with `"use client"` only when hooks, browser APIs, or event handlers require it.
- Use existing interaction patterns: compact buttons, dialogs for confirmation, feature-specific subfolders.
- Treat HTML props as already sanitized domain output; do not add new raw HTML paths here.
- Keep Korean product copy consistent with the route/domain source that owns the feature.

## ANTI-PATTERNS
- Do not fetch privileged data directly from reusable components.
- Do not duplicate board/comment rendering logic across feature folders.
- Do not call `localStorage` or `window` from components that are not client components.
- Do not make component changes that require a route behavior change without updating the route or `lib` owner too.
