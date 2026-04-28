# Admin Password Reset Link — Design Spec

**Date**: 2026-04-28
**Scope**: M3 §18 admin PR-D 후속 PR-E (단독 PR)
**Trigger**: 사용자 요청 — vet40 동등 기능 ("admin이 비번 재설정 가능?"). 보안 고려해 직접 비번 설정이 아닌 **재설정 링크 발급** 방식으로 결정.
**Author**: Claude Opus 4.7 (1M context)

---

## 1. Goal

`/admin/users` 의 각 회원 행 expanded body에 **"비밀번호 재설정"** 섹션을 추가. admin이 버튼 클릭 시 **1회용 recovery 링크**를 발급, UI에 표시. admin이 복사해서 사용자에게 직접 전달(카톡/디스코드/이메일 등). admin은 사용자 비번을 알 수 없고, 사용자가 본인 손으로 새 비번 설정.

## 2. Non-Goals

- **이메일 자동 발송 안 함** — 발급된 링크는 admin UI에 표시만. Supabase 자동 메일 트리거 사용 X.
- **비번 직접 설정 안 함** — `auth.admin.updateUserById({ password })` 사용 X (계정 탈취 risk 회피).
- **사용자 셀프 비번 변경 UI 변경 없음** — 본 PR은 admin 측 UI/플로우만.
- **링크 재발급 횟수 제한 없음** — admin 재량. 단 매 발급마다 audit 기록.

## 3. Architecture

3-레이어 hybrid (다른 PR-D mutation들과 가장 가까운 패턴):

| Layer | 책임 | 위치 |
|---|---|---|
| Server Action | Form 받기, service role 클라이언트로 `generateLink` 호출, audit RPC 호출, 결과 redirect-with-query로 UI 전달 | `app/admin/users/_actions.ts` |
| Postgres RPC | `is_admin()` 가드 + 본인 차단 + audit row insert | 마이그레이션 SQL |
| UI | "재설정 링크 생성" 폼 + 발급된 URL 표시 | `_components/user-password-reset-form.tsx` (신규) |

**Service role 키는 Server Action 내부에서만 import**. 별도 헬퍼 `lib/supabase/admin.ts`로 격리해 실수로 client 번들 혼입 방지.

## 4. Data — Migration

`supabase/migrations/20260504000001_admin_password_reset.sql`:

```sql
-- audit_action enum 확장
alter type public.audit_action add value if not exists 'password_reset_issued';

create or replace function public.log_password_reset_issued(
  p_user_id uuid,
  p_note    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_admin_id uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_user_id = v_admin_id then
    raise exception '본인 비밀번호는 이 화면에서 재설정할 수 없습니다.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception '대상 회원을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  perform public.log_admin_action(
    'password_reset_issued', 'user', p_user_id::text,
    null, null, p_note
  );
end;
$$;
revoke execute on function public.log_password_reset_issued(uuid, text) from public, anon;
grant execute on function public.log_password_reset_issued(uuid, text) to authenticated;
```

마이그 적용은 SQL Editor 직접 실행 (community_tables_done 함정 회피).

## 5. Server-Side — Service Role Client

신규 파일 `lib/supabase/admin.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// service-role client — server-only, never import from client components.
// Bypasses ALL RLS. Use ONLY for auth admin APIs and system mutations
// that explicitly require it.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Supabase admin env vars missing");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

가드: 파일 자체에는 `"use client"` 절대 금지. Server Actions / Route Handlers에서만 import. `next.config.mjs`의 `serverComponentsExternalPackages`/build-time 체크는 별도로 추가하지 않음 (개발자 규율 + code review로 충분).

## 6. Server Action

`app/admin/users/_actions.ts`에 추가:

```ts
export async function issuePasswordResetLink(
  formData: FormData,
): Promise<void> {
  const userId = String(formData.get("user_id") ?? "");
  const note   = String(formData.get("note") ?? "").trim() || null;

  if (!userId) redirectWithError("필수 입력이 누락되었습니다.");

  // 1) 가드 + audit (RLS-context, runs as the requesting admin)
  const supabase = await createClient();
  const { error: rpcErr } = await supabase.rpc("log_password_reset_issued", {
    p_user_id: userId,
    p_note:    note,
  });
  if (rpcErr) redirectWithError(userErrorMessage(rpcErr.message));

  // 2) email lookup (service role — auth.users not exposed via REST)
  const admin = createAdminClient();
  const { data: u, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !u?.user?.email) {
    redirectWithError("대상 회원의 이메일을 찾을 수 없습니다.");
  }

  // 3) generate one-time recovery link
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: u.user.email!,
  });
  if (linkErr || !link?.properties?.action_link) {
    redirectWithError("링크 발급에 실패했습니다.");
  }

  // 4) display via redirect query — short-lived in URL bar, admin should
  //    copy immediately. Not stored in DB.
  const url = link.properties.action_link;
  redirect(`/admin/users?reset_link=${encodeURIComponent(url)}&reset_for=${userId}`);
}
```

**보안 고려**:
- 링크가 redirect URL 쿼리에 잠시 노출되지만 admin 본인 브라우저 한정 (서버 응답 후 즉시 보임)
- audit 로그에 URL 저장 안 함 (URL = credential)
- service role 응답에 link 외 metadata 있으나 모두 server-side에서 폐기

**Ordering tradeoff**: 위 코드는 audit RPC가 link generation 전에 실행됨. 이 순서면 link 발급 자체가 실패해도 audit row가 남는 미세한 불일치 가능. 반대로 link 후 audit 순서면 audit 실패 시 link는 발급됐지만 기록이 없는 더 나쁜 케이스. **현재 순서 유지** — RPC가 모든 가드를 책임지므로 안전, audit-after-fail은 "발급 시도가 있었음" 사실로 해석 가능 (운영자가 실패 사실을 인지). 실패 케이스는 Supabase auth 장애 같은 드문 상황.

## 7. UI

### 7-1. 폼 컴포넌트
신규 `app/admin/users/_components/user-password-reset-form.tsx`:

```tsx
import { issuePasswordResetLink } from "../_actions";

