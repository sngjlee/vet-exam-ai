# M3 §15 — 댓글 추천/정렬/신고/자동 블라인드 (Design Spec)

**Date:** 2026-04-27
**ROADMAP:** §15 (Phase 2 — 커뮤니티 MVP)
**Status:** Approved for plan
**Scope boundary:** §18 (모더레이션 도구 / `/admin` 신고 큐) is OUT OF SCOPE — separate PR.

---

## 1. 배경

§15는 베타(2026-07-01) 전 댓글 품질·안전을 담보하는 핵심 안전장치다. 백엔드 인프라는 이미 마이그레이션 `20260425000001_community_comments.sql`에 모두 깔려 있다:

- `comment_votes` 테이블 — `(comment_id, user_id)` PK, `value smallint check (value in (-1, 1))`
- `comment_reports` 테이블 — `unique (comment_id, reporter_id)`, `report_reason` enum 8종, `report_status` enum 4종
- `comment_status` enum — `visible / hidden_by_author / hidden_by_votes / blinded_by_report / removed_by_admin`
- `handle_comment_vote` 트리거 — vote_score 갱신, milestone(10/50/100) 알림, -5 자동 hide, popular_comment 뱃지(10)
- `handle_comment_report` 트리거 — report_count 갱신, 3건 자동 블라인드, 명예훼손 30일 임시조치
- `handle_report_resolution` 트리거 — 신고자에게 처리 결과 알림
- RLS 정책 — comments(blinded는 작성자/관리자만), comment_votes(owner), comment_reports(reporter+admin)
- 알림 enum — `reply / vote_milestone / report_resolved / comment_blinded / mention`

따라서 §15는 **클라이언트 UI + API 라우트 + 트리거 보강 1개**가 전부다.

---

## 2. 결정 요약 (Q&A 결과)

| # | 항목 | 결정 |
|---|---|---|
| 1 | 추천 표시 | **A. 화살표 2개 + 점수** (`▲ 12 ▼`). 양방향 투표 활성. 베타 분위기는 점수 디자인(중립 색)으로 완화. |
| 2 | 정렬 | **C. 추천순(기본) + 최신순 2종.** 루트 댓글만 적용. tiebreak `created_at desc`. 저장 안 함(매 진입 기본=추천순). 답글은 항상 `created_at asc`. |
| 3 | 신고 사유 | **C. 8개 라디오 + 명예훼손 선택 시 inline 안내** (정보통신망법 §44조의2 임시조치 안내). 부가 설명 0~500자 plain text. |
| 4 | 자동 블라인드 표시 | **A. `hidden_by_votes` / `blinded_by_report` 모두 접힌 행 + 펼침** (placeholder 패턴 재사용). hidden_by_votes는 본문/투표/신고 다 활성, blinded_by_report는 본문 미노출 (RLS). |
| 5 | 투표 API | **C. 단일 토글 라우트** `POST /api/comments/[id]/vote` body `{ value: 1 \| -1 }`. 같은 값 재호출 = 취소(DELETE), 다른 값 = UPDATE, 신규 = INSERT. 클라는 단건 정정으로 낙관적 업데이트. |
| 6a | 본인 댓글 투표 | 차단 (DB 트리거 raise + 클라 disable). |
| 6b | 비로그인 투표 시도 | inline 토스트 "로그인하면 투표할 수 있습니다". 점수 자체는 비로그인도 보임. |
| 6c | 답글 투표/신고 | 둘 다 가능. 더 작은 사이즈로 같은 컴포넌트 재사용. |
| 6d | 본인 댓글 신고 | 차단 (클라 + 서버). |
| 6e | 신고 후 상태 | 버튼 "신고됨 ✓" disable (재신고 차단). |
| 7a | §17 알림 합류 | vote_milestone / report_resolved / popular_comment 뱃지는 트리거 자동. **§15 작업 0.** |
| 7b | §18 모더레이션 도구 | OUT OF SCOPE. 베타 초기엔 SQL Editor로 status 변경. §18 별도 PR. |
| 7c | comment_blinded 알림 | 트리거 보강에 포함 (-5 / 3reports 도달 시 작성자 알림). |
| 7d | 신고 description sanitize | plain text only, 길이 검증만. 절대 HTML 렌더 안 함. |

