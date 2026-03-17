# 수의국시 Visual Redesign & Korean Localization — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully redesign the visual identity of the vet exam app to the "수험서" dark-gold aesthetic and translate all UI text to Korean.

**Architecture:** Design tokens defined in `globals.css` as CSS custom properties, consumed across all pages via Tailwind's `@layer utilities` and plain CSS classes prefixed `.kvle-*`. Fonts loaded in `layout.tsx` via `next/font/google`. All 11 files updated in dependency order (shared tokens first, then shared components, then pages).

**Tech Stack:** Next.js 15, Tailwind CSS v4, `next/font/google` (Noto Serif KR, Noto Sans KR, IBM Plex Mono), Lucide React

**Spec:** `docs/superpowers/specs/2026-03-17-visual-redesign-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `vet-exam-ai/app/globals.css` | Rewrite | All CSS tokens, utility classes, global rules |
| `vet-exam-ai/app/layout.tsx` | Modify | Font loading, metadata, lang/dir attributes |
| `vet-exam-ai/components/NavBar.tsx` | Modify | Korean nav labels, new visual style |
| `vet-exam-ai/components/QuestionCard.tsx` | Modify | Korean labels, answer state styles, left gold border |
| `vet-exam-ai/app/page.tsx` | Modify | Korean text, new card/button classes |
| `vet-exam-ai/app/wrong-notes/page.tsx` | Modify | Korean text, new card/button classes |
| `vet-exam-ai/app/my-stats/page.tsx` | Modify | Korean text, new card/button classes |
| `vet-exam-ai/app/review/page.tsx` | Modify | Korean text, new card/button classes |
| `vet-exam-ai/app/practice/weakest/page.tsx` | Modify | Korean text, new card/button classes |
| `vet-exam-ai/app/retry-wrong/page.tsx` | Modify | Korean text, new card/button classes |
| `vet-exam-ai/app/auth/login/page.tsx` | Modify | Korean text, new input/button classes |

---

## Task 1: CSS Foundation (`globals.css`)

**Files:**
- Rewrite: `vet-exam-ai/app/globals.css`

- [ ] **Step 1: Rewrite `globals.css` with design tokens and utility classes**

Replace the entire file with:

```css
@import "tailwindcss";

:root {
  color-scheme: dark;

  /* Background & Surface */
  --bg:             #080D1A;
  --surface:        #0F1729;
  --surface-raised: #1A2540;

  /* Gold — primary accent */
  --gold:           #D4A843;
  --gold-dim:       rgba(212, 168, 67, 0.12);
  --gold-border:    rgba(212, 168, 67, 0.25);

  /* Blue — secondary accent (review queue) */
  --blue:           #5B8DB8;
  --blue-dim:       rgba(91, 141, 184, 0.12);

  /* Text */
  --text:           #F0EDD8;
  --text-muted:     #8A94A8;
  --text-faint:     #4A5568;

  /* Feedback */
  --correct:        #2D9F6B;
  --correct-dim:    rgba(45, 159, 107, 0.12);
  --wrong:          #C04A3A;
  --wrong-dim:      rgba(192, 74, 58, 0.12);

  /* Borders & Rules */
  --border:         rgba(255, 255, 255, 0.06);
  --rule:           rgba(212, 168, 67, 0.20);

  /* Fonts */
  --font-serif: var(--font-noto-serif-kr), serif;
  --font-sans:  var(--font-noto-sans-kr), sans-serif;
  --font-mono:  var(--font-ibm-plex-mono), monospace;
}

body {
  background: radial-gradient(ellipse at 50% 30%, #0D1525 0%, #080D1A 70%);
  color: var(--text);
  font-family: var(--font-sans);
  min-height: 100vh;
}

/* Korean text — prevent mid-syllable line breaks */
p, h1, h2, h3, h4, button, label, span, td, th {
  word-break: keep-all;
}

/* Focus rings */
:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
  border-radius: 4px;
}

/* Animations */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}

