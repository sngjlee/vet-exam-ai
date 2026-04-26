# Community Tab Skeleton — Design Spec

**작성일:** 2026-04-26
**ROADMAP 매핑:** Phase 1 §13 — 공식 해설 / 커뮤니티 탭 구조 (M2, F1 확장)
**브랜치:** `feat/community-tab-skeleton`

---

## 1. 목적

`QuestionCard`의 정답 reveal 영역을 **`공식 해설` / `커뮤니티 토론(N)` 두 탭**으로 분리한다. 댓글 작성·표시·추천·신고 등 본격 커뮤니티 기능(ROADMAP §14, M3)은 이 spec의 범위가 아니며, 본 작업은 다음 단계의 발판이 되는 read-only skeleton에 한정한다.

## 2. 범위

**포함**
- `QuestionCard.tsx` 정답 reveal 섹션을 탭 UI로 교체
- 두 탭: `공식 해설`(기본 활성), `커뮤니티 토론(N)`
- `community_comments` 카운트 batch fetch — 세션 시작 시 한 번
- 카운트 ≥ 5인 문제는 커뮤니티 탭 라벨 옆 dot indicator로 약한 강조
- 커뮤니티 탭 컨텐츠 = "아직 의견이 없습니다 — 곧 댓글 기능이 열립니다" 안내
- fetch 실패 fallback: 라벨에서 N 생략, dot 미표시

**제외 (M3 또는 후속)**
- 댓글 본문 표시 / 작성 / 수정 / 삭제 / 추천 / 신고 / 정렬
- 모바일 스와이프 탭 전환 (탭 클릭만)
- 세션 종료 후 결과 화면(`app/quiz/page.tsx` line 580~)에 탭 적용
- `questions.comment_count` 비정규화 컬럼 (M3 댓글 작성 도입 시점에 trigger와 함께)

## 3. 데이터 흐름

```
[startSession]
   ↓
fetch /api/comments/counts?ids=ID1,ID2,...,IDn   (한 번)
   ↓
{ "ID1": 3, "ID2": 0, ... }   → useState<Map<string, number>>
   ↓
<QuestionCard commentCount={counts.get(question.id) ?? 0} />
   ↓
탭 라벨: 커뮤니티 토론(N)   + (N≥5 → dot indicator)
```

## 4. API endpoint

`vet-exam-ai/app/api/comments/counts/route.ts` (신규)

### 4.1 요청
```
GET /api/comments/counts?ids=Q1,Q2,Q3
```
- `ids` 쿼리 파라미터: 콤마 구분 question id 리스트
- 비회원도 호출 가능 (RLS `comments: world read visible` 정책 적용)

### 4.2 응답
```json
{ "Q1": 3, "Q2": 0, "Q3": 7 }
```
- 모든 ids에 대해 키 존재 (없으면 0)
- 카운트 대상: `comments.status NOT IN ('blinded_by_report', 'removed_by_admin') AND (blinded_until IS NULL OR blinded_until <= now())` (RLS와 동일 조건; Supabase 클라이언트 select가 자동 적용)

### 4.3 구현 방법
**route handler (server)**:
1. `supabase.from('comments').select('question_id').in('question_id', ids)` (RLS가 visible/blinded 자동 필터)
2. JS reduce로 `Map<question_id, count>` 집계
3. ids 입력 순서 유지하며 `{ id: count }` 객체로 반환 (ids 중 댓글 0건은 0으로 명시)

**1000행 cap 안전 가드**: 1차 응답이 정확히 1000행이면 잠재적 truncation. 그 경우 page-loop 적용 (quiz_selector pagination 패턴 동일). 댓글 0건 시점은 1 round trip으로 충분, 향후 row 증가 시 별도 RPC function 도입 검토.

### 4.4 에러
- ids 없거나 빈 배열 → `{}` 반환 (200)
- ids > 200개 → 400 (세션당 문제 수 5~50 → 충분한 여유)
- DB 에러 → 500 + 빈 객체 (클라이언트는 fallback 처리)

## 5. 컴포넌트 변경

