# 2026-05-08 — 계정/프로필 보강 (Account & Profile Hardening)

## 배경

2026-05-07 팀원 피드백 4건 중 P0 두 건을 묶은 PR.

1. **`#2`**: 가입 후 비밀번호를 변경할 방법이 없음. 비밀번호 분실 시 복구 경로도 부재.
2. **`#3`**: 신규 가입자의 NavBar 닉네임 pill이 "비활성화"로 인지됨. 코드 추적 결과 `useMyNickname()`이 null을 반환하여 email fallback **div(non-clickable)**가 노출되는 버그. `handle_new_user` 트리거 누락/실패로 `user_profiles_public` row가 생성되지 않은 케이스(2026-04-28 orphan 6건 사고와 동일 패턴 의심).

## 비목표 (out of scope)

- 이메일 변경, 알림 설정, 회원 탈퇴, 가입 차단 강화(Action 1번 후속)
- 비밀번호 정책 강화 (영문/숫자/특수문자 강제). 현재 가입 정책과 동일하게 **최소 6자**만.
- 다국어 메일 템플릿 — Supabase 기본 사용
- `/settings` 사이드바/탭 분할 — 단일 섹션 나열로 충분

## 아키텍처 개요

```
사용자 ──┬── /settings (신규)
        │     ├─ AccountInfo (email, 가입일 RO 표시)
        │     └─ PasswordChangeForm
        │           └─ Server Action: changePassword({ current, next })
        │                 ├─ 1) signInWithPassword (re-auth)
        │                 └─ 2) updateUser({ password: next })
        │
        ├── /auth/login (수정)
        │     └─ mode='forgot' 추가
        │           └─ supabase.auth.resetPasswordForEmail(...)
        │                 redirectTo: ${origin}/auth/callback?next=/auth/reset
        │
        ├── /auth/reset (신규)
        │     └─ ResetPasswordForm
        │           └─ updateUser({ password: next })
        │
        └── /profile/me (신규, 서버 redirect)
              └─ supabase.rpc("ensure_my_profile_public")
                    └─ redirect to /profile/{nickname}

NavBar pill:
  - myNickname 있음 → 기존 Link (변경 없음)
  - myNickname 없음 → "프로필 설정" amber CTA Link → /profile/me  [수정]
  - pill 옆 톱니바퀴 아이콘 → /settings  [신규]
```

## 신규/수정 파일

### 신규
- `supabase/migrations/<ts>_ensure_my_profile_public.sql` — RPC 1개
- `app/settings/page.tsx` — server component 셸
- `app/settings/_components/AccountInfo.tsx` — 이메일/가입일 표시 (server)
- `app/settings/_components/PasswordChangeForm.tsx` — client form
- `app/settings/_actions.ts` — `changePassword` server action
- `app/auth/reset/page.tsx` — client page
- `app/auth/reset/_components/ResetPasswordForm.tsx` — client form
- `app/profile/me/page.tsx` — server component, RPC + redirect
- `lib/profile/passwordPolicy.ts` — `validateNewPassword(current, next, confirm)` 순수 함수 (testable)

### 수정
- `app/auth/login/page.tsx` — mode='forgot' 추가, "비밀번호를 잊으셨나요?" 링크
- `components/NavBar.tsx` — pill null fallback CTA + 톱니바퀴 아이콘

## 데이터 흐름

### 흐름 1 — 비밀번호 변경 (`/settings`)

```
사용자 → PasswordChangeForm
  필드: [현재비번 / 새비번 / 새비번확인]
  client validation (passwordPolicy.ts):
    - 새비번 ≥ 6자
    - 새비번 = 새비번확인
    - 새비번 ≠ 현재비번
    
→ Server Action: changePassword({ current, next })
    1) const supabase = await createClient()  // cookies-bound
    2) const { data: { user } } = await supabase.auth.getUser()
       비로그인 → return { error: "auth_required" }
    3) const { error: e1 } = await supabase.auth.signInWithPassword({
         email: user.email!,
         password: current,
       })
       e1 → return { error: "wrong_current_password" }
    4) const { error: e2 } = await supabase.auth.updateUser({ password: next })
       e2 → return { error: e2.message ?? "update_failed" }
    5) return { ok: true }

→ 클라이언트:
  ok → 폼 리셋 + 토스트 "비밀번호가 변경되었습니다"
  error_code → inline 한글 메시지 매핑
```

