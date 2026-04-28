# /admin 콘솔 — 신고/정정 큐 (PR-C) — Design Spec

- **Date**: 2026-04-28
- **Scope**: M3 §18 admin 콘솔 3차 PR. `/admin/reports` 댓글 신고 큐 + `/admin/corrections` 문제 정정 큐. 두 큐 모두 server-first, JS 0 form, RPC 단일 트랜잭션.
- **Out of scope (PR-C 이후)**:
  - `/admin/users` 회원/역할/활성 관리
  - `/admin/questions/new` 생성 폼
  - `/admin/comments/{id}` 댓글 전용 상세 페이지 (큐 expand로 충분)
  - 운영자/신고자/타깃 fuzzy 검색 (P1 이후 audit 뷰어처럼 추가)
  - 정정 자동 적용(`accept` → `questions UPDATE`) — 본 PR은 수동 적용 모델(Q4-B)
  - 신고/정정 CSV 내보내기
  - 인라인 form 에러(`useFormState`) — redirect 에러 코드 + 한글 매핑 유지
  - `comment_remove`/`comment_unblind` 단독 액션(uphold/dismiss에 흡수)
- **Prereqs**: PR #32 (PR-A read-only 콘솔), PR #33 (PR-B mutations + audit), `is_admin()` / `requireAdmin()` 헬퍼, `admin_audit_logs` + `log_admin_action` RPC, `audit_action` enum (12종 이미 포함), `comment_reports` / `question_corrections` 테이블 + 자동 블라인드 트리거.

## Context

PR-A는 read-only 콘솔(대시보드/문제 목록/상세), PR-B는 첫 mutation 레이어(문제 편집 + audit). PR-C는 운영 의사결정 큐 두 개를 얹는다.

**소프트 런칭 차단 요인**: 정보통신망법은 신고 접수 후 24시간 내 임시조치(블라인드/제거) 결정과 그 사실의 신고자 통지를 요구한다. 자동 블라인드 트리거(3건+)는 깔려 있지만 운영자 결정 UI가 없어 통지 사이클이 끊어져 있는 상태.

**기존 자산 (재사용)**

- `comment_reports` 테이블 + INSERT RLS (사용자 신고 작성)
- `question_corrections` 테이블 + INSERT RLS (사용자 정정 제안 작성)
- `audit_action` enum 12종: `comment_remove`, `comment_unblind`, `report_uphold`, `report_dismiss`, `correction_accept`, `correction_reject` 모두 이미 존재
- `notification_type` enum: `report_resolved` 이미 존재
- 자동 블라인드 트리거: 3건 이상 시 `comments.status='blinded_by_report'` + `comment_blinded` 알림 + `defamation` reason → 30일 `blinded_until`
- `log_admin_action` RPC + `requireAdmin()` 가드 + audit 뷰어(PR-B) 패턴
- `app/admin/_components/*` (PR-A) — 사이드바/모바일 drawer/필터/페이저 패턴

**확장 필요**

- `notification_type` enum에 `correction_resolved` 추가
- `resolve_comment_report` RPC (security definer + admin 게이트 + status 일괄 갱신 + 댓글 status 분기 + 알림 + audit, 단일 트랜잭션)
- `resolve_question_correction` RPC (security definer + admin 게이트 + status 갱신 + 알림 + audit, 단일 트랜잭션)
- 신고/정정 RLS UPDATE policy 추가 0개 (RPC가 security definer로 우회)
- 사이드바/대시보드 nav/hub 활성화 + 정정 nav 신규
- audit 뷰어 한글 라벨 보강 + target_type 필터 옵션 추가

## Decisions (브레인스토밍 합의)

| # | 결정 | 이유 |
|---|---|---|
| Q1 | scope = 신고 + 정정 큐 동시 (옵션 B) | 메모리 합의 그대로. audit helper 한 번에 두 entity로 실증 |
| Q2 | 신고 큐 행 단위 = 댓글별 group by (옵션 B) | 운영자 멘탈 모델 = "이 댓글 어떻게 할까". 자동 블라인드 트리거 단위(3건)와 일치 |
| Q3 | 신고 액션 = uphold / dismiss 두 갈래 (옵션 A) | 24h 결정 모델 단순화. dismiss가 자동 블라인드 해제까지 자연스럽게 |
| Q4 | 정정 = 수동 적용 (옵션 B) | accept = 상태만 'accepted', 운영자가 PR-B `/admin/questions/{id}/edit`로 직접 수정 |
| Q5 | 필터 = status + reason(reports만), 정렬 created_at ASC (옵션 A) | 24h 데드라인 직관 + 폭증 패턴 발견 |
| Q6 | mutation = `resolve_*` RPC 단일 트랜잭션 (옵션 B) | 부분 실패 0 (법정 작업이라 정합성 우선). admin 게이트 DB 레벨 |
| Q7 | 알림 = `report_resolved` + `correction_resolved` 둘 다 (옵션 D) | enum 1줄 추가, 라우팅 명확. comment 작성자에게는 추가 알림 0(트리거가 처리) |
| Q8 | 큐 expand UX = `<details>` 인라인 (옵션 A) | server-first, JS 0, 모바일 자연 |
| Q9 | dismiss는 `blinded_by_report`만 visible로 (옵션 B) | 트리거 룰과 운영 결정 분리. votes 룰은 자율 |
| Q10 | 디테일 묶음 OK | (a~j 합의 — Section 4 참고) |

