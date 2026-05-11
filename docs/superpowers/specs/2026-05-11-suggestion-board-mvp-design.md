# Suggestion Board MVP — Design

**Date**: 2026-05-11
**Status**: Draft (awaiting user review)
**Scope**: 베타 1주차 피드백 채널을 외부 오픈카톡 대신 자체 게시판으로 제공. ROADMAP T2 보드 MVP에서 **건의하세요 + 공지사항** 두 채널만 우선 구현. 공부정보공유는 베타 회고 이후 별건.

## 1. 배경과 목표

- 5-08 합의 시퀀스(Custom SMTP → 오픈카톡 → 시딩 §20 → 베타 회고 후 보드 P0 승격)에서 **오픈카톡 단계를 건너뛰고 건의 보드를 곧장 짓는다**.
- 오픈카톡 대비 이점: 영구 자산, 자체 모더, 이미지·댓글·알림 일관 UX, 카톡 → 게시판 이전 비용 절감.
- 단일 보드 MVP가 아닌 **공지·건의 한 묶음**: 운영자 일방 공지(베타 안내·장애·이용 가이드)와 사용자 피드백을 동일한 인프라 위에서 관리한다.

### Non-goals

- 공부정보공유 보드, 시험 후기, FAQ, 자유게시판 (모두 별건/후순위)
- 광고/홍보 자동 필터 (v1.1)
- 게시판 본문 검색 (검색 1차는 questions/comments만; 별건)
- 메일 알림, 모바일 푸시
- 핀 다중 슬롯, 1만+ 유저 broadcast 워커
- 모바일 햄버거 NavBar 리디자인
- recovery session 구분 (`recovery_session_distinguishability_backlog`)

## 2. 아키텍처

### 2.1 라우트

```
/board                          탭 페이지 (공지·건의 카드 2장 + 최근 활동)
/board/suggestions              건의 목록 (정렬 + 상태 필터)
/board/suggestions/new          작성 폼 (approved only)
/board/suggestions/[id]         상세 (본문 + 댓글 스레드)
/board/announcements            공지 목록 (핀 우선 + 최신순)
/board/announcements/new        작성 폼 (admin only)
/board/announcements/[id]       상세 (본문 + 댓글 스레드)
/admin/suggestions              모더 큐 (상태별 필터 + 액션)
```

공지는 별도 admin 큐 없음 — 운영자가 직접 작성·수정·삭제하므로 list/edit가 admin 기능과 동일.

### 2.2 NavBar 진입점

- 데스크탑: 기존 메인 nav 옆에 **"공지·건의"** 1개 항목 → `/board`
- 모바일: 동일 항목을 하단 라인 추가. 항목 수 overflow면 우선순위 조정 (햄버거 도입은 별건).
- Admin 사이드바: `/admin/suggestions` 항목 추가 (`/admin/reports`, `/admin/corrections` 옆).

### 2.3 Dashboard 배너

- `components/dashboard/AnnouncementBanner.tsx` 신규
- 최신 1건 표시 — **핀 공지 우선**, 없으면 최신 announcement 1건
- 제목 + "자세히" 링크 + `×` 닫기
- 닫기 시 `sessionStorage.dismissed_announcement_id = id` + `dismissed_at = now`
- 24h 경과 또는 새 공지 발행 시 다시 표시

### 2.4 컴포넌트 재사용

| 재사용 (기존) | 신규 |
|---|---|
| TipTap composer + sanitize-html | `BoardPostComposer` |
| `CommentImageAttacher` | `BoardPostListItem` / `BoardPostCard` |
| `NotificationsDropdown` | `SuggestionStatusBadge` |
| Admin sidebar + 큐 패턴 | `BoardCommentList` (`CommentList` 변형) |
| `report_reason` enum, audit helper | `AnnouncementBanner` |

## 3. 데이터 모델

### 3.1 신규 enum

