# Quiz Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dashboard `/quiz`에 과목 다중 선택 + 문제 수 preset 도입. localStorage로 마지막 선택 기억. SessionSetup 컴포넌트로 분리 + `createSessionQuestions` 시그니처를 다중 카테고리로 확장.

**Architecture:** Setup UI를 `SessionSetup` 컴포넌트로 떼어내 `app/quiz/page.tsx`의 setup 영역(L131~482)을 교체한다. 그룹 매핑은 `lib/subjectGroups.ts` constant + 매핑 함수 한 파일에서 관리. localStorage 입출력은 `lib/hooks/useQuizConfig.ts` 훅에 격리. 인증 무관 — QuizPage가 wrapper 카드 카피만 user 유무로 분기.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, lucide-react (기존), Supabase (questions 데이터). 테스트 인프라 없음 — manual smoke test + tsc + lint로 회귀 검증.

**Spec:** `docs/superpowers/specs/2026-04-26-quiz-selector-design.md`

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `vet-exam-ai/lib/subjectGroups.ts` | 그룹 constant + groupCategories/getCategoryGroup |
| Create | `vet-exam-ai/lib/hooks/useQuizConfig.ts` | localStorage 마지막 선택 read/write 훅 |
| Create | `vet-exam-ai/components/SubjectChipGroup.tsx` | 그룹 1개 단위 (라벨 + "전체 선택" + chip wrap) |
| Create | `vet-exam-ai/components/SessionSetup.tsx` | Setup 전체 (chips + preset + 시작 버튼 + hint) |
| Modify | `vet-exam-ai/lib/questions/utils.ts` | createSessionQuestions: `categoryFilter?: string` → `categoryFilters?: string[]` |
| Modify | `vet-exam-ai/app/quiz/page.tsx` | setup 영역(L131~482)을 SessionSetup 통합으로 교체 |

기존 호출처 영향: `createSessionQuestions`는 `app/quiz/page.tsx` 외에는 호출되지 않는다 (Task 2에서 grep 확인). 따라서 page.tsx 변경과 함께 처리하면 회귀 없음.

---

## Task 1: Create `lib/subjectGroups.ts`

**Files:**
- Create: `vet-exam-ai/lib/subjectGroups.ts`

**Why first:** 다른 모듈(SubjectChipGroup, SessionSetup)이 이걸 import한다. 가장 기반.

- [ ] **Step 1: Write the file**

```ts
// vet-exam-ai/lib/subjectGroups.ts

export type SubjectGroupKey = 'basic' | 'preventive' | 'clinical' | 'law';

export type SubjectGroup = {
  key: SubjectGroupKey;
  label: string;
  subjects: string[]; // 이 그룹에 속하는 카테고리 풀네임 list
};

// Source of truth: pipeline/extract.py SUBJECTS 테이블 (session 1~4)
export const SUBJECT_GROUPS: SubjectGroup[] = [
  {
    key: 'basic',
    label: '기초',
    subjects: ['해부학', '조직학', '생리학', '생화학', '약리학', '독성학'],
  },
  {
    key: 'preventive',
    label: '예방',
    subjects: [
      '미생물학',
      '전염병학',
      '병리학',
      '공중보건학',
      '조류질병학',
      '수생생물의학',
      '기생충학',
      '실험동물학',
    ],
  },
  {
    key: 'clinical',
    label: '임상',
    subjects: ['내과학', '임상병리학', '외과학', '영상진단의학', '산과학'],
  },
  {
    key: 'law',
    label: '법규',
    subjects: ['수의법규'],
  },
];

/**
 * 현재 데이터에 존재하는 categories 중에서 각 그룹에 속하는 것들만 모아 반환.
 * SUBJECT_GROUPS의 subjects는 "정의" — categories는 "데이터에 실제로 있는 것".
 * 둘의 교집합만 그룹별로 반환한다.
 */
export function groupCategories(
  categories: string[],
): Record<SubjectGroupKey, string[]> {
  const set = new Set(categories);
  const result = {} as Record<SubjectGroupKey, string[]>;
  for (const group of SUBJECT_GROUPS) {
    result[group.key] = group.subjects.filter((s) => set.has(s));
  }
  return result;
}

/**
 * 단일 카테고리가 어느 그룹에 속하는지. 어느 그룹에도 없으면 undefined.
 */
export function getCategoryGroup(category: string): SubjectGroup | undefined {
  return SUBJECT_GROUPS.find((g) => g.subjects.includes(category));
}
```

