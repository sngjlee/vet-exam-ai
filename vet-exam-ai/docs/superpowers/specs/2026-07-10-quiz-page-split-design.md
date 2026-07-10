# Design — `app/quiz/page.tsx` 분할 + `useQuizSession` 훅 추출

- **Date:** 2026-07-10
- **Phase:** 5 (유지보수) — 마지막 항목 ②useQuizSession + ④quiz/page.tsx 분할
- **Type:** 순수 리팩터 (behavior-preserving). 마이그레이션 없음, 신규 기능 없음.

## 배경 / 문제

`app/quiz/page.tsx` = 1406줄. default export `QuizPage()`(L381~끝, ~1025줄)가 단일 거대 컴포넌트로:

- `useState` 15개 / `useEffect` 4개
- `type SessionMode = "practice" | "mini-mock"` — 한 컴포넌트가 `sessionMode` 상태로 두 모드를 분기
  (타이머, deferred vs instant 채점, 시간종료 자동제출, mini-mock 히스토리 저장/로드)
- setup(미시작) / active(진행중) / results(완료) 세 단계 뷰가 한 return 안에 조건부로 뒤섞임

이미 추출된 것: `formatDuration`·`readMiniMockHistory`·`writeMiniMockHistory`·`toMiniMockHistoryItem`·`StudyModeShortcuts`·`MiniMockEntry`·`MiniMockHistory`(L60~380, 전부 page.tsx 인라인). 기존 훅 `lib/hooks/useQuizConfig.ts` 존재.

**목표:** 세션 상태머신을 훅으로 추출하고 뷰를 3단계 컴포넌트로 분리하여 `page.tsx`를 오케스트레이션(~90줄)으로 축소한다. **동작은 완전 불변**이어야 한다.

## 범위 (scope = B "균형")

- ② `useQuizSession` 훅으로 세션 상태머신 추출.
- ④ 뷰를 `QuizSetupView` / `QuizActiveView` / `QuizResultsView` 3개 컴포넌트로 분리.
- 기존 인라인 컴포넌트/헬퍼도 파일로 이동하여 `page.tsx`를 확실히 비운다.

**범위 밖:** practice/mini-mock를 별도 훅·라우트로 완전 분리(옵션 C)는 하지 않는다. 동작 불변 검증이 어렵고 이 항목의 목적(유지보수성)에 과하다. `/review`(별도 라우트, 395줄)는 손대지 않는다. 로직 재작성·최적화·버그수정 금지 — 순수 위치 이동만.

## 파일 구조

```
lib/hooks/useQuizSession.ts        ← 세션 상태머신 (신규)
app/quiz/
  page.tsx                          ← 오케스트레이션만 (~90줄로 축소)
  _components/                       ← Next.js `_` prefix = 라우팅 제외
    quiz-history.ts                 ← MiniMockHistoryItem/SessionWrongAnswer/SessionStartPayload/SessionMode 타입
                                       + formatDuration + read/write/toMiniMockHistoryItem 헬퍼 + 상수
    StudyModeShortcuts.tsx          ← page.tsx 인라인에서 이동
    MiniMockEntry.tsx               ← 이동
    MiniMockHistory.tsx             ← 이동
    QuizSetupView.tsx               ← 신규 (미시작 화면)
    QuizActiveView.tsx              ← 신규 (진행중 화면)
    QuizResultsView.tsx             ← 신규 (완료 화면)
```

- 퀴즈 전용 컴포넌트이므로 route 옆 `app/quiz/_components/`에 co-locate. (`components/`의 `QuestionCard`·`SessionSetup`은 여러 페이지 공용이라 그대로 둔다.)
- 공유 상수(`MINI_MOCK_COUNT`·`MINI_MOCK_MINUTES`·`MINI_MOCK_SECONDS`·`MINI_MOCK_HISTORY_KEY`·`MINI_MOCK_HISTORY_LIMIT`·`TOTAL_QUESTIONS`)와 타입, `formatDuration`은 `quiz-history.ts`에 모아 훅·뷰가 공용 import.

## `useQuizSession` 훅 인터페이스

훅이 세션 상태머신 전체를 소유한다. 15개 state + 관련 effect + start/answer/next/restart 로직 + 파생값 계산을 흡수하고, 뷰는 읽기 전용 파생값 + 액션 콜백만 받는다.

```ts
function useQuizSession(meta: QuestionMeta | null): {
  // 단계 플래그
  started: boolean;
  finished: boolean;
  isMiniMock: boolean;
  // 진행 상태
  currentQuestion: Question | undefined;
  currentIndex: number;
  sessionQuestions: Question[];
  score: number;
  commentCounts: Map<string, number>;
  // mini-mock 타이머/결과 파생값
  remainingSeconds: number | null;
  timerIsUrgent: boolean;
  accuracy: number;
  elapsedLabel: string | null;
  unansweredCount: number;
  timeExpired: boolean;
  sessionWrongAnswers: SessionWrongAnswer[];
  miniMockHistory: MiniMockHistoryItem[];
  // 로딩/에러
  sessionLoading: boolean;
  sessionError: string | null;
  // 액션
  startSession: (payload?: SessionStartPayload) => void;
  handleAnswer: (p: { questionId: string; selectedAnswer: string; isCorrect: boolean }) => void;
  handleNext: () => void;
  handleRestart: () => void;
  quit: () => void; // setStarted(false)
};
```

