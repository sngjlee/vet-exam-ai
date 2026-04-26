# Community Tab Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `QuestionCard` 정답 reveal 영역을 `공식 해설 / 커뮤니티 토론(N)` 두 탭으로 분리하고, `community_comments` 카운트를 세션 시작 시 batch fetch한다.

**Architecture:** 신규 server route `/api/comments/counts`가 ids batch로 카운트를 반환. `app/quiz/page.tsx`가 `startSession` 직후 1회 fetch하여 `Map<id, number>`에 캐시. `QuestionCard`는 `commentCount` prop으로 받아 탭 라벨에 표시 + N≥5 dot indicator. 댓글 콘텐츠는 placeholder (M3에서 구현).

**Tech Stack:** Next.js 15 App Router, React 19 client component, Supabase JS client (server-side route), TypeScript.

**Spec:** `docs/superpowers/specs/2026-04-26-community-tab-skeleton-design.md`

**참고:** 이 repo는 unit test framework 미설치 — verification은 `npx tsc --noEmit` + manual smoke (Task 4).

---

### Task 1: `/api/comments/counts` server route 생성

**Files:**
- Create: `vet-exam-ai/app/api/comments/counts/route.ts`

- [ ] **Step 1: 디렉토리 생성 (자동) + route 파일 작성**

`vet-exam-ai/app/api/comments/counts/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

const MAX_IDS = 200;

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({});
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: `Too many ids (max ${MAX_IDS})` },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .select("question_id")
    .in("question_id", ids);

  if (error) {
    return NextResponse.json({}, { status: 500 });
  }

  // RLS가 visible/blinded 자동 필터. 모든 ids에 대해 0 default.
  const counts: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const row of data ?? []) {
    counts[row.question_id] = (counts[row.question_id] ?? 0) + 1;
  }
  return NextResponse.json(counts);
}
```

- [ ] **Step 2: 타입 체크**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: dev 서버 통해 endpoint smoke**

dev 서버는 사용자가 이미 띄웠다고 가정 (`http://localhost:3000`). 다음 curl로 검증:

```bash
curl -s "http://localhost:3000/api/comments/counts?ids=foo,bar,baz"
```
Expected: `{"foo":0,"bar":0,"baz":0}` (테이블 비었으므로 모두 0)

```bash
curl -s "http://localhost:3000/api/comments/counts?ids="
```
Expected: `{}` (빈 ids)

```bash
curl -s "http://localhost:3000/api/comments/counts?ids=$(python -c 'print(",".join(str(i) for i in range(201)))')" -w " HTTP %{http_code}"
```
Expected: HTTP 400 with `{"error":"Too many ids (max 200)"}`

만약 dev 서버 미실행 또는 포트 다름이면 위 검증은 SKIP하고 보고에 명시.

- [ ] **Step 4: Commit**

```bash
git add vet-exam-ai/app/api/comments/counts/route.ts
git commit -m "Add /api/comments/counts — batch comment count by question ids"
```

---

### Task 2: `app/quiz/page.tsx`에서 batch fetch + QuestionCard prop

**Files:**
- Modify: `vet-exam-ai/app/quiz/page.tsx`

- [ ] **Step 1: useState import + 신규 state 추가**

기존 import 라인 (line 3) `import { useRef, useState } from "react";`는 그대로.

`useState`로 시작하는 기존 state 블록 (line 22~30 부근, `const sessionIdRef = useRef<string>(crypto.randomUUID());` 직전)에 다음 라인 추가:

```ts
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map());
```

위치: `const [started, setStarted] = useState(false);` 바로 다음 줄.

- [ ] **Step 2: `startSession` 함수에 fetch 추가**

`startSession` 함수 (line 35~48)의 `setStarted(true);` 바로 다음에 다음 블록을 추가하여 함수 끝부분이 다음과 같이 되도록 수정:

```ts
    sessionIdRef.current = crypto.randomUUID();
    setSessionQuestions(newSession);
    setCurrentIndex(0);
    setScore(0);
    setStarted(true);

    // 세션 시작 시 댓글 수 batch fetch (1회). 실패 시 빈 Map → undefined commentCount → 카운트 미표시.
    const ids = newSession.map((q) => q.id).join(",");
    fetch(`/api/comments/counts?ids=${encodeURIComponent(ids)}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, number>) => setCommentCounts(new Map(Object.entries(data))))
      .catch(() => setCommentCounts(new Map()));
  }
```

- [ ] **Step 3: QuestionCard 호출에 prop 추가**

활성 세션 블록(line 396~408)의 `<QuestionCard ... />` 호출에 `commentCount` prop 추가하여 다음과 같이 수정:

```tsx
          <QuestionCard
            key={currentQuestion.id}
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            total={sessionQuestions.length}
            onAnswer={handleAnswer}
            onNext={handleNext}
            onQuit={() => setStarted(false)}
            commentCount={commentCounts.get(currentQuestion.id)}
          />