- [ ] **Step 2: Verify with tsc**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 무에러 (새 파일이라 영향 없음)

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/subjectGroups.ts
git commit -m "Add subjectGroups.ts — 4 groups (기초/예방/임상/법규) + 매핑 함수"
```

---

## Task 2: Update `createSessionQuestions` to accept `categoryFilters[]`

**Files:**
- Modify: `vet-exam-ai/lib/questions/utils.ts`

**Why second:** SessionSetup의 `onStart` payload가 이걸 호출한다. 시그니처가 먼저 안 정해지면 SessionSetup 작성 후 또 변경.

- [ ] **Step 1: Verify only one caller exists**

Run: `cd vet-exam-ai && grep -rn "createSessionQuestions" app/ components/ lib/`
Expected output: `lib/questions/utils.ts` (정의), `lib/questions/index.ts` (re-export), `app/quiz/page.tsx` (호출 1건). 다른 호출 없음 확인.

- [ ] **Step 2: Replace `categoryFilter?: string` with `categoryFilters?: string[]`**

`vet-exam-ai/lib/questions/utils.ts`를 다음으로 교체:

```ts
import type { Question } from "./types";

export function getCategories(pool: Question[]): string[] {
  return [...new Set(pool.map((q) => q.category))];
}

export function shuffleArray<T>(array: T[]): T[] {
  const copied = [...array];
  for (let i = copied.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

/**
 * Active 풀에서 categoryFilters에 해당하는 questions만 골라 무작위 N개 반환.
 * categoryFilters undefined 또는 빈 배열이면 active 전체에서 추출.
 */
export function createSessionQuestions(
  pool: Question[],
  total: number,
  categoryFilters?: string[],
): Question[] {
  const active = pool.filter((q) => q.isActive !== false);
  const hasFilter = categoryFilters && categoryFilters.length > 0;
  const filtered = hasFilter
    ? active.filter((q) => categoryFilters!.includes(q.category))
    : active;

  const shuffled = shuffleArray(filtered);
  return shuffled.slice(0, total);
}
```

- [ ] **Step 3: Update sole caller in `app/quiz/page.tsx`**

`vet-exam-ai/app/quiz/page.tsx` L41~55의 `startSession` 함수 안에서:

Before (L44):
```ts
const categoryFilter = selectedCategory === "All" ? undefined : selectedCategory;
const pool = categoryFilter
  ? activeQuestions.filter((q) => q.category === categoryFilter)
  : activeQuestions;
const total = Math.min(TOTAL_QUESTIONS, pool.length);
const newSession = createSessionQuestions(questions, total, categoryFilter);
```

After (임시 — Task 6에서 다시 교체됨):
```ts
const categoryFilters = selectedCategory === "All" ? undefined : [selectedCategory];
const pool = categoryFilters
  ? activeQuestions.filter((q) => categoryFilters.includes(q.category))
  : activeQuestions;
const total = Math.min(TOTAL_QUESTIONS, pool.length);
const newSession = createSessionQuestions(questions, total, categoryFilters);
```

- [ ] **Step 4: Verify with tsc + lint**

Run: `cd vet-exam-ai && npx tsc --noEmit && npm run lint`
Expected: 무에러/무경고

- [ ] **Step 5: Commit**

```bash
git add vet-exam-ai/lib/questions/utils.ts vet-exam-ai/app/quiz/page.tsx
git commit -m "createSessionQuestions: 단일 카테고리 → 다중 카테고리 배열 지원"
```

---

## Task 3: Create `lib/hooks/useQuizConfig.ts`

**Files:**
- Create: `vet-exam-ai/lib/hooks/useQuizConfig.ts`

**Why third:** SessionSetup이 이 훅으로 초기 selection을 가져온다. SubjectChipGroup보다 먼저 둘 이유는 SubjectChipGroup이 더 단순해서 마지막에 묶기 위함.

- [ ] **Step 1: Write the file**

```ts
// vet-exam-ai/lib/hooks/useQuizConfig.ts
"use client";

import { useEffect, useState } from "react";

export type QuizConfig = {
  subjects: string[];
  count: number;
};

const STORAGE_KEY = "kvle:quiz:lastConfig";
export const VALID_COUNTS = [5, 10, 20, 30, 50] as const;
export const DEFAULT_CONFIG: QuizConfig = { subjects: [], count: 5 };

function isValidStored(parsed: unknown): parsed is QuizConfig {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.subjects)) return false;
  if (!p.subjects.every((s): s is string => typeof s === "string")) return false;
  if (typeof p.count !== "number") return false;
  if (!VALID_COUNTS.includes(p.count as (typeof VALID_COUNTS)[number])) return false;
  return true;
}

