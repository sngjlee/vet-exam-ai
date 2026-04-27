# Notifications MVP — Design Spec

**Date**: 2026-04-27
**Roadmap**: M3 §17 (lightweight slice)
**Target**: 베타(2026-07-01) 전 머지. `notifications` 테이블에 트리거가 이미 row를 누적 중이라 데이터 사장 방지 우선.

---

## 1. 문제 정의

`notifications` 테이블 + 5종 enum + RLS + 트리거(`reply` / `vote_milestone` / `report_resolved`)가 §14·§15 마이그레이션 시점부터 활성화되어 있다. 현재 댓글 답글 1단계가 머지된 시점부터 `type='reply'` row가 실제로 누적되기 시작했지만, **사용자에게 보여줄 UI가 없어 데이터가 사장 중**이다.

이번 작업의 목표:

1. NavBar에 알림 벨 + unread 배지를 띄운다.
2. 클릭하면 최근 10개 알림 목록이 드롭다운에 뜬다.
3. 행을 클릭하면 해당 댓글이 있는 페이지로 이동하고, 그 댓글이 자동 스크롤·하이라이트된다.

명시적 범위 밖 (V2 / follow-up):
- Supabase Realtime 구독 (60초 폴링으로 충분)
- 전체 `/notifications` 페이지 + 페이지네이션
- 토스트, 이메일/푸시 다이제스트
- @멘션, 알림 설정(유형별 on/off)
- 정정 채택 알림

---

## 2. 결정 요약 (브레인스토밍 결과)

| # | 결정 | 근거 |
|---|---|---|
| 1 | 스코프 = 벨 + 드롭다운 + click-through (= MVP B안) | A는 "알림 왔는데 어디 갔냐"로 사용자 두 번 일하게 됨 |
| 2 | Click-through 도착지 = 신규 `/questions/[id]` read-only 페이지 | 독립 question 페이지 부재. §14·§15 시딩/공유에서도 곧 필요 |
| 3 | 갱신 방식 = 60초 unread count 폴링 + 드롭다운 open 시 list fetch | partial index 이미 있음. Realtime은 V2 |
| 4 | 읽음 처리 = 행 클릭 시 단건 + "전부 읽음" 버튼 + unread 시각 구분 | GitHub/Linear/Slack 표준 패턴, 학습 비용 0 |
| 5 | 드롭다운 표시 한도 = 최근 10개. 전체 페이지는 follow-up | 베타 초기 트래픽엔 충분 |
| 6 | 문구 = `{nickname}님이 회원님의 댓글에 답글을 달았어요` 등 (이모지는 vote_milestone 🎉만) | 톤 담백 + 마일스톤만 축하감 |
| 7 | 도착 페이지 = bare-minimum (문제·정답·해설·`<CommentThread>`) | `<CommentThread>` 이미 독립 컴포넌트라 mount 비용 작음 |
| 8 | API = 전용 라우트 4개 | 기존 `/api/comments` 패턴과 일관 |

---

## 3. 아키텍처

```
NavBar.tsx
  └─ <NotificationBell />          ← 신규
        ├─ 60s 폴링 → GET /api/notifications/unread-count
        ├─ 클릭 시 ↓
        └─ <NotificationDropdown />
              ├─ open 시 GET /api/notifications?limit=10
              ├─ 행 클릭 → PATCH /api/notifications/[id] (read) → router.push
              └─ "전부 읽음" → POST /api/notifications/mark-all-read

app/questions/[id]/page.tsx       ← 신규 (read-only)
  ├─ Server: question fetch + auth.getUser() (없으면 /auth/login redirect)
  └─ Client wrapper:
        ├─ <QuestionReadOnly />   ← QuestionCard에서 추출한 stem/choices/answer/explanation
        └─ <CommentThread questionId={id} highlightCommentId={searchParams.comment} />
              └─ effect: 댓글 row scrollIntoView + 1.5s ring highlight
```

### 컴포넌트

| 파일 | 역할 |
|---|---|
| `components/notifications/NotificationBell.tsx` | NavBar에 마운트되는 벨 + unread 배지 + 폴링 + 드롭다운 toggle |
| `components/notifications/NotificationDropdown.tsx` | popover 패널, list fetch, mark-all-read 버튼, 외부 클릭 닫기 |
| `components/notifications/NotificationItem.tsx` | 단일 알림 행, unread 시각 구분, 행 클릭 처리 |
| `lib/notifications/format.ts` | pure: `(type, payload, related_comment) → { text, href }` |
| `components/QuestionReadOnly.tsx` | `QuestionCard`에서 추출한 read-only 본문/보기/정답/해설 |
| `app/questions/[id]/page.tsx` | 신규 페이지 |

