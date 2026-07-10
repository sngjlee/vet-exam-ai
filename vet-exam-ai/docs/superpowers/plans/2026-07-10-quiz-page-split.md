# Quiz Page Split + useQuizSession Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `app/quiz/page.tsx`(1406줄)의 세션 상태머신을 `useQuizSession` 훅으로, 뷰를 3개 컴포넌트로 분리하여 page.tsx를 ~90줄 오케스트레이션으로 축소한다. **동작 완전 불변.**

**Architecture:** 순수 이동 리팩터(behavior-preserving). 세션 상태(15 state + effect + start/answer/next/restart)는 훅이 소유하고, `user`/`dueCount`(setup 전용)는 page가 소유. 뷰는 setup/active/results 3단계 프레젠테이션 컴포넌트. 공유 타입·상수·순수 헬퍼는 `app/quiz/_components/quiz-history.ts`에 모은다.

**Tech Stack:** Next.js 16 App Router, React (client component), TypeScript strict + noUncheckedIndexedAccess, vitest.

---

## 중요 규칙 (모든 태스크 공통)

- **bash cwd 함정:** 호출 사이 cwd가 바깥 repo 루트로 리셋됨. 항상 `npm --prefix vet-exam-ai ...` 또는 절대경로 `cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"`.
- **동작 불변:** 로직 재작성·최적화·버그수정 **금지**. state 이름·effect 의존성 배열·타이머 타이밍·ref 로직·계산식을 **글자 그대로** 옮긴다.
- **검증:** 각 태스크 끝에 `npm --prefix vet-exam-ai run typecheck`(tsc --noEmit) 클린 + lint 신규 에러 0. 로컬 `next build`는 win32 바이너리 누락으로 실패 가능=코드 무관, tsc 클린이면 OK.
- 기준 파일: `app/quiz/page.tsx`(현재 1406줄). 라인 범위는 이 원본 기준.

---

## Task 1: 공유 모듈 `quiz-history.ts` — 타입·상수·순수 헬퍼

세션 도메인의 타입·상수·순수 함수를 한 파일에 모아 훅과 뷰가 공용 import한다. `localStorage` I/O 헬퍼도 포함.

**Files:**
- Create: `app/quiz/_components/quiz-history.ts`
- Test: `app/quiz/_components/quiz-history.test.ts`

- [ ] **Step 1: 순수 함수 테스트 작성 (실패 확인용)**

`app/quiz/_components/quiz-history.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatDuration, toMiniMockHistoryItem } from "./quiz-history";
import type { Database } from "../../../lib/supabase/types";

type Row = Database["public"]["Tables"]["mock_exam_sessions"]["Row"];

describe("formatDuration", () => {
  it("formats seconds as mm:ss zero-padded", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(600)).toBe("10:00");
  });
  it("clamps negatives to 00:00", () => {
    expect(formatDuration(-5)).toBe("00:00");
  });
});

describe("toMiniMockHistoryItem", () => {
  it("maps a row and defaults null categories to {}", () => {
    const row = {
      session_id: "s1",
      completed_at: "2026-07-10T00:00:00.000Z",
      total_count: 20,
      score: 15,
      accuracy: 75,
      elapsed_seconds: 300,
      wrong_count: 5,
      unanswered_count: 0,
      time_expired: false,
      categories: null,
    } as unknown as Row;
    const item = toMiniMockHistoryItem(row);
    expect(item.id).toBe("s1");
    expect(item.total).toBe(20);
    expect(item.categories).toEqual({});
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm --prefix vet-exam-ai run test -- quiz-history`
Expected: FAIL — `quiz-history` 모듈 없음.

- [ ] **Step 3: `quiz-history.ts` 작성**