```

- [ ] **Step 4: 타입 체크 (Task 3 prop 추가 전이라 일시적으로 에러 예상)**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: `commentCount` prop이 `QuestionCard` Props에 없으므로 타입 에러 발생. Task 3에서 해소.

이 시점은 commit하지 않음 — Task 3의 변경과 함께 검증 후 commit.

- [ ] **Step 5: (Task 3 완료 후) 다시 타입 체크**

Task 3 완료 후 다시 실행:

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: Commit (Task 3 완료 후 함께)**

이 task는 Task 3와 묶어서 하나의 commit으로 처리. Task 3 Step 6에서 commit.

---

### Task 3: `QuestionCard.tsx`에 commentCount prop + 탭 UI

**Files:**
- Modify: `vet-exam-ai/components/QuestionCard.tsx`

- [ ] **Step 1: Props 타입에 commentCount 추가**

기존 `type Props = { ... };` (line 14~21)에 `commentCount?: number;` 추가하여 다음과 같이 수정:

```tsx
type Props = {
  question: Question;
  questionNumber: number;
  total: number;
  onNext: () => void;
  onAnswer: (payload: AnswerPayload) => void;
  onQuit?: () => void;
  commentCount?: number;
};
```

- [ ] **Step 2: 함수 인자 destructure에 commentCount 추가**

기존 `export default function QuestionCard({ ... }: Props) {` (line 56~63)에 `commentCount` 추가하여 다음과 같이 수정:

```tsx
export default function QuestionCard({
  question,
  questionNumber,
  total,
  onNext,
  onAnswer,
  onQuit,
  commentCount,
}: Props) {
```

- [ ] **Step 3: activeTab state 추가**

기존 useState 라인들 (line 64~66) 뒤에 다음 줄 추가하여 다음과 같이 만들기:

```tsx
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState<"official" | "community">("official");
```

(question.id가 바뀌면 컴포넌트가 remount되며 activeTab도 자동으로 'official' reset — `key={currentQuestion.id}` 덕분.)

- [ ] **Step 4: 탭 UI로 해설 박스 교체**

기존 line 354~385의 `{/* Explanation box */}` 블록 (`<div>`로 시작해서 닫히는 `</div>`까지, 즉 `style={{ background: "var(--bg)", border: "1px solid var(--border)", padding: "14px 16px", borderRadius: 10, }}` div와 그 자식들 전체)을 다음으로 교체:

```tsx
                {/* Tab header */}
                <div
                  role="tablist"
                  aria-label="해설 / 커뮤니티 탭"
                  style={{
                    display: "flex",
                    gap: 4,
                    borderBottom: "1px solid var(--border)",
                    marginBottom: 12,
                  }}
                >
                  <button
                    role="tab"
                    aria-selected={activeTab === "official"}
                    onClick={() => setActiveTab("official")}
                    style={{
                      background: "transparent",
                      border: "none",
                      borderBottom: activeTab === "official" ? "2px solid var(--text)" : "2px solid transparent",
                      padding: "8px 12px",
                      fontSize: 13,
                      fontWeight: activeTab === "official" ? 700 : 500,
                      color: activeTab === "official" ? "var(--text)" : "var(--text-faint)",
                      cursor: "pointer",
                      marginBottom: -1,
                    }}
                  >
                    공식 해설
                  </button>
                  <button
                    role="tab"
                    aria-selected={activeTab === "community"}
                    onClick={() => setActiveTab("community")}
                    style={{
                      background: "transparent",
                      border: "none",
                      borderBottom: activeTab === "community" ? "2px solid var(--text)" : "2px solid transparent",
                      padding: "8px 12px",
                      fontSize: 13,
                      fontWeight: activeTab === "community" ? 700 : 500,
                      color: activeTab === "community" ? "var(--text)" : "var(--text-faint)",
                      cursor: "pointer",
                      marginBottom: -1,
                    }}
                  >
                    커뮤니티 토론
                    {commentCount !== undefined && ` (${commentCount})`}
                    {commentCount !== undefined && commentCount >= 5 && (
                      <span aria-hidden="true" style={{ marginLeft: 4, color: "var(--teal)" }}>
                        •
                      </span>
                    )}
                  </button>
                </div>

                {/* Tab panel */}
                {activeTab === "official" ? (
                  <div
                    role="tabpanel"
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      padding: "14px 16px",
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <HelpCircle
                        size={16}
                        style={{ color: "var(--blue)", marginTop: 2, flexShrink: 0 }}
                      />
                      <div>
                        <span className="kvle-label" style={{ color: "var(--blue)" }}>
                          해설
                        </span>
                        <p
                          style={{
                            fontSize: 13,
                            color: "var(--text-muted)",
                            lineHeight: 1.7,
                            margin: "6px 0 0",
                          }}
                        >
                          {question.explanation}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    role="tabpanel"
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      padding: "14px 16px",
                      borderRadius: 10,
                      fontSize: 13,
                      color: "var(--text-faint)",
                      lineHeight: 1.7,
                    }}
                  >
                    {commentCount && commentCount > 0
                      ? `${commentCount}개의 의견이 있습니다 — 댓글 보기 기능은 곧 열립니다.`
                      : "아직 의견이 없습니다 — 곧 댓글 기능이 열립니다."}
                  </div>
                )}
