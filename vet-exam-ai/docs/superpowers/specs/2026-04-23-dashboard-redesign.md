# Dashboard Redesign Spec
**Date:** 2026-04-23
**Route:** `/dashboard` (stats hub) + new `/quiz` (quiz session)

## Goal
Replace the current `/dashboard` quiz-launcher with a rich stats overview page. Move the existing quiz session to `/quiz`.

## Routes

| Route | Before | After |
|---|---|---|
| `/dashboard` | Embedded quiz session | Stats overview hub |
| `/quiz` | Does not exist | Quiz session (moved verbatim) |

NavBar logo link stays `/dashboard`.

## Dashboard Page Structure (top → bottom)

### 1. Header
- Eyebrow label: "오늘의 학습"
- H1 serif: "어제보다 N문제 더 맞혔습니다" (N derived from today vs yesterday attempt delta; hidden if 0)
- Sub line: "{dueReview}개 문제가 복습을 기다립니다 · 연속 {streak}일째 학습 중"

### 2. Stat Strip (4 cards, responsive grid)
| Label | Value | Accent | Hint |
|---|---|---|---|
| 총 시도 | `stats.totalAttempts` | No | — |
| 정답률 | `stats.accuracy%` | Yes (teal) | — |
| 복습 대기 | `dueCount` | No | — |
| 최약 과목 | weakest.category | No | `{weakest.accuracy}%` |

### 3. Memory Curve Card (full-width, teal top border)
- Title: "KVLE는 잊기 직전에 문제를 다시 보여드립니다"
- Sub: "D+1, D+3, D+7 세 번의 복습으로 기억 유지율이 84%까지 상승합니다."
- Right stat: "현재 유지율 84%"
- SVG: exact MemoryCurve math from screen-dashboard.jsx (naked curve red dashed, SRS sawtooth teal, review markers at D+1/3/7)

### 4. Two-Column Row
**Left — Subject bars card:**
- Label: "과목별 숙련도" / H3: "현재 정답률"
- "목표 70% ─" right-aligned hint
- Renders top 5 `byCategory` entries with: colored dot, name, 약점 red pill (< 70%), progress bar with 70% threshold line, accuracy % + correct/total

**Right — CTA stack (3 buttons):**
1. Gradient teal: "지금 할 것 · 복습 {dueCount}문제 →" → `/review`
2. Surface border: "약점 집중 · {weakest.category} N문제" → `/practice/weakest`
3. Ghost: "랜덤 세션 · 새 문제 30개" → `/quiz`

### 5. Week-at-a-Glance Bar Chart
- 7 columns (Mon–Sun), teal bars, height = attempt count, opacity = accuracy
- Data: derived from `recentAttempts` grouped by day; fallback to static prototype data

## Data Sources

| Field | Source | Fallback |
|---|---|---|
| totalAttempts, accuracy, byCategory, recentAttempts | `useStats(userId, authLoading)` | 312, 74.3%, prototype |
| dueCount | `useDueCountCtx()` | 6 |
| weakest | `findWeakestCategory(byCategory)` | 약리학 · 61.5% |
| yesterday delta | group `recentAttempts` by date | 0 (header hidden) |
| streak | count consecutive days in `recentAttempts` | 1 |
| weekly chart | group `recentAttempts` by weekday | static prototype |

## New Components (all in `app/dashboard/page.tsx`)
- `MemoryCurve` — SVG, no props needed, computes paths inline
- `StatCard({ label, value, unit?, accent?, hint? })` — stat strip card
- `SubjectBars({ byCategory })` — proficiency bars
- `WeekChart({ recentAttempts })` — 7-day bar chart

## CSS Additions (`globals.css`)
- `.dashboard-2col` — `1fr` mobile → `1.2fr 0.8fr` at 900px breakpoint

## Subject Colors
Fixed palette (index-mapped):
```
0: #1ea7bb (teal)
1: #4A7FA8 (blue)
2: #C8895A (amber)
3: #2D9F6B (correct/green)
4: #9B6FD4 (purple)
```

## Auth States
- Loading: centered `<LoadingSpinner />`
- Unauthenticated: redirect to `/auth/login` (or show login prompt card)
- No data yet: show dashboard with fallback zeros + onboarding hint
- Authenticated + data: full dashboard

## Files Changed
1. `app/dashboard/page.tsx` — replaced with new stats hub
2. `app/quiz/page.tsx` — new file, quiz session moved from old dashboard
3. `app/globals.css` — add `.dashboard-2col`