수정:
- `components/NavBar.tsx` — `<NotificationBell />` 마운트 (user 있을 때만)
- `components/comments/CommentThread.tsx` — `highlightCommentId?: string` prop 추가
- `components/comments/CommentItem.tsx` — `id={`comment-${comment.id}`}` 루트 wrapper

---

## 4. API 라우트

기존 `/api/comments` 패턴 준수: server-side `createClient()` + `auth.getUser()` 가드.

### `GET /api/notifications/unread-count`
- 응답: `{ count: number }` (cap 99로는 클라이언트에서 표시. 서버는 실제 count 반환)
- 쿼리: `select count(*) from notifications where user_id = auth.uid() and read_at is null`
- `notifications_user_unread` partial index hit

### `GET /api/notifications?limit=10`
- 응답:
  ```ts
  {
    items: Array<{
      id: string;
      type: 'reply' | 'vote_milestone' | 'mention' | 'report_resolved' | 'comment_blinded';
      payload: Record<string, unknown>;
      read_at: string | null;
      created_at: string;
      related_comment: {
        id: string;
        question_id: string;
        parent_id: string | null;
      } | null;
    }>
  }
  ```
- 쿼리: `notifications` LEFT JOIN `comments` (related_comment_id 기준), `created_at desc limit 10`
- 정렬: `created_at desc` (read_at 무관)

### `PATCH /api/notifications/[id]`
- body: `{ read: true }` (false 케이스는 미지원 — 다시 unread 만드는 UX 없음)
- 동작: `update notifications set read_at = now() where id = $1 and user_id = auth.uid() and read_at is null`
- 응답: `{ ok: true }` / 401 / 404 (다른 user의 row면 RLS로 0 rows updated → 404 매핑)
- 멱등 (이미 read여도 200)

### `POST /api/notifications/mark-all-read`
- 동작: `update notifications set read_at = now() where user_id = auth.uid() and read_at is null`
- 응답: `{ updated: number }`

---

## 5. Deep-link 생성 로직

`formatNotification(type, payload, related_comment)` pure 함수. 응답 shape:

```ts
{ text: string; href: string }
```

| type | text | href | 비고 |
|---|---|---|---|
| `reply` | `${payload.actor_nickname}님이 회원님의 댓글에 답글을 달았어요` | `/questions/${related_comment.question_id}?comment=${related_comment.id}` | 새로 달린 답글로 스크롤 (부모 X). 답글 그룹은 항상 펼침. |
| `vote_milestone` | `회원님의 댓글이 ${payload.milestone} 추천을 받았어요 🎉` | `/questions/${related_comment.question_id}?comment=${related_comment.id}` | actor 표시 안 함 (의도된 익명) |
| `report_resolved` | `payload.resolution === 'upheld'` → `신고하신 댓글이 처리되었어요` / `dismissed` → `신고하신 댓글이 검토 결과 유지되었어요` | `/questions/${related_comment.question_id}?comment=${related_comment.id}` | |
| `comment_blinded` | (트리거 아직 없음, V2) | `#` | format 함수는 5종 다 지원하되 미가용 타입은 `#`으로 fallback |
| `mention` | (트리거 아직 없음, V2) | `#` | 동상 |

`related_comment === null` (댓글 cascade delete된 경우)이면 모든 타입 `href = '#'`이고 텍스트만 표시 (클릭 무동작).

---

## 6. 자동 스크롤 / 하이라이트

`<CommentThread highlightCommentId={...} />`:

1. 기존 fetch 완료 후 `useEffect([highlightCommentId, comments])`:
   ```ts
   if (!highlightCommentId) return;
   const el = document.getElementById(`comment-${highlightCommentId}`);
   if (!el) return;  // blinded/삭제 등으로 미존재 시 silent
   el.scrollIntoView({ block: 'center', behavior: 'smooth' });
   el.classList.add('ring-2', 'ring-[var(--teal)]');
   const timer = setTimeout(() => {
     el.classList.remove('ring-2', 'ring-[var(--teal)]');
   }, 1500);
   return () => clearTimeout(timer);
   ```
2. `CommentItem` 루트에 `id={`comment-${comment.id}`}` 부여 — 루트 댓글이든 답글이든 모두 `CommentItem`이 렌더하므로 한 곳만 수정. `CommentReplyGroup`은 들여쓰기 컨테이너라 손대지 않음.
3. 답글 그룹은 §14 결정 #1 (항상 펼침) 그대로라 별도 expand 로직 불필요.

