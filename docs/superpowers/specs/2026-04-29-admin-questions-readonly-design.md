# /admin 콘솔 + 문제 목록/상세 (read-only PR-A) — Design Spec

- **Date**: 2026-04-29
- **Scope**: M3 §18 admin 콘솔 1차 PR. 권한 게이트 + 사이드바 셸 + 대시보드 + 문제 목록/필터/페이지네이션 + 문제 상세 (읽기 전용).
- **Out of scope (PR-B 이후)**: 문제 생성/수정, 정정 제안 큐, 회원 관리, 시험 회차 관리, 신고 큐, audit 로그 작성, RLS write 정책.
- **Prereqs**: PR #30 (Next 16 useParams 한글 디코드 hotfix), §16 (profile + 뱃지), KVLE-NNNN public_id 시스템.

## Context

현재 시스템:
- `profiles.role`: `user | reviewer | admin` (enum 존재)
- `profiles.is_active`: 활성/비활성 플래그
- `admin_audit_logs`, `question_corrections` 테이블 존재 (앱 코드에서 미사용)
- `questions.public_id` (KVLE-NNNN, copyright-safe)
- `/admin/*` 디렉터리 0 — 그린필드

PR-A 목적: admin이 안전하게 문제 은행을 둘러보고 검수할 수 있는 운영 콘솔의 셸을 깔되, mutation 0으로 시작해 RLS 충돌 위험과 머지 사이즈를 최소화. 다음 PR(쓰기)이 그 위에 form만 얹으면 끝나는 구조.

## Decisions (브레인스토밍 합의)

1. **3 페이지** — `/admin` (대시보드 hub), `/admin/questions` (목록), `/admin/questions/[id]` (어드민 전용 상세)
2. **권한 게이트** — `requireAdmin()` 단일 헬퍼. `user`/`reviewer`/비활성 모두 `/dashboard` redirect (silent)
3. **NavBar pill** — `useMyRole` 훅 추가, `role === 'admin'`일 때만 "운영" pill 노출
4. **풀 필터** — 회차/연도/교시/과목/카테고리/활성/검색어. 정정 제안 집계는 PR-B
5. **URL 페이지네이션 + 정렬 토글** — `?page=&sort=`, per_page 50 고정. 정렬 3종: `recent`(created_at desc, default), `round`(round asc), `kvle`(public_id asc)
6. **상세 풀 필드** — round/session/year 명시 노출 (admin 가드 안). audit 로그/정정 건수는 PR-B에서 합류. "공개 페이지로 이동" 링크 포함
7. **대시보드 hub** — 카운트 카드 4 + "문제 관리" 카드. 회원/시험/신고/감사 카드는 disabled grey (다음 PR 예고)
8. **레이아웃** — 좌측 사이드바 + 미니멀 헤더, 페이지별 본문 액션. 모바일 햄버거 drawer

⚠️ **questions 테이블에 `updated_at` 컬럼 없음** — 정렬 토글 "수정일 desc" → "**등록일 desc**"(`created_at`)로 보정.

## Architecture

### 디렉터리

```
vet-exam-ai/
  app/
    admin/
      layout.tsx                        ← requireAdmin() 게이트 + AdminShell
      page.tsx                          ← 대시보드 (카운트 4 + hub 카드)
      questions/
        page.tsx                        ← 목록 + 필터 + 페이지네이션 (Server)
        [id]/page.tsx                   ← 어드민 전용 상세 (Server)
        _lib/parse-search-params.ts     ← 필터 정규화 + 검색어 sanitize
      _components/
        admin-sidebar.tsx               ← 좌측 사이드바 (server)
        admin-mobile-drawer.tsx         ← 햄버거 drawer (client)
        admin-questions-filters.tsx     ← URL searchParams 동기화 (client)
        admin-questions-table.tsx       ← 행 렌더 (server)
        admin-questions-pager.tsx       ← 페이지 링크 (server)
  lib/
    admin/
      guards.ts                         ← requireAdmin() 단일 헬퍼
      filter-options.ts                 ← getFilterOptions() React cache()
    hooks/
      useMyRole.ts                      ← NavBar pill용 (기존 useMyNickname 옆)
  components/
    NavBar.tsx                          ← admin pill 추가 (수정)
  supabase/migrations/
    20260429000000_admin_count_distinct.sql  ← distinct 카운트 RPC
```