export function useQuizConfig() {
  const [config, setConfig] = useState<QuizConfig>(DEFAULT_CONFIG);

  // 마운트 시 localStorage에서 1회 read (SSR 안전)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (isValidStored(parsed)) {
        setConfig({ subjects: parsed.subjects, count: parsed.count });
      }
    } catch {
      // JSON 손상 / 접근 불가 — DEFAULT_CONFIG 유지
    }
  }, []);

  const setSubjects = (subjects: string[]) =>
    setConfig((prev) => ({ ...prev, subjects }));
  const setCount = (count: number) => setConfig((prev) => ({ ...prev, count }));

  /** 세션 시작 직전 호출. config를 localStorage에 저장. 실패는 무음. */
  const saveConfig = () => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...config, savedAt: new Date().toISOString() }),
      );
    } catch {
      // quota exceeded / private mode — silent
    }
  };

  return { config, setSubjects, setCount, saveConfig };
}
```

- [ ] **Step 2: Verify with tsc**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 무에러

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/hooks/useQuizConfig.ts
git commit -m "Add useQuizConfig — localStorage 마지막 선택 read/write + default fallback"
```

---

## Task 4: Create `components/SubjectChipGroup.tsx`

**Files:**
- Create: `vet-exam-ai/components/SubjectChipGroup.tsx`

**Why before SessionSetup:** SessionSetup이 이 컴포넌트를 4번 렌더한다. 단독 단위 먼저.

- [ ] **Step 1: Write the file**

```tsx
// vet-exam-ai/components/SubjectChipGroup.tsx
"use client";

type Props = {
  groupLabel: string;
  groupSubjects: string[]; // 이 그룹에서 데이터에 존재하는 카테고리만
  selected: Set<string>;
  onToggle: (subject: string) => void;
  onToggleGroup: () => void; // 그룹 전체 선택/해제
};

export default function SubjectChipGroup({
  groupLabel,
  groupSubjects,
  selected,
  onToggle,
  onToggleGroup,
}: Props) {
  if (groupSubjects.length === 0) return null;

  const allSelected = groupSubjects.every((s) => selected.has(s));

  return (
    <div style={{ marginBottom: "0.875rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.375rem",
        }}
      >
        <span
          className="kvle-label"
          style={{ color: "var(--text-muted)" }}
        >
          {groupLabel} {groupSubjects.length}
        </span>
        <button
          type="button"
          onClick={onToggleGroup}
          style={{
            fontSize: "0.6875rem",
            color: "var(--teal)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "0.25rem 0.5rem",
          }}
        >
          {allSelected ? "전체 해제" : "전체 선택"}
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
        {groupSubjects.map((subject) => {
          const active = selected.has(subject);
          return (
            <button
              key={subject}
              type="button"
              onClick={() => onToggle(subject)}
              style={{
                background: active ? "rgba(30,167,187,0.15)" : "var(--surface-raised)",
                border: active ? "1px solid var(--teal)" : "1px solid var(--border)",
                color: active ? "var(--teal)" : "var(--text-muted)",
                padding: "0.3125rem 0.75rem",
                borderRadius: "9999px",
                fontSize: "0.75rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 200ms, border-color 200ms, color 200ms",
              }}
            >
              {subject}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify with tsc**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 무에러

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/components/SubjectChipGroup.tsx
git commit -m "Add SubjectChipGroup — 그룹 1개 단위 chip + 그룹 전체 선택/해제"
```