```sql
create type public.board_post_kind as enum ('suggestion', 'announcement');
create type public.suggestion_status as enum ('received', 'reviewing', 'accepted', 'rejected');
create type public.board_visibility as enum (
  'visible', 'hidden_by_author', 'blinded_by_report', 'removed_by_admin'
);

-- 기존 enum 확장:
alter type public.notification_type add value if not exists 'post_reply';
alter type public.notification_type add value if not exists 'suggestion_state_changed';
alter type public.notification_type add value if not exists 'announcement_published';
alter type public.notification_type add value if not exists 'post_blinded';

alter type public.badge_type add value if not exists 'adopter';

alter type public.audit_action add value if not exists 'board_post_state_change';
alter type public.audit_action add value if not exists 'board_post_visibility_change';
alter type public.audit_action add value if not exists 'announcement_pinned';
```

### 3.2 `board_posts`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `kind` | `board_post_kind` | not null |
| `user_id` | uuid → `profiles(id)` | `on delete set null` |
| `title` | text | 1~200 char |
| `body_text` | text | 1~20000 char (검색·미리보기) |
| `body_html` | text | sanitize-html 결과 |
| `image_urls` | text[] | default `{}`, max 5 |
| `visibility` | `board_visibility` | default `'visible'` |
| `suggestion_status` | `suggestion_status` | nullable. `kind='suggestion'`일 때만 set, default `'received'` |
| `is_anonymized` | boolean | default false. 작성자 선택 (announcement는 강제 false) |
| `is_pinned` | boolean | default false. announcement만 true 허용 |
| `resolution_note` | text | nullable. admin이 채택/반려 시 코멘트 |
| `upvote_count` | int | denormalized |
| `report_count` | smallint | denormalized |
| `comment_count` | int | denormalized |
| `blinded_until` | timestamptz | 정통망법 임시조치 (3+ 신고 또는 admin) |
| `edit_count` | int | default 0 |
| `created_at` / `updated_at` | timestamptz | |

**CHECK 제약**
- `(kind = 'announcement') = (suggestion_status is null)` — 즉 announcement는 status null, suggestion은 status 필수
- `kind = 'announcement' implies is_anonymized = false`
- `kind = 'suggestion' implies is_pinned = false`
- `char_length(title) between 1 and 200`
- `char_length(body_text) between 1 and 20000`
- `cardinality(image_urls) <= 5`

**인덱스**
- `(kind, visibility, created_at desc)` partial where `visibility='visible'`
- `(kind, is_pinned desc, created_at desc)` partial where `kind='announcement' and visibility='visible'`
- `(suggestion_status, created_at desc)` partial where `kind='suggestion'`
- `(user_id, created_at desc)`

### 3.3 `board_post_comments`

`comments` 슬림 버전. vote 컬럼·트리거 제외, 모더 기능 유지.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid pk | |
| `post_id` | uuid → `board_posts(id)` | `on delete cascade` |
| `user_id` | uuid → `profiles(id)` | set null |
| `parent_id` | uuid → `board_post_comments(id)` | 1-level 답글, cascade |
| `body_text` | text | 1~5000 char |
| `body_html` | text | sanitized |
| `image_urls` | text[] | max 3 (댓글 규칙 동일) |
| `status` | `comment_status` | 기존 enum 재사용 |
| `is_anonymized` | boolean | 작성 시 선택 |
| `report_count` | smallint | denormalized |
| `reply_count` | smallint | denormalized |
| `blinded_until` | timestamptz | |
| `edit_count` | int | default 0 |
| `created_at` / `updated_at` | timestamptz | |

**CHECK**
- `char_length(body_text) between 1 and 5000`
- `cardinality(image_urls) <= 3`
- 1-level reply 강제: parent 트리거에서 `parent_id is null` 일 때만 INSERT 허용 (parent_id 가진 row의 parent_id 재참조 차단)

**인덱스**
- `(post_id, created_at)` partial where `status='visible'`
- `(post_id, parent_id, created_at)` for thread rendering
- `(user_id, created_at desc)`

### 3.4 신고 테이블 (별도)