export function UserPasswordResetForm({
  userId, isSelf,
}: { userId: string; isSelf: boolean }) {
  if (isSelf) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        본인 비밀번호는 이 화면에서 재설정할 수 없습니다.
      </p>
    );
  }

  return (
    <form action={issuePasswordResetLink} className="flex flex-col gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <textarea
        name="note"
        maxLength={200}
        rows={2}
        placeholder="발급 사유 (선택, 200자 이내)"
        className="text-sm rounded p-2"
        style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
      />
      <button
        type="submit"
        className="self-start text-sm px-3 py-1.5 rounded"
        style={{ background: "var(--teal)", color: "white", border: 0, cursor: "pointer" }}
      >
        재설정 링크 생성
      </button>
    </form>
  );
}
```

### 7-2. 결과 표시
`page.tsx` 상단 — `errorMsg` 표시 영역 옆에 `reset_link` 쿼리 처리 추가:

```tsx
const linkRaw = raw["reset_link"];
const resetLink = Array.isArray(linkRaw) ? linkRaw[0] : linkRaw;

{resetLink && (
  <div className="mb-4 rounded p-3 text-sm" style={{ ... success styling ... }}>
    <p className="mb-2 font-medium">재설정 링크가 발급되었습니다 (1회용, 1시간 유효)</p>
    <code className="block break-all p-2 rounded text-xs" style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}>
      {resetLink}
    </code>
    <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
      이 링크를 사용자에게 전달하세요. 페이지를 떠나면 다시 볼 수 없습니다.
    </p>
  </div>
)}
```

### 7-3. UsersTable 변경
expanded body에 5번째 섹션 추가:

```tsx
<section>
  <h3 className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
    비밀번호 재설정
  </h3>
  <UserPasswordResetForm userId={r.id} isSelf={isSelf} />
</section>
```

`grid sm:grid-cols-2`라 5섹션이 되면 마지막 행이 1열만 차지. 자연스럽게 표시됨 (별도 grid 변경 불필요).

## 8. Error Handling

| 상황 | 동작 |
|---|---|
| `is_admin()` 실패 | RPC가 access denied raise → Server Action이 generic 메시지로 redirect |
| 본인 비번 시도 | RPC가 P0001 한국어 메시지 raise → `userErrorMessage` 통과 → UI 표시 |
| 대상 user 미존재 | RPC가 P0001 메시지 raise |
| 이메일 lookup 실패 | "대상 회원의 이메일을 찾을 수 없습니다." |
| `generateLink` 실패 (Supabase auth 오류) | "링크 발급에 실패했습니다." (사용자에게 디테일 노출 X) |
| service role 환경변수 누락 | `createAdminClient`가 throw → 500 page.  prod에선 절대 없어야 함 |

## 9. Testing

수동 테스트 (자동 테스트 인프라 미정):
1. admin 본인 행 → "본인 비밀번호는…" 안내 표시 확인
2. 다른 사용자 행 → "재설정 링크 생성" 클릭 → URL 표시 확인
3. 표시된 링크 다른 브라우저(시크릿)에서 열기 → Supabase 비번 재설정 화면 진입 확인
4. 새 비번 설정 후 로그인 시도 → 성공
5. 같은 링크 재사용 시도 → 만료/사용 처리 확인
6. `/admin/audit` 페이지에서 `password_reset_issued` 액션 row 확인
7. note 필드 입력 시 audit row의 note 컬럼에 저장 확인

## 10. Out-of-Scope (별건 PR 후보)

- **링크 만료 시간 명시 표시**: Supabase recovery 기본 1시간 — UI에 정확한 시간 표시하려면 backend에서 해당 정보를 함께 반환받아야 함. 현재 hardcoded "1시간 유효"로 충분.
- **재발급 throttle**: 같은 사용자에게 N분 내 재발급 차단. 운영 중 남발 보이면 추가.
- **링크 즉시 무효화**: admin이 발급 직후 취소하고 싶을 때. Supabase API 미지원 — 사용자 비번 재설정으로만 무효화.
- **passer/candidate 뱃지 + IP 차단** (PR-D PR-2 원래 계획): 별도 PR 유지.

## 11. Migration Order

1. `.env.local` + Vercel env vars에 `SUPABASE_SERVICE_ROLE_KEY` 추가 — **사용자 작업, 완료됨**
2. SQL Editor에 마이그 SQL 실행 (음 enum + RPC)
3. 코드 PR 머지
4. `/admin/users` 진입 → 검증

## 12. Files Changed Summary

| 파일 | 변경 |
|---|---|
| `supabase/migrations/20260504000001_admin_password_reset.sql` | 신규 |
| `lib/supabase/admin.ts` | 신규 |
| `lib/supabase/types.ts` | `audit_action` enum + `log_password_reset_issued` RPC 시그니처 추가 |
| `app/admin/users/_actions.ts` | `issuePasswordResetLink` 추가 |
| `app/admin/users/_components/user-password-reset-form.tsx` | 신규 |
| `app/admin/users/_components/users-table.tsx` | 5번째 섹션 import + 렌더 |
| `app/admin/users/page.tsx` | `reset_link` query 처리 + 결과 박스 |
| `app/admin/audit/_lib/parse-audit-search-params.ts` | audit_action 화이트리스트 + 한국어 라벨 맵에 `password_reset_issued` 추가 (`"비밀번호 재설정 링크 발급"`) |