## Architecture

### 디렉터리

```
vet-exam-ai/
  app/
    admin/
      page.tsx                                   ← 수정: "신고/정정" hub 카드 활성화 + 분리
      _components/admin-nav-items.ts             ← 수정: "신고" 활성 + "정정" 신규
      reports/
        page.tsx                                 ← 신규 server (큐 + 그룹 fetch)
        _components/
          reports-filters.tsx                    ← 신규 client (status/reason)
          reports-table.tsx                      ← 신규 server (행 + <details> expand)
          reports-pager.tsx                      ← 신규 server (PR-B pager 사본)
          report-resolve-form.tsx                ← 신규 server (radio + textarea + submit)
        _actions.ts                              ← 신규 server action (resolveReport)
        _lib/parse-reports-search-params.ts      ← 신규
      corrections/
        page.tsx                                 ← 신규 server
        _components/
          corrections-filters.tsx                ← 신규 client (status)
          corrections-table.tsx                  ← 신규 server (행 + <details> + diff)
          corrections-pager.tsx                  ← 신규 server
          correction-resolve-form.tsx            ← 신규 server
        _actions.ts                              ← 신규 server action (resolveCorrection)
        _lib/parse-corrections-search-params.ts  ← 신규
      audit/
        _components/audit-filters.tsx            ← 수정: action 라벨 4개 추가 + target_type 옵션 추가
  components/
    notifications/notifications-dropdown.tsx     ← 수정: report_resolved / correction_resolved 라우팅 분기
  lib/
    admin/
      report-labels.ts                           ← 신규 (reason / status / resolution 한글 매핑)
      correction-labels.ts                       ← 신규 (status / resolution 한글 매핑)
    supabase/types.ts                            ← 수정: Functions 2개 + Enums.notification_type
  supabase/migrations/
    20260502000000_admin_pr_c.sql                ← 신규
```

신규 16 + 수정 5 + 마이그 1 = 22.

### 진입 흐름 — 신고 처리

1. 운영자 사이드바 "신고" → `/admin/reports` (layout `requireAdmin()`)
2. `parseReportsSearchParams`로 `page` (clamp 1+) / `status` (default `pending`, 5종 + `all`) / `reason` (8종 + `all`) 파싱
3. server fetch (4단계, embedded join 함정 회피):
   - **Step 1 (grouped)**: `comment_reports` 그룹 쿼리
     ```sql
     select comment_id,
            count(*)::int       as report_count,
            array_agg(reason)   as reasons,
            min(created_at)     as first_reported_at
       from comment_reports
      where status = $status      -- or status_in (...) for 'all'
        and reason = $reason       -- skip if 'all'
      group by comment_id
      order by min(created_at) asc
      limit 50 offset $offset
     ```
     `count: 'exact'` 별도 쿼리 (Supabase JS는 group + count 조합 미지원 → distinct comment_id 카운트 RPC 또는 두 번째 쿼리)
   - **Step 2 (comments)**: comment_id 목록 → `comments` `(id, body_html, body_text, status, user_id, created_at, blinded_until)` lookup. `status in ('removed_by_admin','hidden_by_author')` 자동 제외
   - **Step 3 (raw reports)**: 같은 comment_id 묶음의 raw `comment_reports` 행 fetch (`reporter_id, reason, description, created_at, status`) — expand list 표시용
   - **Step 4 (nicknames)**: reporter_id ∪ comments.user_id 합집합 → `user_profiles_public` `(user_id, nickname)` map
4. `<ReportsFilters current options>` + `<ReportsTable groups commentMap rawMap nicknameMap>` + `<ReportsPager current totalPages>` 렌더
5. 운영자 행 expand → uphold/dismiss radio + note textarea + submit
6. `resolveReport(formData)` server action:
   - `requireAdmin()` 재검증
   - `commentId` / `resolution` validation → 실패 시 `?error=<code>` redirect
   - `await supabase.rpc('resolve_comment_report', { p_comment_id, p_resolution, p_note })`
   - error 시 `?error=db_error`
   - `revalidatePath('/admin/reports')` + `redirect('/admin/reports')`

### 진입 흐름 — 정정 처리

1. `/admin/corrections` (layout 가드)
2. `parseCorrectionsSearchParams`: `page` / `status` (default `proposed`, 4종 + `all`)
3. server fetch:
   - `question_corrections` 50건 + `count: 'exact'` + status filter + `created_at ASC`
   - question_id 목록 → `questions` `(id, public_id, question, choices, answer, category, subject, topic, difficulty, explanation, tags, is_active)` map
   - proposed_by ∪ resolved_by 합집합 → `user_profiles_public` nickname map