---

## 7. 폴링 / 가시성

`NotificationBell` 내부:

```ts
useEffect(() => {
  if (!user) return;
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const res = await fetch('/api/notifications/unread-count');
      const { count } = await res.json();
      setCount(count);
    } catch { /* silent */ }
  };

  const start = () => {
    if (timer) return;
    tick();
    timer = setInterval(tick, 60_000);
  };
  const stop = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') start();
    else stop();
  };

  start();
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}, [user]);
```

표시:
- count 0 → 벨 아이콘만, 배지 없음
- count 1~99 → 빨간 점 + 숫자 (NavBar `복습하기`의 ping 패턴 재사용하되 색은 `var(--wrong)` 계열)
- count ≥ 100 → `99+`

---

## 8. 드롭다운 동작

- **open**: `GET /api/notifications?limit=10`. 도착 전 3행 스켈레톤. 매번 fresh fetch (캐시 없음).
- **close**: 외부 mousedown / Esc / 라우트 변경 시.
- **외부 클릭 감지**: bell button ref + dropdown panel ref 두 개. 둘 다 미포함 클릭이면 close.
- **Esc**: 전역 keydown listener (open 동안만 등록).
- **list 0건**: "새 알림이 없어요" 단일 행.
- **포커스 트랩 미적용** (가벼운 popover로 충분). 키보드: Esc로 닫기 + 행 Enter로 follow.

---

## 9. Read 처리

### 단건 (행 클릭)
1. Optimistic: 클라이언트 state에서 해당 row의 `read_at = now()` 즉시 반영 + count -1.
2. `PATCH /api/notifications/[id]` `{ read: true }` 비동기 호출.
3. 응답 대기 안 함 — 즉시 `router.push(href)`.
4. 실패 시 silent rollback (콘솔 warn만). 사용자는 이미 페이지 이동 중.
5. `href === '#'`이면 push 안 함 + read도 처리 안 함 (의미 없음).

### 전부 읽음
1. Optimistic: 모든 list item의 `read_at = now()` + count = 0.
2. `POST /api/notifications/mark-all-read`.
3. 실패 시 reload key bump → list/count 재 fetch.
   (학습 적용: comment delete failure rollback이 stale snapshot으로 wipe되던 패턴 회피 — `project_comment_replies_resume` 메모 참고)

`PATCH`는 멱등이라 이중 클릭 안전. `mark-all-read`도 idempotent (read_at not null이 되면 다음 호출은 0 rows updated).

---

## 10. 인증 가드

| 경로 | 가드 |
|---|---|
| `/questions/[id]` page | server component에서 `auth.getUser()`. 없으면 `redirect('/auth/login')`. (next 파라미터는 follow-up — 현재 로그인 후 dashboard로 가는 흐름 변경 비용이 큼) |
| `/api/notifications/*` 4개 | `auth.getUser()` → 없으면 401. RLS가 백업이지만 명시 401이 더 친절. |
| `<NotificationBell />` | `useAuth().user` 없으면 컴포넌트 자체 미렌더 |

---

## 11. 시각

- 벨 아이콘: lucide `Bell` (16px, NavBar 일관성)
- 배지: NavBar `복습하기` due-count 패턴 재사용. 색 토큰만 `var(--wrong)` (red 계열)로 차별화 → review badge(teal)와 헷갈리지 않음.
- 드롭다운 패널: `var(--surface-raised)` 배경 + `var(--border)` 1px + 그림자 약하게. width 360~400px.
- unread 행: 좌측 4px `var(--teal)` 세로선 + 배경 살짝 tint (`var(--teal-dim)` 약하게).
- 읽음 행: 동일 레이아웃, 강조 없음, 텍스트 `var(--text-muted)`.

---

## 12. 마이그레이션

**0개**. SQL 변경 없음. 기존 `notifications` 테이블 + 트리거 + RLS + index 그대로 사용. JOIN 한 번으로 question_id까지 응답에 포함됨.

---

## 13. 테스트 전략

### 단위
- `formatNotification(type, payload, related_comment)`: 5종 타입 × {정상 / payload 키 누락 / related_comment null} 케이스. Vitest.

### API 라우트 (4개)
- 200 (정상)
- 401 (미인증)
- 404 (다른 user의 row 또는 미존재 — RLS 덕분에 update 0 rows로 자연스럽게 404)
- 멱등 (PATCH 두 번, mark-all-read 두 번)

