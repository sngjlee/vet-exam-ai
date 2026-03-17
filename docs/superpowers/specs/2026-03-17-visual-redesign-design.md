# 수의국시 — Full Visual Redesign & Korean Localization

**Date:** 2026-03-17
**Scope:** Full visual redesign of all UI pages + complete Korean localization
**App Name:** 수의국시 (KVLE 기반 스마트 학습 시스템)

---

## Aesthetic Direction: "수험서" (Exam Prep Book)

Dark, dense, gold-accented. Inspired by Korean 수험서 culture — serious, immersive, prestigious. All study-session text in Korean throughout.

---

## Color System

CSS variables defined in `globals.css`:

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#080D1A` | Page background |
| `--surface` | `#0F1729` | Card background |
| `--surface-raised` | `#1A2540` | Elevated card / hover states |
| `--gold` | `#D4A843` | Primary accent — borders, CTAs, highlights |
| `--gold-dim` | `rgba(212,168,67,0.12)` | Gold tinted backgrounds |
| `--gold-border` | `rgba(212,168,67,0.25)` | Subtle gold borders |
| `--blue` | `#5B8DB8` | Secondary accent — review queue, info |
| `--blue-dim` | `rgba(91,141,184,0.12)` | Blue tinted backgrounds |
| `--text` | `#F0EDD8` | Primary text (warm cream) |
| `--text-muted` | `#8A94A8` | Secondary/muted text |
| `--text-faint` | `#4A5568` | Disabled / placeholder |
| `--correct` | `#2D9F6B` | Correct answer green |
| `--correct-dim` | `rgba(45,159,107,0.12)` | Correct tinted background |
| `--wrong` | `#C04A3A` | Incorrect answer red |
| `--wrong-dim` | `rgba(192,74,58,0.12)` | Wrong tinted background |
| `--border` | `rgba(255,255,255,0.06)` | Default card border |
| `--rule` | `rgba(212,168,67,0.2)` | Gold rule lines / dividers |

---

## Typography

Replace Geist fonts with Korean-optimized stack in `layout.tsx`:

```
Headline font:  Noto Serif KR  (weights: 700) — authoritative, scholarly (900 not reliably available)
Body font:      Noto Sans KR   (weights: 400, 500, 700) — clean, dense, legible
Mono font:      IBM Plex Mono  (weight: 500) — scores, counters, data readouts
```

Font loading implementation:
```ts
import { Noto_Serif_KR, Noto_Sans_KR, IBM_Plex_Mono } from "next/font/google";

// IMPORTANT: must include "korean" subset or Korean glyphs fall back to system fonts
const notoSerifKR = Noto_Serif_KR({ subsets: ["latin", "korean"], weight: ["700"], variable: "--font-serif", display: "swap" });
const notoSansKR = Noto_Sans_KR({ subsets: ["latin", "korean"], weight: ["400", "500", "700"], variable: "--font-sans", display: "swap" });
// IBM_Plex_Mono is the correct next/font/google identifier
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-mono", display: "swap" });
```

Apply all three variables to `<body className>`. The CSS variables `--font-serif`, `--font-sans`, `--font-mono` are then referenced in globals.css.

- Apply `lang="ko"` and `dir="ltr"` on `<html>`
- Update metadata: `title: "수의국시"`, `description: "KVLE 기반 스마트 학습 시스템"`
- **Dark mode:** The app forces dark mode permanently. Set `color-scheme: dark` on `:root` in globals.css. No light/dark toggle.

---

## Design Language