---

## Task 5: Create `components/SessionSetup.tsx`

**Files:**
- Create: `vet-exam-ai/components/SessionSetup.tsx`

**Why:** Task 1~4 모두 통합. Setup 전체 UI + 자동 reduce + hint.

- [ ] **Step 1: Write the file**

```tsx
// vet-exam-ai/components/SessionSetup.tsx
"use client";

import { useEffect, useMemo } from "react";
import { Play } from "lucide-react";
import type { Question } from "../lib/questions/types";
import { groupCategories, SUBJECT_GROUPS } from "../lib/subjectGroups";
import { useQuizConfig, VALID_COUNTS } from "../lib/hooks/useQuizConfig";
import SubjectChipGroup from "./SubjectChipGroup";

type Props = {
  questions: Question[];
  categories: string[];
  loading: boolean;
  error: string | null;
  onStart: (config: { subjects: string[]; count: number }) => void;
};

export default function SessionSetup({
  questions,
  categories,
  loading,
  error,
  onStart,
}: Props) {
  const { config, setSubjects, setCount, saveConfig } = useQuizConfig();

  // 데이터에 존재하지 않는 stale subject은 무음으로 정리
  const validSubjects = useMemo(() => {
    const set = new Set(categories);
    return config.subjects.filter((s) => set.has(s));
  }, [config.subjects, categories]);

  const selectedSet = useMemo(() => new Set(validSubjects), [validSubjects]);

  // 그룹별 카테고리 (현재 데이터에 있는 것만)
  const grouped = useMemo(() => groupCategories(categories), [categories]);

  // 활성 풀 사이즈 계산 (selected 기준, 빈 선택 = active 전체)
  const activeQuestions = useMemo(
    () => questions.filter((q) => q.isActive !== false),
    [questions],
  );
  const availablePoolSize = useMemo(() => {
    if (validSubjects.length === 0) return activeQuestions.length;
    return activeQuestions.filter((q) => selectedSet.has(q.category)).length;
  }, [activeQuestions, selectedSet, validSubjects]);

  // 자동 reduce: count > 풀 → 가능한 가장 큰 valid preset 또는 풀 사이즈로
  useEffect(() => {
    if (availablePoolSize === 0) return; // 풀 0이면 시작 자체가 막힘
    if (config.count > availablePoolSize) {
      const reduced =
        [...VALID_COUNTS].reverse().find((n) => n <= availablePoolSize) ??
        availablePoolSize;
      setCount(reduced);
    }
  }, [availablePoolSize, config.count, setCount]);

  function handleToggleSubject(subject: string) {
    const next = new Set(validSubjects);
    if (next.has(subject)) next.delete(subject);
    else next.add(subject);
    setSubjects([...next]);
  }

  function handleToggleGroup(groupSubjectsInData: string[]) {
    const next = new Set(validSubjects);
    const allSelected = groupSubjectsInData.every((s) => next.has(s));
    if (allSelected) {
      groupSubjectsInData.forEach((s) => next.delete(s));
    } else {
      groupSubjectsInData.forEach((s) => next.add(s));
    }
    setSubjects([...next]);
  }

  function handleSelectCount(n: number) {
    if (n > availablePoolSize) return;
    setCount(n);
  }

  function handleStart() {
    if (!canStart) return;
    saveConfig();
    onStart({ subjects: validSubjects, count: config.count });
  }

  const canStart = !loading && !error && availablePoolSize > 0;

  // 풀 < 5 → 어떤 preset도 클릭 불가, count = pool size로 강제
  useEffect(() => {
    if (availablePoolSize > 0 && availablePoolSize < VALID_COUNTS[0] && config.count !== availablePoolSize) {
      setCount(availablePoolSize);
    }
  }, [availablePoolSize, config.count, setCount]);

  return (
    <div>
      {/* ── 과목 chips (그룹별) ── */}
      <div style={{ marginBottom: "1.25rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "0.625rem",
          }}
        >
          <span className="kvle-label">과목 선택</span>
          <span className="text-xs" style={{ color: "var(--text-faint)" }}>
            {validSubjects.length === 0
              ? "비워두면 전체 과목"
              : `${validSubjects.length}개 선택됨`}
          </span>
        </div>
        {SUBJECT_GROUPS.map((group) => (
          <SubjectChipGroup
            key={group.key}
            groupLabel={group.label}
            groupSubjects={grouped[group.key]}
            selected={selectedSet}
            onToggle={handleToggleSubject}
            onToggleGroup={() => handleToggleGroup(grouped[group.key])}
          />
        ))}
      </div>

      {/* ── 문제 수 preset ── */}
      <div style={{ marginBottom: "1rem" }}>
        <span className="kvle-label" style={{ display: "block", marginBottom: "0.5rem" }}>
          문제 수
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {VALID_COUNTS.map((n) => {
            const disabled = n > availablePoolSize;
            const active = config.count === n;
            return (
              <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => handleSelectCount(n)}
                title={disabled ? `최대 ${availablePoolSize}` : undefined}
                style={{
                  background: active
                    ? "rgba(30,167,187,0.15)"
                    : "var(--surface-raised)",
                  border: active
                    ? "1px solid var(--teal)"
                    : "1px solid var(--border)",
                  color: active ? "var(--teal)" : "var(--text-muted)",
                  padding: "0.375rem 0.875rem",
                  borderRadius: "9999px",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.4 : 1,
                  transition: "background 200ms, border-color 200ms, color 200ms",
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── hint ── */}
      <p
        className="text-xs"
        style={{ color: "var(--text-muted)", marginBottom: "1.25rem" }}
      >
        {error
          ? "문제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
          : loading
            ? "로딩 중…"
            : availablePoolSize === 0
              ? "선택한 과목에 출제 가능한 문제가 없습니다."
              : availablePoolSize < VALID_COUNTS[0]
                ? `${availablePoolSize}문제로 시작 — 풀 사이즈가 작아 자동 조정됨`
                : config.count === availablePoolSize && availablePoolSize < VALID_COUNTS[VALID_COUNTS.length - 1]
                  ? `선택 범위 ${availablePoolSize}문제 중 ${config.count}문제 출제`
                  : `선택 범위에 충분한 문제 — ${config.count}문제 출제`}
      </p>

      {/* ── 시작 버튼 ── */}
      <button
        type="button"
        onClick={handleStart}
        disabled={!canStart}
        className="inline-flex items-center gap-3 font-semibold active:scale-[0.98] w-full sm:w-auto justify-center"
        style={{
          background: "var(--teal)",
          color: "#fff",
          borderRadius: "9999px",
          padding: "10px 10px 10px 22px",
          fontSize: "0.875rem",
          border: "none",
          cursor: !canStart ? "not-allowed" : "pointer",
          opacity: !canStart ? 0.5 : 1,
          transition:
            "opacity 300ms cubic-bezier(0.32,0.72,0,1), transform 200ms cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        {loading ? "로딩 중…" : "세션 시작"}
        <span
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Play size={14} className="fill-current" />
        </span>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify with tsc + lint**

Run: `cd vet-exam-ai && npx tsc --noEmit && npm run lint`
Expected: 무에러/무경고

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/components/SessionSetup.tsx
git commit -m "Add SessionSetup — chips + preset + 자동 reduce + hint + 시작"
```

