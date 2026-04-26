# Dashboard D-day Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드 최상단에 시험일 D-day와 "오늘 권장 N문제" 위젯을 추가하고, 시험일을 단일 source of truth로 통합한다.

**Architecture:** `lib/examDate.ts`에 시험일 상수 + 헬퍼를 export하여 기존 `DDayBadge`(랜딩)와 신규 `DDayPlanWidget`(대시보드)이 공유. 위젯은 client-side에서 `/api/questions` 전체 fetch 후 `localStorage.kvle:quiz:lastConfig`와 intersection으로 풀 사이즈 계산. `storage` 이벤트로 다른 탭 변경 동기화.

**Tech Stack:** Next.js (App Router), React 19 client components, TypeScript, 기존 `useQuizConfig` 패턴 (useState + useEffect hydration).

**Spec:** `docs/superpowers/specs/2026-04-26-dashboard-dday-widget-design.md`

**참고 — 이 repo는 unit test framework 미설치(quiz selector도 manual smoke). 따라서 각 task는 코드 변경 + manual smoke로 검증하고, 마지막 Task 7에서 통합 smoke 시나리오 실행한다.**

---

### Task 1: 시험일 단일 source 파일 생성

**Files:**
- Create: `vet-exam-ai/lib/examDate.ts`

- [ ] **Step 1: 파일 생성 — 상수 + 헬퍼**

`vet-exam-ai/lib/examDate.ts`:

```ts
// vet-exam-ai/lib/examDate.ts
// 시험일 단일 source of truth. 공고 후 EXAM_DATE / EXAM_DATE_LABEL 갱신,
// IS_TENTATIVE = false 변경으로 (예상) 라벨 제거.

export const EXAM_DATE = new Date("2027-01-15T00:00:00+09:00");
export const EXAM_DATE_LABEL = "2027.01.15";
export const IS_TENTATIVE = true;

export function daysUntilExam(now: number = Date.now()): number {
  return Math.ceil((EXAM_DATE.getTime() - now) / 86_400_000);
}
```

- [ ] **Step 2: 타입 체크 통과 확인**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 에러 없이 통과 (이 파일은 신규이며 어디서도 import되지 않음 — 다음 task에서 연결)

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/lib/examDate.ts
git commit -m "Add lib/examDate.ts — 시험일 단일 source of truth"
```

---

### Task 2: 기존 DDayBadge를 examDate 상수로 리팩터 + (예상) 라벨

**Files:**
- Modify: `vet-exam-ai/components/DDayBadge.tsx`

- [ ] **Step 1: 내부 상수 제거 + import 사용 + (예상) 라벨 추가**

`vet-exam-ai/components/DDayBadge.tsx` 전체 교체:

```tsx
"use client";

import { useEffect, useState } from "react";
import { EXAM_DATE_LABEL, IS_TENTATIVE, daysUntilExam } from "../lib/examDate";

export default function DDayBadge() {
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    setDays(daysUntilExam());
    const id = setInterval(() => setDays(daysUntilExam()), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "10px",
      padding: "8px 14px", borderRadius: "10px",
      background: "rgba(192,74,58,0.08)",
      border: "1px solid rgba(192,74,58,0.25)",
      fontFamily: "var(--font-mono)",
      marginBottom: "14px",
    }}>
      <span style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--wrong)", fontWeight: 700 }}>
        수의사 국가시험
      </span>
      <span aria-hidden="true" style={{ color: "var(--border)" }}>·</span>
      <span style={{ fontSize: "14px", color: "var(--text)", fontWeight: 800 }}>
        D-{days ?? "···"}
      </span>
      {IS_TENTATIVE && (
        <span style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 600 }}>
          (예상)
        </span>
      )}
      <span aria-hidden="true" style={{ color: "var(--border)" }}>·</span>
      <span style={{ fontSize: "11px", color: "var(--text-faint)", fontWeight: 600 }}>
        {EXAM_DATE_LABEL}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 랜딩에서 동작 확인**

Run: `cd vet-exam-ai && npm run dev` (백그라운드)
브라우저 `http://localhost:3000` → 우측 상단 D-day 배지 노출 + `(예상)` 라벨 + `2027.01.15` 정상 표시 확인.

- [ ] **Step 4: Commit**

```bash
git add vet-exam-ai/components/DDayBadge.tsx
git commit -m "DDayBadge: examDate 상수 import + (예상) 라벨"
```

---

### Task 3: DDayPlanWidget 컴포넌트 생성 (좌측 D-day 영역만)

**Files:**
- Create: `vet-exam-ai/components/dashboard/DDayPlanWidget.tsx`