---

## 3. PR 분할

design은 통합, plan은 2단 분할.

### PR-A — vote + sort (마이그레이션 0)

| 항목 | 내용 |
|---|---|
| 마이그레이션 | 0 |
| API | `POST /api/comments/[id]/vote`, `GET /api/comments/votes-mine?question_id=` |
| 컴포넌트 | `CommentVoteButton`, sort dropdown, `CommentItem` 통합 |
| CommentThread | sort 상태 + my-votes fetch (별도 쿼리) |
| 가시 효과 | 즉시 추천/비추천/정렬 가능. -5 댓글은 여전히 fetch에서 빠짐(PR-B까지) |
| 위험 | 낮음 — 트리거 변경 0, UI/API 추가만 |

### PR-B — report + blind UI + 트리거 보강 (마이그레이션 1)

| 항목 | 내용 |
|---|---|
| 마이그레이션 | 1개 (`handle_comment_vote` 자가투표 raise + comment_blinded 알림, `handle_comment_report` comment_blinded 알림) |
| API | `POST /api/comments/[id]/report` |
| 컴포넌트 | `CommentMenuOverflow`, `CommentReportModal`, hidden/blinded 접힘 행 |
| CommentThread | fetch status 3종(`visible / hidden_by_votes / blinded_by_report`) + 접힘 placeholder 합성 |
| 가시 효과 | 신고 모달 + 접힘 상태 표시 + 작성자 blinded 알림 |
| 위험 | 보통 — 트리거 보강은 backward-compatible (raise는 기존 row 영향 없음, 알림 insert는 추가) |

---

## 4. 데이터 흐름

### 4.1 투표 (PR-A)

```
[Client]
  CommentVoteButton onClick(value: 1 | -1)
    → 본인 댓글이면 disable (사전 가드)
    → 비로그인이면 토스트 "로그인하면 투표할 수 있습니다"
    → 낙관적 업데이트: roots state에서 해당 댓글 vote_score ±1 / myVote 토글
    → POST /api/comments/[id]/vote { value }

[API /vote]
  auth.getUser() — 비로그인 401
  body validation — value === 1 || value === -1, 그 외 422
  fetch comment — { user_id, status }
    not found → 404
    user_id === current.user.id → 403 (본인 댓글 차단)
    status not in ('visible', 'hidden_by_votes') → 409 (블라인드/삭제는 투표 불가)
  fetch existing vote — comment_votes where (comment_id, user_id)
  분기:
    no existing → INSERT { value }                           → 201 { vote: value }
    existing.value === value → DELETE (취소)                  → 200 { vote: null }
    existing.value !== value → UPDATE { value }              → 200 { vote: value }
  응답 body는 어느 분기든 `{ vote: 1 | -1 | null }` 통일.
  trigger handle_comment_vote가 vote_score / 알림 / -5 hide / 자가투표 raise 자동 처리.
  자가투표 raise(P0002) → 500 → 클라가 사전 disable로 사실상 도달 안 함.

[Client on success]
  서버 응답으로 myVote 정정 (낙관적 결과와 다르면 보정)
  점수는 trigger가 갱신한 값 — 별도 fetch 안 함, 낙관적 ±1 유지

[Client on failure]
  rollback (myVote 원복 + score ∓1)
  토스트 "투표 처리에 실패했습니다."
```

**stale snapshot race 방지:** 점수 정정은 자기 row만 다루므로 §14 3차의 reply race와 다름. `setReloadKey(k+1)` refetch 불필요.

### 4.2 정렬 (PR-A)

```
sortMode: 'score' | 'recent'  (state, 기본 'score', 저장 안 함)

CommentThread fetch 쿼리:
  base: status in ('visible')              ← PR-A
  sort 'score'  → order by vote_score desc, created_at desc
  sort 'recent' → order by created_at desc
  limit 50

답글 정렬: 항상 created_at asc (CommentList에서 클라이언트 sort)
sort change → setReloadKey(k+1) (서버 sort 재요청)
```