원본 `page.tsx`에서 다음을 **그대로** 옮기고 `export`를 붙인다:
- 상수 L21-26: `TOTAL_QUESTIONS`, `MINI_MOCK_COUNT`, `MINI_MOCK_MINUTES`, `MINI_MOCK_SECONDS`, `MINI_MOCK_HISTORY_KEY`, `MINI_MOCK_HISTORY_LIMIT` → 전부 `export const`.
- 타입 L28-58: `SessionMode`, `SessionStartPayload`, `SessionWrongAnswer`, `MiniMockHistoryItem`, `MockExamSessionRow` → 전부 `export type`.
- 함수 L60-99: `formatDuration`, `readMiniMockHistory`, `writeMiniMockHistory`, `toMiniMockHistoryItem` → 전부 `export function`.

파일 상단 import:

```ts
import type { Database } from "../../../lib/supabase/types";
```

(다른 import 불필요 — 이 4함수는 window/JSON만 사용.) 본문은 원본 L60-99와 글자 단위로 동일해야 한다.

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm --prefix vet-exam-ai run test -- quiz-history`
Expected: PASS (2 describe, 4 assert).

- [ ] **Step 5: tsc 확인 & 커밋**

Run: `npm --prefix vet-exam-ai run typecheck`
Expected: 클린 (page.tsx는 아직 자체 정의를 쓰므로 중복 없음 — 이 파일은 신규 독립).

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git add app/quiz/_components/quiz-history.ts app/quiz/_components/quiz-history.test.ts
git commit -m "refactor(quiz): extract session types/constants/helpers to _components/quiz-history"
```

---

## Task 2: 인라인 프레젠테이션 컴포넌트 3개를 파일로 이동

`StudyModeShortcuts`·`MiniMockEntry`·`MiniMockHistory`를 page.tsx 인라인에서 개별 파일로 옮긴다. 본문 JSX는 그대로, 필요한 값은 Task 1 모듈에서 import.

**Files:**
- Create: `app/quiz/_components/StudyModeShortcuts.tsx` (원본 L101-173)
- Create: `app/quiz/_components/MiniMockEntry.tsx` (원본 L175-289)
- Create: `app/quiz/_components/MiniMockHistory.tsx` (원본 L291-379)

- [ ] **Step 1: `StudyModeShortcuts.tsx` 작성**

```tsx
import Link from "next/link";
import { ListChecks, MessageSquare } from "lucide-react";
```

그 뒤에 원본 L101-173 `function StudyModeShortcuts() { ... }`를 `export function StudyModeShortcuts()`로 그대로 붙인다.

- [ ] **Step 2: `MiniMockEntry.tsx` 작성**

```tsx
import { ClipboardCheck, Timer, ArrowRight } from "lucide-react";
import { MINI_MOCK_COUNT, MINI_MOCK_MINUTES } from "./quiz-history";
import type { SessionStartPayload } from "./quiz-history";
```

그 뒤에 원본 L175-289 `MiniMockEntry`를 `export function MiniMockEntry(...)`로 그대로 붙인다. (본문에서 `MINI_MOCK_COUNT`·`MINI_MOCK_MINUTES`·`SessionStartPayload` 참조가 이제 import로 해결됨.)

- [ ] **Step 3: `MiniMockHistory.tsx` 작성**

```tsx
import { formatDuration } from "./quiz-history";
import type { MiniMockHistoryItem } from "./quiz-history";
```

그 뒤에 원본 L291-379 `MiniMockHistory`를 `export function MiniMockHistory(...)`로 그대로 붙인다. (본문에서 `formatDuration`·`MiniMockHistoryItem` 참조가 import로 해결됨. lucide 아이콘 미사용 확인 — import 불필요.)

- [ ] **Step 4: tsc 확인**

Run: `npm --prefix vet-exam-ai run typecheck`
Expected: 클린. (page.tsx는 아직 자체 인라인 정의를 유지 중이므로 이 신규 파일들과 충돌 없음 — 이름은 다른 스코프.)