### 5.1 `vet-exam-ai/components/QuestionCard.tsx`

**Props 추가:**
```ts
type Props = {
  // ... 기존 props ...
  commentCount?: number;  // 미전달 시 카운트/dot 미표시 (fallback)
};
```

**구조 변경 (line 354-385 영역):**

기존 단일 `해설` 박스를 다음으로 교체:

```tsx
{/* 탭 헤더 */}
<div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
  <button role="tab" aria-selected={activeTab === 'official'} onClick={...}>
    공식 해설
  </button>
  <button role="tab" aria-selected={activeTab === 'community'} onClick={...}>
    커뮤니티 토론
    {commentCount !== undefined && ` (${commentCount})`}
    {commentCount !== undefined && commentCount >= 5 && (
      <span aria-hidden="true" style={{ marginLeft: 4, color: 'var(--teal)' }}>•</span>
    )}
  </button>
</div>

{/* 탭 패널 */}
{activeTab === 'official' && (
  <div role="tabpanel">
    {/* 기존 해설 박스 그대로 */}
    {question.explanation}
  </div>
)}
{activeTab === 'community' && (
  <div role="tabpanel" style={{ padding: '14px 16px', color: 'var(--text-faint)' }}>
    {commentCount === 0
      ? '아직 의견이 없습니다 — 곧 댓글 기능이 열립니다.'
      : `${commentCount}개의 의견이 있습니다 — 댓글 보기 기능은 곧 열립니다.`}
  </div>
)}
```

**상태:** 새 useState `activeTab: 'official' | 'community'` (기본 `'official'`). 다음 문제로 이동 시 `'official'`로 reset (key prop이 question.id이므로 자연 reset).

### 5.2 `vet-exam-ai/app/quiz/page.tsx`

**상태 추가:**
```ts
const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map());
```

**`startSession` 직후 fetch:**
```ts
const ids = sessionQuestions.map(q => q.id).join(',');
fetch(`/api/comments/counts?ids=${encodeURIComponent(ids)}`)
  .then(r => r.ok ? r.json() : {})
  .then(data => setCommentCounts(new Map(Object.entries(data))))
  .catch(() => {/* fallback: empty Map → undefined commentCount → 카운트 미표시 */});
```

**QuestionCard 호출에 prop 전달:**
```tsx
<QuestionCard
  // ... 기존 props ...
  commentCount={commentCounts.get(currentQuestion.id)}
/>
```

## 6. 디자인 가이드

- 탭 헤더: 배경 없음, 활성 탭은 하단 2px solid `var(--text)` 강조, 비활성은 `var(--text-faint)`
- 탭 라벨 폰트 크기 13px, 한 줄 (모바일 좁은 폭에도 안전)
- dot indicator: `•` 4px margin-left, `var(--teal)` 색
- 패널 영역 padding/border는 기존 해설 박스와 동일하게 유지 (시각적 연속성)

## 7. 알려진 제한 / 후속

- 댓글 read/write/vote/report → M3 (ROADMAP §14)
- 모바일 스와이프 탭 전환 → 후속 모바일 UX 패치와 묶어서
- 세션 종료 결과 화면 탭 적용 → 사용자 흐름 검증 후 결정
- `questions.comment_count` 비정규화 → M3에서 trigger와 함께 도입 검토
- `/api/comments/counts` 1000행 cap 안전 — 댓글 row가 1000+ 도달 시 RPC function으로 교체

## 8. Smoke 시나리오

1. 신규 세션 시작 → 첫 문제 정답 reveal → 탭 2개 노출 (공식 해설 활성, 커뮤니티(0))
2. 커뮤니티 탭 클릭 → "아직 의견이 없습니다" 안내
3. 다음 문제로 이동 → 탭이 다시 공식 해설로 reset
4. DB에 임의 댓글 5개 insert → 새 세션 → 해당 문제 탭에 `(5) •` dot 노출
5. DevTools → `/api/comments/counts` block → 새 세션 → 탭 라벨에서 N/dot 사라짐, 동작 정상
6. 비회원 anon → 동일 동작 (RLS world read 통과)
