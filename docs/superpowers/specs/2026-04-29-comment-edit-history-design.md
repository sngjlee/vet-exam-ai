# §14 4차 — 댓글 수정 + 변경 이력 (설계)

**작성일**: 2026-04-29
**대상 마일스톤**: M3 잔여 (Phase 2.5 진입 게이트)
**ROADMAP 항목**: §14 댓글 코어 — `**수정 이력**: 수정됨 표시 + 변경 내역 열람` (ROADMAP.md:243)

## 1. 배경

`comment_edit_history` 테이블과 `handle_comment_update` 트리거는 §14 1차 PR(2026-04-26) 마이그레이션에 이미 포함되어 동작 중이다 (`supabase/migrations/20260425000001_community_comments.sql:163-180, 408-422`). 트리거는 댓글 본문(`body_text` 또는 `body_html`) 변경 시 직전 본문을 자동으로 history에 snapshot한다.

지금까지 §14 후속 PR은 답글(3차)·추천/신고(§15)·프로필(§16)·알림(§17)·모더(§18)을 우선 처리하면서 **수정 진입 UI/API는 미구현 상태**로 남아 있었다. M3 잔여 마지막 작업이며, 이것이 닫혀야 Phase 2.5(런칭 보강 — 이미지 첨부, 검색)로 넘어갈 수 있다.

## 2. 결정 사항 (브레인스토밍 합의)