@layer utilities {
  /* Cards */
  .kvle-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-top: 3px solid var(--gold);
    border-radius: 12px;
    padding: 2rem;
  }

  .kvle-card-raised {
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-top: 3px solid var(--gold);
    border-radius: 12px;
    padding: 2rem;
  }

  /* Section label — gold, letter-spaced. NO text-transform (Korean has no uppercase). */
  .kvle-label {
    display: block;
    color: var(--gold);
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  /* Divider */
  .kvle-rule {
    border: none;
    border-top: 1px solid var(--rule);
    margin: 1.5rem 0;
  }

  /* Buttons */
  .kvle-btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--gold);
    border: 1px solid var(--gold-border);
    background: transparent;
    border-radius: 8px;
    padding: 0.625rem 1.5rem;
    font-weight: 600;
    transition: background 150ms, border-color 150ms;
    cursor: pointer;
  }
  .kvle-btn-primary:hover {
    background: var(--gold-dim);
    border-color: var(--gold);
  }
  .kvle-btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .kvle-btn-ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--text-muted);
    border: 1px solid var(--border);
    background: transparent;
    border-radius: 8px;
    padding: 0.625rem 1.5rem;
    font-weight: 500;
    transition: color 150ms, border-color 150ms;
    cursor: pointer;
  }
  .kvle-btn-ghost:hover {
    color: var(--text);
    border-color: var(--gold-border);
  }
  .kvle-btn-ghost:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .kvle-btn-danger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--wrong);
    border: 1px solid rgba(192, 74, 58, 0.3);
    background: transparent;
    border-radius: 8px;
    padding: 0.625rem 1.5rem;
    font-weight: 500;
    transition: background 150ms;
    cursor: pointer;
  }
  .kvle-btn-danger:hover {
    background: var(--wrong-dim);
  }

  /* Input */
  .kvle-input {
    width: 100%;
    background: var(--surface-raised);
    border: 1px solid var(--gold-border);
    border-radius: 8px;
    padding: 0.625rem 0.875rem;
    color: var(--text);
    outline: none;
    transition: border-color 150ms, box-shadow 150ms;
  }
  .kvle-input:focus {
    border-color: var(--gold);
    box-shadow: 0 0 0 2px rgba(212, 168, 67, 0.2);
  }

  /* Badge */
  .kvle-badge {
    display: inline-flex;
    align-items: center;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.125rem 0.625rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  /* Mono wrapper for numeric data */
  .kvle-mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  /* Mount animation — applied in JSX on elements that appear dynamically */
  .fade-in {
    animation: fadeIn 300ms ease forwards;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .fade-in {
      animation: none;
      opacity: 1;
    }
  }
}
```

- [ ] **Step 2: Start dev server and confirm no CSS errors**

```bash
cd vet-exam-ai && npm run dev
```

Expected: Compiles without errors. Visit `http://localhost:3000` — page will look broken (fonts not loaded yet, classes not yet applied to components) but should not crash.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/globals.css
git commit -m "feat: add 수의국시 design token system and kvle utility classes"
```

---

## Task 2: Font Loading & Metadata (`layout.tsx`)

**Files:**
- Modify: `vet-exam-ai/app/layout.tsx`

- [ ] **Step 1: Replace font imports and update metadata**

Replace the entire file with:

```tsx
import type { Metadata } from "next";
import { Noto_Serif_KR, Noto_Sans_KR, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "../components/NavBar";
import { DueCountProvider } from "../lib/context/DueCountContext";

// IMPORTANT: Korean fonts must include the "korean" subset or glyphs fall back to system fonts
const notoSerifKR = Noto_Serif_KR({
  subsets: ["latin", "korean"],
  weight: ["700"],
  variable: "--font-noto-serif-kr",
  display: "swap",
});

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin", "korean"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-kr",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "수의국시",
  description: "KVLE 기반 스마트 학습 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" dir="ltr">
      <body
        className={`${notoSerifKR.variable} ${notoSansKR.variable} ${ibmPlexMono.variable} antialiased`}
      >
        <DueCountProvider>
          <NavBar />
          {children}
        </DueCountProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify fonts load in browser**

With dev server running, open `http://localhost:3000`. Open DevTools → Network → filter by "font". You should see requests to `fonts.gstatic.com` for Noto Serif KR and Noto Sans KR. Body text should render in Noto Sans KR.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/layout.tsx
git commit -m "feat: load Noto Serif KR, Noto Sans KR, IBM Plex Mono fonts; Korean metadata"
```

---

## Task 3: NavBar (`components/NavBar.tsx`)

**Files:**
- Modify: `vet-exam-ai/components/NavBar.tsx`

- [ ] **Step 1: Rewrite NavBar with Korean labels and new visual style**

Replace the entire file with:

```tsx
"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../lib/hooks/useAuth";
import { useDueCountCtx } from "../lib/context/DueCountContext";
import { LogOut, BookOpen, BarChart3, RotateCcw, PenTool, User } from "lucide-react";

export default function NavBar() {
  const { user, loading, signOut } = useAuth();
  const dueCount = useDueCountCtx();
  const router = useRouter();
  const pathname = usePathname();

  async function handleSignOut() {
    await signOut();
    router.refresh();
  }

  const isActive = (path: string) => pathname === path;

  const linkClass = (path: string) =>
    `flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
      isActive(path)
        ? "text-[var(--gold)] bg-[var(--gold-dim)]"
        : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-raised)]"
    }`;

  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{
        background: "var(--bg)",
        borderBottom: "1px solid var(--rule)",
      }}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex flex-col leading-tight group">
          <span
            className="font-bold text-lg tracking-tight"
            style={{ fontFamily: "var(--font-serif)", color: "var(--gold)" }}
          >
            수의국시
          </span>
          <span
            className="kvle-mono text-[10px]"
            style={{ color: "var(--text-faint)" }}
          >
            KVLE
          </span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-1 text-sm font-medium">
          <Link href="/wrong-notes" className={linkClass("/wrong-notes")} aria-label="오답 노트">
            <RotateCcw size={16} />
            <span className="hidden sm:inline">오답 노트</span>
          </Link>

          {!loading && user && (
            <>
              <Link href="/my-stats" className={linkClass("/my-stats")} aria-label="나의 통계">
                <BarChart3 size={16} />
                <span className="hidden sm:inline">나의 통계</span>
              </Link>
              <Link href="/practice/weakest" className={linkClass("/practice/weakest")} aria-label="약점 연습">
                <PenTool size={16} />
                <span className="hidden sm:inline">약점 연습</span>
              </Link>
              <Link href="/review" className={linkClass("/review")} aria-label="복습하기">
                <div className="relative">
                  <BookOpen size={16} />
                  {dueCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--gold)] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--gold)]"></span>
                    </span>
                  )}
                </div>
                <span className="hidden sm:inline">복습하기</span>
                {dueCount > 0 && (
                  <span
                    className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] kvle-mono"
                    style={{ background: "var(--gold-dim)", color: "var(--gold)" }}
                  >
                    {dueCount}
                  </span>
                )}
              </Link>
            </>
          )}

          <div className="h-6 w-px mx-2" style={{ background: "var(--border)" }}></div>

          {!loading && (
            user ? (
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
                  style={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                  }}
                >
                  <User size={13} />
                  <span className="truncate max-w-[120px]">{user.email}</span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center justify-center p-2 rounded-lg transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "var(--wrong)";
                    (e.currentTarget as HTMLElement).style.background = "var(--wrong-dim)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  title="로그아웃"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <Link
                href="/auth/login"
                className="kvle-btn-primary text-sm"
              >
                로그인
              </Link>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify NavBar renders correctly**

With dev server running, check `http://localhost:3000`. Confirm:
- Logo shows "수의국시" in serif gold font with "KVLE" mono subtitle
- Nav links show Korean labels
- Dark background with gold rule divider at bottom of header

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/components/NavBar.tsx
git commit -m "feat: Korean NavBar with 수험서 styling"
```

---

## Task 4: QuestionCard (`components/QuestionCard.tsx`)

**Files:**
- Modify: `vet-exam-ai/components/QuestionCard.tsx`

- [ ] **Step 1: Rewrite QuestionCard with Korean labels and answer state styles**

Note: QuestionCard gets `border-left: 4px solid var(--gold)` instead of the standard top-bar.

Answer state CSS per the spec:
- Unselected: `var(--surface)` bg, `var(--border)` border
- Selected pre-submit: `var(--gold-dim)` bg, `var(--gold-border)` border
- Correct revealed: `var(--correct-dim)` bg, `var(--correct)` border at 50% opacity
- Wrong revealed: `var(--wrong-dim)` bg, `var(--wrong)` border at 50% opacity
- Unchosen revealed: `var(--surface)` bg, `var(--border)` border, 40% opacity

Replace the entire file with:

```tsx
"use client";

import { useState } from "react";
import type { Question } from "../lib/questions";
import { CheckCircle2, XCircle, ArrowRight, HelpCircle } from "lucide-react";

type AnswerPayload = {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
};

type Props = {
  question: Question;
  onNext: () => void;
  onAnswer: (payload: AnswerPayload) => void;
};

export default function QuestionCard({ question, onNext, onAnswer }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const isCorrect = selected === question.answer;

  function handleSubmit() {
    if (!selected) return;
    setSubmitted(true);
    onAnswer({ questionId: question.id, selectedAnswer: selected, isCorrect });
  }

  function getChoiceStyle(choice: string): React.CSSProperties {
    const isSelected = selected === choice;
    const isCorrectChoice = choice === question.answer;
    const isWrongSelection = submitted && isSelected && !isCorrectChoice;
    const showCorrect = submitted && isCorrectChoice;
    const isUnchosen = submitted && !isSelected && !isCorrectChoice;

    if (!submitted) {
      if (isSelected) {
        return {
          background: "var(--gold-dim)",
          border: "1px solid var(--gold-border)",
          color: "var(--text)",
        };
      }
      return {
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--text-muted)",
      };
    }

    if (showCorrect) {
      return {
        background: "var(--correct-dim)",
        border: "1px solid rgba(45,159,107,0.5)",
        color: "var(--text)",
      };
    }
    if (isWrongSelection) {
      return {
        background: "var(--wrong-dim)",
        border: "1px solid rgba(192,74,58,0.5)",
        color: "var(--text)",
      };
    }
    // Unchosen after reveal
    return {
      background: "var(--surface)",
      border: "1px solid var(--border)",
      color: "var(--text-muted)",
      opacity: "0.4",
    };
  }

  function getBadgeStyle(choice: string): React.CSSProperties {
    const isSelected = selected === choice;
    const isCorrectChoice = choice === question.answer;
    const isWrongSelection = submitted && isSelected && !isCorrectChoice;
    const showCorrect = submitted && isCorrectChoice;

    if (showCorrect) return { background: "var(--correct)", color: "#fff" };
    if (isWrongSelection) return { background: "var(--wrong)", color: "#fff" };
    if (isSelected && !submitted) return { background: "var(--gold)", color: "#080D1A" };
    return { background: "var(--surface-raised)", color: "var(--text-muted)" };
  }

  return (
    <div
      className="fade-in relative overflow-hidden"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: "4px solid var(--gold)",
        borderRadius: "12px",
        padding: "2rem",
      }}
    >
      {/* Category badge */}
      <span className="kvle-badge mb-6 inline-block">{question.category}</span>

      {/* Question text */}
      <h2
        className="mb-8 text-xl leading-relaxed font-semibold"
        style={{ color: "var(--text)" }}
      >
        {question.question}
      </h2>

      {/* Answer choices */}
      <div className="space-y-3">
        {question.choices.map((choice, index) => {
          const isCorrectChoice = choice === question.answer;
          const isWrongSelection = submitted && selected === choice && !isCorrectChoice;
          const showCorrect = submitted && isCorrectChoice;

          return (
            <button
              key={choice}
              onClick={() => !submitted && setSelected(choice)}
              disabled={submitted}
              className="w-full flex items-center justify-between rounded-xl p-4 text-left transition-all duration-200"
              style={{
                ...getChoiceStyle(choice),
                cursor: submitted ? "default" : "pointer",
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold kvle-mono transition-colors"
                  style={getBadgeStyle(choice)}
                >
                  {String.fromCharCode(65 + index)}
                </div>
                <span className="font-medium text-sm">{choice}</span>
              </div>
              {submitted && showCorrect && (
                <CheckCircle2 size={20} style={{ color: "var(--correct)", flexShrink: 0 }} />
              )}
              {submitted && isWrongSelection && (
                <XCircle size={20} style={{ color: "var(--wrong)", flexShrink: 0 }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Action area */}
      <div className="mt-8">
        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={!selected}
            className="kvle-btn-primary w-full sm:w-auto"
          >
            정답 확인
            <ArrowRight size={18} />
          </button>
        ) : (
          <div className="fade-in">
            {/* Feedback panel */}
            <div
              className="mb-6 rounded-xl p-5"
              style={{
                background: isCorrect ? "var(--correct-dim)" : "var(--wrong-dim)",
                border: `1px solid ${isCorrect ? "rgba(45,159,107,0.3)" : "rgba(192,74,58,0.3)"}`,
              }}
            >
              <div className="flex items-center gap-2 mb-4">
                {isCorrect ? (
                  <>
                    <CheckCircle2 size={22} style={{ color: "var(--correct)" }} />
                    <span className="text-lg font-bold" style={{ color: "var(--correct)" }}>
                      정답!
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle size={22} style={{ color: "var(--wrong)" }} />
                    <span className="text-lg font-bold" style={{ color: "var(--wrong)" }}>
                      오답
                    </span>
                  </>
                )}
              </div>

              {/* Explanation */}
              <div
                className="rounded-lg p-4"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex items-start gap-2">
                  <HelpCircle size={16} style={{ color: "var(--blue)", flexShrink: 0, marginTop: "2px" }} />
                  <div>
                    <span className="kvle-label mb-1">해설</span>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      {question.explanation}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={onNext}
              className="kvle-btn-primary w-full sm:w-auto"
              style={{ background: "var(--gold-dim)", borderColor: "var(--gold)" }}
            >
              다음 문제
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Start a quiz session and verify answer states**

Visit `http://localhost:3000`. Start a session. For each answer state, confirm:
- Unselected choices: dark surface, subtle border
- Selected choice (pre-submit): gold-tinted bg
- After submit — correct choice: green tint + CheckCircle2 icon
- After submit — wrong selection: red tint + XCircle icon
- After submit — unchosen choices: faded out
- Feedback panel shows 해설 label and explanation
- "다음 문제" button appears after submission

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/components/QuestionCard.tsx
git commit -m "feat: Korean QuestionCard with gold left-border and answer state styles"
```

---

## Task 5: Home Page (`app/page.tsx`)

**Files:**
- Modify: `vet-exam-ai/app/page.tsx`

- [ ] **Step 1: Replace all English text with Korean and apply kvle classes**

Replace the entire file with:

```tsx
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import QuestionCard from "../components/QuestionCard";
import { createSessionQuestions, type Question } from "../lib/questions";
import type { WrongAnswerNote } from "../lib/types";
import { useWrongNotes } from "../lib/hooks/useWrongNotes";
import { useAttempts } from "../lib/hooks/useAttempts";
import { useAuth } from "../lib/hooks/useAuth";
import { useDueCountCtx } from "../lib/context/DueCountContext";
import { useQuestions } from "../lib/hooks/useQuestions";
import { Play, Sparkles, BookOpen, Clock, Target, ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";

const TOTAL_QUESTIONS = 5;

export default function Home() {
  const { questions, categories, loading: questionsLoading } = useQuestions();
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [started, setStarted] = useState(false);
  const { notes: wrongNotes, addNote } = useWrongNotes();
  const { logAttempt } = useAttempts();
  const { user, loading: authLoading } = useAuth();
  const dueCount = useDueCountCtx();
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const currentQuestion = sessionQuestions[currentIndex];
  const finished = started && currentIndex >= sessionQuestions.length;

  function startSession() {
    const categoryFilter = selectedCategory === "All" ? undefined : selectedCategory;
    const pool = categoryFilter ? questions.filter((q) => q.category === categoryFilter) : questions;
    const total = Math.min(TOTAL_QUESTIONS, pool.length);
    const newSession = createSessionQuestions(questions, total, categoryFilter);
    sessionIdRef.current = crypto.randomUUID();
    setSessionQuestions(newSession);
    setCurrentIndex(0);
    setScore(0);
    setStarted(true);
  }

  function handleAnswer(payload: { questionId: string; selectedAnswer: string; isCorrect: boolean }) {
    if (!currentQuestion) return;
    void logAttempt({
      sessionId: sessionIdRef.current,
      questionId: currentQuestion.id,
      category: currentQuestion.category,
      selectedAnswer: payload.selectedAnswer,
      correctAnswer: currentQuestion.answer,
      isCorrect: payload.isCorrect,
    });
    if (payload.isCorrect) { setScore((prev) => prev + 1); return; }
    void addNote({
      questionId: currentQuestion.id,
      question: currentQuestion.question,
      category: currentQuestion.category,
      choices: currentQuestion.choices,
      correctAnswer: currentQuestion.answer,
      selectedAnswer: payload.selectedAnswer,
      explanation: currentQuestion.explanation,
    });
  }

  function handleNext() { setCurrentIndex((prev) => prev + 1); }
  function handleRestart() { startSession(); }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      {/* Hero */}
      {!started && (
        <div className="mb-10 text-center md:text-left">
          <h1
            className="mb-3 text-4xl md:text-5xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
          >
            수의국시,{" "}
            <span style={{ color: "var(--gold)" }}>체계적으로 준비하세요</span>
          </h1>
          <p className="text-lg max-w-2xl" style={{ color: "var(--text-muted)" }}>
            스마트 반복 학습과 데이터 기반 약점 분석으로 합격을 완성합니다.
          </p>
        </div>
      )}

      {/* Logged-in dashboard cards */}
      {!started && !authLoading && user && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {/* Start session card */}
          <div className="md:col-span-2 kvle-card relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -mr-16 -mt-16 opacity-20" style={{ background: "var(--gold)" }}></div>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles size={16} style={{ color: "var(--gold)" }} />
                  <span className="kvle-label">스마트 학습</span>
                </div>
                <h2 className="text-xl font-bold mb-2" style={{ color: "var(--text)" }}>
                  오늘의 학습을 시작하세요
                </h2>
                <p className="mb-6 text-sm" style={{ color: "var(--text-muted)" }}>
                  과목을 선택하고 KVLE 유형 문제를 풀어보세요.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="w-full sm:flex-1">
                  <label className="kvle-label mb-2">과목 선택</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="kvle-input"
                  >
                    <option value="All">전체 과목 (혼합)</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={startSession}
                  disabled={questionsLoading}
                  className="kvle-btn-primary w-full sm:w-auto flex-shrink-0"
                >
                  <Play size={16} className="fill-current" />
                  {questionsLoading ? "로딩 중…" : "세션 시작"}
                </button>
              </div>
            </div>
          </div>

          {/* Review queue card */}
          <div className="kvle-card flex flex-col justify-between relative overflow-hidden">
            <div className="absolute bottom-0 right-0 w-32 h-32 rounded-full blur-2xl -mr-8 -mb-8 opacity-20" style={{ background: "var(--blue)" }}></div>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clock size={16} style={{ color: "var(--blue)" }} />
                <span className="kvle-label" style={{ color: "var(--blue)" }}>오늘의 복습</span>
              </div>
              {dueCount > 0 ? (
                <div>
                  <div className="text-5xl font-black kvle-mono mb-1" style={{ color: "var(--text)" }}>
                    {dueCount}
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>개 문제 복습 대기중</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-6">
                  <CheckCircle2 size={40} className="mb-3" style={{ color: "var(--text-faint)" }} />
                  <p className="font-medium" style={{ color: "var(--text-muted)" }}>오늘 복습 완료!</p>
                </div>
              )}
            </div>
            {dueCount > 0 && (
              <Link
                href="/review"
                className="mt-6 flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold transition-colors text-sm"
                style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "1px solid rgba(91,141,184,0.25)" }}
              >
                복습 시작
                <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Guest card */}
      {!started && (!user || authLoading) && (
        <section className="kvle-card mb-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-xl font-bold mb-2" style={{ color: "var(--text)" }}>
                비회원으로 연습하기
              </h2>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                문제를 풀어볼 수 있지만, 학습 기록 저장과 간격 반복 학습은 로그인이 필요합니다.
              </p>
            </div>
            <button
              onClick={startSession}
              disabled={questionsLoading}
              className="kvle-btn-primary flex-shrink-0"
            >
              <Play size={16} className="fill-current" />
              {questionsLoading ? "로딩 중…" : "바로 시작"}
            </button>
          </div>
        </section>
      )}

      {/* Active session */}
      {started && !finished && currentQuestion && (
        <div className="max-w-3xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full font-bold kvle-mono"
                style={{ background: "var(--surface-raised)", color: "var(--text)" }}
              >
                {currentIndex + 1}
              </div>
              <span style={{ color: "var(--text-muted)" }}>/ {sessionQuestions.length} 문제</span>
            </div>
            <div
              className="flex items-center gap-2 rounded-full px-4 py-2"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
            >
              <Target size={14} style={{ color: "var(--gold)" }} />
              <span className="font-semibold kvle-mono text-sm" style={{ color: "var(--text)" }}>
                {score} / {sessionQuestions.length} 정답
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full rounded-full h-1 mb-8 overflow-hidden" style={{ background: "var(--surface-raised)" }}>
            <div
              className="h-1 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(currentIndex / sessionQuestions.length) * 100}%`, background: "var(--gold)" }}
            />
          </div>

          <QuestionCard
            key={currentQuestion.id}
            question={currentQuestion}
            onAnswer={handleAnswer}
            onNext={handleNext}
          />
        </div>
      )}

      {/* Results */}
      {finished && (
        <section className="max-w-3xl mx-auto fade-in space-y-8">
          <div
            className="kvle-card text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 50% 0%, var(--gold-dim), transparent 70%)" }}></div>
            <div className="relative z-10">
              <div
                className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
                style={{ background: "var(--correct-dim)", border: "2px solid rgba(45,159,107,0.3)" }}
              >
                <CheckCircle2 size={40} style={{ color: "var(--correct)" }} />
              </div>
              <h2 className="text-3xl font-bold mb-3" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
                세션 완료!
              </h2>
              <p className="text-lg" style={{ color: "var(--text-muted)" }}>
                총 <span className="kvle-mono font-bold" style={{ color: "var(--text)" }}>{sessionQuestions.length}</span>문제 중{" "}
                <span className="kvle-mono font-bold" style={{ color: "var(--gold)" }}>{score}</span>문제를 맞혔습니다.
              </p>
            </div>
          </div>

          {/* Concept review */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <BookOpen size={20} style={{ color: "var(--blue)" }} />
              <h3 className="text-xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
                오답 개념 복습
              </h3>
            </div>

            {wrongNotes.length === 0 ? (
              <div
                className="kvle-card text-center"
                style={{ borderStyle: "dashed" }}
              >
                <Sparkles size={28} className="mx-auto mb-3" style={{ color: "var(--gold)" }} />
                <p style={{ color: "var(--text-muted)" }}>완벽합니다! 틀린 문제가 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {wrongNotes.map((note, idx) => (
                  <div
                    key={note.questionId}
                    className="relative rounded-xl p-6 overflow-hidden"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderLeft: "4px solid rgba(192,74,58,0.5)",
                    }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <span className="kvle-badge">{note.category}</span>
                      <span className="kvle-mono text-xs" style={{ color: "var(--text-faint)" }}>#{idx + 1}</span>
                    </div>
                    <p className="mb-6 font-medium leading-relaxed" style={{ color: "var(--text)" }}>
                      {note.question}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="rounded-xl p-4" style={{ background: "var(--wrong-dim)", border: "1px solid rgba(192,74,58,0.2)" }}>
                        <span className="kvle-label mb-1" style={{ color: "var(--wrong)" }}>내 답변</span>
                        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{note.selectedAnswer}</p>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: "var(--correct-dim)", border: "1px solid rgba(45,159,107,0.2)" }}>
                        <span className="kvle-label mb-1" style={{ color: "var(--correct)" }}>정답</span>
                        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{note.correctAnswer}</p>
                      </div>
                    </div>
                    <div className="rounded-xl p-4" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
                      <span className="kvle-label mb-2" style={{ color: "var(--blue)" }}>해설</span>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{note.explanation}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button onClick={handleRestart} className="kvle-btn-primary flex-1">
              <RotateCcw size={16} />
              새 세션 시작
            </button>
            <Link href="/wrong-notes" className="kvle-btn-ghost flex-1 flex items-center justify-center gap-2">
              <BookOpen size={16} />
              전체 오답 노트 보기
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify home page renders correctly**

Visit `http://localhost:3000`. Confirm:
- Hero text in Noto Serif KR, gold accent on 체계적으로 준비하세요
- Session card has gold top-bar, correct Korean labels
- Review queue card has blue accent
- Guest card visible when logged out
- Start a session and confirm progress bar, score counter, and question card all render

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/page.tsx
git commit -m "feat: Korean home page with 수험서 styling"
```

---

## Task 6: Wrong Notes Page (`app/wrong-notes/page.tsx`)

**Files:**
- Modify: `vet-exam-ai/app/wrong-notes/page.tsx`

- [ ] **Step 1: Apply Korean text and kvle classes**

Replace the entire file:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { RETRY_SESSION_KEY } from "../../lib/storage";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useWrongNotes } from "../../lib/hooks/useWrongNotes";
import { BookOpen } from "lucide-react";

export default function WrongNotesPage() {
  const { notes: wrongNotes, loading, deleteNote, clearAll } = useWrongNotes();
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const categories = useMemo(() => [...new Set(wrongNotes.map((n) => n.category))], [wrongNotes]);
  const filteredNotes = selectedCategory === "All"
    ? wrongNotes
    : wrongNotes.filter((n) => n.category === selectedCategory);

  const router = useRouter();

  function handleRetryWrongAnswers() {
    const retryQuestions = filteredNotes.map((note) => ({
      id: note.questionId,
      question: note.question,
      choices: note.choices,
      answer: note.correctAnswer,
      explanation: note.explanation,
      category: note.category,
    }));
    localStorage.setItem(RETRY_SESSION_KEY, JSON.stringify(retryQuestions));
    router.push("/retry-wrong");
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p style={{ color: "var(--text-muted)" }}>로딩 중…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
            오답 노트
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>틀린 문제와 해설을 복습하세요</p>
        </div>
        <Link href="/" className="kvle-btn-ghost text-sm">홈으로</Link>
      </div>

      {/* Filter & actions */}
      <section className="kvle-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label className="kvle-label mb-2">과목으로 필터</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="kvle-input"
              style={{ width: "auto", minWidth: "180px" }}
            >
              <option value="All">전체</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRetryWrongAnswers}
              disabled={filteredNotes.length === 0}
              className="kvle-btn-primary text-sm"
            >
              오답 재풀이
            </button>
            <button onClick={() => void clearAll()} className="kvle-btn-danger text-sm">
              전체 삭제
            </button>
          </div>
        </div>
      </section>

      {/* Notes list */}
      {filteredNotes.length === 0 ? (
        <section className="kvle-card text-center py-12">
          <BookOpen size={40} className="mx-auto mb-3" style={{ color: "var(--text-faint)" }} />
          <p style={{ color: "var(--text-muted)" }}>저장된 오답이 없습니다.</p>
        </section>
      ) : (
        <section className="space-y-4">
          {filteredNotes.map((note) => (
            <article
              key={note.questionId}
              className="rounded-xl p-6"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderLeft: "4px solid rgba(192,74,58,0.5)",
              }}
            >
              <span className="kvle-badge mb-3 inline-block">{note.category}</span>
              <h2 className="mb-4 text-lg font-semibold leading-relaxed" style={{ color: "var(--text)" }}>
                {note.question}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 text-sm">
                <div className="rounded-lg p-3" style={{ background: "var(--wrong-dim)", border: "1px solid rgba(192,74,58,0.2)" }}>
                  <span className="kvle-label mb-1" style={{ color: "var(--wrong)" }}>내 답변</span>
                  <p style={{ color: "var(--text-muted)" }}>{note.selectedAnswer}</p>
                </div>
                <div className="rounded-lg p-3" style={{ background: "var(--correct-dim)", border: "1px solid rgba(45,159,107,0.2)" }}>
                  <span className="kvle-label mb-1" style={{ color: "var(--correct)" }}>정답</span>
                  <p style={{ color: "var(--text-muted)" }}>{note.correctAnswer}</p>
                </div>
              </div>
              <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
                <span className="kvle-label mb-1" style={{ color: "var(--blue)" }}>해설</span>
                <p style={{ color: "var(--text-muted)" }}>{note.explanation}</p>
              </div>
              <button
                onClick={() => void deleteNote(note.questionId)}
                className="kvle-btn-danger text-sm"
                style={{ padding: "0.375rem 0.875rem" }}
              >
                삭제
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify at `/wrong-notes`**

Confirm Korean labels, gold-top-bar filter card, red-left-border note cards, filter select styled correctly.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/wrong-notes/page.tsx
git commit -m "feat: Korean 오답 노트 page with 수험서 styling"
```

---

## Task 7: My Stats Page (`app/my-stats/page.tsx`)

**Files:**
- Modify: `vet-exam-ai/app/my-stats/page.tsx`

- [ ] **Step 0: Read the current file**

Open `vet-exam-ai/app/my-stats/page.tsx` to identify existing English strings and class names before applying replacements.

- [ ] **Step 1: Apply Korean text and kvle classes**

Key replacements:
- "My Stats" → `나의 통계` (Noto Serif KR heading)
- "Total Attempts" → `총 시도`, "Total Correct" → `총 정답`, "Accuracy" → `정답률`, "Last 7 Days" → `최근 7일`
- "By Category" → `과목별 통계`; table headers: `과목`, `시도`, `정답`, `정답률`
- "Recent Attempts" → `최근 시도`; badges: `정답` / `오답`
- "Sign in to see your quiz statistics." → `통계를 확인하려면 로그인하세요.`
- "No attempts yet..." → `아직 풀이 내역이 없습니다. 퀴즈를 시작해 보세요.`
- "Start Quiz" → `퀴즈 시작`, "Practice Weakest" → `약점 집중 연습`
- "Loading..." → `로딩 중…`

Style changes:
- Page wrapper: `mx-auto max-w-3xl px-6 py-12 space-y-8`
- All container divs → `kvle-card`
- StatCard: `kvle-card` + `kvle-mono` on value, `kvle-label` on label
- Table: `border: 1px solid var(--border)` wrapping div, header row with `var(--text-muted)`, row `border-top: 1px solid var(--rule)`
- Correct badge: `background: var(--correct-dim); color: var(--correct)`
- Wrong badge: `background: var(--wrong-dim); color: var(--wrong)`
- All buttons: `kvle-btn-primary` or `kvle-btn-ghost`

- [ ] **Step 2: Verify at `/my-stats`**

Confirm stat cards render with gold top-bars, Korean labels, table styled with rule dividers.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/my-stats/page.tsx
git commit -m "feat: Korean 나의 통계 page with 수험서 styling"
```

---

## Task 8: Review Page (`app/review/page.tsx`)

**Files:**
- Modify: `vet-exam-ai/app/review/page.tsx`

- [ ] **Step 0: Read the current file**

Open `vet-exam-ai/app/review/page.tsx` before applying replacements.

- [ ] **Step 1: Apply Korean text and kvle classes**

Key replacements:
- "Review Queue" → `복습 큐`
- "Sign in to use spaced-repetition review." → `간격 반복 복습을 사용하려면 로그인하세요.`
- "No reviews due right now. Check back later!" → `지금 복습할 항목이 없습니다. 나중에 다시 확인하세요.`
- "Wrong Notes" → `오답 노트`, "Sign in" → `로그인`
- `{dueNotes.length} item(s) due for review.` → `{dueNotes.length}개 문제 복습 대기중`
- `You'll review up to {MAX_REVIEW} at a time.` → `한 번에 최대 {MAX_REVIEW}문제씩 복습합니다.`
- "Start Review" → `복습 시작`
- "Spaced-repetition review" → `간격 반복 복습`
- `Progress: {currentIndex + 1} / {sessionQuestions.length}` → `진행: {currentIndex + 1} / {sessionQuestions.length}`
- `Score: {score}` → `점수: {score}`
- "Back" → `돌아가기`, "Back Home" → `홈으로`
- "Review Complete" → `복습 완료!`
- "Reviewed" → `복습한 문제`, "Correct" → `정답`, "Incorrect" → `오답`
- "All reviewed items were rescheduled." → `모든 복습 항목이 일정에 반영되었습니다.`
- "Some items are due again now." → `일부 항목이 즉시 복습 대상이 됩니다.`
- `Review Again ({dueNotes.length})` → `다시 복습 (${dueNotes.length})`
- "Loading..." → `로딩 중…`

Style changes: same pattern as other pages — `kvle-card`, `kvle-btn-primary`, `kvle-btn-ghost`, `kvle-label`, `kvle-mono` on numeric values. Progress indicator uses `kvle-mono`.

- [ ] **Step 2: Verify at `/review`**

Confirm all states render (loading, unauthenticated, no reviews due, pre-session, active session, finished).

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/review/page.tsx
git commit -m "feat: Korean 복습 큐 page with 수험서 styling"
```

---

## Task 9: Practice Weakest Page (`app/practice/weakest/page.tsx`)

**Files:**
- Modify: `vet-exam-ai/app/practice/weakest/page.tsx`

- [ ] **Step 0: Read the current file**

Open `vet-exam-ai/app/practice/weakest/page.tsx` before applying replacements.

- [ ] **Step 1: Apply Korean text and kvle classes**

Key replacements:
- "Adaptive Practice" → `약점 집중 연습`
- "Sign in to use adaptive practice." → `적응형 연습을 사용하려면 로그인하세요.`
- "Not enough attempt history yet..." → `아직 시도 기록이 부족합니다. 몇 번 더 풀어본 후 다시 오세요.`
- "Start a Quiz" → `퀴즈 시작`
- "Your weakest category right now:" → `현재 가장 취약한 과목:`
- `{weakest.attempts} attempts · {weakest.accuracy}% accuracy · {weakest.attempts - weakest.correct} wrong`
  → `{weakest.attempts}회 시도 · {weakest.accuracy}% 정답률 · {weakest.attempts - weakest.correct}개 오답`
- `You'll get {PRACTICE_COUNT} questions from this category.` → `이 과목에서 ${PRACTICE_COUNT}문제가 출제됩니다.`
- "Start Practice" → `연습 시작`
- "Back" → `돌아가기`, "Back to My Stats" → `통계로 돌아가기`
- "Practice Complete" → `연습 완료!`
- `You answered {score} out of {sessionQuestions.length} correctly.` → `총 ${sessionQuestions.length}문제 중 ${score}문제를 맞혔습니다.`
- "Practice Again" → `다시 연습`
- "Loading..." → `로딩 중…`

Style: same `kvle-*` pattern. Weakest category name displayed in large serif text. Stats line uses `kvle-mono`.

- [ ] **Step 2: Verify at `/practice/weakest`**

Confirm all states render correctly with Korean text.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/practice/weakest/page.tsx
git commit -m "feat: Korean 약점 집중 연습 page with 수험서 styling"
```

---

## Task 10: Retry Wrong Page (`app/retry-wrong/page.tsx`)

**Files:**
- Modify: `vet-exam-ai/app/retry-wrong/page.tsx`

- [ ] **Step 0: Read the current file**

Open `vet-exam-ai/app/retry-wrong/page.tsx` before applying replacements.

- [ ] **Step 1: Apply Korean text and kvle classes**

Key replacements:
- "Retry Wrong Answers" → `오답 재풀이`
- "Re-attempt previously incorrect questions" → `이전에 틀린 문제를 다시 풀어보세요`
- "Back" → `돌아가기`, "Back to Wrong Notes" → `오답 노트로`, "Back Home" → `홈으로`
- "There are no retry questions available." → `재풀이할 문제가 없습니다.`
- "Loading..." → `로딩 중…`
- "Retry Complete" → `재풀이 완료!`
- `You answered {score} out of {sessionQuestions.length} correctly.` → `총 ${sessionQuestions.length}문제 중 ${score}문제를 맞혔습니다.`
- `Progress: {currentIndex + 1} / {sessionQuestions.length}` → `진행: {currentIndex + 1} / {sessionQuestions.length}`
- `Score: {score}` → `점수: {score}`

Style: same `kvle-*` pattern.

- [ ] **Step 2: Verify at `/retry-wrong` (navigate from `/wrong-notes`)**

Confirm Korean labels and consistent styling.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/retry-wrong/page.tsx
git commit -m "feat: Korean 오답 재풀이 page with 수험서 styling"
```

---

## Task 11: Login Page (`app/auth/login/page.tsx`)

**Files:**
- Modify: `vet-exam-ai/app/auth/login/page.tsx`

- [ ] **Step 0: Read the current file**

Open `vet-exam-ai/app/auth/login/page.tsx` before applying replacements.

- [ ] **Step 1: Apply Korean text and kvle classes**

Key replacements:
- `mode === "signin" ? "Sign in" : "Create account"` → `mode === "signin" ? "로그인" : "회원가입"`
- "← Back" → `← 돌아가기`
- "Email" → `이메일`, "Password" → `비밀번호`
- Submit button: `mode === "signin" ? "로그인" : "회원가입"`, loading → `처리 중…`
- "Don't have an account? Sign up" → `계정이 없으신가요? 회원가입`
- "Already have an account? Sign in" → `이미 계정이 있으신가요? 로그인`
- "Account created. Check your email..." → `계정이 생성되었습니다. 이메일로 전송된 인증 링크를 확인해 주세요.`

Style changes:
- Page: `mx-auto max-w-sm px-6 py-20`
- Wrap form in `kvle-card`
- Inputs: `kvle-input`
- Submit button: `kvle-btn-primary w-full`
- Error message: `kvle-card-raised` small text in `var(--text-muted)`
- Back link: `kvle-btn-ghost` text style

- [ ] **Step 2: Verify at `/auth/login`**

Confirm Korean labels, styled input fields, gold focus ring on inputs, mode toggle text is Korean.

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/app/auth/login/page.tsx
git commit -m "feat: Korean 로그인 page with 수험서 styling"
```

---

## Final Verification

- [ ] **Run through complete user journey**

1. Open `http://localhost:3000` — hero, session card, review queue card all render
2. Start a session as guest — QuestionCard renders, answer states work, session complete screen renders
3. Log in — dashboard cards render with user data
4. Visit `/wrong-notes` — list and filter render
5. Visit `/my-stats` — stat cards and table render
6. Visit `/review` — review queue renders
7. Visit `/practice/weakest` — practice start screen renders
8. Navigate to `/wrong-notes` → click "오답 재풀이" → confirm `/retry-wrong` renders Korean labels
9. Visit `/auth/login` — form renders with Korean labels and styled inputs
10. Check mobile at 375px width — NavBar shows icons only, text hidden

- [ ] **Final commit**

```bash
git add -A
git commit -m "chore: complete 수의국시 visual redesign and Korean localization"
```
