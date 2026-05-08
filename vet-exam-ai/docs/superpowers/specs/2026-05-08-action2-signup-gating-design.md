# Action 2 — 가입 차단 강화 (Signup Gating) 설계

작성일: 2026-05-08
세션 컨텍스트: 5/8 PR #45 + #46 머지 후 합의된 P0. 시딩 §20 진입 차단 요인.

## 배경 / 목적

현재 가입 흐름은 email + password → Supabase 메일 인증 → 즉시 활성. `handle_new_user` 트리거가 `is_active=true`로 설정해 모든 권한이 곧바로 부여된다.

문제 두 가지를 동시에 해소해야 한다:

1. **저작권 / 신원**: KVLE 기출 문제·해설이 외부에 새지 않도록 "실제 수험생"으로 자격을 제한
2. **시딩 안전망**: 댓글 시딩 §20을 시작하기 전에 봇/일회성 메일 가입을 차단

수동 승인 큐로 두 목적 동시 충족. 증빙(학생증 이미지 또는 자기신고 텍스트)을 admin이 검수.

## 비목표 (out of scope)

- 자동 학생증 OCR 검증
- SMS 인증 (Twilio 비용)
- 이메일 도메인 화이트리스트 (.ac.kr 강제)
- 외부 메일 발송 인프라(Resend/SES) 도입 — Phase 2로 deferred
- 가입 후 추가 권한 등급(reviewer/proctor 자동 분류)
- IP 기반 차단 (PR-D PR-2 backlog)

## 결정 요약

| # | 항목 | 결정 |
|---|---|---|
| 1 | 게이트 목적 | 저작권 + 안전망 (둘 다) |
| 2 | 증빙 형태 | 이미지 OR 텍스트 (둘 중 하나) |
| 3 | pending 권한 | 읽기만 허용 (쓰기·투표·신고·프로필 편집 차단) |
| 4 | 기존 유저 | 자동 grandfather (`is_active=true`인 모든 행) |
| 5 | 가입 흐름 | 2-step (메일 인증 → 증빙 제출) |
| 6 | 알림 | 인앱 알림 (메일 알림은 Phase 2 deferred) |
| 7 | 재신청 | 가능, 사유 노출 + UPSERT 재제출, 무제한 |
| 8 | 필드 | 필수: 대학·목표 회차 / 선택(admin-only): 실명·학번·메모 |
| 9 | 이미지 TTL | 승인=즉시 삭제, 거부=30일 보관 후 cron 삭제 |

## 데이터 모델

### enum

```sql
create type public.signup_status as enum
  ('pending_proof', 'pending_review', 'approved', 'rejected');

create type public.signup_proof_kind as enum ('image', 'text');
```

### profiles 컬럼 추가

```sql
alter table public.profiles
  add column signup_status public.signup_status not null default 'pending_proof';
```

마이그 내 backfill: 기존 `profiles` 모든 row → `signup_status='approved'` (is_active와 무관하게 grandfather).
`is_active=false`로 정지된 기존 유저는 reactivate 시 곧바로 쓰기 가능 — 별도의 재증빙 게이트 부과하지 않음.

### `signup_applications` 신규 테이블 (1 row per user, mutable)

```sql
create table public.signup_applications (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  status             public.signup_status not null default 'pending_review',
  university         text not null check (char_length(university) between 1 and 100),
  target_round       smallint not null check (target_round between 1 and 200),
  real_name          text check (char_length(real_name) <= 50),         -- admin-only
  student_number     text check (char_length(student_number) <= 30),    -- admin-only
  free_note          text check (char_length(free_note) <= 1000),       -- admin-only
  proof_kind         public.signup_proof_kind not null,
  proof_storage_path text,
  proof_text         text check (char_length(proof_text) <= 2000),
  submitted_at       timestamptz not null default now(),
  reviewed_at        timestamptz,
  reviewed_by        uuid references public.profiles(id) on delete set null,
  decision_reason    text check (char_length(decision_reason) <= 500),
  rejection_count    int  not null default 0,
  last_rejection_at  timestamptz,

  constraint proof_kind_payload_consistent check (
    (proof_kind = 'image' and proof_storage_path is not null and proof_text is null)
    or
    (proof_kind = 'text'  and proof_text is not null and proof_storage_path is null)
  )
);

create index on public.signup_applications (status, submitted_at desc);
create index on public.signup_applications (status, last_rejection_at desc);
```

### 본인용 view

`signup_applications` 컬럼 단위 RLS 어렵기 때문에, 본인이 볼 수 있는 필드만 노출하는 view 분리.