---

## Task 6: Replace setup area in `app/quiz/page.tsx`

**Files:**
- Modify: `vet-exam-ai/app/quiz/page.tsx`

**Why:** SessionSetup을 실제로 wire up. 기존 인라인 setup 영역 (회원/비회원 카드 모두) 제거하고 SessionSetup으로 대체. 시작 화면 외 영역(active session, finished)은 손대지 않음.

- [ ] **Step 1: Read current page.tsx to confirm structure**

이미 알려진 구조:
- L20~30: state, hooks
- L41~55: `startSession` (Task 2에서 임시 수정됨)
- L131~146: 헤더 영역
- L148~394: 회원 카드 (세션 시작 + 복습 큐)
- L396~482: 비회원 카드
- L484~497: active session
- L499~786: 결과 화면

`SessionSetup`은 회원 카드 / 비회원 카드 둘 다에 들어가며, 외곽 카드(border-top, padding 등)는 유지하되 내부 인라인 selector 코드만 SessionSetup으로 교체한다.

- [ ] **Step 2: Update startSession to accept payload from SessionSetup**

`vet-exam-ai/app/quiz/page.tsx` L41~55 `startSession`을 다음으로 교체 (Task 2의 임시 코드 → 최종 형태):

```ts
function startSession(payload?: { subjects: string[]; count: number }) {
  const subjects = payload?.subjects ?? [];
  const count = payload?.count ?? TOTAL_QUESTIONS;

  const categoryFilters = subjects.length > 0 ? subjects : undefined;
  const newSession = createSessionQuestions(questions, count, categoryFilters);
  if (newSession.length === 0) return;

  sessionIdRef.current = crypto.randomUUID();
  setSessionQuestions(newSession);
  setCurrentIndex(0);
  setScore(0);
  setStarted(true);
}
```