```

- [ ] **Step 5: 타입 체크**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 에러 없음 (Task 2의 commentCount prop도 이제 타입 체크 통과)

- [ ] **Step 6: Commit (Task 2 + Task 3 묶음)**

```bash
git add vet-exam-ai/app/quiz/page.tsx vet-exam-ai/components/QuestionCard.tsx
git commit -m "QuestionCard: 공식 해설 / 커뮤니티 토론 탭 + batch comment count"
```

---

### Task 4: 통합 smoke test

**파일 변경 없음. 시나리오 실행 + 결과 기록.**

dev 서버는 사용자가 이미 띄움 (`http://localhost:3000`).

- [ ] **시나리오 1: 신규 세션 + 정답 reveal**

`/quiz` 진입 → 세션 시작 → 첫 문제에서 답 선택 후 "정답 확인" 클릭.
**Expected:** 정답 reveal 영역에 탭 2개 노출 — `공식 해설`(활성, 굵게+text 색) / `커뮤니티 토론(0)`(비활성). 공식 해설 패널에 기존 explanation 텍스트 노출.

- [ ] **시나리오 2: 커뮤니티 탭 클릭**

위 상태에서 `커뮤니티 토론(0)` 탭 클릭.
**Expected:** 활성 탭 토글, 패널 텍스트 "아직 의견이 없습니다 — 곧 댓글 기능이 열립니다."

- [ ] **시나리오 3: 다음 문제 이동 시 reset**

"다음 문제" 클릭 → 새 문제 답 선택 → "정답 확인".
**Expected:** activeTab이 자동으로 `'official'`로 reset (key prop으로 remount 효과).

- [ ] **시나리오 4: 카운트 ≥ 5 dot indicator**

DevTools → Application → Network → `/api/comments/counts` 응답을 override (또는 임시로 첫 문제 ID에 5+ 카운트 mock):

옵션 A — DB 직접 insert (Supabase SQL Editor):
```sql
-- 임시 댓글 5개 insert (테스트 후 삭제)
insert into public.comments (question_id, user_id, type, body_text, body_html)
select '<첫 문제 ID>', null, 'discussion', 'test', '<p>test</p>'
from generate_series(1, 5);
```

옵션 B — DevTools Network에서 응답 모킹:
DevTools → Network → `/api/comments/counts` 우클릭 → Override response → `{"<첫문제ID>":5,"...":0,...}`.

새 세션 시작 후 첫 문제 정답 reveal.
**Expected:** `커뮤니티 토론(5) •` (teal dot) 노출.

테스트 후 옵션 A의 insert는 삭제: `delete from public.comments where body_text = 'test';`

- [ ] **시나리오 5: API 실패 fallback**

DevTools → Network → `/api/comments/counts` 우클릭 → Block request URL.
새 세션 시작 → 첫 문제 정답 reveal.
**Expected:** 탭 라벨 `커뮤니티 토론` (숫자 없음, dot 없음). 클릭 시 패널은 "아직 의견이 없습니다" (commentCount === undefined → falsy 분기).

테스트 후 block 해제.

- [ ] **시나리오 6: 비회원 (anon) 동작**

브라우저 시크릿 창 → `/quiz` (회원 미인증) → 세션 시작 → 정답 reveal.
**Expected:** 탭 노출 + 카운트 fetch 정상 (RLS world read), 동작 동일.

- [ ] **시나리오 7: 모바일 폭 (탭 단어 줄바꿈 안 됨)**

DevTools → Device Toolbar → iPhone SE (375px) → `/quiz` → 정답 reveal.
**Expected:** 탭 두 개 모두 한 줄로 표시 (줄바꿈/잘림 없음).

- [ ] **결과 기록**

7개 시나리오 PASS/FAIL 기록. FAIL 있으면 fix → 추가 commit. 모두 PASS면 다음 step.

- [ ] **최종 git log 확인**

Run: `git log --oneline main..HEAD`
Expected: 2 commit (Task 1 + Task 2/3 묶음). 필요 시 fix commit 추가.

---

## 완료 후

`feat/community-tab-skeleton` push + PR 생성 (사용자가 GitHub 웹에서 직접). PR description 템플릿:

```
## ROADMAP §13 — 공식해설 / 커뮤니티 탭 구조 (M2, F1 확장)

- /api/comments/counts: ids batch로 댓글 수 반환 (RLS world read)
- QuestionCard 정답 reveal에 탭 UI 추가 (공식 해설 / 커뮤니티 토론(N))
- N≥5 dot indicator (var(--teal))
- 댓글 read/write/vote는 M3 (이번은 read-only skeleton)

Spec: docs/superpowers/specs/2026-04-26-community-tab-skeleton-design.md
Plan: docs/superpowers/plans/2026-04-26-community-tab-skeleton.md
```