**인덱스:** `comments_question_score (question_id, vote_score desc) where status='visible' and parent_id is null` 이미 존재.

### 4.3 신고 (PR-B)

```
[Client]
  CommentMenuOverflow → "신고" 클릭
    → CommentReportModal 오픈
    → 라디오 8개 (spam/misinformation/privacy/hate_speech/advertising/copyright/defamation/other)
    → defamation 선택 시 빨간 inline 안내 박스 노출
    → 부가 설명 textarea (0~500자, optional)
    → 제출 버튼

[API /report]
  auth.getUser() — 비로그인 401
  body validation:
    reason: enum 8종 중 하나 — 그 외 422
    description: optional, max 500 plain text — 초과 시 422
  fetch comment — { user_id, status }
    not found → 404
    user_id === current.user.id → 403 (본인 신고 차단)
    status === 'removed_by_admin' → 410
  INSERT comment_reports { comment_id, reporter_id, reason, description? }
    UNIQUE 위반 (이미 신고함) → 409
  trigger handle_comment_report:
    report_count++
    >= 3 → status = 'blinded_by_report'
    reason = 'defamation' → blinded_until = now() + 30 days
    [PR-B trigger 보강] >= 3 도달 시 comment_blinded 알림 insert (작성자에게)
  → 201

[Client on success]
  모달 닫기 + 토스트 "신고가 접수되었습니다."
  해당 댓글의 ⋯ 메뉴 항목을 "신고됨 ✓" disable로 토글 (state 갱신)
  reportedCommentIds Set에 add
```

### 4.4 접힘 상태 표시 (PR-B)

```
CommentThread fetch:
  status in ('visible', 'hidden_by_votes', 'blinded_by_report')
  단, blinded_by_report는 RLS가 작성자/관리자만 본문 노출 → 비owner는 row 자체는 받지만 body_html은 RLS 정책에 따라 보호

CommentItem 렌더 분기:
  status === 'visible'           → 일반 렌더 (vote/report/reply 활성)
  status === 'hidden_by_votes'   → 접힌 행:
                                    "[누적 비추천으로 접힘 (-7)] 펼치기 ▾"
                                    펼침 시 일반 렌더 (vote/report/reply 활성)
                                    state.expandedIds Set 사용
  status === 'blinded_by_report' →
    if owner or admin → 일반 렌더 + 안내 배지 "신고로 임시 비공개됨"
    else              → 접힌 행 (펼침 불가):
                        "[신고로 임시 비공개된 댓글입니다]"

부모 root가 hidden_by_votes/blinded_by_report인 경우 답글 처리:
  - hidden_by_votes: root는 접힌 행, 답글은 그 아래에 펼친 채 그대로 표시
    (사용자가 root를 펼치면 root만 본문 노출 — 답글 자리 변경 없음)
  - blinded_by_report (비owner): root는 접힌 행 + 펼침 불가, 답글은 그 아래에 펼친 채 그대로 표시
    (RLS가 root 본문은 막지만 답글들은 자체 status='visible'이므로 노출됨)
  - 결과적으로 thread 합성 로직은 §14 3차의 `hidden_by_author` placeholder 패턴과 동일하게 동작:
    root row 자체는 collapsed-display, 답글 group은 정상 매핑.
  - isPlaceholder는 hidden_by_author 전용으로 유지(혼동 방지). collapsed 상태는
    별도 isCollapsed + collapsedReason prop으로 표현.
```

### 4.5 my-votes fetch (PR-A)