- **Gold top-bar accent** (`border-top: 3px solid var(--gold)`) on all `.kvle-card` elements. This is the primary card identifier. Every `<section>` or content card uses it.
- **QuestionCard exception:** The question card gets a `border-left: 4px solid var(--gold)` instead of the top bar, to visually differentiate it as the active interaction element. No top bar on QuestionCard.
- **Thin gold rule lines** (`border-top: 1px solid var(--rule)`) as section dividers — `.kvle-rule` class produces a full-width horizontal rule.
- **Section labels** — `.kvle-label` applies `letter-spacing: 0.12em`, `font-size: 0.65rem`, `color: var(--gold)`, `font-weight: 700`. Korean text has no uppercase case, so do NOT apply `text-transform: uppercase` — use the class for spacing and color only.
- **Progress bar:** Gold fill (`var(--gold)`) on a dark track (`var(--surface-raised)`), height 4px, `border-radius: 2px`.
- **NavBar:** Background `var(--bg)`, `border-bottom: 1px solid var(--rule)`. Logo text "수의국시" in `var(--font-serif)`, color `var(--gold)`. On `< 640px`: nav link text is hidden via CSS (`hidden sm:inline`), icons remain visible, each icon button gets an `aria-label` with the Korean link name (e.g., `aria-label="오답 노트"`).
- **IBM Plex Mono** (`var(--font-mono)`) for all numeric data: scores, counts, percentages, question numbers.
- **Body background:** `background: radial-gradient(ellipse at 50% 30%, #0D1525 0%, #080D1A 70%)` — subtle depth. Applied on `body` in globals.css.
- **Token usage guide:**
  - `--border`: general card/element outline (very subtle, barely visible)
  - `--rule`: gold-tinted divider lines between sections
  - `--gold-border`: input borders, badge outlines — more visible than `--border`, less intense than `--gold`
  - `--gold-dim`: hover/selected tinted backgrounds (e.g., hovered button bg, selected answer bg before submission)
  - `--blue-dim`: review queue card tinted background
  - `--correct-dim` + `--correct`: correct answer revealed state — background dim, border and icon in `--correct`
  - `--wrong-dim` + `--wrong`: wrong answer revealed state — background dim, border and icon in `--wrong`

### Answer Feedback States (QuestionCard)

| State | Background | Border | Letter badge | Icon |
|---|---|---|---|---|
| Unselected | `var(--surface)` | `var(--border)` | `var(--surface-raised)` text muted | — |
| Selected (pre-submit) | `var(--gold-dim)` | `var(--gold-border)` | `var(--gold)` bg, dark text | — |
| Correct (revealed) | `var(--correct-dim)` | `var(--correct)` at 50% | `var(--correct)` bg, white text | `CheckCircle2` in `var(--correct)` |
| Wrong (revealed) | `var(--wrong-dim)` | `var(--wrong)` at 50% | `var(--wrong)` bg, white text | `XCircle` in `var(--wrong)` |
| Unchosen (revealed) | `var(--surface)` opacity 40% | `var(--border)` | dimmed | — |

### Empty & Loading States

All pages: loading state shows `로딩 중…` text in `var(--text-muted)`, centered, no spinner needed.

Empty states (where applicable):
- Wrong notes empty: gold `BookOpen` icon, text "저장된 오답이 없습니다.", muted
- Review queue empty: blue `CheckCircle2` icon, text "오늘 복습 완료!"
- Stats no data: muted text, link to start a quiz

### Mobile / Responsive

- NavBar collapses nav links to icon-only on `< sm` breakpoint (< 640px), keeping logo and auth button visible
- All `max-w-5xl` pages become full-width with `px-4` on mobile
- Grid cards on home page (`grid-cols-1 md:grid-cols-3`) already responsive — keep this pattern
- `word-break: keep-all` applied globally on Korean text containers to prevent mid-word line breaks in question stems
- Focus rings: `outline: 2px solid var(--gold)`, `outline-offset: 2px` on all interactive elements

---

## CSS Utility Classes (globals.css)

Replace existing utility classes with:

| Class | CSS description |
|---|---|
| `.kvle-card` | `background: var(--surface); border: 1px solid var(--border); border-top: 3px solid var(--gold); border-radius: 12px; padding: 2rem;` |
| `.kvle-card-raised` | Same as `.kvle-card` but `background: var(--surface-raised)` — used for nested/elevated content |
| `.kvle-label` | `color: var(--gold); font-size: 0.65rem; font-weight: 700; letter-spacing: 0.12em; display: block;` (no text-transform — Korean has no uppercase) |
| `.kvle-rule` | `border: none; border-top: 1px solid var(--rule); margin: 1.5rem 0;` |
| `.kvle-btn-primary` | `color: var(--gold); border: 1px solid var(--gold-border); background: transparent; border-radius: 8px; padding: 0.625rem 1.5rem; font-weight: 600; transition: background 150ms; &:hover { background: var(--gold-dim); }` |
| `.kvle-btn-ghost` | `color: var(--text-muted); border: 1px solid var(--border); background: transparent; border-radius: 8px; padding: 0.625rem 1.5rem; font-weight: 500; &:hover { color: var(--text); border-color: var(--gold-border); }` |
| `.kvle-btn-danger` | `color: var(--wrong); border: 1px solid rgba(192,74,58,0.3); background: transparent; border-radius: 8px; padding: 0.625rem 1.5rem; &:hover { background: var(--wrong-dim); }` |
| `.kvle-input` | `background: var(--surface-raised); border: 1px solid var(--gold-border); border-radius: 8px; padding: 0.625rem 0.875rem; color: var(--text); width: 100%; outline: none; &:focus { border-color: var(--gold); box-shadow: 0 0 0 2px rgba(212,168,67,0.2); }` |
| `.kvle-badge` | `background: var(--surface-raised); border: 1px solid var(--border); border-radius: 999px; padding: 0.125rem 0.625rem; font-size: 0.75rem; font-weight: 600; color: var(--text-muted);` |
| `.kvle-mono` | `font-family: var(--font-mono); font-variant-numeric: tabular-nums;` |
| `.fade-in` | `animation: fadeIn 300ms ease forwards;` — `@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }` |

---

## File-by-File Changes

### 1. `app/layout.tsx`
- Replace `Geist` / `Geist_Mono` imports with `Noto_Serif_KR`, `Noto_Sans_KR`, `IBM_Plex_Mono` from `next/font/google`
- Set `lang="ko"` on `<html>`
- Update `metadata.title` → `"수의국시"`, `metadata.description` → `"KVLE 기반 스마트 학습 시스템"`
- Pass new font CSS variables to `<body>`

### 2. `app/globals.css`
- Complete rewrite: CSS variables, body styles, utility classes as described above
- Remove old `.glass`, `.glass-card`, `.gradient-text` utilities
- Add `.kvle-*` utility classes
- Add `@keyframes fadeIn` for `.fade-in`
- Add body radial gradient

### 3. `components/NavBar.tsx`
- Logo: "수의국시" in Noto Serif KR bold, gold color; subtitle "KVLE" in mono tiny text beneath
- Nav links Korean text: 오답 노트 / 나의 통계 / 약점 연습 / 복습하기
- Auth: 로그인 / 로그아웃
- Active state: gold underline or gold text
- Apply `.kvle-card` bg with `border-bottom: 1px solid var(--rule)`

### 4. `components/QuestionCard.tsx`
- Apply `.kvle-card` with left gold `4px` border
- Category badge → `.kvle-badge`
- "Check Answer" → `정답 확인`
- "Next Question" → `다음 문제`
- "Correct!" → `정답!` (gold text)
- "Incorrect" → `오답` (red text)
- "Explanation" label → `해설` as `.kvle-label`
- Answer choice letters use IBM Plex Mono
- Correct/wrong state colors from CSS variables

### 5. `app/page.tsx`
| English | Korean |
|---|---|
| "Master the Veterinary Board Exam" | `수의국시, 체계적으로 준비하세요` |
| "Smarter practice..." subtitle | `스마트 반복 학습과 데이터 기반 약점 분석으로 합격을 완성합니다.` |
| "Smarter Practice" badge | `스마트 학습` |
| "Ready to test your knowledge?" | `오늘의 학습을 시작하세요` |
| Card description | `과목을 선택하고 KVLE 유형 문제를 풀어보세요.` |
| "Select Subject" label | `과목 선택` |
| "All Subjects (Mixed)" option | `전체 과목 (혼합)` |
| "Start Session" | `세션 시작` |
| "Loading…" | `로딩 중…` |
| "Review Queue" label | `오늘의 복습` |
| "questions due for review today" | `개 문제 복습 대기중` |
| "You're all caught up!" | `오늘 복습 완료!` |
| "Start Review" | `복습 시작` |
| "Practice as a guest" | `비회원으로 연습하기` |
| Guest description | `문제를 풀어볼 수 있지만, 학습 기록 저장과 간격 반복 학습은 로그인이 필요합니다.` |
| "Quick Start" | `바로 시작` |
| "of X" counter | `/ X 문제` |
| "X / Y correct" score | `X / Y 정답` (mono) |
| "Session Complete!" | `세션 완료!` |
| Score summary | `총 Y문제 중 X문제를 맞혔습니다.` |
| "Concept Review" | `오답 개념 복습` |
| "Perfect score! No wrong answers..." | `완벽합니다! 틀린 문제가 없습니다.` |
| "Start New Session" | `새 세션 시작` |
| "View All Wrong Notes" | `전체 오답 노트 보기` |
| "Your Answer" | `내 답변` |
| "Correct Answer" | `정답` |
| "Explanation" | `해설` |