`TOTAL_QUESTIONS = 5`는 fallback default로만 남긴다 (handleRestart 호환).

- [ ] **Step 3: Update handleRestart to repeat last config**

L87:
```ts
function handleRestart() { startSession(); }
```
→ 변경 없음 (payload 없이 호출하면 빈 선택 + 5문제 default — 이건 기존 "All / 5" 동작과 동일하게 fallback). Restart는 항상 default 동작 — 사용자가 다른 selection 원하면 시작 화면으로 돌아가야 함. 단순함 우선.

- [ ] **Step 4: Replace member card setup area (L148~394)**

기존 회원 카드의 선택 + 시작 영역(L191~268, "스마트 학습 라벨 + 헤드라인 + select + 버튼"이 들어있는 inner div)을 SessionSetup으로 교체. 외곽 카드(border-top, double-bezel padding) 유지. 복습 큐 카드(L272~393)는 그대로 둔다.

회원 카드 내부의 inner div 구조를 다음으로 교체:

```tsx
<div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
  <div>
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
      <Sparkles size={15} style={{ color: "var(--teal)" }} />
      <span className="kvle-label">스마트 학습</span>
    </div>
    <h2
      className="text-lg font-bold tracking-tight"
      style={{ color: "var(--text)", marginBottom: "0.375rem" }}
    >
      오늘의 학습을 시작하세요
    </h2>
    <p
      className="text-sm"
      style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}
    >
      과목과 문제 수를 골라 KVLE 유형 문제를 풀어보세요.
    </p>
  </div>
  <SessionSetup
    questions={questions}
    categories={categories}
    loading={questionsLoading}
    error={questionsError ? "문제를 불러오지 못했습니다" : null}
    onStart={startSession}
  />
</div>
```

import 추가 (page.tsx 상단):
```ts
import SessionSetup from "../../components/SessionSetup";
```

기존 state/handler 정리 (page.tsx에서 제거):
- `selectedCategory`, `setSelectedCategory` state — SessionSetup 내부로 이동했으므로 page.tsx에서 삭제
- `selectedQuestionCount` 계산 — SessionSetup이 자체 계산
- `canStartSession` 계산 — SessionSetup이 자체 계산
- 기존 `<select>` + 외부 시작 버튼 영역 제거

- [ ] **Step 5: Replace non-member card setup area (L396~482)**