- [ ] **Step 1: 디렉토리 확인**

Run: `ls vet-exam-ai/components/`
디렉토리 `dashboard/`가 없으면 다음 step의 Write가 자동 생성.

- [ ] **Step 2: 위젯 skeleton 작성 — D-day 좌측만, 우측은 자리만 확보**

`vet-exam-ai/components/dashboard/DDayPlanWidget.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { EXAM_DATE_LABEL, IS_TENTATIVE, daysUntilExam } from "../../lib/examDate";

export default function DDayPlanWidget() {
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    setDays(daysUntilExam());
    const id = setInterval(() => setDays(daysUntilExam()), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderTop: "3px solid var(--wrong)",
        borderRadius: 12,
        padding: 22,
        marginBottom: 22,
        gap: 24,
      }}
    >
      {/* LEFT: D-day */}
      <div>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--wrong)", fontWeight: 700, marginBottom: 6 }}>
          수의사 국가시험
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 800, color: "var(--text)" }}>
            D-{days ?? "···"}
          </span>
          {IS_TENTATIVE && (
            <span style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 600 }}>
              (예상)
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", fontWeight: 600, marginTop: 4 }}>
          {EXAM_DATE_LABEL}
        </div>
      </div>

      {/* RIGHT: pool / 권장 — Task 4~5에서 채움 */}
      <div />
    </div>
  );
}
```

- [ ] **Step 3: 타입 체크**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add vet-exam-ai/components/dashboard/DDayPlanWidget.tsx
git commit -m "Add DDayPlanWidget skeleton — D-day 좌측 영역"
```

---

### Task 4: 위젯 우측 — pool fetch + selector intersection

**Files:**
- Modify: `vet-exam-ai/components/dashboard/DDayPlanWidget.tsx`

- [ ] **Step 1: pool fetch + lastConfig 로드 + storage 이벤트 리스너 추가**

`vet-exam-ai/components/dashboard/DDayPlanWidget.tsx` 전체 교체:

```tsx
"use client";

import { useEffect, useState } from "react";
import { EXAM_DATE_LABEL, IS_TENTATIVE, daysUntilExam } from "../../lib/examDate";
import type { Question } from "../../lib/questions";

const STORAGE_KEY = "kvle:quiz:lastConfig";

type StoredConfig = { subjects: string[]; count: number };

function readStoredSubjects(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredConfig>;
    if (!Array.isArray(parsed.subjects)) return null;
    if (!parsed.subjects.every((s) => typeof s === "string")) return null;
    return parsed.subjects;
  } catch {
    return null;
  }
}

export default function DDayPlanWidget() {
  const [days, setDays] = useState<number | null>(null);
  const [allCategories, setAllCategories] = useState<string[] | null>(null); // 전체 active 문제의 카테고리 list (중복 포함, intersection용)
  const [selectedSubjects, setSelectedSubjects] = useState<string[] | null>(null);
  const [fetchError, setFetchError] = useState(false);

  // D-day timer
  useEffect(() => {
    setDays(daysUntilExam());
    const id = setInterval(() => setDays(daysUntilExam()), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Pool fetch (once)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/questions")
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json() as Promise<Question[]>;
      })
      .then((data) => {
        if (cancelled) return;
        setAllCategories(data.map((q) => q.category));
      })
      .catch(() => {
        if (!cancelled) setFetchError(true);
      });
    return () => { cancelled = true; };
  }, []);

  // selector lastConfig — mount + storage event
  useEffect(() => {
    setSelectedSubjects(readStoredSubjects());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSelectedSubjects(readStoredSubjects());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // poolSize: subjects 미설정/빈 배열이면 전체, 아니면 intersection
  const poolSize =
    allCategories === null
      ? null
      : !selectedSubjects || selectedSubjects.length === 0
      ? allCategories.length
      : allCategories.filter((c) => selectedSubjects.includes(c)).length;

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderTop: "3px solid var(--wrong)",
        borderRadius: 12,
        padding: 22,
        marginBottom: 22,
        gap: 24,
      }}
    >
      {/* LEFT: D-day */}
      <div>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--wrong)", fontWeight: 700, marginBottom: 6 }}>
          수의사 국가시험
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 800, color: "var(--text)" }}>
            D-{days ?? "···"}
          </span>
          {IS_TENTATIVE && (
            <span style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 600 }}>
              (예상)
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", fontWeight: 600, marginTop: 4 }}>
          {EXAM_DATE_LABEL}
        </div>
      </div>

      {/* RIGHT: pool size only (권장 수는 Task 5에서) */}
      <div>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--text-muted)", fontWeight: 700, marginBottom: 6 }}>
          선택한 풀
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 800, color: "var(--text)" }}>
          {fetchError ? "—" : poolSize === null ? "···" : `${poolSize}문제`}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 에러 없음 (`Question` 타입은 `lib/questions/index.ts`에 export 되어 있어야 함 — `lib/questions/types.ts` 참고)