`board_post_reports`, `board_post_comment_reports` — `comment_reports` 패턴 카피.

```sql
create table public.board_post_reports (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.board_posts(id) on delete cascade,
  reporter_id     uuid not null references public.profiles(id) on delete cascade,
  reason          public.report_reason not null,
  note            text,
  status          public.report_status not null default 'pending',
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles(id) on delete set null,
  resolution_note text,
  unique (post_id, reporter_id)  -- 1인 1신고
);
-- 같은 구조의 board_post_comment_reports
```

### 3.5 Upvote 테이블

```sql
create table public.board_post_upvotes (
  post_id    uuid not null references public.board_posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
```
토글 시 `board_posts.upvote_count` 트리거로 갱신.

### 3.6 Storage

- 기존 `comment-images` Supabase Storage 버킷 재사용
- Path prefix만 분리: `boards/{post_id}/...` (게시글), `boards/{post_id}/comments/{comment_id}/...` (댓글)
- 정책·EXIF 제거·압축 파이프라인 동일

## 4. 상태 머신과 RLS

### 4.1 Suggestion 상태 전환

```
received ──┬──→ reviewing ──┬──→ accepted (lock)
           │                └──→ rejected (lock)
           ├──→ accepted (skip reviewing, lock)
           └──→ rejected (skip reviewing, lock)
```

- `accepted` / `rejected` 진입 후 작성자 편집·삭제 RLS 차단 (lock)
- admin은 잠긴 상태에서도 visibility 변경 가능 (blind/remove)
- 모든 상태 전환은 `update_suggestion_state` RPC 단일 진입. 직접 UPDATE 정책 없음.
- 상태 재변경(rejected → accepted 등) 허용. admin 판단에 위임.

### 4.2 RLS — `board_posts`

**SELECT**
- `signup_status_of(auth.uid()) = 'approved'`인 사용자만 SELECT 가능 (admin 포함)
- `visibility = 'visible'`이면 모두 표시
- `visibility = 'hidden_by_author'` 또는 `'blinded_by_report'`인 경우: 작성자 본인 또는 admin만 표시
- `visibility = 'removed_by_admin'`인 경우: admin만 표시
- `blinded_until > now()`인 경우: 작성자·admin만 표시 (visibility와 별개 정통망법 임시조치)

**INSERT**
- `kind = 'announcement'`: admin only (`role = 'admin' AND is_active`)
- `kind = 'suggestion'`: `signup_status_of(auth.uid()) = 'approved'` (admin도 grandfather 백필로 approved 상태이므로 통과)

**UPDATE — 작성자 본인 편집** (제목·본문·이미지·익명 토글)
- `auth.uid() = user_id`
- `visibility = 'visible'`
- `kind = 'announcement' OR (kind = 'suggestion' AND suggestion_status IN ('received', 'reviewing'))`
- announcement는 admin이 작성자이므로 admin도 동일 정책으로 자기 글 편집 가능

**UPDATE — 모든 상태/시각/admin 액션**: 정책 없음 (service_role / SECURITY DEFINER 함수만)

**DELETE**: 정책 없음 (soft delete만 — `set visibility = 'hidden_by_author'`)

### 4.3 RLS — `board_post_comments`

`comments` 정책 카피. 단 부모 게시글 visibility 체크 추가:
- 부모 `board_posts.visibility != 'visible'`이거나 `blinded_until > now()`이면 게시글에 접근 불가한 사용자는 댓글도 조회 불가

### 4.4 신고/Upvote RLS

- `board_post_reports` INSERT: approved 사용자, 본인 글 신고 차단
- `board_post_reports` SELECT: 본인 신고 + admin
- `board_post_upvotes` INSERT/DELETE: approved 사용자, 본인 글 upvote 차단
- `board_post_upvotes` SELECT: 누구나 (count 노출)

## 5. RPC와 트리거

### 5.1 RPC (모두 SECURITY DEFINER + `set search_path = public` + admin 게이트)