```
GET /api/comments/votes-mine?question_id=<id>
  auth.getUser() — 비로그인 {} 반환 (200)
  step 1: select id from comments where question_id = $1
          (root + reply 모두, sort 무관 — 단순 ID 수집)
          fetch limit 200 (50 root × 4 평균 답글 여유분, page-1 가정)
  step 2: select comment_id, value from comment_votes
            where user_id = auth.uid() and comment_id in (step1.ids)
  → return { [comment_id]: 1 | -1 }   (Object map, 직렬화 단순)

CommentThread useEffect:
  questionId, currentUserId, reloadKey 변할 때 fetch (sortMode 변경 시는 댓글 fetch만 재요청, my-votes는 그대로)
  state.myVotes: Map<commentId, 1 | -1>  (객체 → Map 변환)
```

---

## 5. 스키마 / 트리거 변경 (PR-B 마이그레이션)

```
-- 20260427000000_comment_vote_report_blinded_alerts.sql

-- 1. handle_comment_vote 보강
--    (a) 자가 투표 차단 (raise)
--    (b) -5 도달 시 comment_blinded 알림

create or replace function public.handle_comment_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  vote_delta integer := 0;
  new_score  integer;
  comment_owner uuid;
begin
  -- 자가 투표 차단 (INSERT/UPDATE만 — DELETE는 자기 vote 취소이므로 OK)
  if TG_OP in ('INSERT', 'UPDATE') then
    select user_id into comment_owner
      from public.comments where id = new.comment_id;
    if comment_owner is not null and comment_owner = new.user_id then
      raise exception 'Cannot vote on own comment'
        using errcode = 'P0002';  -- 별도 SQLSTATE (depth는 P0001)
    end if;
    comment_owner := null;  -- 이후 milestone 로직이 자체적으로 다시 채움
  end if;

  -- (기존 카운터 갱신 + comment_owner / new_score returning 로직 그대로) ...
  -- (기존 milestone 알림 10/50/100 + popular_comment 뱃지 로직 그대로) ...

  -- 자동 hide + comment_blinded 알림 (NEW — 기존 -5 hide 블록 교체)
  if new_score is not null and new_score <= -5 then
    declare
      hidden_owner uuid;
    begin
      update public.comments
        set status = 'hidden_by_votes'
        where id = coalesce(new.comment_id, old.comment_id) and status = 'visible'
        returning user_id into hidden_owner;

      -- 처음 hidden 상태로 전환된 row만 알림 (status='visible' WHERE 절이 idempotency 보장)
      if hidden_owner is not null then
        insert into public.notifications (user_id, type, related_comment_id, payload)
        values (
          hidden_owner, 'comment_blinded',
          coalesce(new.comment_id, old.comment_id),
          jsonb_build_object('reason', 'votes', 'score', new_score)
        );
      end if;
    end;
  end if;

  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
-- NOTE: plan에서 기존 함수 full body를 인용하여 정확한 patched version을 작성.
--       위 코드는 보강 부분만 발췌. 기존 카운터 갱신 / milestone 블록은 변경 없음.

-- 2. handle_comment_report 보강
--    (a) 3 reports 도달 시 comment_blinded 알림

create or replace function public.handle_comment_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count smallint;
  comment_owner uuid;
begin
  update public.comments
    set report_count = report_count + 1
    where id = new.comment_id
    returning report_count, user_id into new_count, comment_owner;

  if new_count >= 3 then
    update public.comments
      set status = 'blinded_by_report'
      where id = new.comment_id and status = 'visible';

    -- 처음 blinded 전환된 경우만 (idempotent via unique notification index)
    if comment_owner is not null then
      insert into public.notifications (user_id, type, related_comment_id, payload)
      values (
        comment_owner, 'comment_blinded',
        new.comment_id,
        jsonb_build_object('reason', 'reports', 'count', new_count)
      )
      on conflict do nothing;
    end if;
  end if;

  if new.reason = 'defamation' then
    update public.comments
      set blinded_until = greatest(coalesce(blinded_until, now()), now() + interval '30 days')
      where id = new.comment_id;
  end if;

  return new;
end;
$$;
```