4. server에서 각 행마다 diff 계산:
   ```ts
   const diff = Object.keys(proposed_change).map((k) => ({
     key: k,
     before: questions[id][k],
     after:  proposed_change[k],
   }));
   ```
   값은 `JSON.stringify` 후 80자 cap (긴 jsonb는 "..." 처리)
5. `<CorrectionsFilters>` + `<CorrectionsTable rows questionMap nicknameMap diff>` + `<CorrectionsPager>`
6. 운영자 행 expand → accept/reject + note + submit
7. `resolveCorrection(formData)` → `supabase.rpc('resolve_question_correction', { p_correction_id, p_resolution, p_note })` → `revalidatePath('/admin/corrections')` + `redirect('/admin/corrections')`
8. accept된 행은 expand 안에 form 대신 "수정하러 가기 → `/admin/questions/{id}/edit`" 링크 노출 (PR-B edit 페이지 그대로)

### 저작권 가드

- 두 큐 모두 admin 가드 안 → 댓글 작성자 / 문제 round 자유 노출 OK
- `comments.body_html`은 PR #31 sanitize-html 통과본 → `dangerouslyInnerHTML` 안전
- 공개 페이지 링크는 항상 `/questions/{public_id ?? id}` (PR-A 규칙)
- 알림 클릭 라우팅도 동일

## Components

### `app/admin/reports/page.tsx` (server)

- `requireAdmin()` (layout)
- `dynamic = 'force-dynamic'`
- 4단계 fetch (Architecture 흐름)
- 빈 그룹 결과 시 `{ groups: [], totalPages: 1, ... }` 반환
- `<ReportsFilters>` + `<ReportsTable>` + `<ReportsPager>` 자식

### `app/admin/reports/_lib/parse-reports-search-params.ts`

```ts
import type { Database } from "../../../../lib/supabase/types";

type ReportStatus = Database["public"]["Enums"]["report_status"];
type ReportReason = Database["public"]["Enums"]["report_reason"];

export type ParsedReportsSearchParams = {
  page:   number;
  status: ReportStatus | "all";
  reason: ReportReason | "all";
};

const VALID_STATUSES: ReadonlyArray<ReportStatus | "all"> =
  ["pending", "reviewing", "upheld", "dismissed", "all"];
const VALID_REASONS: ReadonlyArray<ReportReason | "all"> =
  ["spam", "misinformation", "privacy", "hate_speech", "advertising",
   "copyright", "defamation", "other", "all"];

export function parseReportsSearchParams(
  raw: { [k: string]: string | string[] | undefined },
): ParsedReportsSearchParams {
  const pickOne = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? "";
  const status = pickOne(raw.status) as ReportStatus | "all";
  const reason = pickOne(raw.reason) as ReportReason | "all";
  const pageRaw = parseInt(pickOne(raw.page), 10);
  return {
    page:   Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    status: VALID_STATUSES.includes(status) ? status : "pending",
    reason: VALID_REASONS.includes(reason)  ? reason : "all",
  };
}
```

### `<ReportsFilters>` (client)

- PR-B `<AuditFilters>` 사본 (다른 라우트만 교체)
- status select 5개: 대기 / 검토 중 / 인정됨 / 기각됨 / 전체 (default = pending)
- reason select 9개: 8 enum 한글 + 전체 (default = all)
- "필터 초기화" → `/admin/reports`

### `<ReportsTable>` (server)

- 컬럼:
  - 댓글 미리보기 (`body_text` 40자 + `…`)
  - 작성자 (닉네임 + `/profile/{nickname}` 링크)
  - 신고 N건 (예: "3건 · 스팸, 명예훼손, 기타" — chip 또는 inline)
  - 가장 오래된 신고 시각 (상대시각)
  - 댓글 status badge (자동 블라인드면 강조)
  - ▸ expand
- expand `<details>`:
  - 댓글 전체 본문 (`comments.body_html`, max-h 200px scroll, sanitize-html 통과본)
  - 신고 list (raw_map[comment_id]):
    - 각 행: `[reporter_nickname, reason 한글 chip, description, created_at]`
  - `<ReportResolveForm comment_id current_comment_status />`
- 빈 상태: "처리할 신고가 없습니다"

### `<ReportResolveForm>` (server)