### 진입 흐름

1. `/admin/*` 진입 → `app/admin/layout.tsx`에서 `requireAdmin()` 실행
2. 비로그인: `redirect('/auth/login?next=/admin')`. 비-admin / 비활성: `redirect('/dashboard')` (silent — 토스트 없음)
3. 통과 시 `<AdminShell>` (사이드바 + 본문 슬롯) 렌더
4. 본문은 각 페이지 server component가 채움

### 저작권 가드 분리

- `app/admin/_components/*`는 `round`/`session`/`year` 노출 OK
- 공개 라우트(`app/questions/*`, `components/QuestionCard.tsx` 등)의 컴포넌트를 admin에서 **재사용하지 않음** — admin 전용 컴포넌트로 새로 작성
- "공개 페이지로 이동" 링크는 항상 `/questions/{public_id ?? id}` (raw id 노출 안 함)

## Components

### `app/admin/layout.tsx` (server)
- 단일 책임: 권한 게이트 + 셸 렌더
- `await requireAdmin()` 1회 → fail 시 redirect, 성공 시 children 렌더
- 자식: `<AdminSidebar>` + `<AdminMobileDrawer>` + 헤더(햄버거 버튼은 모바일 헤더에 위치) + 본문 슬롯
- 필터 dropdown 데이터는 **layout이 page에 props 전달 불가**(App Router 제약) → `lib/admin/filter-options.ts`에 `getFilterOptions()` 함수를 두고 React `cache()`로 감싸 페이지에서 호출 (per-request dedup)

### `app/admin/page.tsx` (server) — 대시보드
- 카운트 4: 총 문제 / 활성 문제 / 회차 수 / 카테고리 수
- 총/활성: `count: 'exact', head: true`
- 회차/카테고리 distinct: `count_questions_distinct(col)` RPC 호출
- 카드 5: 카운트 4 + "문제 관리" 진입 카드
- 회원/시험/신고/감사 카드는 disabled grey (PR-B 예고)
- RPC 실패 시 해당 카드만 `—`, 화면은 죽지 않음

### `app/admin/questions/page.tsx` (server) — 목록
- `searchParams` 파싱: `page` `sort` `round` `year` `session` `subject` `category` `is_active` `q`
- 정규화/sanitize는 `_lib/parse-search-params.ts`에서 단일 함수로
- 단일 쿼리: `.from('questions').select(컬럼, { count: 'exact' })` + 동적 필터 chain + `order(...)` + `range(offset, offset+49)`
- 자식: `<AdminQuestionsFilters initial={...} options={...}>`, `<AdminQuestionsTable rows={...}>`, `<AdminQuestionsPager page={...} totalPages={...} sp={...}>`

#### `<AdminQuestionsFilters>` (client) — 유일한 client component
- `useRouter() / usePathname() / useSearchParams()`
- 입력 변화 시 URL 갱신 (`router.replace`). 검색어만 300ms 디바운스
- "필터 초기화" 버튼 1개

#### `<AdminQuestionsTable>` (server)
- 컬럼: KVLE-ID · 회차/교시 · 과목 · 카테고리 · 문제 첫 80자(말줄임) · 정답(선지 번호) · 활성 chip · 등록일
- 행 클릭 = `<Link href="/admin/questions/{id}">` (raw id 사용 — admin 가드 내부)
- 빈 결과: "조건에 맞는 문제가 없습니다" + "필터 초기화" 링크

#### `<AdminQuestionsPager>` (server)
- `?page=` 만 갱신, 다른 필터 보존
- "이전 / 다음" + "현재 / 총" 표시