```sql
create view public.my_signup_application as
select
  user_id,
  status,
  rejection_count,
  decision_reason,
  submitted_at,
  reviewed_at,
  last_rejection_at,
  proof_kind  -- 'image' / 'text' 알 수 있게만
from public.signup_applications
where user_id = auth.uid();
```

(view는 invoker 권한으로 동작하므로 RLS는 base 테이블 정책 사용; base 테이블에 본인 SELECT 정책을 두되 admin-only 컬럼은 선택하지 않는 view로 누설 차단.)

### 상태 머신

```
auth.users insert
   ↓ handle_new_user trigger (수정)
profiles.signup_status = 'pending_proof'

submit_signup_application RPC (본인)
   ↓ UPSERT signup_applications, profiles.signup_status='pending_review'
pending_review

approve_signup_application RPC (admin)
   ↓ profiles.signup_status='approved'
   ↓ Storage 객체 즉시 삭제 (proof_kind='image'인 경우)
   ↓ notifications insert (signup_approved)
   ↓ admin_audit_log
approved   (terminal)

reject_signup_application RPC (admin, reason 필수)
   ↓ profiles.signup_status='rejected'
   ↓ signup_applications.rejection_count++, decision_reason, last_rejection_at
   ↓ Storage 객체 유지 (30일 후 cron 삭제)
   ↓ notifications insert (signup_rejected)
rejected
   ↓ submit_signup_application RPC 재호출 시
pending_review (UPSERT, rejection_count 유지)
```

### Storage 버킷

신규 private bucket `signup-proofs`.

- 객체 키: `{user_id}/{uuid}.{ext}` (영문/숫자/하이픈만 — 한글 트랩 회피)
- 클라이언트 업로드 RLS: 본인 prefix(`{auth.uid()}/`)에만 INSERT 허용, SELECT 차단
- admin 조회: service-role로 signed URL 발급 (`createSignedUrl`)
- 30일 cron: `pg_cron` 일별 작업 — `rejected` 상태에서 `last_rejection_at < now() - interval '30 days'`인 row의 storage 객체 삭제 + path NULL화

### 알림 enum 확장

```sql
alter type public.notification_type add value if not exists 'signup_approved';
alter type public.notification_type add value if not exists 'signup_rejected';
```

기존 NavBar 벨 + 60초 폴링 자동으로 잡음.

## RLS 변경

### 신규 정책 (signup_applications)

- world INSERT/UPDATE/DELETE 차단 (RPC만 통과)
- 본인 SELECT only: `using (user_id = auth.uid())`
- admin SELECT: SECURITY DEFINER RPC `list_signup_applications`, `get_signup_application` 통과

### 기존 정책 수정 (signup_status='approved' 게이트 추가)

- `comments`: insert 정책 — `auth.uid() = author_id and signup_status_of(auth.uid()) = 'approved'`
- `comment_votes`: insert 정책
- `comment_reports`: insert 정책
- `comment_pins`: insert 정책
- `user_profiles_public`: 본인 update 정책

읽기 정책은 **건드리지 않음** (questions/comments/votes 카운트는 anon 포함 누구나 읽기 유지).

`signup_status_of(uid)` SECURITY DEFINER 헬퍼 함수 신설:

```sql
create or replace function public.signup_status_of(p_uid uuid)
returns public.signup_status
language sql stable security definer
set search_path = public
as $$
  select signup_status from public.profiles where id = p_uid;
$$;
```

## RPC 명세

### `submit_signup_application`

```
input: p_university text, p_target_round smallint,
       p_real_name text default null,
       p_student_number text default null,
       p_free_note text default null,
       p_proof_kind signup_proof_kind,
       p_proof_storage_path text default null,
       p_proof_text text default null

guards:
  - auth.uid() not null
  - profiles.signup_status in ('pending_proof', 'rejected')   else noop
  - kind/payload 일관성 (CHECK가 잡지만 사전 명시)
  - p_proof_storage_path가 'p_uid/...' 형식 검증
  - p_university 길이 1~100, p_target_round 1~200

action:
  - UPSERT signup_applications (user_id key)
    - rejection_count는 기존 값 보존 (재제출)
    - status='pending_review', submitted_at=now()
    - decision_reason=NULL, reviewed_at=NULL, reviewed_by=NULL
  - update profiles set signup_status='pending_review'
```

### `approve_signup_application`

```
input: p_user_id uuid, p_note text default null

guards:
  - is_admin()
  - p_user_id <> auth.uid()  (본인 가드)
  - signup_applications.status='pending_review'   else noop

action:
  - update signup_applications set
      status='approved', reviewed_at=now(), reviewed_by=auth.uid(), decision_reason=p_note
  - update profiles set signup_status='approved'
  - storage delete (proof_storage_path) — service_role schema 함수 사용
  - signup_applications.proof_storage_path = NULL
  - insert into notifications (recipient_id=p_user_id, type='signup_approved', payload=...)
  - log_admin_action('signup_approve', 'user', p_user_id::text, ...)
```