```tsx
import { resolveReport } from "../_actions";

export function ReportResolveForm({
  commentId,
  currentCommentStatus,
}: { commentId: string; currentCommentStatus: string }) {
  return (
    <form action={resolveReport} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="comment_id" value={commentId} />
      <fieldset className="flex gap-3">
        <legend className="text-xs" style={{ color: "var(--text-muted)" }}>처리 결과</legend>
        <label className="text-sm">
          <input type="radio" name="resolution" value="upheld" required />
          신고 인정 (댓글 제거)
        </label>
        <label className="text-sm">
          <input type="radio" name="resolution" value="dismissed" required />
          신고 기각{currentCommentStatus === "blinded_by_report" ? " (자동 블라인드 해제)" : ""}
        </label>
      </fieldset>
      <textarea
        name="note"
        maxLength={200}
        rows={2}
        placeholder="처리 사유 (선택, 200자 이내) — 신고자에게 함께 전달됩니다"
        className="text-sm rounded p-2"
        style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
      />
      <button
        type="submit"
        className="self-start text-sm px-3 py-1.5 rounded"
        style={{ background: "var(--teal)", color: "white" }}
      >
        처리 저장
      </button>
    </form>
  );
}
```

### `app/admin/reports/_actions.ts`

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../../lib/admin/guards";
import { createClient } from "../../../lib/supabase/server";

export async function resolveReport(formData: FormData) {
  await requireAdmin();
  const commentId  = String(formData.get("comment_id") ?? "");
  const resolution = String(formData.get("resolution") ?? "");
  const noteRaw    = String(formData.get("note") ?? "").trim();
  const note       = noteRaw ? noteRaw.slice(0, 200) : null;

  if (!commentId) redirect("/admin/reports?error=missing_target");
  if (resolution !== "upheld" && resolution !== "dismissed") {
    redirect("/admin/reports?error=invalid_resolution");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_comment_report", {
    p_comment_id: commentId,
    p_resolution: resolution,
    p_note:       note,
  });
  if (error) {
    console.error("[resolveReport]", error);
    redirect("/admin/reports?error=db_error");
  }

  revalidatePath("/admin/reports");
  redirect("/admin/reports");
}
```

### `app/admin/corrections/page.tsx` (server)

- `requireAdmin()` (layout)
- `parseCorrectionsSearchParams` (`page` / `status`)
- fetch:
  - `question_corrections` 50건 + count
  - questions map + user_profiles_public map
  - server에서 diff 배열 계산 후 props 전달

### `<CorrectionsTable>` (server)

- 컬럼:
  - 문제 KVLE (`questions.public_id ?? id`) 링크 → `/questions/{public_id}`
  - 제안자 닉네임 (탈퇴면 "탈퇴한 사용자")
  - 변경 키 요약 (예: "answer, choices …+1")
  - created_at 상대시각
  - status badge
  - ▸ expand
- expand `<details>`:
  - 문제 본문 + 현재 정답 + 카테고리/과목
  - diff list:
    ```
    answer:    "3번" → "4번"
    choice_3:  "..." → "..."
    ```
  - status가 `proposed` / `reviewing` → `<CorrectionResolveForm>`
  - status가 `accepted` → "수정하러 가기 → /admin/questions/{id}/edit" 링크 + resolved_at + resolved_by_nickname + resolution_note 표시
  - status가 `rejected` → resolved_at + resolved_by_nickname + resolution_note만 표시
- 빈 상태: "처리할 정정 제안이 없습니다"

### `<CorrectionResolveForm>` (server)

- `<form action={resolveCorrection}>` JS 0
- hidden `correction_id`
- radio: `resolution=accepted|rejected` (required)
- textarea `note` (200자 cap, optional)
- submit "처리 저장"

### `app/admin/corrections/_actions.ts`

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../../lib/admin/guards";
import { createClient } from "../../../lib/supabase/server";

export async function resolveCorrection(formData: FormData) {
  await requireAdmin();
  const correctionId = String(formData.get("correction_id") ?? "");
  const resolution   = String(formData.get("resolution") ?? "");
  const noteRaw      = String(formData.get("note") ?? "").trim();
  const note         = noteRaw ? noteRaw.slice(0, 200) : null;

  if (!correctionId) redirect("/admin/corrections?error=missing_target");
  if (resolution !== "accepted" && resolution !== "rejected") {
    redirect("/admin/corrections?error=invalid_resolution");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_question_correction", {
    p_correction_id: correctionId,
    p_resolution:    resolution,
    p_note:          note,
  });
  if (error) {
    console.error("[resolveCorrection]", error);
    redirect("/admin/corrections?error=db_error");
  }

  revalidatePath("/admin/corrections");
  redirect("/admin/corrections");
}
```

### `lib/admin/report-labels.ts` + `lib/admin/correction-labels.ts`

```ts
// report-labels.ts
export const REPORT_REASON_KO: Record<string, string> = {
  spam:           "스팸",
  misinformation: "허위/잘못된 정보",
  privacy:        "개인정보",
  hate_speech:    "혐오 표현",
  advertising:    "광고/홍보",
  copyright:      "저작권 침해",
  defamation:     "명예훼손",
  other:          "기타",
};
export const REPORT_STATUS_KO: Record<string, string> = {
  pending:    "대기",
  reviewing:  "검토 중",
  upheld:     "인정됨",
  dismissed:  "기각됨",
};
export const REPORT_RESOLUTION_KO: Record<string, string> = {
  upheld:    "신고 인정",
  dismissed: "신고 기각",
};

// correction-labels.ts
export const CORRECTION_STATUS_KO: Record<string, string> = {
  proposed:  "제안됨",
  reviewing: "검토 중",
  accepted:  "수락됨",
  rejected:  "거절됨",
};
export const CORRECTION_RESOLUTION_KO: Record<string, string> = {
  accepted: "정정 수락",
  rejected: "정정 거절",
};
```

