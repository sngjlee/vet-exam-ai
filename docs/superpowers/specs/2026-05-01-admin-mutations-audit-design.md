# /admin 콘솔 — 문제 수정 + 감사 로그 (PR-B) — Design Spec

- **Date**: 2026-05-01
- **Scope**: M3 §18 admin 콘솔 2차 PR. questions 콘텐츠/메타/활성 편집 + audit 인프라 + read-only audit 뷰어.
- **Out of scope (PR-C 이후)**:
  - `/admin/questions/new` 생성 폼 (파이프라인 service_role로 들어옴)
  - 신고 큐 (`/admin/reports`) — comment_reports 기반
  - 정정 큐 (`/admin/corrections`) — question_corrections 기반
  - `/admin/users` 회원/역할/활성 관리
  - `round`/`session`/`year` 편집 (저작권 + attempts.category 등 스냅샷 drift)
  - 인라인 form 에러 (`useFormState`) — 본 PR은 redirect 에러 코드 + 상단 alert
- **Prereqs**: PR #32 (PR-A read-only 콘솔), `is_admin()` / `is_reviewer_or_admin()` 헬퍼, `admin_audit_logs` 테이블, `audit_action` enum, `requireAdmin()` 헬퍼.

## Context

PR-A에서 read-only 콘솔(대시보드 + 문제 목록 + 상세) 머지됨. PR-B는 그 위에 첫 mutation 레이어를 깐다.

**기존 자산 (재사용)**
- `admin_audit_logs` 테이블 + admin read-only RLS
- `audit_action` enum: `comment_remove`, `comment_unblind`, `user_suspend`, `user_unsuspend`, `badge_grant`, `badge_revoke`, `correction_accept`, `correction_reject`, `report_uphold`, `report_dismiss`, `role_change`
- `is_admin()` 헬퍼
- `app/admin/_components/*` (PR-A) — 사이드바/모바일 drawer/필터 패턴

**확장 필요**
- `audit_action` enum에 `question_update` 추가
- `questions` UPDATE RLS 정책 (admin-only)
- `log_admin_action` RPC (security definer + admin 게이트)
- `admin_audit_logs` insert 경로는 RPC 단일화 (직접 insert RLS는 추가하지 않음)

## Decisions (브레인스토밍 합의)

| # | 결정 | 이유 |
|---|---|---|
| Q1 | scope = mutations + audit 인프라 + audit 뷰어 (옵션 A) | audit helper는 향후 모든 admin PR에서 재사용. mutations이 일일 운영 가치 1순위 |
| Q2 | `/admin/questions/new` 생성은 PR-C로 미룸 (옵션 C) | 신규 문제는 파이프라인이 공급. 콘솔 직접 생성 빈도 낮음 |
| Q3 | edit 가능 필드: 콘텐츠 + 메타 + is_active (옵션 A) | 일상 정정 + 의심 문제 즉시 비공개. 회차/연도는 잠금 |
| Q4 | RLS write = 단일 admin-only UPDATE (옵션 A) | 컬럼 잠금은 앱 레이어 책임. 파이프라인은 service_role이라 영향 없음 |
| Q5 | audit insert = `security definer` RPC + 게이트 (옵션 A) | PR-A의 RPC 패턴과 일관. 형식 강제 + admin 검증 한 번에 |
| Q6 | enum 확장 = `question_update` 단 한 개 (옵션 B) | YAGNI. 활성 토글 분리는 jsonb diff로 판별 가능 |
| Q7 | audit 뷰어 = `/admin/audit` 활성화 (옵션 A) | 본인 액션 즉시 검증 + 운영 가시화 |
| Q8 | edit form = Server Action + JS 0 (옵션 A) | PR-A server-first 톤 유지. 가장 적은 코드 |
| Q9 | 검증 = 최소 검증 + redirect 에러 (옵션 A) | Phase 0 자동 검증 룰 일관. 한글 매핑은 한 곳 |
| Q10 | audit 페이로드 = diff만 (옵션 A) | 뷰어 가독성 + 페이로드 절약 |

## Architecture

### 디렉터리

```
vet-exam-ai/
  app/
    admin/
      page.tsx                                ← 수정: "감사 로그" 카드 disabled → 활성
      _components/admin-nav-items.ts          ← 수정: "감사" 사이드바 nav disabled 해제
      questions/
        [id]/
          page.tsx                            ← 수정: 헤더에 "수정" 링크 추가
          edit/
            page.tsx                          ← 신규 server form
            _actions.ts                       ← 신규 server action (updateQuestion)
      audit/
        page.tsx                              ← 신규 read-only 리스트 (server)
        _components/
          audit-filters.tsx                   ← 신규 (client, URL 동기화)
          audit-table.tsx                     ← 신규 (server)
          audit-pager.tsx                     ← 신규 (server, PR-A pager 패턴 사본)
        _lib/parse-audit-search-params.ts     ← 신규
  lib/
    admin/
      audit.ts                                ← 신규 logAdminAction + diffJson
    supabase/types.ts                         ← 수정: Functions.log_admin_action + Enums.audit_action
  supabase/migrations/
    20260501000000_admin_pr_b.sql             ← 신규
```

