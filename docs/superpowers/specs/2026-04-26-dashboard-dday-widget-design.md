# Dashboard D-day Widget — Design Spec

**작성일:** 2026-04-26
**ROADMAP 매핑:** Phase 1 §12 — 시험일 D-day + 학습 플랜 (M2)
**브랜치:** `feat/dashboard-dday-widget`

---

## 1. 목적

대시보드 최상단에 시험일 D-day와 "오늘 권장 문제 수"를 고정 노출하여, 매일 학습 페이스를 가시화한다. 수국시는 전 응시생이 동일 날짜에 보므로 시험일은 전역 상수로 관리한다.

## 2. 범위

**포함**
- 대시보드(`/dashboard`) 최상단에 새 위젯 1개 추가
- 시험일 단일 source of truth (`lib/examDate.ts`)
- 기존 `components/DDayBadge.tsx`(랜딩 사용 중) 리팩터 — 동일 상수 import
- "오늘 권장 N문제" 계산: 유저의 마지막 selector 선택(`localStorage.kvle:quiz:lastConfig`) 기반 풀 / 남은 일수
- "3회독 시 하루 약 M문제" 보조 한 줄

**제외 (YAGNI)**
- 유저별 시험일 입력 UI / DB 저장
- 회독 수 입력 슬라이더 (3회독 hint hardcoded)
- 페이스 기반 ETA (최근 풀이 평균)
- 비회원 대시보드 / 세션 페이지 노출

## 3. 시험일 source of truth

`vet-exam-ai/lib/examDate.ts` (신규):

```ts
export const EXAM_DATE = new Date("2027-01-15T00:00:00+09:00");
export const EXAM_DATE_LABEL = "2027.01.15";
export const IS_TENTATIVE = true; // 공고 후 false 변경 1줄로 라벨 제거

export function daysUntilExam(now: number = Date.now()): number {
  return Math.ceil((EXAM_DATE.getTime() - now) / 86_400_000);
}
```

리팩터 대상:
- `vet-exam-ai/components/DDayBadge.tsx`: 내부 `EXAM_DATE` 상수 제거 → `lib/examDate.ts`에서 import
- `IS_TENTATIVE` true이면 D-day 옆 `(예상)` 작은 라벨 노출

## 4. 위젯 컴포넌트

`vet-exam-ai/components/dashboard/DDayPlanWidget.tsx` (신규, "use client")

### 4.1 레이아웃

대시보드 최상단 가로 박스 (반응형: ≥768px 좌우 분할 / 모바일 세로 스택):

```
┌───────────────────────────────────────────────────────────────┐
│  D-{N}  (예상)                │  오늘 권장 {X}문제             │
│  수의사 국가시험              │  3회독 시 하루 약 {3X}문제     │
│  2027.01.15                   │  선택 풀: {pool size}문제      │
└───────────────────────────────────────────────────────────────┘
```

- 좌측: 기존 `DDayBadge` 디자인 톤 차용 (wrong color accent)
- 우측: 권장 수치는 큰 숫자(text-xl 정도), 보조 줄 2개는 text-faint

### 4.2 상태 / 데이터 흐름

- `useEffect` mount 시:
  1. `/api/questions` fetch (현재 endpoint는 subjects 필터 없음 — 전체 active 반환). 응답 캐싱: 페이지 내 once.
  2. `lib/hooks/useQuizConfig.ts` read 함수로 `kvle:quiz:lastConfig` 로드 → `subjects` 배열
  3. `poolSize` = subjects 미설정/빈 배열이면 전체 length, 아니면 `data.filter(q => subjects.includes(q.category)).length`
  4. `daysUntilExam()` 계산
  5. `recommendedToday = Math.max(1, Math.ceil(poolSize / daysLeft))`
  6. `recommendedThreeRound = recommendedToday * 3`
- `storage` 이벤트 리스너로 다른 탭의 selector 변경 즉시 반영 (fetch 재호출 없이 intersection만 재계산)
- 1시간마다 D-day 재계산 (기존 `DDayBadge` 패턴 동일)

### 4.3 fallback / edge case

| 조건 | 처리 |
|---|---|
| `daysLeft <= 0` | "시험일 도달" 메시지 + 권장 수 숨김 |
| `poolSize === 0` | "선택한 풀에 문제가 없습니다 — 과목 다시 선택" 링크(`/quiz`) |
| API 실패 | 우측 영역 skeleton 유지, 좌측 D-day는 정상 표시 |
| `lastConfig` 없음 (신규 유저) | 전체 active 카테고리로 fetch |

## 5. 통합 지점

`vet-exam-ai/app/dashboard/page.tsx`:
- 기존 첫 섹션(점수 허브) 위에 `<DDayPlanWidget />` 삽입
- 기존 레이아웃과 간격 일관 유지

## 6. 테스트 (smoke)

수동 시나리오:
1. 회원 로그인 → `/dashboard` 진입 → 위젯 노출, D-{N} 정상 계산
2. `/quiz`에서 selector 변경 → 다른 탭 `/dashboard`로 이동 → 풀 사이즈 / 권장 수 갱신
3. localStorage clear → `/dashboard` → 전체 풀 기준 권장 수 노출
4. selector에서 데이터 없는 과목만 선택(불가능 케이스 대비) → fallback 메시지
5. `IS_TENTATIVE = false` 토글 → `(예상)` 라벨 사라짐
6. 랜딩 `/` 진입 → `DDayBadge` 동일 D-N 표시 (단일 source 확인)

## 7. 알려진 제한 / 후속

- 회독 가정 3회는 hardcoded — 사용자 입력 토글은 V2
- 권장 문제 수는 동기 부여 지표 — 실제 페이스/약점 가중치 반영은 후속
- 비회원 대시보드(랜딩 카드)에 권장 수 노출 안 함 (개인 풀 전제 못 깨므로)
- 시험일 변경: `lib/examDate.ts` 1줄 변경으로 적용. admin UI 미포함.