### `reject_signup_application`

```
input: p_user_id uuid, p_reason text  (length 3..500, 필수)

guards:
  - is_admin()
  - p_user_id <> auth.uid()
  - p_reason 길이 검증
  - signup_applications.status='pending_review'   else noop

action:
  - update signup_applications set
      status='rejected', reviewed_at=now(), reviewed_by=auth.uid(),
      decision_reason=p_reason, rejection_count=rejection_count+1, last_rejection_at=now()
  - update profiles set signup_status='rejected'
  - insert into notifications (..., type='signup_rejected', payload includes reason)
  - log_admin_action('signup_reject', 'user', ...)
```

### `list_signup_applications`

```
input: p_status signup_status default 'pending_review',
       p_page int default 1,
       p_page_size int default 50

guards: is_admin()

return: 페이지네이션된 row 집합 (모든 컬럼 + auth.users.email join)
order:  status='rejected'면 last_rejection_at desc, 그 외 submitted_at desc
```

### `get_signup_application`

```
input: p_user_id uuid
guards: is_admin()
return: 단건 + email
```

## 라우트 / 컴포넌트

### 신규 유저 흐름

```
app/auth/login/page.tsx                          (수정 없음)
app/auth/callback/route.ts                       (수정 없음 — pending_proof 진입은 미들웨어가 처리)

app/auth/pending-proof/page.tsx                  (신규, 서버 셸)
  └─ _components/SignupApplicationForm.tsx       (신규, client; resubmit 모드 지원)
  └─ _actions.ts                                  (submitSignupApplication)

app/auth/pending-review/page.tsx                 (신규, 정적 안내 + submitted_at)
app/auth/rejected/page.tsx                       (신규, decision_reason + 재제출 CTA → SignupApplicationForm 재사용)
```

### 미들웨어 가드

`middleware.ts` (신규 또는 기존 확장):
- 세션 있고 status≠'approved'면 상태별 페이지로 redirect
- 통과 경로: `/`, `/auth/*`, `/api/auth/*`, 정적 파일, `/_next/*`
- 읽기 라우트(`/questions/*`, `/search`, `/community`)는 **별도 가드 없음** (pending도 읽기 가능 결정)
- 쓰기 라우트(`/profile/me/edit`, `/dashboard`, `/settings`)는 layout에서 status 체크 + redirect

### admin 큐

```
app/admin/signup-applications/page.tsx                            (신규 셸)
  ├─ _lib/parse-search-params.ts
  ├─ _components/queue-filters.tsx                                (status / 검색)
  ├─ _components/queue-table.tsx
  ├─ _components/queue-pager.tsx
  ├─ _components/application-detail-drawer.tsx                    (client, 이미지 lightbox)
  ├─ _components/approve-form.tsx                                 (server action)
  ├─ _components/reject-form.tsx                                  (reason 필수)
  └─ _actions.ts
```

`/admin` 사이드바에 "가입 신청" 항목 추가.

## 알림 통합

기존 `notifications` 테이블 + `payload jsonb`. payload schema:

```jsonc
// signup_approved
{ "kind": "signup_approved", "note": "선택 메모" | null }

// signup_rejected
{ "kind": "signup_rejected", "reason": "거부 사유 문자열", "rejection_count": 2 }
```

NavBar 드롭다운 + `/notifications` 페이지에서 메시지 분기 렌더링. 클릭 시:
- approved → `/dashboard`
- rejected → `/auth/rejected`

## 외부 메일 (Phase 2 deferred)

Q6에서 인앱 + 메일 합의했지만 **외부 메일 인프라(Resend/SES) 미설치**. 1차 구현은 인앱 알림만. Phase 2 backlog로 분리:
- Resend account + API key 환경변수
- Supabase Edge Function 또는 Next API route에서 RPC 후속 호출
- 한글 메일 템플릿 (approve / reject 두 종)

## Storage 30일 cron

`pg_cron` 이미 설정됨 (이미지 큐 운영에서 검증). 신규 cron 작업:

```sql
select cron.schedule(
  'signup-proof-purge',
  '0 4 * * *',   -- 매일 04:00 UTC
  $$
    -- 30일 지난 거부 row의 객체 삭제 + path NULL
    delete from storage.objects where ...;
    update public.signup_applications set proof_storage_path = null where ...;
  $$
);
```

세부 SQL은 plan 단계에서 확정. cron은 service_role 권한.

## PR 분할 검토

이 설계는 1개 PR로 묶이면 ~12 task 규모. 다음 두 안 중 plan 단계에서 결정:

- **A. 단일 PR** (추천): 마이그 + admin 큐 + 사용자 흐름 + 미들웨어 게이트 한 번에. 상태 머신 원자성 보장. 시딩 §20 진입을 막지 않음.
- **B. 2-PR 분할**: PR-1 (마이그 + admin 큐 + RPC, 게이트는 OFF) → PR-2 (사용자 흐름 + 미들웨어 + RLS 정책 ON). admin이 미리 큐를 사용해보고 검증 가능. 다만 PR-2가 빠르게 따라붙어야 시딩 가능.

기본은 A. plan 단계에서 task 수가 너무 비대해지면 B로 전환.

## 마이그레이션 / 시퀀싱

마이그 1개 (`20260509000000_signup_gating.sql`):

1. enum 2개 (`signup_status`, `signup_proof_kind`)
2. `profiles.signup_status` 추가 + 기존 `is_active=true` 행 backfill `'approved'`
3. `signup_applications` 테이블 + 인덱스
4. `my_signup_application` view
5. RLS 정책 (signup_applications)
6. `signup_status_of()` 헬퍼
7. 기존 RLS 정책 수정 (comments / votes / reports / pins / profiles update)
8. `notification_type` enum 확장 (`signup_approved`, `signup_rejected`)
9. RPC 5종
10. `handle_new_user` 트리거: 변경 불필요. `profiles.signup_status` 컬럼 default `'pending_proof'`가 자동 처리
11. Storage 버킷 생성 + RLS (`signup-proofs`)
12. cron 작업 등록

`is_active`와 `signup_status`는 직교: `is_active=false`이면 정지(기존), `signup_status≠'approved'`이면 신규 게이트. 두 조건 모두 통과해야 쓰기.

## 에러 / 가드 패턴

- 모든 RPC `SECURITY DEFINER + set search_path=public` (5/4 트랩)
- admin 가드: `is_admin()` 체크 후 `42501` errcode
- 본인 가드: `auth.uid() <> p_user_id` 검증, 위반 시 `P0001`
- 상태 머신 위반(이미 approved를 또 approve 등): noop 반환 (idempotent)
- Storage 업로드 검증:
  - client: type/size 사전 체크
  - RPC: path 형식 + 본인 uid prefix 검증

## 테스트 전략 (수동)

vet-exam-ai는 unit test 인프라 없음. 정통 수동 검증:

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | 신규 가입 (email+pw) → 메일 인증 | `/auth/pending-proof` 도달, signup_status='pending_proof' |
| 2 | 텍스트 증빙 + 필수 필드만 제출 | `/auth/pending-review` 도달 |
| 3 | admin 큐(`/admin/signup-applications`)에서 row 확인 | submitted_at desc 정렬 |
| 4 | 이미지 증빙 + 모든 선택 필드 제출 | drawer에서 이미지 inline 표시 + admin-only 필드 모두 보임 |
| 5 | reject (사유 입력) | 인앱 알림 + `/auth/rejected`에서 사유 노출 |
| 6 | 재제출 | rejection_count 1 증가, status pending_review 복귀 |
| 7 | approve | 알림 + Storage 객체 삭제 (Storage 콘솔로 확인) + `/dashboard` 진입 가능 |
| 8 | 기존 grandfathered 계정 로그인 | status='approved'로 정상 동작, 댓글 작성 OK |
| 9 | pending_proof 상태로 댓글 POST 시도 | RLS 거부 (`42501`) |
| 10 | 본인 admin 계정으로 본인 approve 시도 | `P0001` 거부 |

추가:
- `npx tsc --noEmit` 통과
- 마이그 SQL Editor 적용 (CLI db push 함정 회피)
- 가드 검증: pending 유저로 `/profile/me/edit` 직접 URL 접근 시 redirect

## 운영자 수동 작업 (배포 전)

- [ ] Storage 버킷 `signup-proofs` 콘솔 생성 + private 확인 (마이그 안 자동 생성도 가능하나 확인)
- [ ] pg_cron 작업 활성 확인 (`select * from cron.job`)
- [ ] 본인 admin 계정 + 1개 일반 테스트 계정으로 end-to-end 시나리오 1회

## 후속 / 백로그

- 외부 메일(Resend) 통합 → Phase 2
- 학생증 OCR 자동 검증
- 이메일 도메인 화이트리스트 (대학 메일 자동 우선 승인)
- IP 제한 / SMS 인증
- "passer" 뱃지(이미 backlog)와 별개로 "verified_student" 뱃지 자동 부여 검토

## 영향받는 기존 메모리

- 5/8 session_2026_05_08_summary.md `다음 액션 후보 1` 처리됨
- 관련: account_profile_hardening_done.md (인접 영역)