| # | 항목 | 결정 |
|---|---|---|
| Q1 | 수정 진입 UI 패턴 | **A. 인라인 교체** — 본문 div를 그 자리에서 composer로 변환 |
| Q2 | type 변경 허용 여부 | **B. 고정** — body만 수정. type 변경 불가 (트리거가 body만 추적) |
| Q3 | 수정 가능 시간 윈도우 | **A. 무제한** — 시험 대비 학습 커뮤니티 특성상 정정/보강 빈도가 자연스러움. bait & switch는 history 공개로 견제 |
| Q4 | "수정됨" 인디케이터 위치 + history 진입 | **A. 헤더 인라인 텍스트 + 클릭 → 모달** |
| Q5 | History 모달 표시 방식 | **A. 시간순 버전 목록 (snapshot only)** — diff는 V2 (#27 정정 워크플로우)와 함께 |
| Q6 | "수정됨" 판별 기준 | **B. `edit_count` 컬럼 추가** — 트리거에서 +1 |
| Q7 | 답글 수정 허용 여부 | **A. 허용** — `CommentReplyComposer` mode 분기로 재사용 |
| Q8 | 수정 API 엔드포인트 | **A. `PATCH /api/comments/[id]`** |
| Q9 | History fetch | **A. lazy + API route (`GET /api/comments/[id]/history`)** |
| Q10 | UX 패턴 | **A. 서버 응답 대기** — optimistic은 3차 PR delete race 학습 회피 |

## 3. 데이터 모델

### 3.1 마이그레이션 (1개)

`supabase/migrations/20260429000000_comment_edit_count.sql` (timestamp는 push 직전 충돌 확인 후 확정)

```sql
alter table public.comments
  add column edit_count integer not null default 0;

create or replace function public.handle_comment_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.body_text != new.body_text or old.body_html != new.body_html then
    insert into public.comment_edit_history (comment_id, body_text, body_html, edited_at)
    values (old.id, old.body_text, old.body_html, old.updated_at);
    new.updated_at := now();
    new.edit_count := old.edit_count + 1;
  end if;
  return new;
end;
$$;
```

- 기존 댓글: `default 0`으로 자동 백필
- 트리거 시멘틱은 유지 — body 변경 시에만 +1, 다른 컬럼 변경(status 등)은 영향 없음

### 3.2 schema.sql 동기화

`supabase/schema.sql`의 `comments` 테이블 정의에 `edit_count` 컬럼 추가하고 `handle_comment_update` 함수도 동일하게 갱신.

### 3.3 typed schema (Database 타입)

`vet-exam-ai/lib/supabase/types.ts`의 `comments` Row/Insert/Update에 `edit_count: number` 추가.

## 4. API 계약

### 4.1 `PATCH /api/comments/[id]`

**Auth/권한**
- 401: 미인증
- 403: `existing.user_id !== user.id`
- 404: 댓글 없음
- 409: `existing.status !== "visible"` (soft-deleted/hidden_by_votes/blinded_by_report 모두 거부)

**Validation**
- 422: `EditCommentSchema = z.object({ body_text: z.string().min(1).max(5000) })` 실패

**처리**
1. body_text가 기존과 동일 → 200 + 기존 row (no-op, history 미생성)
2. 다르면: 서버에서 `renderCommentMarkdown(body_text)` → `body_html` 재계산
3. `update({ body_text, body_html })` 실행. 트리거가 자동으로:
   - `comment_edit_history`에 직전 body snapshot 1행 insert
   - `comments.updated_at` = now()
   - `comments.edit_count` += 1

**Response 200**
```ts
{
  id: string,
  body_text: string,
  body_html: string,
  edit_count: number,
  updated_at: string,
  created_at: string
}
```

**비범위**: admin 강제 수정 경로는 1차 PR 미포함 (V2).

### 4.2 `GET /api/comments/[id]/history`

**Auth**: 비인증도 read 허용 (RLS world-read 일치).

**처리**
1. 댓글 row 조회 — 없으면 404
2. `status === "hidden_by_author"` → 410 (방어적; 메뉴 자체가 placeholder엔 안 뜨므로 정상 도달 불가)
3. `comment_edit_history.select("body_html, edited_at").eq("comment_id", id).order("edited_at", desc)` 실행
4. 댓글 본인의 `body_html`, `updated_at`을 `current`로 묶어 반환

**Response 200**
```ts
{
  current: { body_html: string, edited_at: string },  // edited_at = comments.updated_at
  history: Array<{ body_html: string, edited_at: string }>  // edited_at desc
}
```

**비범위**: body_text 응답 미포함 (1차에선 본문 렌더만 보여줌, diff는 V2).

## 5. 컴포넌트 / 라우트 맵

| 영역 | 경로 | 변경 |
|---|---|---|
| API: 수정 | `vet-exam-ai/app/api/comments/[id]/route.ts` | `PATCH` 핸들러 추가 (기존 DELETE 옆) |
| API: 이력 조회 | `vet-exam-ai/app/api/comments/[id]/history/route.ts` | **신규** GET |
| 스키마 (zod) | `vet-exam-ai/lib/comments/schema.ts` | `EditCommentSchema` 신규 추가 |
| Sanitize | `vet-exam-ai/lib/comments/sanitize.ts` | 변경 없음 (`renderCommentMarkdown` 재사용) |
| CommentItem | `vet-exam-ai/components/comments/CommentItem.tsx` | "· 수정됨" 라벨 + 메뉴 항목 + edit mode 분기 |
| CommentEditComposer | `vet-exam-ai/components/comments/CommentEditComposer.tsx` | **신규** — root 댓글용, body_text만, type 칩 없음 |
| CommentReplyComposer | `vet-exam-ai/components/comments/CommentReplyComposer.tsx` | `mode: "create" \| "edit"` + `initialText` prop 확장 |
| CommentEditHistoryModal | `vet-exam-ai/components/comments/CommentEditHistoryModal.tsx` | **신규** — 시간순 버전 목록 |
| CommentMenuOverflow | `vet-exam-ai/components/comments/CommentMenuOverflow.tsx` | `canEdit` prop + `onEdit` 추가 |
| CommentList | `vet-exam-ai/components/comments/CommentList.tsx` | edit/history props 전파 |
| CommentReplyGroup | `vet-exam-ai/components/comments/CommentReplyGroup.tsx` | edit/history props 전파 |
| CommentThread | `vet-exam-ai/components/comments/CommentThread.tsx` | edit_count/body_text fetch 추가, edit/history state, PATCH/GET handler |

## 6. UI 동작 상세

### 6.1 CommentItem 헤더

기존: `[type 칩] [작성자/뱃지] · [상대시간] [신고됨?] ... [추천] [답글] [핀] [⋯메뉴]`

변경: `[type 칩] [작성자/뱃지] · [상대시간] [· 수정됨] [신고됨?] ... [추천] [답글] [핀] [⋯메뉴]`

- "· 수정됨" 노출 조건: `comment.edit_count > 0`
- 스타일: `color: var(--text-faint)`, `fontSize: 11`, `cursor: pointer`, hover 시 underline
- 클릭 → `onShowHistory(commentId)` 콜백
- aria-label: `"수정 이력 보기 (총 ${edit_count}회 수정됨)"`

### 6.2 `⋯` 메뉴 — 새 항목 `수정`

`CommentMenuOverflow`에 `canEdit: boolean`, `onEdit: () => void` prop 추가.

- 표시 조건 (호출자가 결정): `isOwner && status === "visible" && !isEditing`
- 메뉴 안에서 `삭제` 위에 배치
- 클릭 시 `setOpen(false)` + `onEdit()`

### 6.3 Edit mode 인라인 교체

`CommentItem`에 `isEditing: boolean`, `onCancelEdit: () => void`, `onSaved: (row: UpdatedCommentRow) => void` prop 추가.

`isEditing && !isPlaceholder`일 때 본문 `<div dangerouslySetInnerHTML>`을 composer로 대체:

- **Root 댓글**: `<CommentEditComposer initialText={body_text} commentId={id} onSaved={onSaved} onCancel={onCancelEdit} />`
- **답글**: `<CommentReplyComposer mode="edit" initialText={body_text} commentId={id} onSaved={onSaved} onCancel={onCancelEdit} />`

본문 외 영역(헤더, 추천/답글/메뉴)은 그대로 유지.

### 6.4 CommentEditComposer (신규)

**Props**
```ts
{
  commentId: string;
  initialText: string;
  onSaved: (row: UpdatedCommentRow) => void;
  onCancel: () => void;
}
```

**상태**
- `text: string` (초기값 = `initialText`)
- `submitting: boolean`

**동작**
- textarea, 카운터 표시 (`${text.length}/5000`)
- `저장` 버튼:
  - disabled: `submitting || text.trim().length === 0 || text.length > 5000 || text === initialText`
  - 클릭: `submitting=true` → `PATCH /api/comments/${commentId}` body `{ body_text: text }` → 200이면 `onSaved(row)`, 비-200이면 토스트 + `submitting=false`
- `취소` 버튼:
  - `text !== initialText`이면 `confirm("작성 중인 내용이 사라집니다. 취소할까요?")`, true면 `onCancel()`
  - 같으면 즉시 `onCancel()`
- ESC 키: 취소와 동일

### 6.5 CommentReplyComposer 확장

기존 props에 `mode: "create" | "edit"`, `initialText?: string`, `commentId?: string`, `onSaved?: (row) => void` 추가.

- `mode === "edit"`일 때:
  - 초기 textarea 값 = `initialText`
  - 등록 라벨 → `저장`
  - 제출 시 `PATCH /api/comments/${commentId}` (POST 대신)
  - 응답을 `onSaved`에 전달
- `mode === "create"` (기본): 기존 동작 유지

### 6.6 CommentEditHistoryModal (신규)

**Props**
```ts
{
  commentId: string;
  editCount: number;
  onClose: () => void;
}
```

**동작**
1. 마운트 시 `GET /api/comments/${commentId}/history` 호출
2. Loading: "이력 불러오는 중…"
3. Error: 재시도 버튼
4. 성공:
   - Header: `수정 이력 (총 ${editCount}회)`
   - Body 시간순 (현재 → 직전 → ... → 최초):
     ```
     [현재] {formatRelative(current.edited_at)}
     <body_html>
     ─────────────
     [수정 전] {formatRelative(history[0].edited_at)}
     <body_html>
     ─────────────
     ...
     [최초 작성] {formatRelative(history[N-1].edited_at)}
     <body_html>
     ```
   - 각 본문은 `kvle-prose` + `dangerouslySetInnerHTML`
5. Close: backdrop 클릭 / ESC / X 버튼

**패턴**: `CommentReportModal` 구조 재사용.

## 7. CommentThread 통합

### 7.1 Fetch 변경

기존 select에 `body_text`, `edit_count`, `updated_at` 추가:

```ts
.select("id, user_id, parent_id, type, body_text, body_html, created_at, updated_at, edit_count, status, vote_score")
```

`CommentRow` 타입에 3개 필드 추가. 답글 fetch도 동일.

### 7.2 CommentItemData 확장

```ts
export type CommentItemData = {
  id: string;
  user_id: string | null;
  type: CommentType;
  body_text: string;        // 신규
  body_html: string;
  created_at: string;
  edit_count: number;       // 신규
  authorNickname: string | null;
};
```

### 7.3 신규 state

```ts
const [editingId, setEditingId] = useState<string | null>(null);
const [historyForId, setHistoryForId] = useState<string | null>(null);
const [historyEditCount, setHistoryEditCount] = useState<number>(0);
```

`editingId`와 `replyingToId`는 동시에 1개만 — `onStartEdit` 시 `setReplyingToId(null)`, `onStartReply` 시 `setEditingId(null)`.

### 7.4 핸들러

- `onStartEdit(id)` — 위 동시성 가드 + `setEditingId(id)`
- `onCancelEdit()` — `setEditingId(null)`
- `onSaved(row)`:
  - `setRoots`로 해당 댓글의 `body_text`, `body_html`, `edit_count`, `updated_at` 갱신 (root든 reply든 위치 찾아 patch)
  - `setEditingId(null)`
  - `pinnedCommentId === row.id`이고 `pinnedFallback` 존재 시 fallback도 갱신
  - 만약 PATCH 응답이 409 (status 변경 race)였다면 토스트 + `setReloadKey(k+1)` + `setEditingId(null)`
- `onShowHistory(id, editCount)` — `setHistoryForId(id)` + `setHistoryEditCount(editCount)`
- `onCloseHistory()` — `setHistoryForId(null)`

### 7.5 Prop 전파

`CommentList` → `CommentReplyGroup` → `CommentItem`:
- `editingId`, `onStartEdit`, `onCancelEdit`, `onSaved`, `onShowHistory`

각 단계에서 `editingId === comment.id`로 `isEditing` 분기 결정.

### 7.6 모달 마운트

`CommentThread`의 JSX 끝에 `historyForId &&` 분기로 `<CommentEditHistoryModal commentId={historyForId} editCount={historyEditCount} onClose={onCloseHistory} />`.

## 8. 에러 / 엣지

| 케이스 | 처리 |
|---|---|
| 본문 변경 없이 저장 | 클라이언트에서 `text === initialText` 가드, PATCH 안 보내고 close |
| 5000자 초과 | 클라 카운터 + 서버 422 |
| 빈 body_text | 클라 disabled + 서버 422 |
| 타인 댓글 수정 시도 | 서버 403 — 메뉴 자체가 안 보이므로 도달 어려움 (URL 직접 호출 시) |
| 삭제된 댓글 수정 시도 | 서버 409 (placeholder는 메뉴 미노출) |
| Blinded 댓글 수정 시도 | 서버 409 (메뉴 자체가 안 보이는 분기 이미 있음) |
| 수정 중 다른 사용자가 신고 → blinded | PATCH 409 → 토스트 "이 댓글은 더 이상 수정할 수 없습니다" + composer 닫고 `setReloadKey(k+1)` |
| body_html이 sanitize 후 빈 문자열 | body_text는 1자 이상 통과, sanitize 결과 `<p></p>` 등은 허용. 실질 문제 없음 |
| 동시 편집 (같은 작성자가 두 탭) | last-write-wins. history엔 둘 다 남음. 1차 스코프에서 수용 |
| 답글 수정 중 부모 삭제 | 부모 placeholder 됐어도 답글 자체는 visible 유지 → 수정 정상 동작 |
| Pinned 댓글 수정 | `pinnedFallback` / `pinnedDisplay` 갱신. CommentThread `onSaved`가 책임 |

## 9. 테스트 체크리스트 (수락 기준)

### API
- [ ] `PATCH /api/comments/[id]` 401 (미인증)
- [ ] PATCH 403 (타인)
- [ ] PATCH 404 (없음)
- [ ] PATCH 409 (status != visible)
- [ ] PATCH 422 (zod 실패: 빈/초과/non-string)
- [ ] PATCH 200 시 body_html 재계산 + edit_count +1 + updated_at 갱신
- [ ] PATCH body_text 동일 → 200 no-op + history 미생성 + edit_count 불변
- [ ] `GET /api/comments/[id]/history` 200 (current + history desc)
- [ ] GET 404 (없음) / 410 (hidden_by_author)

### DB
- [ ] `handle_comment_update` 트리거가 history 1행 insert + edit_count +1 동시 적용
- [ ] 기존 댓글 `default 0` 백필 정상

### UI
- [ ] CommentItem: `edit_count > 0` 시 "· 수정됨" 노출, 클릭 시 모달 열림
- [ ] `⋯` 메뉴: `isOwner && status === "visible"`에서만 `수정` 노출
- [ ] Edit composer 인라인 교체 정상, 취소 confirm 동작 (변경 있을 때만)
- [ ] ESC 키 = 취소 동일
- [ ] 답글 수정 동선 동일 (CommentReplyComposer `mode="edit"`)
- [ ] History 모달: 현재 → 가장 최근 수정전 → ... → 최초 작성 순으로 표시
- [ ] History 모달 close: backdrop / ESC / X 버튼
- [ ] Pinned 댓글 수정 시 pinned section도 즉시 갱신
- [ ] `replyingToId`와 `editingId` 상호배타
- [ ] 모바일 (375px) 인라인 composer 정상, 모달 풀폭 정상

### Build
- [ ] `npx tsc --noEmit` EXIT=0
- [ ] `npm run build` EXIT=0

## 10. 비범위 (1차 PR 제외)

- type 변경 (Q2=B 결정) — 잘못 분류 시 삭제 후 재작성
- diff 표시 (Q5=A 결정) — V2 #27 정정 워크플로우와 함께
- admin 강제 수정 — 작성자 본인만, V2
- 수정 시간 윈도우 제한 (Q3=A) — 무제한
- @멘션 (V2 #28)
- 이미지 첨부 (별 PR — §14 2차)
- 알림 발송 — 수정은 알림 미발송 (body 변경마다 답글 받은 자에게 알림 보내면 noisy)

## 11. 후속 작업 (이번 PR 이후)

- §14 2차 (이미지 첨부) — Phase 2.5 T0, 시딩 게이트
- §27 정정 워크플로우 + diff 표시 (V2)
- admin 강제 수정 + audit log (V2)