- [ ] **Step 3: 만약 import 경로 에러 시 확인**

`Question` import가 실패하면:

Run: `grep -n "export" vet-exam-ai/lib/questions/index.ts vet-exam-ai/lib/questions/types.ts | head -10`
적절한 경로(예: `"../../lib/questions/types"`)로 import 수정.

- [ ] **Step 4: Commit**

```bash
git add vet-exam-ai/components/dashboard/DDayPlanWidget.tsx
git commit -m "DDayPlanWidget: pool fetch + selector intersection"
```

---

### Task 5: 권장 문제 수 + 3회독 보조 + edge case 처리

**Files:**
- Modify: `vet-exam-ai/components/dashboard/DDayPlanWidget.tsx`

- [ ] **Step 1: 우측 영역을 "오늘 권장 N문제" 메인 + 3회독 보조 + 풀 사이즈 + edge case로 교체**

`vet-exam-ai/components/dashboard/DDayPlanWidget.tsx`의 `{/* RIGHT */}` 블록(`<div>...</div>` 통째)을 다음으로 교체:

```tsx
      {/* RIGHT: 오늘 권장 + 3회독 보조 + 풀 사이즈 */}
      <div>
        {(() => {
          if (fetchError) {
            return (
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--text-muted)", fontWeight: 700, marginBottom: 6 }}>
                  오늘의 학습량
                </div>
                <div style={{ fontSize: 13, color: "var(--text-faint)" }}>
                  문제 풀 정보를 불러오지 못했습니다.
                </div>
              </div>
            );
          }
          if (days !== null && days <= 0) {
            return (
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--wrong)", fontWeight: 700, marginBottom: 6 }}>
                  시험일 도달
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  최선을 다했습니다.
                </div>
              </div>
            );
          }
          if (poolSize === null || days === null) {
            return (
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--text-muted)", fontWeight: 700, marginBottom: 6 }}>
                  오늘의 학습량
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 800, color: "var(--text-faint)" }}>
                  ···
                </div>
              </div>
            );
          }
          if (poolSize === 0) {
            return (
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--text-muted)", fontWeight: 700, marginBottom: 6 }}>
                  오늘의 학습량
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>
                  선택한 풀에 문제가 없습니다.
                </div>
                <a href="/quiz" style={{ fontSize: 12, color: "var(--teal)", fontWeight: 700, textDecoration: "underline" }}>
                  과목 다시 선택
                </a>
              </div>
            );
          }
          const recommendedToday = Math.max(1, Math.ceil(poolSize / days));
          const recommendedThreeRound = recommendedToday * 3;
          return (
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--text-muted)", fontWeight: 700, marginBottom: 6 }}>
                오늘 권장
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 800, color: "var(--text)" }}>
                  {recommendedToday}
                </span>
                <span style={{ fontSize: 14, color: "var(--text-muted)", fontWeight: 600 }}>
                  문제
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 4 }}>
                3회독 시 하루 약 {recommendedThreeRound}문제
              </div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                선택 풀: {poolSize}문제
              </div>
            </div>
          );
        })()}
      </div>
```