### `app/admin/audit/_components/audit-filters.tsx` 수정

- action select 한글 라벨 사전(있다면 확장, 없다면 신규) 4개 추가:
  - `report_uphold` → "신고 인정"
  - `report_dismiss` → "신고 기각"
  - `correction_accept` → "정정 수락"
  - `correction_reject` → "정정 거절"
- target_type select 옵션에 `comment` / `correction` 추가 (이미 free-text로 동작하지만 명시적 옵션이 UX 개선)

### `app/admin/page.tsx` + `_components/admin-nav-items.ts` 수정

- 사이드바 nav:
  - "신고" `disabled: true` 제거 + `href: "/admin/reports"` 활성
  - "정정" 신규 추가 (icon `GitPullRequest`, href `/admin/corrections`, 위치는 "신고" 직후)
- 대시보드 hub: 기존 단일 "신고/정정" 카드 → 두 카드로 분리
  - "신고" `href="/admin/reports"`, desc="댓글 신고 큐, 24시간 임시조치 결정"
  - "정정" `href="/admin/corrections"`, desc="문제 정정 제안 처리"
- 두 카드 모두 `disabled` 제거

### `components/notifications/notifications-dropdown.tsx` 수정

- 알림 클릭 라우팅 분기에 두 type 추가:
  - `report_resolved`: `payload.related_comment_id`로 해당 댓글 위치 → `/questions/{public_id ?? id}#comment-{comment_id}` (댓글이 `removed_by_admin`이어도 question 페이지 fallback)
  - `correction_resolved`: `payload.question_public_id ?? payload.question_id` → `/questions/{...}` (RPC가 alert insert 시 KVLE까지 회수해 payload에 박아 넣음 → 클라이언트에서 추가 lookup 0)
- 라벨 카피: report_resolved는 `payload.resolution`에 따라 "신고하신 댓글이 운영자 검토 후 제거되었습니다" / "신고하신 댓글이 검토 결과 위반이 아닌 것으로 판단되었습니다", correction_resolved는 "정정 제안이 수락되었습니다" / "정정 제안이 거절되었습니다"
- 본 PR은 dropdown 한 곳만 수정. `/notifications` 풀 페이지에 추가 분기는 P1 (현재 동선상 dropdown 클릭이 주 경로)

## Migration

### `20260502000000_admin_pr_c.sql`