### 6. `app/wrong-notes/page.tsx`
| English | Korean |
|---|---|
| "Wrong Answer Notes" | `오답 노트` |
| "Review incorrect answers and explanations" | `틀린 문제와 해설을 복습하세요` |
| "Back Home" | `홈으로` |
| "Filter by subject" | `과목으로 필터` |
| "All" | `전체` |
| "Retry Wrong Answers" | `오답 재풀이` |
| "Clear All" | `전체 삭제` |
| "No saved wrong answers." | `저장된 오답이 없습니다.` |
| "My answer:" | `내 답변:` |
| "Correct answer:" | `정답:` |
| "Explanation:" | `해설:` |
| "Delete" | `삭제` |
| "Loading…" | `로딩 중…` |

### 7. `app/my-stats/page.tsx`
| English | Korean |
|---|---|
| "My Stats" | `나의 통계` |
| "Total Attempts" | `총 시도` |
| "Total Correct" | `총 정답` |
| "Accuracy" | `정답률` |
| "Last 7 Days" | `최근 7일` |
| "By Category" | `과목별 통계` |
| "Category" | `과목` |
| "Attempts" | `시도` |
| "Correct" | `정답` |
| "Recent Attempts" | `최근 시도` |
| "Correct" badge | `정답` |
| "Wrong" badge | `오답` |
| "Sign in to see your quiz statistics." | `통계를 확인하려면 로그인하세요.` |
| "Sign in" | `로그인` |
| "No attempts yet. Start a quiz session..." | `아직 풀이 내역이 없습니다. 퀴즈를 시작해 보세요.` |
| "Start Quiz" | `퀴즈 시작` |
| "Practice Weakest" | `약점 집중 연습` |
| "Loading..." | `로딩 중…` |

### 8. `app/review/page.tsx`
| English | Korean |
|---|---|
| "Review Queue" | `복습 큐` |
| "Sign in to use spaced-repetition review." | `간격 반복 복습을 사용하려면 로그인하세요.` |
| "Sign in" | `로그인` |
| "No reviews due right now. Check back later!" | `지금 복습할 항목이 없습니다. 나중에 다시 확인하세요.` |
| "Wrong Notes" | `오답 노트` |
| "X item(s) due for review." | `X개 문제 복습 대기중` |
| "You'll review up to X at a time." | `한 번에 최대 X문제씩 복습합니다.` |
| "Start Review" | `복습 시작` |
| "Spaced-repetition review" | `간격 반복 복습` |
| "Progress: X / Y" | `진행: X / Y` |
| "Score: X" | `점수: X` |
| "Back" | `돌아가기` |
| "Review Complete" | `복습 완료!` |
| "Reviewed" | `복습한 문제` |
| "Correct" | `정답` |
| "Incorrect" | `오답` |
| "All reviewed items were rescheduled." | `모든 복습 항목이 일정에 반영되었습니다.` |
| "Some items are due again now." | `일부 항목이 즉시 복습 대상이 됩니다.` |
| "Review Again (X)" | `다시 복습 (X)` |
| "Back Home" | `홈으로` |
| "Loading..." | `로딩 중…` |

### 9. `app/practice/weakest/page.tsx`
| English | Korean |
|---|---|
| "Adaptive Practice" | `약점 집중 연습` |
| "Sign in to use adaptive practice." | `적응형 연습을 사용하려면 로그인하세요.` |
| "Sign in" | `로그인` |
| "Not enough attempt history yet..." | `아직 시도 기록이 부족합니다. 몇 번 더 풀어본 후 다시 오세요.` |
| "Start a Quiz" | `퀴즈 시작` |
| "Your weakest category right now:" | `현재 가장 취약한 과목:` |
| "X attempts · Y% accuracy · Z wrong" | `X회 시도 · Y% 정답률 · Z개 오답` |
| "You'll get X questions from this category." | `이 과목에서 X문제가 출제됩니다.` |
| "Start Practice" | `연습 시작` |
| "Back" | `돌아가기` |
| "Practice Complete" | `연습 완료!` |
| "You answered X out of Y correctly." | `총 Y문제 중 X문제를 맞혔습니다.` |
| "Practice Again" | `다시 연습` |
| "Back to My Stats" | `통계로 돌아가기` |
| "Loading..." | `로딩 중…` |