- [ ] **Step 5: 커밋**

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git add app/quiz/_components/StudyModeShortcuts.tsx app/quiz/_components/MiniMockEntry.tsx app/quiz/_components/MiniMockHistory.tsx
git commit -m "refactor(quiz): move inline presentation components to _components/"
```

---

## Task 3: `useQuizSession` 훅 — 세션 상태머신 추출

원본 `QuizPage`(L381-657)의 세션 상태·effect·핸들러를 훅으로 옮긴다. **뷰 렌더(L659-1404)는 아직 page.tsx에 남겨둔다** — 이 태스크는 page.tsx가 훅을 호출하도록 배선하고 자체 state 선언을 제거하는 것까지.

**Files:**
- Create: `lib/hooks/useQuizSession.ts`
- Modify: `app/quiz/page.tsx` (L381-657 영역을 훅 호출로 대체)

- [ ] **Step 1: `useQuizSession.ts` 작성 — 상태/effect/핸들러 이동**

파일 상단:

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { Question } from "../questions";
import { useWrongNotes } from "./useWrongNotes";
import { useAttempts } from "./useAttempts";
import { useAuth } from "./useAuth";
import { createClient } from "../supabase/client";
import type { QuestionMeta } from "./useQuestionMeta";
import {
  TOTAL_QUESTIONS,
  MINI_MOCK_COUNT,
  MINI_MOCK_SECONDS,
  MINI_MOCK_HISTORY_LIMIT,
  readMiniMockHistory,
  writeMiniMockHistory,
  toMiniMockHistoryItem,
  formatDuration,
} from "../../app/quiz/_components/quiz-history";
import type {
  SessionMode,
  SessionStartPayload,
  SessionWrongAnswer,
  MiniMockHistoryItem,
} from "../../app/quiz/_components/quiz-history";
```

훅 본문 = 원본 L382-657을 그대로 옮기되, `meta`는 인자로 받는다(원본은 `useQuestionMeta()`를 QuizPage에서 호출). 구조:

```ts
export function useQuizSession(meta: QuestionMeta | null) {
  // ── 원본 L387-406의 state/ref 선언을 그대로 (단 meta 관련 useQuestionMeta 호출은 제거)
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [started, setStarted] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map());
  const [sessionMode, setSessionMode] = useState<SessionMode>("practice");
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [sessionEndedAt, setSessionEndedAt] = useState<number | null>(null);
  const [sessionWrongAnswers, setSessionWrongAnswers] = useState<SessionWrongAnswer[]>([]);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [timeExpired, setTimeExpired] = useState(false);
  const [miniMockHistory, setMiniMockHistory] = useState<MiniMockHistoryItem[]>([]);
  const { addNote } = useWrongNotes();
  const { logAttempt } = useAttempts();
  const { user } = useAuth();
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const savedMiniMockResultRef = useRef<string | null>(null);

  // ── 파생값 원본 L408-425 그대로
  const currentQuestion = sessionQuestions[currentIndex];
  const finished = started && currentIndex >= sessionQuestions.length;
  const isMiniMock = sessionMode === "mini-mock";
  const accuracy =
    sessionQuestions.length > 0 ? Math.round((score / sessionQuestions.length) * 100) : 0;
  const elapsedSeconds =
    sessionStartedAt && sessionEndedAt
      ? Math.max(0, Math.round((sessionEndedAt - sessionStartedAt) / 1000))
      : null;
  const elapsedLabel = elapsedSeconds !== null ? formatDuration(elapsedSeconds) : null;
  const miniMockEndsAt = isMiniMock && sessionStartedAt ? sessionStartedAt + MINI_MOCK_SECONDS * 1000 : null;
  const remainingSeconds =
    miniMockEndsAt && !finished
      ? Math.max(0, Math.ceil((miniMockEndsAt - clockNow) / 1000))
      : null;
  const answeredCount = score + sessionWrongAnswers.length;
  const unansweredCount = Math.max(0, sessionQuestions.length - answeredCount);
  const timerIsUrgent = remainingSeconds !== null && remainingSeconds <= 60;

  // ── effect: 히스토리 로드 (원본 L427-460 그대로)
  // ── effect: 타이머 (원본 L462-476 그대로)
  // ── startSession (원본 L478-536 그대로) — meta 미참조라 변경 없음
  // ── handleAnswer (원본 L538-576 그대로)
  // ── handleNext (원본 L578-586 그대로)
  // ── handleRestart (원본 L587-593 그대로) — meta?.total 참조: 이제 인자 meta 사용
  // ── effect: mini-mock 결과 저장 (원본 L595-657 그대로)

  return {
    started, finished, isMiniMock,
    currentQuestion, currentIndex, sessionQuestions, score, commentCounts,
    remainingSeconds, timerIsUrgent, accuracy, elapsedLabel, unansweredCount,
    timeExpired, sessionWrongAnswers, miniMockHistory,
    sessionLoading, sessionError,
    startSession, handleAnswer, handleNext, handleRestart,
    quit: () => setStarted(false),
  };
}
```