### 컴포넌트
- `NotificationBell`:
  - 폴링 mock — 60s 후 fetch 호출
  - `visibilitychange hidden` → fetch 안 함
  - `visible` 복귀 → 즉시 fetch + interval 재개
  - count 99+ cap
  - user null → 미렌더
- `NotificationDropdown`:
  - open → list fetch
  - 외부 클릭 → close
  - Esc → close
  - 행 클릭 → optimistic + push
  - mark-all-read → 모든 행 read 표시

### 수동 verify 체크리스트 (E2E 대신)
1. 답글 달기 → 60s 내 부모 작성자에게 벨 점 표시
2. 클릭 → 드롭다운에 `"{nickname}님이 회원님의 댓글에 답글을 달았어요"` 행
3. 행 클릭 → `/questions/[id]?comment=<id>` 이동 + 해당 댓글 자동 스크롤 + 1.5s ring 하이라이트
4. 벨 다시 열면 해당 행 read 표시 + 카운트 -1
5. "전부 읽음" → 모든 행 read + 점 사라짐
6. 백그라운드 탭에선 폴링 stop (DevTools Network로 1분 관찰)

---

## 14. 구현 단계 (subagent-driven 친화)

| T | 산출물 | 주요 파일 |
|---|---|---|
| **T1** | `formatNotification` + 단위 테스트 | `lib/notifications/format.ts`, `format.test.ts` |
| **T2** | API 라우트 4종 + 단위 테스트 | `app/api/notifications/route.ts`, `app/api/notifications/[id]/route.ts`, `app/api/notifications/unread-count/route.ts`, `app/api/notifications/mark-all-read/route.ts` |
| **T3** | `<NotificationBell />` (폴링 + 배지 + 외부클릭) | `components/notifications/NotificationBell.tsx` |
| **T4** | `<NotificationDropdown />` + `<NotificationItem />` | `components/notifications/NotificationDropdown.tsx`, `NotificationItem.tsx` |
| **T5** | NavBar 통합 | `components/NavBar.tsx` |
| **T6** | `<QuestionReadOnly />` 추출 + `/questions/[id]` 페이지 | `components/QuestionReadOnly.tsx`, `app/questions/[id]/page.tsx` |
| **T7** | `CommentThread` `highlightCommentId` prop + scroll/highlight | `components/comments/CommentThread.tsx`, `CommentItem.tsx` |
| **T8** | 수동 verify + 메모리 업데이트 | (코드 변경 없음) |

**의존성**:
- T1 / T2 → 병렬
- T3 → T1·T2 후
- T4 → T3 후 (Bell이 Dropdown을 마운트)
- T5 → T4 후
- T6 / T7 → 병렬 (T7 wire-up은 T6에서 import 시)
- T8 → 모두 후

**bash CWD 함정** (학습 적용): 각 implementer prompt에 `cd vet-exam-ai && <command>` 한 줄로 묶기. orchestrator는 절대경로 사용. push 금지 명시. `git status` 확인 후 explicit path commit.

---

## 15. 알려진 위험 / 주의

- `vote_milestone` payload엔 `actor_id` 없음 — "누가 추천했는지" 표시 안 함 (의도된 익명 유지).
- `mark-all-read`는 폴링과 race가 있어도 결정적 (read_at not null = idempotent).
- 시계 차이로 정렬 흔들리지 않음 — 정렬은 `created_at desc`이고 read_at만 변하므로 영향 없음.
- `comment_blinded` / `mention` 타입은 트리거 미작성이라 현재 row 0건. format 함수는 5종 다 지원하되 `href = '#'` fallback. 트리거 추가 시 자동 합류.
- `comments` cascade delete로 `related_comment_id`가 살아있을 수 없음 — dangling reference 방지. `LEFT JOIN`으로 안전 처리.
- 60초 폴링은 사용자당 분당 1회 count 쿼리. 베타 직전 Supabase usage 모니터링 권장. 부하 발생 시 visibility-aware 폴링 + back-off 로직으로 확장.

---

## 16. 명시적 범위 밖 (정리)

- Supabase Realtime
- `/notifications` 전체 페이지 + 페이지네이션
- 토스트
- 이메일 다이제스트, 모바일 push
- @멘션, 알림 설정 페이지
- 정정 채택 알림 (§27)
- 합격생 뱃지 / 닉네임 필수화 — 별도 §17 follow-up 또는 §16
- 알림 click-through 전 로그인된 상태 보장 (next param 처리)
