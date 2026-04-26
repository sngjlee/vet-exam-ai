# Quiz Selector Design (M2 #6 / ROADMAP §11)

> 과목 다중 선택 + 문제 수 preset 도입. ROADMAP §11 "과목/교시/문제 수 선택 퀴즈" 중 **과목 복수 + 문제 수**만 다룬다 (교시 제외).
> 작성: 2026-04-26
> 토픽: dashboard `/quiz` SessionSetup UI 신설, `createSessionQuestions` 다중 카테고리 지원, localStorage 마지막 선택 기억.

---

## 1. 개요

### 목표
수험생이 dashboard 진입 → 원하는 과목군과 문제 수를 1~2 클릭 안에 골라 → 즉시 세션 시작. "전 과목 5문제 랜덤"만 가능했던 현재 quiz를 약점 집중 학습 도구로 확장.

### Scope (포함)
- 과목 다중 선택 (chips, 그룹 라벨, 그룹 전체선택)
- 문제 수 preset (5/10/20/30/50)
- 마지막 선택 기억 (localStorage, 비로그인 포함)
- 풀 사이즈 부족 시 preset 비활성화 + hint
- 컴포넌트 분리 (`SessionSetup`) + `createSessionQuestions` 인터페이스 변경

### 비포함 (명시적 제외)
- 교시별 선택 (별도 작업)
- 약점 집중 자동 추천 (`practice/weakest`로 별도 분리됨)
- 사용자별 `user_settings` DB 저장 (localStorage로 충분)
- "기타" 임의 숫자 입력 필드
- 과목별 정확 비중 보장 (합친 풀 무작위로 충분)
- 결과 화면에 세션 메타 표시 ("이 세션은 약리+병리 30문제")

### 성공 기준
- 매일 사용자가 dashboard 진입 → 시작까지 평균 1~2 클릭
- 비로그인 사용자도 selection 동작 (단, 로그인 후 attempts 저장은 기존과 동일)
- 기존 단일 과목 select 동작과 호환 (회귀 없음)
- 빈 선택, 풀 부족, localStorage 손상 모두 우아하게 처리

---

## 2. 사용자 흐름

### 1차 진입 (첫 사용자, localStorage 없음)
1. dashboard `/quiz` 진입
2. SessionSetup 카드: 과목 chips 모두 unselected, preset = 5 (default)
3. (선택 없이 시작 가능) "세션 시작" 클릭 → 빈 선택 = 전체 풀 → 5문제 무작위
4. 기존 QuestionCard 흐름 진입

### 반복 사용자 (localStorage 있음)
1. dashboard `/quiz` 진입
2. SessionSetup: 어제 선택한 과목 chips 활성, 어제 preset 활성
3. 변경 없으면 "세션 시작" 1클릭 → 같은 패턴 반복

### 과목 선택 → 풀 사이즈 변화
1. 사용자가 chip 토글 → SessionSetup이 즉시 `availablePoolSize` 재계산
2. 합친 풀이 20개라면 preset 30/50 disabled (회색, 클릭 불가, tooltip "최대 20")
3. 현재 선택된 preset이 풀보다 크면 자동으로 가능한 가장 큰 preset으로 reduce + hint 표시 ("20문제로 자동 조정")

### 그룹 전체선택
1. 그룹 헤더 옆 "전체 선택" 클릭 → 해당 그룹 모든 chip 활성화
2. 그룹 전체가 이미 선택된 상태에서 클릭 → "전체 해제"로 토글

### 시작 직전
1. "세션 시작" 클릭 → localStorage에 `{subjects, count, savedAt}` 저장
2. 기존 startSession() 흐름 진입 (`createSessionQuestions`가 새 인터페이스로 호출됨)
3. 세션 중 / 결과 화면은 기존과 동일

### 중도 종료
- QuestionCard `onQuit` → setStarted(false) → SessionSetup 카드로 복귀, 직전 selection 그대로 보임 (기존 동작 유지)

---

## 3. UI 컴포넌트 구조

### 신설

```
components/
  SessionSetup.tsx          # 과목 chips + preset + 시작 버튼 (Setup 전체)
  SubjectChipGroup.tsx      # 그룹 1개 단위 (라벨 + "전체 선택" + chip wrap)
lib/
  subjectGroups.ts          # 그룹 정의 + prefix → group 매핑 + 라벨
  hooks/
    useQuizConfig.ts        # localStorage 읽기/쓰기 + default fallback
```

### 기존 변경
- `app/quiz/page.tsx` — 시작 전 카드 영역(L131~482)을 `SessionSetup`으로 교체. 비회원 카드도 `SessionSetup`을 그대로 사용 (props로 변형 없이; Setup 자체는 인증 무관, 변화는 wrapper 레이아웃만).
- `lib/questions.ts` — `createSessionQuestions(questions, count, categoryFilter?)` → `(questions, count, categoryFilters?: string[])`. `categoryFilters` undefined/[] = 전체.
- `useQuestions` — 변경 없음. 이미 `categories` 제공.