주의사항:
- 원본 L589 `handleRestart`의 `meta?.total`은 인자 `meta`를 그대로 참조하므로 코드 변경 없음.
- effect 4개의 의존성 배열을 **글자 그대로** 유지(원본 L460, L476, L645-657). `user`·`meta` 등 참조 동일.
- `clockNow`는 내부 state로 유지(타이머 effect가 사용). 반환하지 않음(뷰는 `remainingSeconds`만 사용).
- `answeredCount`는 `unansweredCount` 계산용 내부 변수, 반환 안 함.

- [ ] **Step 2: `page.tsx`가 훅을 호출하도록 배선**

`app/quiz/page.tsx`에서:
- 원본 L382-657(useQuestionMeta 호출 이후의 모든 state/ref/파생값/effect/핸들러 선언)을 **삭제**하고 다음으로 대체:

```tsx
export default function QuizPage() {
  const { meta, loading: metaLoading, error: metaError } = useQuestionMeta();
  const { user, loading: authLoading } = useAuth();
  const dueCount = useDueCountCtx();
  const {
    started, finished, isMiniMock,
    currentQuestion, currentIndex, sessionQuestions, score, commentCounts,
    remainingSeconds, timerIsUrgent, accuracy, elapsedLabel, unansweredCount,
    timeExpired, sessionWrongAnswers, miniMockHistory,
    sessionLoading, sessionError,
    startSession, handleAnswer, handleNext, handleRestart, quit,
  } = useQuizSession(meta);

  return ( /* 기존 L659-1404 JSX 그대로 유지 */ );
}
```

- import 추가: `import { useQuizSession } from "../../lib/hooks/useQuizSession";`
- JSX 내 `onQuit={() => setStarted(false)}`(원본 L1050)를 `onQuit={quit}`로 변경.
- 더 이상 page.tsx가 직접 쓰지 않는 import 제거: `useEffect`, `useRef`, `useState`(전부 훅으로 이동), `createClient`, `Database`/`useWrongNotes`/`useAttempts` — **단 JSX가 여전히 쓰는 것은 남긴다**(`useState`는 이제 page에서 미사용이면 제거). 제거 후 tsc가 미사용 import를 잡아준다.
- page.tsx에 남아있는 인라인 컴포넌트/헬퍼/타입/상수(원본 L21-379)는 **이 태스크에서 아직 제거하지 않는다** — Task 4-6에서 뷰를 분리하며 함께 정리. 단 JSX가 이들을 계속 참조하므로 유지.

- [ ] **Step 3: tsc & lint 확인**

Run: `npm --prefix vet-exam-ai run typecheck`
Expected: 클린. 미사용 import가 있으면 제거.

Run: `npm --prefix vet-exam-ai run lint`
Expected: 신규 에러 0 (기존 베이스라인 에러는 무시).