### `app/admin/questions/[id]/page.tsx` (server) — 상세
- `decodeMaybe(params.id)` (PR #30 패턴)
- 쿼리: `.or('id.eq.{id},public_id.eq.{id}')` 양쪽 매치 → `notFound()` fallback
- 풀 필드 + round/session/year 명시 + 공개 페이지 링크 (`/questions/{public_id ?? id}` 새 탭)

### `<AdminSidebar>` (server)
- 6개 nav: 대시보드 / 문제 / 회원(disabled) / 시험(disabled) / 신고(disabled) / 감사(disabled)
- 활성 1개(/admin/questions 진입 시 "문제"), 나머지 grey
- 하단: "← 일반 사이트로" 링크
- 모바일에서 `hidden md:block`

### `<AdminMobileDrawer>` (client)
- 햄버거 버튼은 모바일 전용 헤더(layout 내부, `md:hidden`)에 위치
- 클릭 시 좌측에서 sheet 슬라이드 인 — 사이드바와 동일한 nav 콘텐츠
- ESC 키 / backdrop 클릭으로 닫힘
- ConfirmDialog 패턴 참조하되 별도 컴포넌트 (sheet ≠ dialog)

### `useMyRole` 훅 (`lib/hooks/useMyRole.ts`) + NavBar
- 기존 `lib/hooks/useMyNickname.ts` 패턴을 그대로 따름 (Convention 일관성)
- 클라이언트 supabase로 본인 `profile.role` + `is_active` 가져옴 + auth state listen + 캐시
- NavBar: `useMyRole() === 'admin'`이면서 `is_active`일 때만 우측 "운영" pill, 클릭 시 `/admin`

## Data flow

### 대시보드 카운트

```ts
const [total, active, rounds, categories] = await Promise.all([
  supabase.from('questions').select('*', { count: 'exact', head: true }),
  supabase.from('questions').select('*', { count: 'exact', head: true }).eq('is_active', true),
  supabase.rpc('count_questions_distinct', { col: 'round' }),
  supabase.rpc('count_questions_distinct', { col: 'category' }),
]);
```

⚠️ **함정 회피**: `select('round')` 만 호출하면 1000행 cap에 걸려 distinct가 부정확. RPC 함수가 정확도 확보.

### 목록 쿼리 (`/admin/questions`)

```ts
const sortMap = {
  recent: { col: 'created_at', ascending: false },
  round:  { col: 'round',      ascending: true  },
  kvle:   { col: 'public_id',  ascending: true  },
} as const;

const PAGE = 50;
let q = supabase
  .from('questions')
  .select('id, public_id, round, session, year, subject, category, question, answer, is_active, created_at',
          { count: 'exact' });

if (sp.round)     q = q.eq('round',    sp.round);
if (sp.year)      q = q.eq('year',     sp.year);
if (sp.session)   q = q.eq('session',  sp.session);
if (sp.subject)   q = q.eq('subject',  sp.subject);
if (sp.category)  q = q.eq('category', sp.category);
if (sp.is_active != null) q = q.eq('is_active', sp.is_active);
// sp.q는 parse-search-params.ts에서 영숫자/한글/공백/하이픈만 통과 + 100자 cap 후 전달됨
if (sp.q) q = q.or(`public_id.ilike.%${sp.q}%,question.ilike.%${sp.q}%`);

const { col, ascending } = sortMap[sp.sort];
const offset = (sp.page - 1) * PAGE;
const { data, count } = await q.order(col, { ascending }).range(offset, offset + PAGE - 1);
const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
```

- per_page 50 고정 → 1000행 cap 무관
- `count: 'exact'`로 totalPages 계산
- 검색어 `q`는 `parse-search-params.ts`에서 영숫자/한글/공백/하이픈만 허용, 100자 cap 후 전달

### 상세 쿼리

```ts
function decodeMaybe(s: string) { try { return decodeURIComponent(s); } catch { return s; } }
const id = decodeMaybe(params.id);
const { data } = await supabase
  .from('questions')
  .select('*')
  .or(`id.eq.${id},public_id.eq.${id}`)
  .limit(1)
  .maybeSingle();
if (!data) notFound();
```

### 필터 dropdown 데이터

- `lib/admin/filter-options.ts`의 `getFilterOptions()` (React `cache()`로 per-request dedup) — 페이지에서 직접 호출
- 단일 RPC `get_questions_filter_options()` 호출 → JSON 객체로 5개 distinct 배열 반환:
  ```ts
  type FilterOptions = {
    rounds: number[];     // round desc (최신 회차 위로)
    years: number[];      // year desc
    sessions: number[];   // session asc (1~4교시)
    subjects: string[];   // subject asc
    categories: string[]; // category asc
  };
  ```
- 일반 `.select('round')` 방식은 1000행 cap 함정에 노출 → RPC가 안전

## Error handling / edge cases

### 권한 가드 매트릭스

| 상태 | 처리 | 토스트 |
|---|---|---|
| 비로그인 | `redirect('/auth/login?next=/admin')` | 없음 |
| role=user | `redirect('/dashboard')` | 없음 (silent) |
| role=reviewer | `redirect('/dashboard')` | 없음 (PR-A 차단) |
| role=admin + is_active=false | `redirect('/dashboard')` | 없음 |
| profile 행 없음 | `redirect('/dashboard')` | 없음 |
| role=admin + is_active=true | 통과 | — |

### `/admin/questions` 엣지

- `page` 음수/문자/0/totalPages 초과: `Math.max(1, Math.min(parsed, totalPages))` 클램프
- `sort` 미지정/잘못: `'recent'` 폴백
- `round/year/session` NaN: 필터만 silent drop
- `is_active` 비-boolean: 무시
- 검색어 sanitize: 영숫자/한글/공백/하이픈만 허용, 100자 cap, 토큰화 0 (단일 ilike OR)
- 빈 결과: 빈 상태 메시지 + 필터 초기화 링크

### `/admin/questions/[id]` 엣지

- `decodeURIComponent` 실패 → try/catch → 원본 그대로 (PR #30 패턴)
- 양쪽 컬럼 매치 0 → `notFound()`
- 동일 id 충돌 (이론상): `limit(1).maybeSingle()` 안전망

### 대시보드 카운트

- RPC 실패 시 해당 카드 `—` + silent 로그
- 4건 중 일부만 실패 → 실패한 카드만 `—`

### 저작권 가드

- admin 컴포넌트만 round/session/year 노출
- 공개 페이지 링크는 `/questions/{public_id ?? id}` (raw id 노출 0)
- 공개 컴포넌트(QuestionCard 등) admin에서 재사용 금지 (네임스페이스 분리)

## Migration

### `20260429000000_admin_count_distinct.sql`

```sql
-- 1. 단일 컬럼 distinct 카운트 (대시보드 카드 3,4)
create or replace function public.count_questions_distinct(col text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result integer;
begin
  if col not in ('round', 'category', 'subject', 'session', 'year') then
    raise exception 'invalid column: %', col;
  end if;
  execute format('select count(distinct %I) from public.questions where %I is not null', col, col)
    into result;
  return result;
end;
$$;

revoke execute on function public.count_questions_distinct(text) from public, anon;
grant execute on function public.count_questions_distinct(text) to authenticated;

-- 2. 필터 dropdown 옵션 통합 (목록 페이지) — admin 전용
-- 저작권 가드: round/year 값 자체가 회차 정보 노출이므로 함수 내부에서 admin 체크
create or replace function public.get_questions_filter_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  select role::text into caller_role
    from public.profiles
    where id = auth.uid() and is_active;

  if caller_role is null or caller_role <> 'admin' then
    raise exception 'access denied' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'rounds',     coalesce((select jsonb_agg(r order by r desc) from (select distinct round     as r from public.questions where round     is not null) s), '[]'::jsonb),
      'years',      coalesce((select jsonb_agg(r order by r desc) from (select distinct year      as r from public.questions where year      is not null) s), '[]'::jsonb),
      'sessions',   coalesce((select jsonb_agg(r order by r asc ) from (select distinct session   as r from public.questions where session   is not null) s), '[]'::jsonb),
      'subjects',   coalesce((select jsonb_agg(r order by r asc ) from (select distinct subject   as r from public.questions where subject   is not null) s), '[]'::jsonb),
      'categories', coalesce((select jsonb_agg(r order by r asc ) from (select distinct category  as r from public.questions where category  is not null) s), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.get_questions_filter_options() from public, anon;
grant execute on function public.get_questions_filter_options() to authenticated;
```

- `count_questions_distinct`: `security definer` + 컬럼 화이트리스트 → SQL 인젝션 방어. 카운트 숫자만 반환 (회차 누설 0)
- `get_questions_filter_options`: 회차/연도 **값 자체**를 반환하므로 함수 내부에서 admin 체크. 일반 사용자가 직접 RPC 호출해도 `42501` 에러
- types.ts에 `Functions.count_questions_distinct`, `Functions.get_questions_filter_options` 추가

### 적용 순서 (메모리 함정 회피)

1. 마이그레이션 파일 git commit (재현성)
2. PR-A 머지 직전 **Supabase Studio SQL Editor 직접 실행** (CLI db push "up to date" 함정 회피)
3. `select public.count_questions_distinct('round');` sanity check
4. PR 머지

## Verification (수동 검증 시나리오)

PR-A 자동 테스트 0. 머지 전 다음 시나리오 통과 확인:

- [ ] 비로그인 → `/admin` → `/auth/login?next=/admin` redirect
- [ ] 일반 user 진입 → `/admin` → `/dashboard` redirect (silent)
- [ ] reviewer 진입 → `/admin` → `/dashboard` redirect (silent)
- [ ] 비활성 admin 진입 → `/dashboard` redirect
- [ ] admin 진입 → `/admin` 대시보드 카운트 4 표시
- [ ] NavBar에 admin만 "운영" pill 노출 (다른 역할은 안 보임)
- [ ] `/admin/questions` 빈 필터 → 50건 + 총 페이지 표시
- [ ] 필터 라운드/카테고리 적용 → URL `?round=&category=` 동기화
- [ ] 정렬 토글 3종 각각 동작 (recent/round/kvle)
- [ ] 페이지 이동 1→2→1 동작
- [ ] 검색어 입력 → 300ms 후 URL 동기화
- [ ] 검색어 특수문자(`,`, `.`, 한자 등) 정규화 통과
- [ ] 상세 진입 KVLE-NNNN → 풀 필드 + round/session/year 표시
- [ ] 상세 진입 raw 한글 id → 동일 표시 (decode fallback)
- [ ] 상세 "공개 페이지로 이동" → KVLE 라우트 새 탭 열림
- [ ] 모바일 햄버거 → drawer 열림/닫힘
- [ ] 비활성 사이드바 nav 클릭 시 이동 0

## File budget

추정 ~14 task (writing-plans에서 세분화). §16 PR-A와 비슷한 사이즈.

신규 14 / 수정 1 (`components/NavBar.tsx`) / 마이그 1.

## Out of scope (PR-B 이후 예고)

- `app/admin/questions/new`, `/admin/questions/[id]/edit` (생성/수정 form)
- RLS write 정책 (`questions update where role='admin'`)
- `admin_audit_logs` 기록 헬퍼 (`logAdminAction(action, target, before, after)`)
- 정정 제안 카운트 컬럼 + 처리 큐 UI
- `/admin/users` 회원/역할 관리
- `/admin/exams` 회차별 집계
- `/admin/moderation` 신고/정정 큐
- `/admin/audit` 감사 로그 뷰