### SessionSetup 컴포넌트 인터페이스

```tsx
type SessionSetupProps = {
  questions: Question[];          // 전체 active questions (poolSize 계산용)
  categories: string[];           // useQuestions에서
  loading: boolean;
  error: string | null;
  onStart: (config: { subjects: string[]; count: number }) => void;
};
```

내부 상태:
- `selectedSubjects: string[]` — chip 활성 상태 (`useQuizConfig` 훅으로 init)
- `count: number` — preset 선택값 (`useQuizConfig`)
- `availablePoolSize: number` — `useMemo`로 selectedSubjects + questions에서 즉시 계산

### SubjectChipGroup 인터페이스

```tsx
type SubjectChipGroupProps = {
  groupLabel: string;             // "기초", "예방", "임상", "법규"
  groupSubjects: string[];        // 이 그룹에 속한 카테고리 list
  selected: Set<string>;
  onToggle: (subject: string) => void;
  onToggleGroup: () => void;      // 그룹 전체 선택/해제
};
```

### 렌더 트리

```
QuizPage
  ├─ SessionSetup (started=false일 때만)
  │    ├─ SubjectChipGroup × 4 (기초/예방/임상/법규)
  │    ├─ PresetCount row (5/10/20/30/50 chips)
  │    ├─ AvailablePoolHint ("총 N문제 중 M문제 출제")
  │    └─ StartButton
  ├─ QuestionCard (started=true)
  └─ ResultSection (finished=true)
```

---

## 4. 데이터 모델 / 인터페이스

### 4.1 `lib/subjectGroups.ts`

```ts
export type SubjectGroup = {
  key: 'basic' | 'preventive' | 'clinical' | 'law';
  label: string;          // 화면 표기 ("기초", "예방", ...)
  prefix: string;         // 카테고리 코드 prefix (e.g., "1.")
};

export const SUBJECT_GROUPS: SubjectGroup[] = [
  { key: 'basic',      label: '기초', prefix: '1.' },
  { key: 'preventive', label: '예방', prefix: '2.' },
  { key: 'clinical',   label: '임상', prefix: '3.' },
  { key: 'law',        label: '법규', prefix: '4.' },
];

// useQuestions에서 가져온 categories를 그룹별로 분류
export function groupCategories(categories: string[]): Record<SubjectGroup['key'], string[]>;

// 단일 카테고리 → 어떤 그룹에 속하는지
export function getCategoryGroup(category: string): SubjectGroup | undefined;
```

**왜 prefix 매핑?** 데이터에서 카테고리 이름이 `1.1_해부` / `2.3_병리` 형태로 prefix를 가짐 (rewritten 파일명에서 확인). 새 과목 추가/이름 변경 시 자동 분류. prefix 규칙이 깨지면 fallback: prefix와 매칭되지 않는 카테고리는 어떤 그룹에도 속하지 않으며, 화면에는 표시되지 않는다 (현재 데이터는 모두 1.~4.이라 발생하지 않음).

### 4.2 `lib/questions.ts` — `createSessionQuestions` 시그니처 변경

```ts
// Before
createSessionQuestions(
  questions: Question[],
  count: number,
  categoryFilter?: string,         // 단일 카테고리 또는 undefined(=전체)
): Question[]

// After
createSessionQuestions(
  questions: Question[],
  count: number,
  categoryFilters?: string[],      // 다중 카테고리. 빈 배열/undefined = 전체
): Question[]
```

내부 로직:
```ts
const pool = activeQuestions.filter(
  q => !categoryFilters?.length || categoryFilters.includes(q.category)
);
// 기존 무작위 추출 로직 재사용 → Math.min(count, pool.length)
```

### 4.3 `lib/hooks/useQuizConfig.ts`

```ts
type QuizConfig = {
  subjects: string[];   // 선택된 카테고리 코드
  count: number;        // preset 값 (5/10/20/30/50 중 하나)
};

const STORAGE_KEY = 'kvle:quiz:lastConfig';
const DEFAULT_CONFIG: QuizConfig = { subjects: [], count: 5 };
const VALID_COUNTS = [5, 10, 20, 30, 50];

export function useQuizConfig(): {
  config: QuizConfig;
  setSubjects: (subjects: string[]) => void;
  setCount: (count: number) => void;
  saveConfig: () => void;       // 세션 시작 시 호출 (write)
};
```

**저장 정책:** chip 토글 / preset 변경 시 즉시 저장하지 않고, **세션 시작 직전에만 한 번 write**. 사용자가 이것저것 만지다가 시작 안 하고 떠나면 저장 안 됨 — "시작한 selection만 기억" 원칙.