신규 8 + 수정 4 + 마이그 1.

### 진입 흐름 (edit)

1. 사용자가 `/admin/questions/{id}` 상세에서 "수정" 클릭
2. `/admin/questions/{id}/edit` 진입 → `requireAdmin()` 게이트 (layout)
3. server component가 `decodeMaybe(id)` + `or('id.eq...,public_id.eq...')` 로드
4. notFound 시 next/navigation `notFound()`
5. `<form action={updateQuestion}>` 렌더 (JS 0)
6. submit 시 server action `updateQuestion(formData)`:
   - `requireAdmin()` 재검증 (가드 우회 방지)
   - before snapshot select
   - parse + 검증 → 실패 시 `?error=<code>` redirect (edit page 그대로)
   - `update(...)` → 실패 시 `?error=db_error`
   - `diffJson(before, after)` → 변경 있으면 `logAdminAction(...)`
   - `revalidatePath` + `redirect('/admin/questions/{id}')`

### 진입 흐름 (audit)

1. `/admin/audit` 진입 → `requireAdmin()`
2. searchParams 파싱: `page` `action` `target_type` `admin`
3. 쿼리:
   - `admin_audit_logs` select 50건 + `count: 'exact'`
   - admin_id 집합 → `user_profiles_public` 별도 쿼리로 nickname map
   - target_type='question' 행만 questions 추가 lookup해 KVLE map
4. `<AuditFilters>` + `<AuditTable rows>` + `<AuditPager>` 렌더

### 저작권 가드 분리

- edit form의 round/session/year는 **read-only meta strip**로만 노출 (input 없음, 편집 불가)
- audit 뷰어는 admin 가드 안 → round/session/year 자유 노출 OK
- 공개 페이지 링크는 항상 `/questions/{public_id ?? id}` (PR-A 규칙 유지)

## Components

### `app/admin/questions/[id]/edit/page.tsx` (server)

- 단일 책임: 데이터 로드 + form 렌더
- 필드 18개:
  - **편집 가능 (12)**:
    - `question` textarea
    - `choices_1..5` input × 5
    - `answer` select (choices 중 하나 — radio 또는 select)
    - `explanation` textarea
    - `category` select (PR-A `getFilterOptions().categories` 재사용)
    - `subject` select (filter options)
    - `topic` input
    - `difficulty` select: `easy` / `medium` / `hard` / null
    - `tags` comma-separated input
    - `community_notes` textarea
    - `is_active` checkbox
  - **잠금 표시 (read-only meta strip, 6)**:
    - `id` / `public_id` / `round` / `session` / `year` / `created_at`
- `searchParams.error` 있으면 상단 alert (한글 매핑)
- 하단: "취소" Link (상세로) + "저장" submit

### `app/admin/questions/[id]/edit/_actions.ts` (server action)

```ts
"use server";
export async function updateQuestion(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("questions").select("*").eq("id", id).maybeSingle();
  if (!before) redirect(`/admin/questions/${encodeURIComponent(id)}?error=not_found`);

  const choices = [1,2,3,4,5].map((i) =>
    String(formData.get(`choice_${i}`) ?? "").trim());
  const answer  = String(formData.get("answer") ?? "").trim();
  const question = String(formData.get("question") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  const errs: string[] = [];
  if (choices.some((c) => !c)) errs.push("choices_empty");
  if (!choices.includes(answer)) errs.push("answer_mismatch");
  if (!question) errs.push("question_empty");
  if (!category) errs.push("category_empty");
  if (errs.length) {
    redirect(`/admin/questions/${encodeURIComponent(id)}/edit?error=${errs[0]}`);
  }

  const update = {
    question, choices, answer, category,
    subject: String(formData.get("subject") ?? "") || null,
    topic:   String(formData.get("topic") ?? "") || null,
    difficulty: String(formData.get("difficulty") ?? "") || null,
    explanation: String(formData.get("explanation") ?? ""),
    community_notes: String(formData.get("community_notes") ?? "") || null,
    tags: String(formData.get("tags") ?? "")
      .split(",").map((t) => t.trim()).filter(Boolean),
    is_active: formData.get("is_active") === "on",
  };

  const { error } = await supabase.from("questions").update(update).eq("id", id);
  if (error) {
    redirect(`/admin/questions/${encodeURIComponent(id)}/edit?error=db_error`);
  }

  const { before: b, after: a } = diffJson(before as Record<string, unknown>, { ...before, ...update });
  if (Object.keys(a).length > 0) {
    await logAdminAction({
      action: "question_update",
      targetType: "question",
      targetId: id,
      before: b, after: a,
    });
  }

  revalidatePath(`/admin/questions/${encodeURIComponent(id)}`);
  redirect(`/admin/questions/${encodeURIComponent(id)}`);
}
```