**보안**:
- Service role 키 사용 안 함 — cookies-bound `createClient()`만 사용.
- `signInWithPassword` 재인증은 Supabase가 IP/계정 단위 rate limit 자동 적용.
- 비번 평문은 어떤 audit/log table에도 저장하지 않음.

### 흐름 2 — 비밀번호 찾기

```
[로그인 페이지 mode='forgot']
  사용자 → 이메일 입력 → "재설정 메일 발송"
  → supabase.auth.resetPasswordForEmail(email, {
       redirectTo: `${origin}/auth/callback?next=/auth/reset`,
     })
  → 토스트: "메일을 보냈습니다. 받은편지함을 확인하세요." (이메일 존재 여부 무관 동일 메시지)

[메일 클릭]
  → ${SITE_URL}/auth/callback?code=<recovery_code>&next=/auth/reset

[/auth/callback (이미 존재)]
  exchangeCodeForSession(code) → 쿠키에 recovery 세션 저장
  → redirect to /auth/reset

[/auth/reset 페이지]
  client mount:
    const { data: { user } } = await supabase.auth.getUser()
    !user → "유효하지 않거나 만료된 링크입니다." + /auth/login 링크
  
  user 있음:
    [새비번 / 새비번확인] 폼
    submit:
      validateNewPassword (현재비번 비교는 skip — recovery 세션이 곧 인증)
      → supabase.auth.updateUser({ password: next })
      → 성공: router.push('/dashboard') + 토스트
      → 실패: inline 에러
```

**Supabase 설정 사전 확인** (배포 전 운영자 작업 — Pre-deploy checklist 참조):
- Dashboard → Authentication → URL Configuration → Redirect URLs:
  - `${SITE_URL}/auth/callback` 등록 여부 (가입 confirmation으로 이미 등록되어 있을 가능성 높음)
- Email Template → Reset Password: 기본 템플릿 사용

**ForgotPasswordForm 입력 검증**:
- `<input type="email" required />` + 빈 입력 거부
- 클라이언트 측 추가 정규식 검증 없음 (Supabase가 형식 검증 처리)

### 흐름 3 — `/profile/me` 닉네임 fix

```
NavBar pill (myNickname null):
  → 클릭 → /profile/me (Link)

[/profile/me — server component]
  1) const supabase = await createClient()
  2) const { data: { user } } = await supabase.auth.getUser()
     !user → redirect("/auth/login?next=/profile/me")
  3) const { data: nickname } = await supabase.rpc("ensure_my_profile_public")
     RPC 에러 → throw → 에러 바운더리 (Next.js error.tsx)
  4) redirect(`/profile/${encodeURIComponent(nickname)}`)
```

### RPC 시그니처

```sql
create or replace function public.ensure_my_profile_public()
returns text  -- 보장된 nickname
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_nickname text;
begin
  if v_user_id is null then
    raise exception 'auth required' using errcode = '28000';
  end if;
  
  -- 1) profiles
  insert into public.profiles (id) 
  values (v_user_id) 
  on conflict (id) do nothing;
  
  -- 2) user_profiles_public — 임시 닉네임 보장
  v_nickname := 'user_' || substring(v_user_id::text from 1 for 8);
  insert into public.user_profiles_public (user_id, nickname)
  values (v_user_id, v_nickname)
  on conflict (user_id) do nothing;
  
  -- 3) newbie 뱃지
  insert into public.badges (user_id, badge_type, reason)
  values (v_user_id, 'newbie', 'auto-granted (ensure_my_profile_public)')
  on conflict (user_id, badge_type) do nothing;
  
  -- 4) 보장된 닉네임 반환 (이미 변경한 사용자면 user_xxxx 아닌 실제 닉네임)
  select nickname into v_nickname 
    from public.user_profiles_public 
    where user_id = v_user_id;
    
  return v_nickname;
end;
$$;

grant execute on function public.ensure_my_profile_public() to authenticated;
```