**Read 정책:** 마운트 시 1회 읽음. 잘못된 JSON / unknown count / 형식 위반 모두 default로 fallback. stale subject(현재 categories에 없음)은 SessionSetup이 categories와 교집합으로 자동 정리.

### 4.4 PresetCount (SessionSetup 내부)

상태 props: `count`, `availablePoolSize`, `onSelect(n)`.
렌더: `[5, 10, 20, 30, 50].map(n => <chip disabled={n > availablePoolSize} active={n === count} />)`.
자동 reduce 로직은 SessionSetup에서 useEffect로 처리:
```ts
if (count > availablePoolSize) {
  const reduced = [...VALID_COUNTS].reverse().find(n => n <= availablePoolSize) ?? availablePoolSize;
  setCount(reduced);
}
```

---

## 5. 상태 관리 / localStorage

### 상태 owner 분리

| 상태 | Owner | 이유 |
|---|---|---|
| `selectedSubjects: string[]` | SessionSetup (`useQuizConfig` 초기값) | Setup 내부에서만 사용, 시작 시 onStart로 부모에 전달 |
| `count: number` | SessionSetup (`useQuizConfig` 초기값) | 동상 |
| `started`, `sessionQuestions`, `currentIndex`, `score` | QuizPage (기존) | 변경 없음 |
| `lastConfig` (localStorage) | `useQuizConfig` 훅 | 마운트 시 read, 시작 시 write |

### 부모 ↔ Setup 데이터 흐름

```tsx
QuizPage
  ├─ useQuestions() → questions, categories, loading, error
  └─ <SessionSetup
       questions={questions}
       categories={categories}
       loading={loading}
       error={error}
       onStart={({subjects, count}) => {
         // 1. createSessionQuestions(questions, count, subjects)
         // 2. setSessionQuestions / setStarted(true) / setCurrentIndex(0) / setScore(0)
         // 3. sessionIdRef.current = crypto.randomUUID()
       }}
     />
```

`useQuizConfig.saveConfig()`는 SessionSetup이 onStart 호출 직전에 자체 트리거 (부모는 storage 존재를 모름).

### useQuizConfig 훅 동작

```ts
function useQuizConfig() {
  const [config, setConfig] = useState<QuizConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (
        parsed && typeof parsed === 'object' &&
        Array.isArray(parsed.subjects) &&
        parsed.subjects.every((s: unknown) => typeof s === 'string') &&
        typeof parsed.count === 'number' &&
        VALID_COUNTS.includes(parsed.count)
      ) {
        setConfig({ subjects: parsed.subjects, count: parsed.count });
      }
    } catch { /* default fallback */ }
  }, []);

  const setSubjects = (subjects: string[]) => setConfig(prev => ({ ...prev, subjects }));
  const setCount = (count: number) => setConfig(prev => ({ ...prev, count }));

  const saveConfig = () => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...config,
        savedAt: new Date().toISOString()
      }));
    } catch { /* quota exceeded etc — silent */ }
  };

  return { config, setSubjects, setCount, saveConfig };
}
```

### SSR 고려
Next.js App Router에서 `app/quiz/page.tsx`는 이미 `"use client"`. `useQuizConfig`도 client-only. SSR 시 default 값으로 첫 렌더 → 마운트 후 localStorage 값으로 sync (1프레임 깜빡임 가능, 허용).

### 낯선 카테고리 처리
localStorage에 저장된 subjects 중 현재 categories에 없는 것이 있을 경우, SessionSetup이 selectedSubjects를 categories와 교집합으로 필터링한 후 chip 렌더. stale subject은 무시되고 자동 정리됨 (별도 안내 없음).

---

## 6. Edge cases & error handling

| 상황 | 동작 | 사용자 피드백 |
|---|---|---|
| 첫 진입, localStorage 없음 | DEFAULT_CONFIG (subjects=[], count=5) | 정상 노출, 모든 chip unselected, preset 5 highlighted |
| localStorage JSON 손상 | try/catch → DEFAULT_CONFIG fallback | 무음 |
| localStorage 쓰기 실패 (quota / private mode) | 무음 silent fail | 세션은 정상 시작, 다음 진입에 기억 안 됨 (수용) |
| 저장된 subject가 현재 categories에 없음 | categories 교집합으로 자동 필터링 | 무음 |
| 빈 선택 (subjects=[]) | activeQuestions 전체 풀에서 추출 | hint 영역에 "전체 과목 (총 N문제)" 표시, 시작 버튼 활성 |
| 풀 = 0 (선택한 과목 모두 active 0) | 시작 버튼 비활성, 빨간 안내 | "선택한 과목에 출제 가능한 문제가 없습니다" (기존 메시지 재사용) |
| 풀 < count | 자동 reduce + preset disabled | hint "선택 범위에 N문제 — 자동 조정됨" |
| 풀 < 5 (모든 preset disabled) | 가장 작은 preset(5) disabled, count = pool size로 강제 | hint "N문제 가능" + 시작 버튼 활성 (풀 사이즈로 시작) |
| `useQuestions` loading | SessionSetup 비활성 + spinner/skeleton | "로딩 중…" |
| `useQuestions` error | SessionSetup 비활성 + 빨간 안내 | "문제를 불러오지 못했습니다" (기존 메시지 재사용) |
| 비로그인 사용자 | SessionSetup 동일하게 노출 | wrapper 카피만 변경 ("비회원으로 연습"), Setup 자체는 인증 무관 |
| 세션 진행 중 페이지 이탈 → 복귀 | 기존 동작 (start 상태 휘발) | SessionSetup이 마지막 selection으로 다시 표시 |