### 10. `app/retry-wrong/page.tsx`
| English | Korean |
|---|---|
| "Retry Wrong Answers" | `오답 재풀이` |
| "Re-attempt previously incorrect questions" | `이전에 틀린 문제를 다시 풀어보세요` |
| "Back" | `돌아가기` |
| "There are no retry questions available." | `재풀이할 문제가 없습니다.` |
| "Back to Wrong Notes" | `오답 노트로` |
| "Loading..." | `로딩 중…` |
| "Retry Complete" | `재풀이 완료!` |
| "You answered X out of Y correctly." | `총 Y문제 중 X문제를 맞혔습니다.` |

### 11. `app/auth/login/page.tsx`
| English | Korean |
|---|---|
| "Sign in" | `로그인` |
| "Create account" | `회원가입` |
| "← Back" | `← 돌아가기` |
| "Email" | `이메일` |
| "Password" | `비밀번호` |
| "Loading…" | `처리 중…` |
| "Don't have an account? Sign up" | `계정이 없으신가요? 회원가입` |
| "Already have an account? Sign in" | `이미 계정이 있으신가요? 로그인` |
| "Account created. Check your email..." | `계정이 생성되었습니다. 이메일로 전송된 인증 링크를 확인해 주세요.` |

---

## Spacing & Layout System

| Token | Value | Used for |
|---|---|---|
| Page max-width (wide) | `max-w-5xl` (64rem) | Home page |
| Page max-width (narrow) | `max-w-3xl` (48rem) | All other pages |
| Page horizontal padding | `px-6` (1.5rem) mobile; `px-6` desktop | All `<main>` elements |
| Page vertical padding | `py-12` (3rem) | All `<main>` elements |
| Card inner padding | `p-8` (2rem) standard; `p-6` (1.5rem) compact | `.kvle-card` default padding |
| Gap between cards | `gap-6` (1.5rem) | Card grids |
| Section vertical spacing | `space-y-8` (2rem) | Between page sections |
| Section label bottom margin | `mb-3` (0.75rem) | Below `.kvle-label` |

## Styling Approach

All pages use the same pattern:
- `<main>` gets `mx-auto max-w-5xl px-6 py-12` (or `max-w-3xl` for single-column pages)
- Cards use `.kvle-card` (gold top-bar, `var(--surface)` bg, `border-radius: 12px`, padding `p-8`)
- Section labels use `.kvle-label`
- Buttons: `.kvle-btn-primary` (gold outline + hover fill) or `.kvle-btn-ghost`
- Inputs: `.kvle-input` (dark bg, gold focus ring)
- Data values use `.kvle-mono` (IBM Plex Mono)
- All pages get consistent loading state: `로딩 중…` in `var(--text-muted)`

### Global Focus & Accessibility Rules (in globals.css)
```css
:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
  border-radius: 4px;
}

/* Korean text — prevent mid-word breaks in question stems and answers */
p, h1, h2, h3, button, label, span {
  word-break: keep-all;
}

/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .fade-in { animation: none; opacity: 1; }
}
```

`.fade-in` is applied on component mount (add class when element first renders). Used on: QuestionCard, session complete section, feedback panel after answer submission.

**Forced-colors / High Contrast mode:** Out of scope for this version.

---

## Implementation Order

1. `globals.css` — establishes the entire design token system (do first)
2. `layout.tsx` — font loading and metadata
3. `components/NavBar.tsx` — visible on every page
4. `components/QuestionCard.tsx` — core interaction component
5. `app/page.tsx` — home page (most complex)
6. `app/wrong-notes/page.tsx`
7. `app/my-stats/page.tsx`
8. `app/review/page.tsx`
9. `app/practice/weakest/page.tsx`
10. `app/retry-wrong/page.tsx`
11. `app/auth/login/page.tsx`