- [ ] **Step 2: 타입 체크**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add vet-exam-ai/components/dashboard/DDayPlanWidget.tsx
git commit -m "DDayPlanWidget: 오늘 권장 N문제 + 3회독 보조 + edge cases"
```

---

### Task 6: 대시보드 페이지에 위젯 통합

**Files:**
- Modify: `vet-exam-ai/app/dashboard/page.tsx`

- [ ] **Step 1: import 추가**

`vet-exam-ai/app/dashboard/page.tsx`의 기존 import 블록(파일 상단, 다른 component import 사이)에 추가:

```tsx
import DDayPlanWidget from "../../components/dashboard/DDayPlanWidget";
```

(기존 `import LoadingSpinner from "../../components/LoadingSpinner";` 줄 바로 아래에 삽입.)

- [ ] **Step 2: 회원 메인 렌더링의 Header 위에 위젯 삽입**

`vet-exam-ai/app/dashboard/page.tsx`의 다음 블록을 찾는다 (line ~414 부근):

```tsx
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 64px" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
```

`<main>` 여는 태그 바로 다음 줄(`{/* ── Header ── */}` 위)에 위젯을 삽입하여 다음과 같이 만든다:

```tsx
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 64px" }}>
      <DDayPlanWidget />
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
```

- [ ] **Step 3: 타입 체크 + 빌드 확인**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: dev 서버에서 회원 대시보드 확인**

dev 서버가 죽었으면: `cd vet-exam-ai && npm run dev` (백그라운드)
브라우저 → 로그인 → `/dashboard` → 최상단에 위젯 노출 확인 (좌: D-day, 우: 오늘 권장 N).

- [ ] **Step 5: Commit**

```bash
git add vet-exam-ai/app/dashboard/page.tsx
git commit -m "Wire DDayPlanWidget into dashboard 최상단"
```

---

### Task 7: 통합 smoke test

**파일 변경 없음. 시나리오 실행 + 결과 기록.**

dev 서버가 떠있어야 함 (`cd vet-exam-ai && npm run dev`).

- [ ] **시나리오 1: 기본 회원 대시보드**

회원 로그인 → `/dashboard` 진입.
**Expected:** 최상단 위젯 좌측 `D-{N} (예상) · 2027.01.15`, 우측 `오늘 권장 N문제 / 3회독 시 하루 약 M문제 / 선택 풀: P문제`. N, M, P 모두 합리적 값(0보다 큰 양수, M = N×3, D-day는 PRD 기준 ~D-260대).

- [ ] **시나리오 2: selector 변경 동기화**

탭 A: `/dashboard`. 탭 B: `/quiz` → 과목 chip 일부 토글 → "시작" 클릭(이게 saveConfig 트리거). 탭 A로 복귀.
**Expected:** 위젯의 "선택 풀" 사이즈와 "오늘 권장" 숫자가 새 selector에 맞게 갱신. 새로고침 없이.

- [ ] **시나리오 3: 신규 유저 (lastConfig 없음)**

DevTools → Application → Local Storage → `kvle:quiz:lastConfig` 삭제 → `/dashboard` 새로고침.
**Expected:** "선택 풀"이 전체 active 문제 수(현재 ~1,831)로 표시.

- [ ] **시나리오 4: 빈 풀 fallback**

DevTools → Local Storage에 `kvle:quiz:lastConfig` 값으로 다음 입력:
```json
{"subjects":["존재하지않는과목"],"count":5}
```
`/dashboard` 새로고침.
**Expected:** 우측에 "선택한 풀에 문제가 없습니다 — 과목 다시 선택" + `/quiz` 링크.

- [ ] **시나리오 5: 랜딩 D-day 일관성**

`/` 진입 → 랜딩의 `DDayBadge` 확인.
**Expected:** `D-{N}`이 시나리오 1의 N과 동일. `(예상)` 라벨, `2027.01.15` 동일.

- [ ] **시나리오 6: IS_TENTATIVE 토글**

`vet-exam-ai/lib/examDate.ts`의 `IS_TENTATIVE = true` → `false`로 임시 변경 → 브라우저 새로고침.
**Expected:** 대시보드 위젯과 랜딩 배지에서 `(예상)` 라벨 사라짐.
**확인 후 `true`로 되돌림** (commit하지 않음).

- [ ] **시나리오 7: API 실패 fallback**

DevTools → Network → `/api/questions` 우클릭 → "Block request URL" → `/dashboard` 새로고침.
**Expected:** 좌측 D-day는 정상, 우측에 "문제 풀 정보를 불러오지 못했습니다" + 우측 풀 사이즈 자리는 `—`.
**확인 후 block 해제.**

- [ ] **결과 기록**

7개 시나리오 PASS/FAIL 기록. FAIL 있으면 fix → 별도 commit. 모두 PASS면 다음 step.

- [ ] **dev 서버 종료 + 최종 git status 확인**

Run: `git status` (working tree clean이어야 함)
Run: `git log --oneline main..HEAD` (Task 1~6의 commit 6개 확인)

---

## 완료 후

`feat/dashboard-dday-widget` 브랜치에 push하고 PR 생성. ROADMAP §12 완료 마킹.

PR description 템플릿:
```
## ROADMAP §12 — 시험일 D-day + 학습 플랜 (M2)

- lib/examDate.ts: 시험일 단일 source + IS_TENTATIVE 라벨
- DDayPlanWidget: 대시보드 최상단 위젯 (D-day + 오늘 권장 N문제 + 3회독 보조)
- 풀: localStorage selector × /api/questions intersection, storage 이벤트 동기화
- DDayBadge(랜딩) 리팩터: 동일 상수 import + (예상) 라벨

Spec: docs/superpowers/specs/2026-04-26-dashboard-dday-widget-design.md
Plan: docs/superpowers/plans/2026-04-26-dashboard-dday-widget.md

Smoke 7/7 PASS.
```