**보강 안전성:**
- 자가 투표 raise는 backward-compatible — 기존 row에 영향 없음. 클라가 사전 disable하면 절대 도달 안 함.
- comment_blinded 알림은 신규 enum value — `notifications.type` enum이 이미 5종 모두 정의됨.
- §17 NotificationItem의 `formatNotification`은 `comment_blinded` 5종 케이스 모두 지원 (확인됨, notifications_mvp_done 메모).
- 알림 idempotency는 `notifications` 테이블의 unique partial index(있다면)에 의존. 없으면 동일 댓글이 -5↔-4를 왔다 갔다 할 때 중복 발생 가능 — partial unique index 추가 필요 시 plan에서 결정.

---

## 6. 컴포넌트 인터페이스

### 6.1 CommentVoteButton (PR-A)

```ts
type Props = {
  commentId: string;
  score: number;                  // 표시용 vote_score
  myVote: 1 | -1 | null;          // 내 현재 투표
  isOwner: boolean;               // 본인 댓글이면 disabled
  isAuthed: boolean;              // 비로그인이면 토스트
  size?: 'normal' | 'small';      // 답글은 'small'
  onVoteChange: (commentId: string, value: 1 | -1, prev: 1 | -1 | null) => void;
};
// onVoteChange는 컴포넌트가 prev(현재 myVote)를 알고 있으므로 부모 핸들러가
// 토글 의도(같은 값 재호출 = 취소)를 판단할 수 있도록 prev를 함께 넘긴다.

// 표시:
//   ▲ score ▼   (가로 배치)
//   ▲: myVote===1 → teal, else neutral
//   ▼: myVote===-1 → wrong-red, else neutral
//   isOwner → 둘 다 disabled, tooltip "본인 댓글에는 투표할 수 없습니다"
```

### 6.2 CommentMenuOverflow (PR-B)

```ts
type Props = {
  commentId: string;
  isOwner: boolean;
  isReported: boolean;            // 내가 이미 신고함
  canDelete: boolean;
  onDelete: () => void;
  onReport: () => void;
};

// ⋯ 버튼 → dropdown:
//   - "삭제" (canDelete)
//   - "신고" (!isOwner && !isReported)
//   - "신고됨 ✓" disabled (isReported)
```

### 6.3 CommentReportModal (PR-B)

```ts
type Props = {
  commentId: string;
  open: boolean;
  onClose: () => void;
  onSubmitted: (commentId: string) => void;
};

// 라디오 8종 + defamation inline 빨간 박스
// 부가 설명 textarea (count 표시: "0 / 500")
// 제출 버튼: 사유 미선택 시 disabled
// 제출 중 spinner
// 응답:
//   201 → onSubmitted, 모달 닫기, 토스트
//   409 → 토스트 "이미 신고하신 댓글입니다." + 모달 닫기
//   403 → 토스트 "본인 댓글은 신고할 수 없습니다."
//   기타 → 토스트 "신고 처리에 실패했습니다."
```

### 6.4 CommentList sort dropdown (PR-A)

```ts
// CommentList 상단:
//   "댓글 N" 제목 우측에 "정렬 ▾" (추천순 / 최신순)
//   기본 추천순. localStorage 저장 안 함.
```

### 6.5 CommentItem 변경 (PR-A 통합)

```ts
type Props = {
  comment: CommentItemData;
  myVote: 1 | -1 | null;          // NEW
  score: number;                  // NEW (denormalized vote_score)
  isOwner: boolean;
  isAuthed: boolean;
  isReply?: boolean;
  isReported?: boolean;           // PR-B
  isCollapsed?: boolean;          // PR-B (hidden_by_votes 접힘 상태)
  collapsedReason?: 'votes' | 'reports';  // PR-B
  // 기존 props ...
  onVoteChange: (commentId: string, value: 1 | -1, prev: 1 | -1 | null) => void;
  onReport?: (id: string) => void;  // PR-B
};
```

---

## 7. CommentThread state / fetch 변경