```sql
-- =============================================================================
-- §18 PR-C: admin reports + corrections queues
-- =============================================================================

-- 0. notification_type enum 확장 (correction 결과 알림)
alter type public.notification_type add value if not exists 'correction_resolved';

-- 1. resolve_comment_report RPC
create or replace function public.resolve_comment_report(
  p_comment_id uuid,
  p_resolution text,            -- 'upheld' | 'dismissed'
  p_note       text default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id      uuid;
  v_target_status public.report_status;
  v_audit_action  public.audit_action;
  v_owner_id      uuid;
  v_curr_status   public.comment_status;
  v_affected      int;
  v_reporter_ids  uuid[];
begin
  v_admin_id := auth.uid();
  if v_admin_id is null
     or not exists (
       select 1 from public.profiles
       where id = v_admin_id and role = 'admin' and is_active
     ) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_resolution = 'upheld' then
    v_target_status := 'upheld';
    v_audit_action  := 'report_uphold';
  elsif p_resolution = 'dismissed' then
    v_target_status := 'dismissed';
    v_audit_action  := 'report_dismiss';
  else
    raise exception 'invalid resolution' using errcode = '22023';
  end if;

  select user_id, status into v_owner_id, v_curr_status
    from public.comments where id = p_comment_id;
  if v_owner_id is null then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;

  -- 그룹 단위로 pending/reviewing 신고 일괄 갱신, reporter_ids 회수
  with updated as (
    update public.comment_reports
       set status          = v_target_status,
           resolved_by     = v_admin_id,
           resolved_at     = now(),
           resolution_note = p_note
     where comment_id = p_comment_id
       and status in ('pending', 'reviewing')
    returning reporter_id
  )
  select count(*)::int,
         array_agg(distinct reporter_id) filter (where reporter_id is not null)
    into v_affected, v_reporter_ids
    from updated;

  if coalesce(v_affected, 0) = 0 then
    return 0;     -- 다른 운영자가 이미 처리. 멱등 종료.
  end if;

  -- 댓글 status 분기 (Q9-B)
  if p_resolution = 'upheld' then
    update public.comments
       set status     = 'removed_by_admin',
           updated_at = now()
     where id = p_comment_id
       and status <> 'removed_by_admin';
  else  -- dismissed: blinded_by_report만 visible로 복원
    update public.comments
       set status     = 'visible',
           updated_at = now()
     where id = p_comment_id
       and status = 'blinded_by_report';
  end if;

  -- reporter들에게 알림
  if v_reporter_ids is not null then
    insert into public.notifications (user_id, type, related_comment_id, payload, actor_id)
    select rid,
           'report_resolved',
           p_comment_id,
           jsonb_build_object(
             'resolution', p_resolution,
             'note',       coalesce(p_note, '')
           ),
           v_admin_id
      from unnest(v_reporter_ids) rid;
  end if;

  -- audit (그룹 단위 단일 행)
  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, before_state, after_state, note)
  values
    (v_admin_id, v_audit_action, 'comment', p_comment_id::text,
     jsonb_build_object('comment_status',  v_curr_status,
                       'reports_affected', v_affected),
     jsonb_build_object('comment_status_after',
       case when p_resolution = 'upheld' then 'removed_by_admin'::text
            when v_curr_status = 'blinded_by_report' then 'visible'::text
            else v_curr_status::text end),
     p_note);

  return v_affected;
end;
$$;

revoke execute on function public.resolve_comment_report(uuid, text, text) from public, anon;
grant  execute on function public.resolve_comment_report(uuid, text, text) to authenticated;

-- 2. resolve_question_correction RPC (수동 적용 모델 — 상태만 변경)
create or replace function public.resolve_question_correction(
  p_correction_id uuid,
  p_resolution    text,            -- 'accepted' | 'rejected'
  p_note          text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id      uuid;
  v_target_status public.correction_status;
  v_audit_action  public.audit_action;
  v_proposer_id   uuid;
  v_question_id   uuid;
  v_curr_status   public.correction_status;
begin
  v_admin_id := auth.uid();
  if v_admin_id is null
     or not exists (
       select 1 from public.profiles
       where id = v_admin_id and role = 'admin' and is_active
     ) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_resolution = 'accepted' then
    v_target_status := 'accepted';
    v_audit_action  := 'correction_accept';
  elsif p_resolution = 'rejected' then
    v_target_status := 'rejected';
    v_audit_action  := 'correction_reject';
  else
    raise exception 'invalid resolution' using errcode = '22023';
  end if;

  select proposed_by, question_id, status
    into v_proposer_id, v_question_id, v_curr_status
    from public.question_corrections where id = p_correction_id;

  if v_question_id is null then
    raise exception 'correction not found' using errcode = 'P0002';
  end if;

  if v_curr_status not in ('proposed', 'reviewing') then
    return false;     -- 이미 처리됨. 멱등 종료.
  end if;

  update public.question_corrections
     set status          = v_target_status,
         resolved_by     = v_admin_id,
         resolved_at     = now(),
         resolution_note = p_note,
         updated_at      = now()
   where id = p_correction_id
     and status in ('proposed', 'reviewing');

  if v_proposer_id is not null then
    -- payload에 question public_id까지 미리 회수 → dropdown 클라에서 추가 lookup 0
    insert into public.notifications (user_id, type, payload, actor_id)
    select v_proposer_id,
           'correction_resolved',
           jsonb_build_object(
             'resolution',         p_resolution,
             'note',               coalesce(p_note, ''),
             'question_id',        v_question_id::text,
             'question_public_id', q.public_id
           ),
           v_admin_id
      from public.questions q
     where q.id = v_question_id;
  end if;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, before_state, after_state, note)
  values
    (v_admin_id, v_audit_action, 'correction', p_correction_id::text,
     jsonb_build_object('status', v_curr_status),
     jsonb_build_object('status', v_target_status),
     p_note);

  return true;
end;
$$;

revoke execute on function public.resolve_question_correction(uuid, text, text) from public, anon;
grant  execute on function public.resolve_question_correction(uuid, text, text) to authenticated;
```

### 적용 순서 (PR-B 함정 회피)

1. 마이그 commit (재현성)
2. Supabase Studio SQL Editor 직접 실행 (`supabase db push "up to date"` 함정 회피)
3. sanity check (admin 본인 계정):
   ```sql
   -- 1. 가짜 comment_id로 호출 → P0002 'comment not found' 정상
   select public.resolve_comment_report(
     '00000000-0000-0000-0000-000000000000', 'dismissed', 'sanity'
   );
   -- 2. enum 확인
   select unnest(enum_range(null::public.notification_type));
   -- 3. RPC 권한 확인
   select has_function_privilege('authenticated',
     'public.resolve_comment_report(uuid, text, text)', 'execute');
   ```
4. 비-admin 계정으로 RPC 호출 → `42501` 거부 확인
5. types.ts 갱신 (`Functions.resolve_comment_report` + `resolve_question_correction` 두 entry, `Enums.notification_type`에 `correction_resolved` 추가)
6. PR 머지