### `lib/admin/audit.ts` (server-only)

```ts
import { createClient } from "../supabase/server";
import type { Database } from "../supabase/types";

type AuditAction = Database["public"]["Enums"]["audit_action"];

export async function logAdminAction(args: {
  action: AuditAction;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  note?: string | null;
}): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_admin_action", {
    p_action:      args.action,
    p_target_type: args.targetType,
    p_target_id:   args.targetId,
    p_before:      args.before ?? null,
    p_after:       args.after ?? null,
    p_note:        args.note ?? null,
  });
  if (error) {
    console.error("[audit] log_admin_action failed", error);
    return null;
  }
  return data as string;
}

export function diffJson<T extends Record<string, unknown>>(
  before: T, after: T,
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {}, a: Partial<T> = {};
  for (const k of Object.keys(after) as (keyof T)[]) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k];
      a[k] = after[k];
    }
  }
  return { before: b, after: a };
}
```

- `null` 반환 정책: audit 실패해도 main mutation은 성공 (감사 누락은 콘솔 로그). 본 PR은 silent fail.

### `app/admin/audit/page.tsx` (server)

- `requireAdmin()`
- searchParams: `page` `action` `target_type` `admin` (운영자 닉네임 fuzzy)
- 단일 쿼리: `.from('admin_audit_logs').select('*', { count: 'exact' })` + 동적 필터 + `range(offset, offset+49)` + `order('created_at', desc)`
- admin_id 모음 → `user_profiles_public` 별도 쿼리 (PR #14 embedded join 함정 회피)
- target_type='question' 행만 questions 추가 lookup해 `(id, public_id)` map
- 자식: `<AuditFilters initial options>` (client) + `<AuditTable rows adminMap questionMap>` (server) + `<AuditPager>`

### `<AuditFilters>` (client)

- PR-A `<AdminQuestionsFilters>` 패턴 그대로
- `useRouter() / usePathname() / useSearchParams()`
- action: enum 12개 한글 라벨 매핑 select
- target_type: select (`question` / `comment` / `user` / `correction` / `report` / `badge`)
- 운영자 닉네임: 300ms debounce input
- "필터 초기화" 버튼

### `<AuditTable>` (server)

- 컬럼: 시각 / 운영자 (닉네임 + profile 링크) / action 한글 / target (question은 KVLE 링크) / 변경 요약 (diff 첫 줄)
- diff 요약: `Object.keys(after).slice(0,2).map(k => "${k}: ${before[k]} → ${after[k]}").join(", ")` + "…+N"
- 빈 결과: "감사 로그가 없습니다"

### `<AuditPager>` (server)

- PR-A `<AdminQuestionsPager>` 사본 — 라우트 베이스(`/admin/audit`)와 `ParsedAuditSearchParams` 타입만 교체
- 다른 필터 보존, `?page=`만 갱신
- 재사용 불가 이유: PR-A pager는 `/admin/questions` 경로 + `ParsedSearchParams` 타입을 하드코딩

### `app/admin/page.tsx` 수정

- "감사 로그" hub 카드 `disabled` 제거 + `<Link href="/admin/audit">` 활성화

### `app/admin/questions/[id]/page.tsx` 수정

- 헤더 우측 "공개 페이지로 이동" 옆에 `<Link href="/admin/questions/{id}/edit">수정</Link>` 추가

## Migration

### `20260501000000_admin_pr_b.sql`

```sql
-- 0. enum 확장 (트랜잭션 자동 commit)
alter type public.audit_action add value if not exists 'question_update';

-- 1. questions UPDATE policy (admin-only)
create policy "questions: admin update"
  on public.questions for update
  using (public.is_admin())
  with check (public.is_admin());

-- 2. log_admin_action RPC
create or replace function public.log_admin_action(
  p_action      public.audit_action,
  p_target_type text,
  p_target_id   text,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_note        text  default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_id       uuid;
begin
  v_admin_id := auth.uid();

  if v_admin_id is null
     or not exists (
       select 1 from public.profiles
       where id = v_admin_id and role = 'admin' and is_active
     ) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, before_state, after_state, note)
  values
    (v_admin_id, p_action, p_target_type, p_target_id, p_before, p_after, p_note)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.log_admin_action(
  public.audit_action, text, text, jsonb, jsonb, text
) from public, anon;
grant execute on function public.log_admin_action(
  public.audit_action, text, text, jsonb, jsonb, text
) to authenticated;
```

### 적용 순서 (메모리 함정 회피)

1. 마이그 commit (재현성)
2. 머지 직전 Supabase Studio SQL Editor 직접 실행 (CLI `db push "up to date"` 함정 회피)
3. sanity check:
   ```sql
   select public.log_admin_action(
     'comment_remove', 'test', 'sanity-1', null, null, 'sanity'
   );
   delete from admin_audit_logs where note = 'sanity';
   ```
   - admin 본인 계정으로 통과 확인
4. types.ts 갱신: `Functions.log_admin_action` + `Enums.audit_action` (`question_update` 포함)
5. PR 머지

## Error handling / edge cases

### 권한

- 비-admin이 `/admin/questions/{id}/edit` 진입 → layout `requireAdmin()`이 `/dashboard` redirect
- 비-admin이 server action 직접 호출 → `requireAdmin()` 재검증 + RPC `42501` 거부
- 비-admin이 RPC 직접 호출 → `42501`

### 검증 실패 (Q9-A 룰)

| 코드 | 한글 메시지 |
|---|---|
| `not_found` | 문제를 찾을 수 없습니다 |
| `choices_empty` | 선지가 비어 있습니다 |
| `answer_mismatch` | 정답이 선지 중 하나와 정확히 일치해야 합니다 |
| `question_empty` | 문제 본문이 비어 있습니다 |
| `category_empty` | 카테고리는 필수입니다 |
| `db_error` | 저장 중 오류가 발생했습니다. 다시 시도하세요 |

### Audit 실패

- RPC 호출 실패 → 콘솔 로그 + `null` 반환 → main update는 성공
- 향후 필요 시 Sentry / 알림 hook 추가

### Diff 빈 변경

- form submit했지만 변경 0 → audit 호출 skip → 그냥 redirect

### 저작권 가드

- edit form의 round/session/year input 0 (잠금 strip만)
- audit 뷰어는 admin 가드 안 → round 노출 OK
- 공개 링크는 모두 `(public_id ?? id)`

### `/admin/audit` 엣지

- `page` 음수/문자/0/totalPages 초과: 클램프
- `action` enum 비어있음/잘못: silent drop
- `target_type` 잘못: silent drop
- 운영자 검색 sanitize: 영숫자/한글/공백/하이픈, 50자 cap
- admin_id null (탈퇴) → "탈퇴한 운영자" 표시
- target lookup 실패 (question 삭제 등) → raw target_id 표시

## Verification (수동 검증 시나리오)

PR-B 자동 테스트 0. 머지 전 다음 시나리오 통과 확인:

- [ ] 비-admin이 `/admin/questions/{id}/edit` 진입 → `/dashboard` redirect
- [ ] 비-admin이 RPC 직접 호출 → `42501` 거부
- [ ] choices 5개 미입력 → `?error=choices_empty`
- [ ] answer가 choices에 없음 → `?error=answer_mismatch`
- [ ] question 비어있음 → `?error=question_empty`
- [ ] 정상 update → 상세 페이지로 redirect + 변경 반영 + audit 1행 추가
- [ ] is_active 토글 → audit `before:{is_active:true}, after:{is_active:false}` 기록
- [ ] 변경 0인 채로 submit → audit 미기록
- [ ] `/admin/audit` 진입 → 방금 한 수정이 행으로 보임
- [ ] audit 행의 KVLE 링크 → 해당 문제 admin 상세 정상 진입
- [ ] audit 필터 (action / target_type / 운영자) URL 동기화
- [ ] 운영자 닉네임 검색 → 300ms 후 URL 갱신
- [ ] 페이지 1→2→1 동작 + 다른 필터 보존
- [ ] edit form에 round/session/year input 없음 (잠금 strip만)
- [ ] 헤더 "수정" 링크 → edit 페이지 진입
- [ ] 대시보드 "감사 로그" 카드 활성 → `/admin/audit` 진입
- [ ] dashboard 카드 모바일 햄버거 drawer에서도 sidebar nav "감사" 활성

## File budget

추정 ~14 task (writing-plans에서 세분화). PR-A(16 commit)와 비슷한 사이즈.

신규 8 / 수정 4 (`app/admin/page.tsx`, `app/admin/questions/[id]/page.tsx`, `app/admin/_components/admin-nav-items.ts`, `lib/supabase/types.ts`) / 마이그 1.

## Out of scope (PR-C 이후 예고)

- `app/admin/questions/new` 생성 폼
- `/admin/reports` 신고 큐 (comment_reports 기반)
- `/admin/corrections` 정정 큐 (question_corrections 기반)
- `/admin/users` 회원/역할/활성 관리 + audit 통합
- `useFormState` 인라인 에러
- audit 행 expand (full diff 보기)
- audit CSV 내보내기
- 이메일 알림 연동