비회원 카드 내부에서:
- "비회원으로 연습하기" 헤더 + 안내 문구는 유지
- 기존 시작 버튼 (`<button onClick={startSession}>`)을 SessionSetup으로 교체

비회원 카드 내부 구조:
```tsx
<div className="grid grid-cols-1 gap-6">
  <div style={{ position: "relative" }}>
    <h2
      className="text-base font-bold tracking-tight"
      style={{ color: "var(--text)", marginBottom: "0.375rem" }}
    >
      비회원으로 연습하기
    </h2>
    <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
      문제를 풀어볼 수 있지만, 학습 기록 저장과 간격 반복 학습은 로그인이 필요합니다.
    </p>
  </div>
  <SessionSetup
    questions={questions}
    categories={categories}
    loading={questionsLoading}
    error={questionsError ? "문제를 불러오지 못했습니다" : null}
    onStart={startSession}
  />
</div>
```

기존 `grid-cols-1 sm:grid-cols-[1fr_auto]` 등 비회원 카드의 grid 구조도 단순화 (선택+버튼이 SessionSetup 한 덩어리로 들어감).

- [ ] **Step 6: Remove unused imports/state**

제거 대상:
- `selectedCategory` state + `setSelectedCategory`
- `categories`, `selectedQuestionCount`, `canStartSession` 중 page.tsx 내부에서 더 이상 직접 쓰이지 않는 것 (SessionSetup props로만 전달되는 것은 유지)
- `Play`, `Clock` 등 lucide-react 아이콘 중 회원/비회원 카드에서 더 이상 안 쓰는 것 — `Play`는 SessionSetup으로 이동했으니 page.tsx에서 사용 검사 후 제거

`useQuestions`에서 `categories`는 여전히 SessionSetup props로 전달하므로 유지.

- [ ] **Step 7: Verify with tsc + lint**

Run: `cd vet-exam-ai && npx tsc --noEmit && npm run lint`
Expected: 무에러/무경고. lint가 unused import 잡으면 정리.

- [ ] **Step 8: Commit**

```bash
git add vet-exam-ai/app/quiz/page.tsx
git commit -m "Wire SessionSetup into quiz page (회원/비회원 카드 모두) + startSession payload 처리"
```

---

## Task 7: Manual smoke test + final cleanup

**Why:** spec §7의 13개 manual checklist 통과 확인. 회귀 없음 검증.

- [ ] **Step 1: Start dev server**

```bash
cd vet-exam-ai && npm run dev
```
브라우저에서 `http://localhost:3000/quiz` 접속.

- [ ] **Step 2: Run smoke test checklist**

DevTools → Application → Local Storage에서 `kvle:quiz:lastConfig` 키를 manipulate하며 아래 13개 항목을 차례로 확인:

| # | 시나리오 | 기대 동작 | 결과 |
|---|---|---|---|
| 1 | 첫 진입 (storage 비움) | 모든 chip unselected, preset 5 active, "비워두면 전체 과목" hint, 시작 버튼 활성 | [ ] PASS |
| 2 | 빈 선택 + 시작 | 5문제 무작위 추출, QuestionCard 정상 진행 | [ ] PASS |
| 3 | 단일 과목 (예: 약리학) + 10 + 시작 | 약리학에서 10문제 추출 | [ ] PASS |
| 4 | 다중 과목 (3개) + 30 + 시작 | 합친 풀 무작위 30문제 | [ ] PASS |
| 5 | 그룹 "전체 선택" 클릭 | 해당 그룹 모든 chip 활성, 다시 클릭 → 전체 해제 | [ ] PASS |
| 6 | 풀 < count (예: 1과목 + 30) | 자동 reduce + 30/50 disabled + hint 표시 | [ ] PASS |
| 7 | 풀 = 0 (선택 0 + 데이터 0인 가상 상태) | 시작 버튼 비활성 + 빨간 안내 | [ ] PASS |
| 8 | 시작 + 페이지 새로고침 | SessionSetup 복귀, 마지막 selection 유지 | [ ] PASS |
| 9 | 비로그인 사용자 (로그아웃 후) | SessionSetup 동작 동일, wrapper 카피 다름 | [ ] PASS |
| 10 | DevTools에서 storage 값 `{"foo":"bar"}` 후 새로고침 | DEFAULT_CONFIG fallback, 경고 없음 | [ ] PASS |
| 11 | DevTools에서 storage subjects에 `["없는과목"]` 추가 후 새로고침 | 자동 필터링, chip 안 보임 | [ ] PASS |
| 12 | 모바일 viewport (~375px) | chip wrap 정상, 시작 버튼 풀폭, 그룹 라벨 가독 | [ ] PASS |
| 13 | `npm run lint && npx tsc --noEmit` | 무에러/무경고 | [ ] PASS |