| RPC | 인자 | 동작 |
|---|---|---|
| `update_suggestion_state` | `p_post_id`, `p_new_status`, `p_note` | suggestion_status 갱신, 작성자에 `suggestion_state_changed` 알림, `accepted`시 adopter 뱃지 부여 (idempotent), audit log |
| `set_announcement_pinned` | `p_post_id`, `p_pinned` | 핀 토글. 기존 핀이 있으면 자동 unpin (단일 핀), audit log |
| `set_board_post_visibility` | `p_post_id`, `p_visibility`, `p_reason` | admin blind/remove/복구. `blinded_by_report`로 갈 때 작성자에 `post_blinded` 알림 |
| `set_board_post_comment_visibility` | `p_comment_id`, `p_visibility`, `p_reason` | 동일, 댓글 |
| `resolve_board_post_report` | `p_post_id`, `p_resolution` | `resolve_comment_report` 패턴 |
| `resolve_board_post_comment_report` | `p_comment_id`, `p_resolution` | 동일 |
| `broadcast_announcement` | `p_post_id` | approved 사용자 전원에 `announcement_published` 알림 일괄 INSERT |

### 5.2 트리거

| 트리거 | 시점 | 동작 |
|---|---|---|
| `handle_board_post_insert` | after insert | `kind='announcement'` 면 `broadcast_announcement(NEW.id)` 호출 |
| `handle_board_post_upvote_insert/delete` | after | `board_posts.upvote_count` 갱신 |
| `handle_board_post_report_insert` | after | `board_posts.report_count` 갱신. 3건 도달 시 visibility를 `blinded_by_report`로 + `blinded_until = now() + 30일` + 작성자에 `post_blinded` 알림 |
| `handle_board_post_comment_insert` | after | `board_posts.comment_count` ++, 부모 댓글 `reply_count` ++ (있으면), 부모 글 작성자에 `post_reply` 알림 (자기 글 자기 댓글 skip) |
| `handle_board_post_comment_update` | before | `edit_count` 증가 + `updated_at` 갱신. `SECURITY DEFINER` 필요 (RLS 적용 테이블에 트리거가 쓰므로 — `feedback_security_definer_trigger.md` 함정 회피) |
| `handle_board_post_comment_report_insert` | after | 댓글 신고 카운트 + 3건 자동 blind |

### 5.3 Adopter 뱃지

- `update_suggestion_state`에서 `p_new_status = 'accepted'` 시:
  ```sql
  insert into public.badges (user_id, badge_type, reason, awarded_by)
  values (target_user_id, 'adopter', '건의 채택', auth.uid())
  on conflict (user_id, badge_type) do nothing;
  ```
- 익명 글이라도 `user_id`로 뱃지 부여 (UI상 익명, 내부적으론 실명 — 사용자 본인만 자기 프로필에서 인지)

## 6. 알림

### 6.1 `notification_type` payload 스키마

| type | required payload keys |
|---|---|
| `post_reply` | `post_id`, `post_title`, `post_kind`, `actor_nickname` |
| `suggestion_state_changed` | `post_id`, `post_title`, `from_status`, `to_status`, `resolution_note` (nullable) |
| `announcement_published` | `post_id`, `post_title`, `is_pinned` |
| `post_blinded` | `post_id`, `post_kind`, `reason` |

`notifications.payload_keys_present` CHECK 제약에 4개 case 추가.

### 6.2 멱등성

`(user_id, type, payload->>'post_id')` 부분 인덱스를 `type IN ('announcement_published')` 조건으로 UNIQUE → broadcast 재실행 시 중복 알림 차단.

### 6.3 드롭다운 라우팅

- `post_reply` → `/board/{post_kind}s/{post_id}#comments`
- `suggestion_state_changed` → `/board/suggestions/{post_id}`
- `announcement_published` → `/board/announcements/{post_id}`
- `post_blinded` → `/board/{post_kind}s/{post_id}` (작성자만 알림 받음)

## 7. UI 상세