**SECURITY DEFINER 가드**: `set search_path = public` 명시 필수 (메모리 `feedback_security_definer_trigger.md` 위반 회피).

### NavBar fallback CTA

```tsx
// 기존 (수정 대상)
{myNickname ? (
  <Link href={`/profile/${encodeURIComponent(myNickname)}`} ...>
    <User size={13} />
    <span>{myNickname}</span>
  </Link>
) : (
  <div ... style={{ ... color: "var(--text-muted)" }}>
    <User size={13} />
    <span>{user.email}</span>
  </div>
)}

// 변경 후
{myNickname ? (
  <Link href={`/profile/${encodeURIComponent(myNickname)}`} ...>
    <User size={13} />
    <span>{myNickname}</span>
  </Link>
) : (
  <Link 
    href="/profile/me" 
    // 기존 pill과 동일한 padding/border-radius/font-size + amber 강조
    style={{
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      padding: "0.375rem 0.75rem",
      borderRadius: "9999px",
      fontSize: "0.75rem",
      textDecoration: "none",
      background: "var(--amber-dim)",
      border: "1px solid var(--amber)",
      color: "var(--amber)",
    }}
    title="프로필을 설정해주세요"
  >
    <User size={13} />
    <span>프로필 설정</span>
  </Link>
)}

// 추가: pill 옆 톱니바퀴
<Link 
  href="/settings" 
  className="..." 
  title="계정 설정"
  aria-label="계정 설정"
>
  <Settings size={14} />
</Link>
```

## 에러 처리

| 시나리오 | 처리 | 사용자 메시지 |
|----------|------|--------------|
| 비번 변경: 현재 비번 틀림 | Server Action `error: "wrong_current_password"` | "현재 비밀번호가 일치하지 않습니다" |
| 비번 변경: Supabase 일반 에러 | catch | "변경에 실패했습니다. 잠시 후 다시 시도해주세요" |
| 비번 변경: rate limit (429) | catch by message pattern | "잠시 후 다시 시도해주세요" |
| 비번 변경: 새비번 = 현재 비번 | client `passwordPolicy.ts` | "기존 비밀번호와 다른 비밀번호를 입력하세요" |
| 비번 변경: 새비번 < 6자 | client | "비밀번호는 6자 이상이어야 합니다" |
| 비번 변경: 새비번 ≠ 확인 | client | "비밀번호가 일치하지 않습니다" |
| 비번찾기: 미등록 이메일 | Supabase 200 (의도된 동작) | "메일을 보냈습니다." (성공 메시지 동일 — 계정 존재 leak 방지) |
| 비번찾기: rate limit | Supabase 429 | "잠시 후 다시 시도해주세요" |
| /auth/reset: 세션 무효 | client `getUser()` null | "유효하지 않거나 만료된 링크입니다. 비밀번호 찾기를 다시 요청하세요." + /auth/login 링크 |
| /profile/me: RPC 실패 | server throw → error.tsx | "프로필 초기화에 실패했습니다. 새로고침하세요." |
| /profile/me: 비로그인 | redirect | `/auth/login?next=/profile/me` |

## 테스팅

**유닛**:
- `lib/profile/passwordPolicy.ts` — `validateNewPassword(current, next, confirm)` 5케이스:
  - 새비번 < 6자
  - 새비번 = 현재비번
  - 새비번 ≠ 확인
  - 정상 통과
  - 빈 입력