```ts
type Status = 'loading' | 'ready' | 'error';
type SortMode = 'score' | 'recent';

const [sortMode, setSortMode] = useState<SortMode>('score');
const [myVotes, setMyVotes] = useState<Map<string, 1 | -1>>(new Map());
const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());  // PR-B
const [expandedCollapsed, setExpandedCollapsed] = useState<Set<string>>(new Set());  // PR-B

useEffect(() => {
  // (a) auth + nickname (기존) ...
  // (b) comments fetch (sort 적용)
  //     PR-A: status = 'visible'
  //     PR-B: status in ('visible', 'hidden_by_votes', 'blinded_by_report')
  // (c) profiles fetch (기존) ...
  // (d) my-votes fetch (PR-A)
  //     GET /api/comments/votes-mine?question_id=
  //     setMyVotes
  // (e) my-reports fetch (PR-B)
  //     GET /api/comments/reports-mine?question_id=
  //     setReportedIds
}, [questionId, sortMode, reloadKey]);

// vote handler
async function handleVoteChange(id: string, value: 1 | -1, prev: 1 | -1 | null) {
  // 낙관적 업데이트:
  //   prev === value     → 취소 의도, myVotes에서 제거, score -= value
  //   prev !== value     → 설정/변경 의도, myVotes 갱신, score += (value - (prev ?? 0))
  // POST /api/comments/[id]/vote { value }
  // 응답: { vote: null } 이면 취소 확정 / { vote: 1 | -1 } 이면 set 확정
  //       (서버 결과가 낙관적 결과와 다르면 보정 — 거의 발생 안 함)
  // 실패 시 rollback (myVotes / score 둘 다 prev 복원)
}
```

---

## 8. 에러 처리 / 보안

### 투표
- 401: 클라가 비로그인 disable + 서버 가드
- 403: 본인 댓글 → 클라 disable + 서버 가드 + DB 트리거 raise
- 409: 댓글 status가 visible/hidden_by_votes 외 → 클라 disable + 서버 가드
- 422: value invalid
- 500: DB 에러 → 토스트 + rollback

### 신고
- 401: 클라가 비로그인 진입점 차단 + 서버 가드
- 403: 본인 댓글 → 클라 메뉴 항목 안 보임 + 서버 가드
- 409: UNIQUE 위반 (재신고) → 클라가 reportedIds로 사전 차단, 서버는 fallback
- 410: removed_by_admin → 클라 메뉴 차단
- 422: reason / description 검증 실패
- 500: 토스트

### RLS / 공격 표면
- 클라가 직접 supabase.from('comment_votes').insert() 시도해도 RLS는 owner만 허용 (`auth.uid() = user_id`) — API 라우트 우회 가능. **이 우회는 막을 수 없으므로 트리거의 자가 투표 raise + status 검증을 DB-level truth로 신뢰**. API 라우트는 친절한 에러 메시지/낙관적 응답 형식 표준화 목적.
- 신고 description은 plain text. body_html처럼 sanitize 거치지 않음. 관리자 페이지에서도 plain text로만 렌더 (§18 PR에서 명시).
- comment_blinded 알림 트리거는 RLS 우회(`security definer`) — comment_owner 조회 시 RLS 회피 OK (이미 기존 트리거 동일 패턴).

---

## 9. 시각 가이드라인

- **vote 버튼:** 16px 화살표 아이콘 (lucide `ChevronUp` / `ChevronDown`), 비활성 색 `var(--text-faint)`, 활성: 추천 `var(--teal)` / 비추천 `var(--wrong)`. 점수는 `font-size: 12px`, 중립 색.
- **sort dropdown:** CommentList 헤더 우측 `정렬 ▾` 작은 텍스트 버튼. 펼치면 메뉴 2개.
- **접힌 행 (hidden_by_votes):** dashed border, `var(--text-faint)` 텍스트, 점수 표시 `(−7)`, 우측 "펼치기 ▾".
- **접힌 행 (blinded_by_report):** 같은 dashed 스타일, "신고로 임시 비공개된 댓글입니다" 텍스트만.
- **신고 모달:** 모달 너비 480px, 라디오 8개 세로, defamation 선택 시 그 아래에 빨간 박스(`var(--wrong-dim)`) inline 안내. 부가 설명 textarea, "0 / 500" 카운트.

inline style + CSS var 패턴 유지 (Tailwind utility runtime 주입 함정 — notifications_mvp_done 학습).