### RLS 추가는 0개

- `resolve_*` RPC가 `security definer`라 `comment_reports` / `question_corrections` UPDATE policy 없이 동작
- 일반 user가 RPC 직접 호출해도 admin 게이트에서 `42501`
- 일반 user가 `comment_reports.update()` JS 직접 호출은 RLS UPDATE 정책 없음 → 거부 (기본값)

## Error handling / edge cases

### 권한

- 비-admin이 `/admin/reports` 또는 `/admin/corrections` 진입 → layout `requireAdmin()`이 `/dashboard` redirect
- 비-admin이 server action 직접 POST → `requireAdmin()` 재검증
- 비-admin이 RPC 직접 호출 → `42501`

### 검증 / 에러 redirect 코드

| 코드 | 한글 메시지 |
|---|---|
| `missing_target` | 대상 댓글/정정이 지정되지 않았습니다 |
| `invalid_resolution` | 올바른 처리 결과를 선택하세요 |
| `db_error` | 저장 중 오류가 발생했습니다. 다시 시도하세요 |

### 멱등 / 동시성

- 두 운영자가 같은 comment_id를 동시에 처리:
  - 첫 RPC가 `where status in ('pending','reviewing')` → 모두 갱신
  - 두 번째 RPC는 0행 갱신 → `return 0` (silent OK)
  - 알림은 첫 운영자만 보냄 (두 번째는 0행이라 `if v_reporter_ids is not null` skip)
  - audit는 첫 운영자 1행만 (두 번째는 v_affected=0이라 audit insert도 skip — 위 코드 `return 0` 위치에 의해)
- correction은 `if v_curr_status not in ('proposed','reviewing') then return false` 가드
- 댓글 작성자 `comment_blinded` 알림은 트리거의 `status='visible'` WHERE 가드로 트랜지션 시 1회만

### 큐에서 제외되는 케이스

- 신고 큐 SQL: `comments.status not in ('removed_by_admin','hidden_by_author')` → 이미 처리된 댓글 제외 (Step 2 lookup에서 자연 제외)
- 정정 큐: status filter가 `proposed`(default)면 `accepted`/`rejected` 자동 제외, `all` 토글 시 표시 (form 자리에 처리 정보)

### 알림 클릭 라우팅

- `report_resolved`: 댓글이 제거됐어도 question 페이지로 fallback (상세 페이지가 댓글 anchor 처리)
- `correction_resolved`: payload에 RPC가 박아둔 `question_public_id` 직접 사용 → 클라이언트 lookup 0
- dropdown에 분기 누락 시: 본 PR에서 추가 (`components/notifications/notifications-dropdown.tsx`)

### 저작권 가드

- 두 큐 모두 admin 가드 안 → round/session/year 자유 노출 OK
- 공개 페이지 링크는 항상 `(public_id ?? id)`
- 큐 안에서 댓글 본문 표시: `body_html` (sanitize-html 통과본) `dangerouslyInnerHTML`

### Audit 트랜잭션 일체화

- PR-B는 audit 별도 RPC라 silent fail이었지만, PR-C는 RPC 안에 audit insert 포함 → 트랜잭션 부분 → 실패 시 전체 롤백 (정합성 강화)

### Note 입력

- 200자 server-side cap (`noteRaw.slice(0, 200)`)
- 빈 문자열 → null 변환 (DB에 빈 문자열 들어가지 않음)
- audit `note` 필드 + 알림 `payload.note` 양쪽에 들어감

### sanitize 입력

- form 자체는 hidden id + radio + textarea만 → XSS 표면 없음
- note는 텍스트 그대로 저장(escape는 렌더 시 React 자동)

### removed_by_admin 댓글 후속 신고

- 사용자가 `removed_by_admin` 댓글에 신고 시도 → API route(`/api/comments/[id]/report`)에서 `if (comment.status === 'removed_by_admin')` 가드 → 410
- 이미 깔린 가드(report API route 56~61L) 변경 없음

## Verification (수동 검증 시나리오)

자동 테스트 0 (PR-B 기조). 머지 전 다음 시나리오 통과:

### 권한
- [ ] 비-admin이 `/admin/reports` 진입 → `/dashboard` redirect
- [ ] 비-admin이 `/admin/corrections` 진입 → `/dashboard` redirect
- [ ] 비-admin이 `resolve_comment_report` RPC 호출 → `42501`
- [ ] 비-admin이 `resolve_question_correction` RPC 호출 → `42501`