### 7.1 `/board` 탭 페이지

- 카드 2장: "📢 공지 (n)" / "💬 건의 (n)" — 각 카드에 최근 3건 미리보기 (제목 + 작성자/익명 + 시간)
- 핀 공지 항상 상단 (공지 카드 내부에서도 핀 표시)
- 미인증 시 `/auth/login?next=/board` 리다이렉트, 미승인 시 `/auth/pending-proof` 또는 `/auth/pending-review`

### 7.2 목록 페이지

- `/board/suggestions`:
  - 정렬 토글: 최신 / 인기(upvote) / 상태별 필터 (탭: 전체 / 접수 / 검토중 / 채택 / 반려)
  - 행: 제목, 작성자 또는 "익명", 상태 뱃지, 댓글 수, 공감 수, 시간
- `/board/announcements`:
  - 핀 우선, 그 다음 최신순
  - 운영자에게 "새 공지 작성" CTA 노출
- 페이지네이션 20개씩, `range()` + 1000행 cap 회피 패턴

### 7.3 작성 폼 (`/new`)

- 제목 input (200자 카운터)
- TipTap 에디터 + 이미지 첨부 (`CommentImageAttacher` 변형)
- 익명 체크박스 — `kind='suggestion'`에서만 활성, announcement에선 disable
- 미리보기 → 작성 → 상세로 리다이렉트
- 클라이언트 sanitize + 서버 sanitize 이중

### 7.4 상세 페이지

- 헤더: 제목, 작성자(닉네임 링크 또는 "익명"), 작성일, 상태 뱃지(suggestion)
- 본문: sanitize된 body_html + 이미지 갤러리
- 액션 바: 공감(upvote) / 신고 / 공유 / 작성자에겐 수정·삭제 (잠금 시 disable + tooltip)
- 운영자 코멘트: `resolution_note` 있으면 본문 아래 강조 박스
- 댓글 스레드: `BoardCommentList` — 1-depth 답글, sort, anonymize 옵션
- Admin 보이기: 익명 글이면 일반 영역엔 "익명" 그대로 표시. admin role 사용자에게만 본문 헤더 옆에 회색 작은 "(작성자: {nickname})" 자동 표기 (별도 토글 없음)

### 7.5 Admin 모더 큐 `/admin/suggestions`

- 탭: 전체 / 접수 / 검토중 / 채택 / 반려 / 신고됨(3+) / blind된
- 행: 제목, 작성자(admin은 익명 글도 실제 닉네임 표시), 카운터, 시간, 상태 뱃지
- 드로어: 본문 + 댓글 미리보기 + 액션 버튼(검토중/채택/반려/visibility) + resolution_note 입력
- 패턴: `/admin/reports`, `/admin/corrections` 구조 카피

### 7.6 NavBar / Dashboard

- NavBar 항목명: "공지·건의" (한 줄). 모바일은 동일 라벨. 8번째 항목 추가 시 데스크탑 overflow 검토.
- Admin 사이드바: `/admin/suggestions` 항목 추가
- Dashboard `AnnouncementBanner`는 D-day 위젯 **아래**에 배치 (D-day가 가장 시선 우선)

## 8. Acceptance

### 8.1 기능

1. approved 사용자가 건의글 작성 → 목록에 노출, 본인은 익명 선택 가능
2. approved 사용자가 글에 공감/신고/댓글 가능 (자기 글 공감·신고 차단)
3. 작성자가 자기 글 수정/삭제 → 접수·검토중에서만 가능, 채택·반려에선 비활성 + tooltip
4. admin이 상태 변경 → 작성자에게 알림 + 상태 뱃지 변경 + `accepted`면 adopter 뱃지 1회 부여
5. 게시글 신고 3건 → 자동 blind + 작성자에 알림
6. admin이 공지 작성 → `kind='announcement'` 인서트 시점에 trigger로 모든 approved 사용자에 알림 row 일괄 INSERT
7. dashboard 상단에 최신/핀 공지 표시 + `×`로 24h dismiss + 새 공지 발행 시 재노출
8. admin이 공지 핀 토글 → 단일 핀만 유지 (기존 핀 자동 unpin)
9. 익명 글도 admin view에선 작성자 식별 가능
10. 1-depth 답글 외에는 부모 자식 댓글 차단 (trigger)