---

## 10. 테스팅 / 검수

테스트 인프라 없음(notifications_mvp_done와 동일 상황) → typecheck + 빌드 + 수동 스모크.

**스모크 체크리스트:**

PR-A:
- [ ] 추천 → 점수 +1, 화살표 teal, 다시 누르면 취소 → 점수 -1
- [ ] 비추천 → 점수 -1, 화살표 red, 다시 누르면 취소
- [ ] 추천 → 비추천 변경 → 점수 -2 (correct delta)
- [ ] 본인 댓글 화살표 disabled
- [ ] 비로그인 클릭 → 토스트, 상태 변화 없음
- [ ] 정렬 추천순 ↔ 최신순 토글, 답글 순서는 변하지 않음 (asc 유지)
- [ ] 페이지 새로고침 후에도 myVotes 복원
- [ ] 답글에서도 vote 동작

PR-B:
- [ ] ⋯ → 신고 → 모달 → defamation 선택 시 빨간 안내 노출
- [ ] description 0~500 검증 (501자 차단)
- [ ] 신고 제출 → 토스트 + 메뉴 "신고됨 ✓" 토글
- [ ] 같은 댓글 재신고 시도 → 메뉴에서 사전 차단 (UNIQUE까지 안 감)
- [ ] vote_score를 -5로 만들면 자동 hidden_by_votes → 접힌 행으로 전환
- [ ] hidden_by_votes 펼치기 → 본문 + 투표/신고 활성
- [ ] 신고 3건으로 blinded_by_report → 비owner 접힌 행 (펼침 불가), owner는 일반 렌더 + 안내 배지
- [ ] 작성자에게 comment_blinded 알림 도착 (NavBar 벨)

---

## 11. 후속 / 명시 deferral

- **§18 모더레이션 도구 (`/admin/reports`)** — 별도 PR. 베타 초기엔 SQL Editor로 `comment_reports.status` 변경 → `handle_report_resolution`이 신고자 알림 자동.
- **vote_score / report_count 정합성 점검 스크립트** — 트리거 갱신 못 따라간 경우 대비. M5 시딩 후 일괄 재계산.
- **무한 스크롤 / 50건 초과** — 현재 limit 50 그대로. 베타 후 결정.
- **블라인드된 댓글 작성자 이의제기** — V2 (정보통신망법 임시조치 절차 §F).
- **administer pagination for /admin/reports** — §18.
- **vote_milestone 알림 idempotency unique partial index** — `notifications` 테이블 검토 후 plan에서 결정.

---

## 12. 학습 / 함정 (선행 메모리에서 가져옴)

- **embedded join 함정** (comment_core_done) — comment_votes / comment_reports도 typed에 `Relationships: []` 가능성 높음 → 두-쿼리 stitch 패턴 유지.
- **Tailwind v4 utility runtime 주입 함정** (notifications_mvp_done) — vote 활성 색은 inline `style.color` 또는 CSS var 직접 사용.
- **bash CWD 함정** (comment_replies_done) — implementer prompt에 `cd vet-exam-ai && <cmd>` 한 줄로 묶기, orchestrator는 절대경로.
- **subagent commit이 pre-staged 휩쓸기** (dday_widget_done) — `git status` 확인 + explicit path + push 금지 prompt.
- **stale snapshot rollback** (comment_replies_done) — 단건 정정으로 vote는 OK, refetch 불필요.

---

## 13. Out of Scope (명시)

- §14 4차 PR (수정 + 변경 이력 모달) — 별도
- §14 2차 PR (이미지 첨부) — 별도
- §16 (유저 프로필 / 뱃지 페이지) — 별도. popular_comment 뱃지는 §15 트리거가 자동 grant하지만 노출 UI는 §16.
- §17 추가 (toast / realtime / next param / 전체 페이지) — 별도
- §18 (`/admin` 모더레이션 도구) — 별도. **§15가 신고 row를 쌓아두지만 처리 UI는 없음 — 베타 초기 운영 약속.**