- [ ] **Step 4: 커밋**

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git add lib/hooks/useQuizSession.ts app/quiz/page.tsx
git commit -m "refactor(quiz): extract session state machine to useQuizSession hook"
```

---

## Task 4: `QuizSetupView` — 미시작 화면 분리

원본 page.tsx JSX의 `!started` 블록들(헤더 L702-716 + shortcuts/entry/history L719-727 + 로그인 대시보드 L729-927 + 비회원 카드 L930-988)을 컴포넌트로 옮긴다.

**Files:**
- Create: `app/quiz/_components/QuizSetupView.tsx`
- Modify: `app/quiz/page.tsx`

- [ ] **Step 1: `QuizSetupView.tsx` 작성**

```tsx
import Link from "next/link";
import SessionSetup from "../../../components/SessionSetup";
import { StudyModeShortcuts } from "./StudyModeShortcuts";
import { MiniMockEntry } from "./MiniMockEntry";
import { MiniMockHistory } from "./MiniMockHistory";
import type { MiniMockHistoryItem, SessionStartPayload } from "./quiz-history";
import type { QuestionMeta } from "../../../lib/hooks/useQuestionMeta";
import type { User } from "@supabase/supabase-js";
import { Sparkles, Clock, ArrowRight, CheckCircle2 } from "lucide-react";

type Props = {
  meta: QuestionMeta | null;
  metaLoading: boolean;
  metaError: string | null;
  sessionLoading: boolean;
  sessionError: string | null;
  user: User | null;
  authLoading: boolean;
  dueCount: number;
  miniMockHistory: MiniMockHistoryItem[];
  onStart: (payload?: SessionStartPayload) => void;
};