**소유권 경계:**
- 훅 내부에서 `useWrongNotes`(addNote)·`useAttempts`(logAttempt)·`useAuth`(user — 히스토리 로드/저장용)를 호출한다.
- `user`/`dueCount`/`authLoading`은 **setup 화면 전용**(세션 도메인과 무관)이므로 **`page.tsx`가 `useAuth`·`useDueCountCtx`를 직접 호출**하여 소유한다. 훅은 히스토리에 필요한 `user`만 자체 `useAuth`로 다시 읽는다 — `useAuth`는 내부적으로 context/캐시라 중복 호출 비용이 없고, 경계가 깔끔해진다 (옵션 A).
- `meta`는 `startSession`의 mini-mock count 계산·`handleRestart`에 필요하므로 인자로 주입한다. `metaLoading`/`metaError`는 setup 뷰 전용이라 page가 소유.

**동작 완전 불변 원칙:**
- state 이름·`useEffect` 의존성 배열·타이머 타이밍(1s interval)·`sessionIdRef`/`savedMiniMockResultRef` ref 로직을 그대로 옮긴다.
- `startSession`의 fetch/try-catch, `/api/comments/counts` batch fetch, mini-mock 결과 저장 effect(localStorage + `mock_exam_sessions` insert)를 로직 변경 없이 이동.
- 파생값(`accuracy`·`elapsedSeconds`·`miniMockEndsAt`·`remainingSeconds`·`answeredCount`·`unansweredCount`·`timerIsUrgent`) 계산식 그대로.

## 뷰 컴포넌트 분리

각 뷰는 훅이 반환한 값 + page가 소유한 값(user/dueCount 등)을 props로 받는 순수 프레젠테이션 컴포넌트.

- **`QuizSetupView`** (`!started`): 헤더 + `StudyModeShortcuts` + `MiniMockEntry` + `MiniMockHistory` + 로그인 대시보드 카드(세션 시작 `SessionSetup` + 복습 큐)/비회원 카드. props: `meta`·`metaLoading`·`metaError`·`sessionLoading`·`sessionError`·`user`·`authLoading`·`dueCount`·`miniMockHistory`·`onStart`.
- **`QuizActiveView`** (`started && !finished && currentQuestion`): mini-mock 타이머 배너 + `QuestionCard`. props: `isMiniMock`·`remainingSeconds`·`timerIsUrgent`·`currentQuestion`·`currentIndex`·`total`·`commentCounts`·`onAnswer`·`onNext`·`onQuit`.
- **`QuizResultsView`** (`finished`): 완료 카드(점수/정답률/미응답/소요) + 오답 해설 리스트 + 액션 버튼(다시 풀기/오답노트). props: `isMiniMock`·`sessionQuestions`·`score`·`accuracy`·`unansweredCount`·`elapsedLabel`·`timeExpired`·`sessionWrongAnswers`·`onRestart`.
- `page.tsx`는 배경 orbs + 세 뷰의 조건부 렌더만 담당.

## 검증 전략 (behavior-preserving 증명)

테스트 커버 없음 + 로그인 게이트 뒤라 로컬 스모크 제한적.

1. **tsc 클린** — `npm --prefix vet-exam-ai run typecheck`(또는 `tsc --noEmit`). 로컬 `next build`는 win32 네이티브 바이너리 누락으로 실패 가능하나 코드 무관(Vercel 정상). tsc 클린이면 OK.
2. **lint 신규 에러 0** — main 베이스라인에 기존 에러 존재 → 신규 에러 없음만 검증. "exit 0" 강제 금지.
3. **훅 유닛 테스트(저비용 추가)** — `formatDuration`·`toMiniMockHistoryItem`은 순수 함수라 vitest 커버 가능. 이동하는 김에 몇 개 추가. fetch/localStorage 의존 로직은 테스트 제외.
4. **배포 후 수동 QA** — practice(instant 채점) + mini-mock(타이머·시간종료 자동제출·히스토리 저장/로드) 두 경로 유저 스모크. 브랜치 푸시 후 유저가 `pull/new/<branch>` 링크로 PR 생성(gh CLI 미인증).

**리스크 관리:** 순수 위치 이동이라 diff는 크지만 로직 변경 0. 서브에이전트 개발 시 태스크마다 "동작 불변" 스펙 리뷰를 게이트로 둔다.

## 방법론

`writing-plans → subagent-driven-development(태스크당 구현→스펙리뷰→최종리뷰) → finishing-a-development-branch`. 직전 ⑤⑥ 세션에서 이 흐름으로 성공.

**함정:**
- bash cwd가 호출 사이 바깥 repo 루트로 리셋 → 항상 `npm --prefix vet-exam-ai ...` 또는 절대경로 `cd`. (`subagent_repo_root_path_confusion`)
- gh CLI 미인증 → PR 자동생성 불가. 유저가 직접 생성.
- 로컬 next build 실패는 코드 무관(`windows_native_binary_build`).
- lint 베이스라인 기존 에러 존재, 신규만 검증(`lint_baseline_pre_existing`).