체크가 모두 PASS면 다음 step.

- [ ] **Step 3: Final lint + tsc 한 번 더**

Run: `cd vet-exam-ai && npx tsc --noEmit && npm run lint`
Expected: 무에러/무경고

- [ ] **Step 4: Update memory + final commit**

별도 코드 변경이 더 있으면 commit. 없으면 memory만 갱신:

```bash
# (선택) 메모리 파일 갱신
# C:/Users/Theriogenology/.claude/projects/.../memory/MEMORY.md에
# - [quiz_selector_done.md](./project_quiz_selector.md) — 2026-04-26 M2 #6 완료
# 항목 추가
```

### Manual Test Failures: 처리 방침

체크 중 PASS하지 않는 항목이 있으면:
- **시나리오 1, 2, 3, 4, 8**: 핵심 흐름 회귀. 즉시 디버그 (대개 startSession payload 또는 createSessionQuestions 호출 인자 문제)
- **시나리오 5, 6**: SessionSetup 내부 토글/auto-reduce 로직. useEffect deps 또는 setSubjects/setCount 호출 누락
- **시나리오 7**: hint 분기 또는 canStart 조건 누락
- **시나리오 10, 11**: useQuizConfig의 isValidStored 또는 validSubjects 필터링 결함
- **시나리오 12**: SubjectChipGroup의 flex-wrap 또는 카드 외곽 grid 결함

수정 후 해당 시나리오 + 의존하는 후속 시나리오 재실행.

---

## Self-Review (이 plan 작성자가 직접 실행)

**1. Spec coverage:**
- §1 개요/scope/성공기준 — Task 1~6 전체에 반영
- §2 사용자 흐름 6개 — Task 6 + Task 7 manual checklist에 반영
- §3 컴포넌트 구조 — Task 1, 3, 4, 5에 1:1 매핑
- §4.1 subjectGroups — Task 1
- §4.2 createSessionQuestions — Task 2
- §4.3 useQuizConfig — Task 3
- §4.4 PresetCount — Task 5에 통합 (별도 컴포넌트 미분리 — Setup 내부에 인라인. spec §3 "작으면 인라인도 OK" 명시 부합)
- §5 상태 관리 — Task 5 (owner 분리), Task 6 (payload 흐름)
- §6 edge cases 12개 — Task 5 (대부분), Task 7 manual checklist (전체 검증)
- §7 manual smoke test — Task 7
- §8 작업 순서 — Task 순서가 §8과 일치 (subjectGroups → questions/utils → useQuizConfig → SubjectChipGroup → SessionSetup → page.tsx → smoke test)

빠진 항목 없음.

**2. Placeholder scan:**
TBD/TODO 없음. 모든 step에 실제 코드 또는 명령어. "appropriate error handling" 같은 vague 지시 없음.

**3. Type consistency:**
- `QuizConfig` (useQuizConfig) — `{subjects: string[], count: number}` 일관
- `SubjectGroup` (subjectGroups) — Task 1 정의, Task 5에서 import해 그대로 사용
- `createSessionQuestions(pool, total, categoryFilters?: string[])` — Task 2 정의, Task 6에서 동일 시그니처로 호출
- `SessionSetupProps.onStart` payload — Task 5 정의 (`{subjects, count}`), Task 6 startSession 인자와 일치

일관성 OK.