### 신고 큐
- [ ] 댓글 1개에 reason 다른 신고 3건 생성 → 큐에 1행 (3건 chip)
- [ ] 행 expand → 신고 3건 list + 댓글 본문 + form 표시
- [ ] uphold 처리 (note 비움) → redirect 후 큐에서 제거
- [ ] uphold 후 `/admin/audit`에 `report_uphold` 행 1개
- [ ] uphold 후 댓글 페이지에 "[운영자가 제거한 댓글입니다]" 또는 동등 표시
- [ ] 신고자 3명 모두 알림 1건씩 (`report_resolved`, resolution=upheld)
- [ ] 새 댓글 신고 3건 → 자동 블라인드 (`status='blinded_by_report'`) + comment_blinded 알림 1건 (작성자에게)
- [ ] dismiss 처리 → comments.status 'visible' 복원 + reporter들 알림 (resolution=dismissed)
- [ ] 댓글 status가 `hidden_by_votes`인 상태에서 dismiss → `hidden_by_votes` 그대로 (Q9-B)
- [ ] 두 운영자 동시 처리 → 두 번째는 RPC `return 0`, UI는 redirect만 (에러 X)
- [ ] `removed_by_admin` 댓글에 새 신고 시도 → API 410, 큐에 진입 안 함
- [ ] reason 필터 `spam` → 스팸 신고만 노출
- [ ] status 필터 `upheld` → 인정된 신고만 노출
- [ ] page 1→2→1 동작 + 다른 필터 보존
- [ ] 큐 빈 상태: "처리할 신고가 없습니다"
- [ ] 200자 초과 note → 200자 cap (server-side trim)
- [ ] resolution 미선택 submit → `?error=invalid_resolution` 한글 alert

### 정정 큐
- [ ] `/admin/corrections` 진입 + 정정 1건 expand → diff list 표시
- [ ] accept 처리 → status `accepted` + proposer 알림 + audit `correction_accept`
- [ ] accept 후 expand 안 form 자리에 "수정하러 가기 → /admin/questions/{id}/edit" 링크
- [ ] 링크 클릭 → PR-B edit 페이지 정상 진입
- [ ] reject 처리 → status `rejected` + proposer 알림 + audit `correction_reject`
- [ ] 두 운영자 동시 accept 시도 → 두 번째는 RPC `return false` + redirect만
- [ ] status 필터 `accepted` 토글 → 처리된 정정 표시 + 처리 정보 read-only
- [ ] 빈 상태: "처리할 정정 제안이 없습니다"

### Nav / Hub / Audit 통합
- [ ] 사이드바 "신고" / "정정" 활성 (active 하이라이트 정상)
- [ ] 모바일 햄버거 drawer에서도 두 항목 활성
- [ ] 대시보드 "신고" / "정정" hub 카드 활성 → 각 큐로 진입
- [ ] `/admin/audit`에서 `report_uphold` / `report_dismiss` / `correction_accept` / `correction_reject` 4개 액션이 한글 라벨로 보임
- [ ] `/admin/audit` target_type 필터에 `comment` / `correction` 옵션 + 필터링 정상

### 알림 라우팅
- [ ] NavBar 드롭다운에서 `report_resolved` 알림 클릭 → 해당 댓글 위치(`#comment-{id}`)로 이동, 댓글이 제거됐으면 question 페이지로 fallback
- [ ] NavBar 드롭다운에서 `correction_resolved` 알림 클릭 → 해당 문제(`/questions/{public_id}`)로 이동
- [ ] 두 알림 모두 한글 라벨 정상 (resolution별 분기)

## File budget

추정 ~15 task (writing-plans에서 세분화). PR-B(15 commit)와 비슷한 사이즈.

신규 12 / 수정 5 / 마이그 1.

| 그룹 | 파일 수 | 비고 |
|---|---|---|
| 마이그 | 1 | RPC 2개 + enum 1줄 |
| types.ts | 1 | Functions 2 + Enums.notification_type |
| reports/ | 7 | page + 4 컴포넌트 + action + parser |
| corrections/ | 7 | page + 4 컴포넌트 + action + parser |
| labels | 2 | report-labels + correction-labels |
| nav/hub | 2 | admin-nav-items + admin/page |
| audit-filters 보강 | 1 |  |
| notifications-dropdown | 1 | report_resolved + correction_resolved 라우팅 |
| **합계** | **22** | (마이그 + types 포함) |

literal-copy task 다수 → subagent-driven에 적합 (haiku 기본, sonnet은 RPC 검증·diff 계산·알림 라우팅 분기 등 복합 task).

## Out of scope (PR-D 이후 예고)

- `/admin/users` 회원/역할/활성/뱃지 부여 + audit 통합
- `/admin/questions/new` 신규 문제 생성 폼
- `/admin/comments/{id}` 댓글 전용 상세 페이지 (편집 이력 + 신고 이력 통합)
- 운영자/신고자/타깃 fuzzy 검색
- 정정 자동 적용(jsonb 화이트리스트 + 자동 questions UPDATE)
- 신고/정정 CSV 내보내기
- `useFormState` 인라인 form 에러
- 신고 처리 SLA 대시보드 (24h 임박/초과 카운트)
- 운영자 처리량 통계 (audit 기반 집계)
- `/notifications` 풀 페이지의 report_resolved/correction_resolved 분기 (현재 dropdown만)