### 시작 버튼 활성 조건 (모두 만족)
1. `!loading && !error`
2. `availablePoolSize > 0` (빈 선택이어도 active 전체가 0개가 아니면 OK)
3. `count > 0` (자동 reduce 후 항상 보장됨)

### 시작 시 호출 분기
- subjects가 비어있으면 `createSessionQuestions(questions, count)` (3번째 인자 생략)
- 아니면 `createSessionQuestions(questions, count, subjects)`

### 로깅/관측
기존 `useAttempts.logAttempt`가 카테고리 1개를 받음 (`currentQuestion.category`). 다중 과목 세션이라도 attempts는 question 단위로 기록되니 변경 불필요. 세션 메타 저장은 §1 비포함 — 결과 화면에 표시도 V2.

---

## 7. 테스트 접근

### 인프라 현황
없음. `npm run lint` (ESLint) + `tsc` 타입 체크만 존재. 본 plan에는 테스트 인프라 도입(vitest/jest) 포함하지 않는다 — 그 자체로 결정 영역이며 별도 plan으로 분리한다.

### 접근: Manual smoke test only
- 타입 체크 + lint로 정합성 1차 보장
- 실 사용자처럼 dev server 띄워 아래 checklist 통과 확인
- 향후 데이터 레이어 변경 잦아지면 vitest 도입 고려

### Manual smoke test checklist

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | 첫 진입 (localStorage 비움) | DEFAULT_CONFIG, 모든 chip unselected, preset 5 활성, "전체 N문제" hint, 시작 버튼 활성 |
| 2 | 빈 선택으로 시작 | 활성 전체 풀에서 5문제 무작위, 기존 QuestionCard 흐름 정상 |
| 3 | 단일 과목 + 10 선택 후 시작 | 해당 과목 풀에서 10개, 결과 화면 정상 |
| 4 | 다중 과목 (3개 그룹) + 30 선택 | 합친 풀 무작위 30개 |
| 5 | 그룹 "전체 선택" 클릭 | 해당 그룹 모든 chip 활성, 다시 클릭 → 전체 해제 |
| 6 | 풀 < count (예: 1과목 active 12, count 30) | 자동 reduce → 10 (가장 큰 valid preset), 30/50 disabled, hint 표시 |
| 7 | 풀 = 0 (active 0인 가상 카테고리) | 시작 버튼 비활성, 빨간 안내 |
| 8 | 시작 후 페이지 새로고침 | 마지막 selection으로 SessionSetup 복귀 |
| 9 | 비로그인 사용자 | SessionSetup 동작 동일, wrapper 카피 ("비회원으로 연습") |
| 10 | DevTools에서 localStorage 손상 (`{"foo":"bar"}`) | DEFAULT_CONFIG fallback, 경고 없음 |
| 11 | DevTools에서 stale subject (`"99.X_없는과목"`) | 자동 필터링, chip 안 보임 |
| 12 | 모바일 viewport (~375px) | chip wrap 정상, 시작 버튼 풀폭, 그룹 라벨 가독 |
| 13 | `npm run lint && npx tsc --noEmit` | 무경고/무에러 |

---

## 8. 작업 순서 힌트 (plan 작성용 참고)

1. `lib/subjectGroups.ts` (constant + 매핑 함수, 가장 기반)
2. `lib/questions.ts` — `createSessionQuestions` 시그니처 확장 (호출처 일시 호환)
3. `lib/hooks/useQuizConfig.ts` (localStorage)
4. `components/SubjectChipGroup.tsx` (작은 단위 먼저)
5. `components/SessionSetup.tsx` (위 모두 통합)
6. `app/quiz/page.tsx` — SessionSetup으로 교체, 기존 setup 영역 제거
7. Manual smoke test 13개 항목 통과 확인
8. lint + tsc 무에러 확인