export function QuizSetupView({
  meta, metaLoading, metaError, sessionLoading, sessionError,
  user, authLoading, dueCount, miniMockHistory, onStart,
}: Props) {
  return (
    <>
      {/* 원본 L702-988의 !started JSX 블록들을 그대로.
          단 각 블록의 바깥 `{!started && (...)}` 조건 래퍼는 제거
          (이 컴포넌트 자체가 !started일 때만 렌더되므로).
          startSession → onStart, meta?.* / metaLoading / sessionLoading /
          metaError / sessionError / user / authLoading / dueCount /
          miniMockHistory 참조는 전부 props로 해결됨. */}
    </>
  );
}
```

옮길 JSX(원본 라인, `{!started && (` 래퍼 안쪽만):
- 헤더: L703-715 (`<div className="fade-in" ...>`)
- `<StudyModeShortcuts />`: L719
- `<MiniMockEntry .../>`: L721-725 (`onStart={startSession}` → `onStart={onStart}`)
- `<MiniMockHistory history={miniMockHistory} />`: L727
- 로그인 대시보드 `{!started && !authLoading && user && (...)}`: L729-927 → `{!authLoading && user && (...)}`. 내부 `onStart={startSession}` → `onStart={onStart}`.
- 비회원 카드 `{!started && (!user || authLoading) && (...)}`: L930-988 → `{(!user || authLoading) && (...)}`. 내부 `onStart={startSession}` → `onStart={onStart}`.

`User` 타입 확인: 프로젝트에서 `user`의 타입은 `useAuth()` 반환. import 경로는 `@supabase/supabase-js`의 `User`. (Step 3 tsc가 불일치 시 잡음 — 불일치하면 `ReturnType<typeof useAuth>["user"]`로 대체.)

- [ ] **Step 2: page.tsx에서 setup JSX를 컴포넌트 호출로 대체**

원본 L702-988 전체(헤더~비회원 카드)를 다음으로 대체:

```tsx
{!started && (
  <QuizSetupView
    meta={meta}
    metaLoading={metaLoading}
    metaError={metaError}
    sessionLoading={sessionLoading}
    sessionError={sessionError}
    user={user}
    authLoading={authLoading}
    dueCount={dueCount}
    miniMockHistory={miniMockHistory}
    onStart={startSession}
  />
)}
```

import 추가: `import { QuizSetupView } from "./_components/QuizSetupView";`

- [ ] **Step 3: tsc 확인**

Run: `npm --prefix vet-exam-ai run typecheck`
Expected: 클린. `User` 타입 불일치 시 Step 1 노트대로 수정.

- [ ] **Step 4: 커밋**

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git add app/quiz/_components/QuizSetupView.tsx app/quiz/page.tsx
git commit -m "refactor(quiz): extract QuizSetupView"
```

---

## Task 5: `QuizActiveView` — 진행중 화면 분리

원본 L991-1056 `{started && !finished && currentQuestion && (...)}` 블록(타이머 배너 + QuestionCard)을 컴포넌트로.

**Files:**
- Create: `app/quiz/_components/QuizActiveView.tsx`
- Modify: `app/quiz/page.tsx`

- [ ] **Step 1: `QuizActiveView.tsx` 작성**

```tsx
import QuestionCard from "../../../components/QuestionCard";
import { formatDuration } from "./quiz-history";
import type { Question } from "../../../lib/questions";
import { Timer, AlertTriangle } from "lucide-react";

type Props = {
  isMiniMock: boolean;
  remainingSeconds: number | null;
  timerIsUrgent: boolean;
  currentQuestion: Question;
  currentIndex: number;
  total: number;
  commentCount: number | undefined;
  onAnswer: (p: { questionId: string; selectedAnswer: string; isCorrect: boolean }) => void;
  onNext: () => void;
  onQuit: () => void;
};

export function QuizActiveView({
  isMiniMock, remainingSeconds, timerIsUrgent, currentQuestion,
  currentIndex, total, commentCount, onAnswer, onNext, onQuit,
}: Props) {
  return (
    <div style={{ position: "relative", maxWidth: "48rem", margin: "0 auto" }}>
      {/* 원본 L993-1042 타이머 배너: isMiniMock && remainingSeconds !== null 블록 그대로 */}
      {/* 원본 L1043-1054 QuestionCard 그대로. 단 props 이름 매핑:
          question={currentQuestion}
          questionNumber={currentIndex + 1}
          total={total}
          onAnswer={onAnswer}
          onNext={onNext}
          onQuit={onQuit}
          commentCount={commentCount}
          feedbackMode={isMiniMock ? "deferred" : "instant"}
          sessionLabel={isMiniMock ? "모의고사" : "세션"}
          key={currentQuestion.id} */}
    </div>
  );
}
```

타이머 배너(원본 L993-1042)와 QuestionCard(L1043-1054)를 그대로 옮긴다. `formatDuration(remainingSeconds)` 호출(L1039)은 import로 해결. `remainingSeconds !== null` 가드가 배너 조건이므로 `formatDuration` 인자는 number로 좁혀짐.

- [ ] **Step 2: page.tsx에서 active JSX를 컴포넌트 호출로 대체**

원본 L991-1056 전체를 대체:

```tsx
{started && !finished && currentQuestion && (
  <QuizActiveView
    isMiniMock={isMiniMock}
    remainingSeconds={remainingSeconds}
    timerIsUrgent={timerIsUrgent}
    currentQuestion={currentQuestion}
    currentIndex={currentIndex}
    total={sessionQuestions.length}
    commentCount={commentCounts.get(currentQuestion.id)}
    onAnswer={handleAnswer}
    onNext={handleNext}
    onQuit={quit}
  />
)}
```

import 추가: `import { QuizActiveView } from "./_components/QuizActiveView";`
(`commentCounts.get(...)`를 page에서 계산해 넘기므로 뷰는 `Map`을 몰라도 됨. `currentQuestion` 좁힘은 바깥 `&& currentQuestion` 가드로 보장.)

- [ ] **Step 3: tsc 확인 & 커밋**

Run: `npm --prefix vet-exam-ai run typecheck`
Expected: 클린.

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git add app/quiz/_components/QuizActiveView.tsx app/quiz/page.tsx
git commit -m "refactor(quiz): extract QuizActiveView"
```

---

## Task 6: `QuizResultsView` — 완료 화면 분리

원본 L1059-1403 `{finished && (...)}` 블록(완료 카드 + 오답 해설 + 액션 버튼)을 컴포넌트로.

**Files:**
- Create: `app/quiz/_components/QuizResultsView.tsx`
- Modify: `app/quiz/page.tsx`

- [ ] **Step 1: `QuizResultsView.tsx` 작성**

```tsx
import Link from "next/link";
import type { Question } from "../../../lib/questions";
import type { SessionWrongAnswer } from "./quiz-history";
import { BookOpen, Sparkles, CheckCircle2, RotateCcw } from "lucide-react";

type Props = {
  isMiniMock: boolean;
  sessionQuestions: Question[];
  score: number;
  accuracy: number;
  unansweredCount: number;
  elapsedLabel: string | null;
  timeExpired: boolean;
  sessionWrongAnswers: SessionWrongAnswer[];
  onRestart: () => void;
};

export function QuizResultsView({
  isMiniMock, sessionQuestions, score, accuracy, unansweredCount,
  elapsedLabel, timeExpired, sessionWrongAnswers, onRestart,
}: Props) {
  return (
    <section className="fade-in" style={{ position: "relative", maxWidth: "48rem", margin: "0 auto" }}>
      {/* 원본 L1065-1401 내부(section 여는 태그 다음부터 닫는 태그 전까지)를 그대로.
          sessionQuestions.length / score / accuracy / unansweredCount /
          elapsedLabel / timeExpired / isMiniMock / sessionWrongAnswers 참조는 props로 해결.
          handleRestart → onRestart. */}
    </section>
  );
}
```

원본 결과 화면 JSX(L1065-1401, `<section>` 안쪽 전체)를 그대로 옮긴다. `onClick={handleRestart}`(L1346) → `onClick={onRestart}`.

- [ ] **Step 2: page.tsx에서 results JSX를 컴포넌트 호출로 대체**

원본 L1059-1403 전체를 대체:

```tsx
{finished && (
  <QuizResultsView
    isMiniMock={isMiniMock}
    sessionQuestions={sessionQuestions}
    score={score}
    accuracy={accuracy}
    unansweredCount={unansweredCount}
    elapsedLabel={elapsedLabel}
    timeExpired={timeExpired}
    sessionWrongAnswers={sessionWrongAnswers}
    onRestart={handleRestart}
  />
)}
```

import 추가: `import { QuizResultsView } from "./_components/QuizResultsView";`

- [ ] **Step 3: page.tsx 정리 — 인라인 잔재 제거**

이제 page.tsx JSX가 인라인 컴포넌트/헬퍼/타입/상수를 직접 참조하지 않으므로 원본 L21-379(상수/타입/헬퍼/StudyModeShortcuts/MiniMockEntry/MiniMockHistory 인라인 정의)를 **삭제**한다. 남는 page.tsx는:
- import 블록 (React 미사용이면 `useState` 등 제거; `Link`가 JSX에서 미사용이면 제거 — tsc가 잡음)
- `QuizPage()` 함수: 훅 3개 호출 + 배경 orbs(원본 L659-699) + 세 뷰 조건부 렌더 + `</main>`.

최종 page.tsx 상단 import 예상:

```tsx
"use client";

import { useAuth } from "../../lib/hooks/useAuth";
import { useDueCountCtx } from "../../lib/context/DueCountContext";
import { useQuestionMeta } from "../../lib/hooks/useQuestionMeta";
import { useQuizSession } from "../../lib/hooks/useQuizSession";
import { QuizSetupView } from "./_components/QuizSetupView";
import { QuizActiveView } from "./_components/QuizActiveView";
import { QuizResultsView } from "./_components/QuizResultsView";
```

(lucide/Link/QuestionCard/SessionSetup/Question 타입 등은 전부 뷰로 이동했으므로 page.tsx에서 제거. tsc가 미사용을 전부 잡아준다.)

- [ ] **Step 4: tsc & lint & 테스트 확인**

Run: `npm --prefix vet-exam-ai run typecheck`
Expected: 클린. 미사용 import 전부 제거된 상태.

Run: `npm --prefix vet-exam-ai run lint`
Expected: 신규 에러 0.

Run: `npm --prefix vet-exam-ai run test`
Expected: 기존 35 + quiz-history 신규 통과, 전부 그린.

- [ ] **Step 5: page.tsx 라인 수 확인**

Run: `wc -l app/quiz/page.tsx` (또는 파일 확인)
Expected: ~90-120줄 (오케스트레이션만).

- [ ] **Step 6: 커밋**

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git add app/quiz/page.tsx app/quiz/_components/QuizResultsView.tsx
git commit -m "refactor(quiz): extract QuizResultsView, reduce page.tsx to orchestration"
```

---

## Task 7: 최종 검증 & 동작 불변 리뷰

**Files:** (검증만, 코드 변경 없음 원칙)

- [ ] **Step 1: 전체 diff 리뷰 — 동작 불변 확인**

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git diff main...refactor/phase5-quiz-split -- app/quiz lib/hooks/useQuizSession.ts
```

확인 항목:
- effect 4개 의존성 배열이 원본과 글자 단위 동일한가.
- 타이머 interval 1000ms, 자동제출 조건(`now >= sessionStartedAt + MINI_MOCK_SECONDS * 1000`) 동일한가.
- `feedbackMode = isMiniMock ? "deferred" : "instant"`, `sessionLabel` 매핑 동일한가.
- 히스토리 저장 effect의 dedup(`findIndex`)·slice·localStorage·supabase insert 동일한가.
- `sessionIdRef`/`savedMiniMockResultRef` 사용 동일한가.

- [ ] **Step 2: 전체 typecheck + lint + test 최종 실행**

Run: `npm --prefix vet-exam-ai run typecheck && npm --prefix vet-exam-ai run lint && npm --prefix vet-exam-ai run test`
Expected: tsc 클린, lint 신규 0, test 전부 그린.

- [ ] **Step 3: 브랜치 push (유저가 PR 생성)**

```bash
cd "C:/Users/Theriogenology/Desktop/vet-exam-ai/vet-exam-ai"
git push -u origin refactor/phase5-quiz-split
```

gh CLI 미인증 → 유저에게 `https://github.com/sngjlee/vet-exam-ai/pull/new/refactor/phase5-quiz-split` 링크 안내. 배포 후 수동 QA: practice(instant) + mini-mock(타이머·시간종료 자동제출·히스토리 로드/저장) 두 경로.

---

## Self-Review 결과 (플랜 작성자 확인)

- **Spec coverage:** 파일 구조(Task 1-6 전부 커버), 훅 인터페이스(Task 3, 반환 필드 스펙과 일치), 뷰 3분할(Task 4-6), user/dueCount page 소유(Task 3 Step 2), 검증 전략(Task 1 unit + Task 7). ✓
- **Placeholder scan:** verbatim 이동 본문은 원본 라인 범위로 정확히 지시(플레이스홀더 아님, 소스가 진실). 신규 콘텐츠(시그니처·props·import)는 완전한 코드. ✓
- **Type consistency:** `SessionStartPayload`·`MiniMockHistoryItem`·`SessionWrongAnswer`·`QuestionMeta`·`Question` 이름이 Task 1→3→4-6에서 일관. 훅 반환 필드명이 Task 3 정의와 page 구조분해(Task 3 Step 2)·뷰 props(Task 4-6)에서 일치. ✓
- **위험 지점:** `User` 타입 import 경로 불확실 → Task 4 Step 1에 fallback 명시. page.tsx 미사용 import는 tsc가 강제로 잡음.