### 8.2 기술

- `npx tsc --noEmit` 통과
- 마이그 1개 SQL Editor 적용 성공 (FK type=text 일치 확인 — `board_posts.id`는 uuid, `comments.question_id`처럼 text FK 아님)
- 모든 RPC SECURITY DEFINER + `set search_path = public` + admin 게이트
- 모든 트리거 (RLS 테이블 INSERT/UPDATE) SECURITY DEFINER + search_path
- `comments` 테이블·정책 무손상 (회귀 0)
- prod 페이지 로드 5초 내: `/board`, `/board/suggestions`, `/board/announcements`
- 모바일 360px 기준 레이아웃 깨짐 0

### 8.3 정책 가드

- 게시판은 공식 문제·해설 본문을 인용·복제하지 않음 (사용자 자유 작성, ToS·커뮤니티 가이드라인 동일 적용)
- 회차/연도 노출은 사용자 자유 (광고·홍보 신고 대상엔 포함)
- `signup_status != 'approved'` 사용자는 게시판 접근 불가 (proxy.ts 기존 게이트 그대로 통용 — 라우트 prefix `/board` 추가)

## 9. 마이그레이션 / 적용 순서

1. **enum 확장** (`board_post_kind`, `suggestion_status`, `board_visibility` 신규 + `notification_type` / `badge_type` / `audit_action` 확장)
2. **`board_posts`** 테이블 + CHECK + 인덱스 + RLS
3. **`board_post_comments`** 테이블 + CHECK + 인덱스 + RLS
4. **`board_post_upvotes`**, **`board_post_reports`**, **`board_post_comment_reports`** + RLS
5. **`notifications.payload_keys_present` CHECK 재작성** (4개 case 추가)
6. **트리거 7종 + 함수**
7. **RPC 7종**
8. **Storage path prefix 추가** (기존 버킷 정책 재사용, 별도 마이그 불필요)

마이그 파일: `vet-exam-ai/supabase/migrations/20260512000000_suggestion_board_mvp.sql` (단일 파일). SQL Editor 한 번에 적용.

### 9.1 회피해야 할 함정 (메모리 기준)

- **FK 타입 정합성** (`fk_type_must_match_referenced_pk`) — `board_posts.id` uuid이므로 댓글 FK도 uuid OK. 단 `user_id`는 `profiles(id)` uuid 그대로.
- **SECURITY DEFINER 트리거** (`security_definer_trigger`) — RLS 테이블에 INSERT/UPDATE하는 트리거(handle_board_post_comment_update 등) 전부 `SECURITY DEFINER + set search_path = public` 명시.
- **CHECK 제약 일관성** (`check_constraint_audit`) — `title`/`body_text` length CHECK는 INSERT 정책에 반영된 한도와 일치.
- **module load env throw** — Storage path 유틸은 lazy init (env 직접 throw 금지).
- **RSC inline fn** (`rsc_inline_fn_trap`) — Server Component에서 Client Component에 인라인 함수 prop 금지.
- **React Compiler useCallback** — IIFE + boolean sentinel deps 패턴 또는 unstable deps 제거.

## 10. 후속 / Backlog

- 공부정보공유 보드 (ROADMAP T2 그대로, M5)
- 광고/홍보 자동 필터 (v1.1)
- 게시판 본문 검색 (별건)
- 메일/푸시 알림
- 댓글 vote
- 핀 다중 슬롯
- 1만+ 유저 broadcast 워커
- 모바일 햄버거 NavBar 리디자인

---

**다음 단계**: 이 spec을 사용자가 검토하고 승인하면 `superpowers:writing-plans` 스킬로 구현 계획서 작성.