**수동 통합 (브라우저)**:
1. 비번 변경 happy path: 새 테스트 계정 → /settings → 변경 → 로그아웃 → 새 비번으로 재로그인 ✅
2. 비번 변경 wrong current: 의도적으로 틀린 현재비번 → 에러 노출 확인
3. 비번찾기 메일 발송: 로그인 페이지 forgot 모드 → 이메일 입력 → Supabase Email logs에서 발송 로그 확인
4. 비번찾기 풀 흐름: 메일 클릭 → /auth/reset → 새 비번 → 재로그인 ✅
5. /profile/me happy: 정상 사용자 → 자기 프로필로 redirect ✅
6. /profile/me orphan 시나리오: SQL Editor로 `delete from user_profiles_public where user_id = '<my>';` → NavBar pill amber CTA 노출 확인 → 클릭 → 자가 백필 + 정상 redirect ✅
7. NavBar 톱니바퀴: 클릭 → /settings 진입 ✅
8. 비번 정책 검증: 5자 입력 시 거부, 동일 비번 거부, 확인 불일치 거부

## 보안 노트

- **service role 키 사용 안 함**: 모든 작업이 cookies-bound 사용자 세션 권한으로 충분 (`signInWithPassword` 재인증, `updateUser({password})`, `resetPasswordForEmail`).
- **비번 평문 미저장**: audit log, error report, telemetry 어디에도 비번 평문 보내지 않음.
- **계정 열거 방지**: 비번찾기 미등록 이메일 입력 시 동일 성공 메시지 (Supabase 기본 동작).
- **재인증**: 변경 시 현재 비번 입력 강제 (세션 탈취 후 비번 교체로 계정 영구 강탈 방지).
- **RPC SECURITY DEFINER**: `set search_path = public` 명시 — 메모리 `feedback_security_definer_trigger.md` 룰 준수.

## 메모리/사고 회피 항목

기존 메모리 인덱스에서 적용 가능한 것들:
- `feedback_security_definer_trigger.md` — RPC `set search_path = public` 명시 ✅
- `feedback_module_load_env_throw.md` — 모듈 top에서 env throw 금지 (Server Action에서 lazy init) ✅
- `feedback_subagent_repo_root_path_confusion.md` — 마이그 경로 절대경로 명시 (`vet-exam-ai/supabase/migrations/`) ✅
- `feedback_react_compiler_usecallback_unstable_deps.md` — useCallback deps 새 array/object 금지 ✅

## Pre-deploy 체크리스트 (운영자 수동 작업)

PR 머지 후 배포 전 1회 확인 — 흐름 2 (비번찾기) 동작 전제 조건:

- [ ] **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**: `${SITE_URL}/auth/callback` 등록 여부 확인 (가입 confirmation 흐름이 이미 동작 중이면 등록되어 있을 가능성 높음)
- [ ] **Email Template → Reset Password**: 기본 템플릿이 활성화되어 있는지 확인 (한글화는 Phase 2)
- [ ] **`/auth/reset` 라우트 manual 테스트**: prod 환경에서 본인 계정으로 비번찾기 1회 → 메일 수신 → 링크 클릭 → 새 비번 설정 → 재로그인 성공 확인

## Phase 2 백로그 (이번 PR 밖)

- 이메일 변경 (`/settings` 내 신규 섹션)
- 알림 설정 (`user_notification_prefs` 테이블 + 기존 알림 발행 코드 lookup 추가)
- 회원 탈퇴 (정책 brainstorm 필요 — soft delete vs hard, 댓글/투표 처리)
- `handle_new_user` 트리거 사고 root cause 조사 (이번 PR은 ensure_my_profile_public 안전망으로 영구 봉합. 트리거 자체 디버깅은 별건)

## 결론

| 항목 | 결과 |
|------|------|
| 마이그레이션 | 1개 (`ensure_my_profile_public` RPC) |
| 신규 페이지 | 3개 (`/settings`, `/auth/reset`, `/profile/me`) |
| 수정 페이지 | 2개 (`/auth/login`, `NavBar`) |
| 신규 컴포넌트 | 4개 (AccountInfo, PasswordChangeForm, ResetPasswordForm, ForgotPasswordForm) |
| 신규 server action | 1개 (`changePassword`) |
| 신규 라이브러리 | 1개 (`passwordPolicy.ts`) |
| 추정 작업량 | 0.5~1일 (subagent-driven 또는 직접 Write) |
