# M3 §16 — 유저 프로필 / 뱃지 페이지

**날짜:** 2026-04-27
**범위:** ROADMAP §16 (F9 — 유저 프로필) MVP
**선행 의존성:** M3 §14 (댓글 코어), §15 (vote/sort/report/blind), §17 (알림 MVP) 머지 완료
**관련 메모리:** project_report_blind_done, project_vote_sort_done, project_comment_replies_resume

---

## 1. 배경

PRD §F9 / ROADMAP §16은 "공개 프로필 + 5종 뱃지(MVP)"를 정의한다. 현재 상태:

- DB 인프라 완비. `user_profiles_public` (nickname/bio/target_round/university + visibility 토글 2종), `badges` (5종 enum, unique user_id+type), 자동 grant 트리거(newbie/first_contrib/popular_comment)는 이미 가동 중.
- **누락은 UI 전부.** 어떤 페이지/컴포넌트도 `user_profiles_public`이나 `badges`를 노출하지 않음. 댓글 작성자도 nickname만 텍스트로 표시되고 클릭 동선/뱃지 없음.
- 자동 grant 뱃지는 PR-A 머지 시점부터 누적 중 (popular_comment는 §15 PR-A 머지 후 vote_score>=10 댓글 작성자에게 자동 grant). 현재까지 `badges` 테이블에 row가 적립돼 있어도 가시화 경로가 없는 상태.

이 spec은 두 PR로 분할해 (PR-A 페이지/편집/마이그, PR-B 댓글 인라인 합류) §16을 마무리한다.

---

## 2. 결정 11항목

| # | 항목 | 결정 |
|---|---|---|
| 1 | 라우팅 | A. `/profile/[nickname]` 단일. 본인일 때 편집 UI 노출. |
| 2 | 편집 UI 형태 | C. 인라인 토글 (별도 페이지/모달 없음). |
| 3 | 댓글 목록 노출 | A. 본인/타인 동일하게 최근 20개 + 더 보기 페이지네이션. |
| 4 | 활동 통계 | A + (a). 작성 댓글 수 + `sum(vote_score)` + 가입일. |
| 5 | 댓글 인라인 뱃지 | B. 운영자/검수자/인기 댓글만. 새내기/첫 기여는 프로필에서만. |
| 6 | 본인 진입점 | A. NavBar user pill을 `/profile/[my-nickname]` 링크로 전환. 댓글 nickname도 같이 링크화. |
| 7 | 닉네임 변경 정책 | C. 임시 닉네임 또는 `nickname_changed_at IS NULL`일 땐 자유, 그 외 30일 1회 제한. 마이그 1. |
| 8 | vote_score 합계 계산 | A. on-the-fly `sum(vote_score)` 쿼리. denormalized 컬럼 없음. |
| 9 | 비공개 토글 | A. 현재 스키마 그대로 (target_round/university 2종, bio는 항상 공개). |
| 10 | 임시 닉네임 안내 | A + C. 프로필 상단 배너만 (본인 + nickname matches `^user_[0-9a-f]{8}$`). 가입 폼/댓글 작성 강제는 범위 밖. |
| 11 | PR 분할 | B. PR-A (페이지+편집+마이그) / PR-B (댓글 인라인 뱃지+nickname 링크+NavBar pill). |

---

## 3. 라우팅 / 데이터 흐름

### 3.1 라우트

- `app/profile/[nickname]/page.tsx` — Next.js dynamic segment, RSC.
- URL의 nickname은 한글 가능 → `decodeURIComponent(params.nickname)` 후 사용.
- nickname not found → `notFound()` → 기본 404 페이지.

### 3.2 RSC 서버 로드 순서

1. `user_profiles_public.select("*").eq("nickname", decodedNickname).maybeSingle()`
2. profile 없으면 `notFound()`.
3. **두 쿼리 stitch** (embedded join 함정 회피 — comment_core_done 학습):
   - `badges.select("badge_type, awarded_at").eq("user_id", profile.user_id)`
   - `comments.select("id, question_id, body_text, vote_score, type, created_at").eq("user_id", profile.user_id).eq("status", "visible").order("created_at", desc).range(0, 19)` — 21번째 row peek으로 has_more
4. 별도 `comments.select("vote_score", count: 'exact').eq("user_id", profile.user_id).eq("status", "visible")` aggregate — `sum(vote_score)`는 RPC 또는 PostgREST 표현식. 가장 단순한 형태:
   - `supabase.rpc("get_user_total_vote_score", { uid: profile.user_id })` — 새 RPC 함수 1개 (마이그에 포함).
5. 댓글 카드에 question stem 미리보기 표시용 → `questions.select("id, stem").in("id", commentQuestionIds)` 별도 fetch.
6. 본인 여부: `await supabase.auth.getUser()` → `data.user?.id === profile.user_id`.
7. 응답 마스킹: `target_round_visible=false`이면 본인이 아닌 한 `target_round=null`로 마스킹. university도 동일.

### 3.3 클라이언트 hydration

본인일 때만 RSC가 `<ProfileEditController>` 클라이언트 컴포넌트 마운트. 편집 모드 토글, form state, PATCH 호출 담당. 저장 성공 시 `router.refresh()` 호출 → RSC 재로드.

---

## 4. 페이지 레이아웃

```
┌──────────────────────────────────────────────────────────┐
│ [임시 닉네임 배너 — 본인 + nickname matches user_xxx]    │
├──────────────────────────────────────────────────────────┤
│ HEADER                                                   │
│  Nickname (kvle-serif, 34px)        [편집 / 저장 / 취소]│
│  자기소개(bio) — 줄바꿈 보존                             │
│  메타: 준비 회차 · 대학 · 가입 N개월차                   │
├──────────────────────────────────────────────────────────┤
│ STATS — 3-up grid (StatCard 컴포넌트 재활용)             │
│  작성 댓글 N    받은 추천 합계 N    가입일 yyyy-mm-dd    │
├──────────────────────────────────────────────────────────┤
│ BADGES                                                   │
│  [운영자] [검수자] [새내기] [첫 기여] [인기 댓글]        │
│  보유 뱃지 강조. 자동 grant 미보유는 회색 outline.       │
│  운영자/검수자(수동 부여)는 미보유 시 숨김.              │
├──────────────────────────────────────────────────────────┤
│ MY COMMENTS                                              │
│  최근 20개. 카드: question stem 80자 + body_text 120자   │
│   + vote_score + 작성일 + type 라벨. 클릭 → /questions/.│
│  하단 [더 보기 ▾] 페이지네이션 (offset 20씩)             │
└──────────────────────────────────────────────────────────┘
```

### 4.1 임시 닉네임 배너

- 본인 + nickname이 `^user_[0-9a-f]{8}$`에 매칭될 때만 노출
- "닉네임을 설정해 주세요. 임시 닉네임 상태에서 작성한 댓글에는 `user_xxxxxxxx`로 표시됩니다. [편집 →]"
- 클릭 시 편집 모드 진입 + nickname input focus

### 4.2 편집 모드

HEADER 영역만 폼으로 전환. 다른 섹션은 read-only 유지.

| 필드 | 입력 | 제약 |
|---|---|---|
| nickname | text + 잠금 해제 버튼 | 2~16자, `^[가-힣a-zA-Z0-9_]+$`, 30일 제한 (섹션 5) |
| bio | textarea | 0~500자 |
| target_round | number | 1~200 |
| target_round_visible | checkbox "공개" | — |
| university | text | 0~50자 |
| university_visible | checkbox "공개" | — |

[저장] [취소] 버튼. 저장 성공 → `router.refresh()`. 취소 → 폼 state 폐기 후 토글 닫기.

### 4.3 뱃지 시각화

- 보유 뱃지: 색상 chip (운영자=Shield/teal, 검수자=BadgeCheck/amber, 새내기=Sparkle/teal-dim, 첫 기여=Award/teal-dim, 인기 댓글=Flame/wrong)
- 자동 grant 미보유 (newbie/first_contrib/popular_comment 중 못 받은 것): 회색 outline + 텍스트 "미획득" — 하지만 newbie는 가입 즉시 자동 grant되므로 사실상 항상 보유, fallback 안내 정도.
- 수동 grant 미보유 (운영자/검수자): 숨김 (자력으로 못 얻음 → 노출 동기 없음)

---

## 5. 닉네임 변경 정책 (옵션 C)

### 5.1 마이그레이션 `20260428000000_user_profiles_public_nickname_changed_at.sql`

```sql
alter table public.user_profiles_public
  add column nickname_changed_at timestamptz;

comment on column public.user_profiles_public.nickname_changed_at is
  'NULL = 최초 임시 닉네임 상태. 본 닉네임 첫 설정 시 set, 이후 매 변경마다 갱신. 30일 1회 제한 enforce용.';

create or replace function public.is_temp_nickname(n text)
returns boolean language sql immutable as $$
  select n ~ '^user_[0-9a-f]{8}$';
$$;

create or replace function public.get_user_total_vote_score(uid uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(vote_score), 0)::integer
    from public.comments
   where user_id = uid and status = 'visible';
$$;
```

### 5.2 PATCH 검증 흐름

1. nickname 변경 요청 발생 시 (즉, body의 nickname이 현재 row의 nickname과 다를 때):
   - `current.nickname`이 임시 닉네임이거나 `current.nickname_changed_at IS NULL` → **자유 변경 허용**
   - 그 외 + `now() - nickname_changed_at < interval '30 days'` → 400 `{ error: "nickname_change_too_soon", next_change_available_at: ts }`
   - 통과 → update에 `nickname_changed_at = now()` 같이 set
2. unique constraint 위반 (23505) → 400 `{ error: "nickname_taken" }`
3. 형식/길이 위반 → zod 단계에서 400

### 5.3 클라 UI

- 편집 모드 진입 시 nickname input은 기본 disabled
- "닉네임 변경" 잠금 해제 버튼 클릭 → input enabled + 안내문 "변경 후 30일 동안 다시 바꿀 수 없습니다"
- 임시 닉네임 또는 `nickname_changed_at IS NULL` → 잠금 해제 버튼 항상 활성, 안내문 동일
- 30일 미만 + 본 닉네임 → 잠금 해제 버튼 비활성, 안내문 "다음 변경 가능: yyyy-mm-dd"

---

## 6. API 설계

### 6.1 RSC fetch (`/profile/[nickname]/page.tsx`)

별도 API route 없이 RSC가 서버 supabase client로 직접 호출. 5번 query (profile / badges / comments page-1 / questions stems / total_vote_score RPC) + auth.getUser().

### 6.2 `PATCH /api/profile`

- Auth required (signed-out → 401)
- Body schema (zod):
  ```ts
  const profileUpdateSchema = z.object({
    nickname: z.string().min(2).max(16).regex(/^[가-힣a-zA-Z0-9_]+$/).optional(),
    bio: z.string().max(500).nullable().optional(),
    target_round: z.number().int().min(1).max(200).nullable().optional(),
    university: z.string().max(50).nullable().optional(),
    target_round_visible: z.boolean().optional(),
    university_visible: z.boolean().optional(),
  });
  ```
- 동작: zod parse → nickname 변경 케이스면 5.2 검증 → `update("user_profiles_public").eq("user_id", auth.uid()).select().single()` (RLS가 owner-only)
- 응답: 마스킹 적용된 본인 row

### 6.3 `GET /api/profile/[user_id]/comments?offset=N&limit=20`

- Auth 불필요 (world-readable)
- 응답:
  ```ts
  {
    comments: Array<{
      id: string,
      question_id: string,
      question_stem_preview: string, // 80자
      body_text_preview: string,     // 120자
      vote_score: number,
      type: comment_type,
      created_at: string,
    }>,
    has_more: boolean,
  }
  ```
- 두 쿼리 stitch: `comments` 페이지 → question_id 모음 → `questions.select("id, stem").in("id", ids)` → 클라이언트에서 매핑
- limit fixed 20, offset은 0/20/40/...

### 6.4 helper `lib/profile/maskPrivacy.ts`

```ts
export function maskProfile(
  profile: UserProfilePublicRow,
  isOwner: boolean,
): UserProfilePublicRow {
  if (isOwner) return profile;
  return {
    ...profile,
    target_round: profile.target_round_visible ? profile.target_round : null,
    university: profile.university_visible ? profile.university : null,
  };
}
```

RSC와 PATCH 응답 둘 다 사용. visibility 토글 자체는 본인이 아니어도 응답에 포함되지만 (UI에서 노출 안 함) 마스킹된 값과 함께면 무해.

---

## 7. PR-B (댓글 인라인 합류)

### 7.1 신규 컴포넌트 `CommentAuthorInline.tsx`

```tsx
interface Props {
  userId: string | null;          // null = 탈퇴
  nickname: string;               // "탈퇴한 사용자" 가능
  badges: BadgeType[];            // operator/reviewer/popular_comment만 필터됨
  size?: 'small' | 'normal';      // 답글은 small
}
```

- nickname을 `<Link href={'/profile/' + encodeURIComponent(nickname)}>`로 감쌈 (userId가 null이면 plain span)
- 옆에 인라인 뱃지 chip 노출 (Shield / BadgeCheck / Flame, lucide-react)
- 색상은 design tokens 변수 (`var(--teal)`, `var(--amber)`, `var(--wrong)`) — Tailwind v4 함정 회피용 inline style

### 7.2 CommentThread fetch 보강

기존 CommentThread는 댓글 fetch 후 `user_profiles_public`을 별도 호출해서 nickname 조립 중. 같은 흐름에 **`badges` 한 번 더** 조회:

```ts
const userIds = comments.map(c => c.user_id).filter(Boolean);
const [profiles, badges] = await Promise.all([
  supabase.from('user_profiles_public').select('user_id, nickname').in('user_id', userIds),
  supabase.from('badges').select('user_id, badge_type')
    .in('user_id', userIds)
    .in('badge_type', ['operator', 'reviewer', 'popular_comment']),
]);
const authorMap = new Map(/* userId -> { nickname, badges: BadgeType[] } */);
```

CommentItem / ReplyGroup에 `authorMap` prop drilling. 답글에도 동일 적용 (size="small").

### 7.3 NavBar pill 링크화

`components/NavBar.tsx`의 user pill 영역을 `<Link href={'/profile/' + encodeURIComponent(myNickname)}>`로 감쌈. signed-in 분기 안에서. 임시 닉네임이어도 정상 작동 (페이지에서 배너 노출).

myNickname은 NavBar에서 `useAuth()` 외에 `user_profiles_public` 단건 fetch 필요 → `lib/hooks/useMyNickname.ts` 신규 (또는 기존 useAuth 확장).

### 7.4 익명 댓글

`user_id IS NULL` (작성자 탈퇴 cascade) → "탈퇴한 사용자" 텍스트, 링크 없음, 뱃지 없음. PRD §A의 "탈퇴 시 댓글 익명화" 정책 준수.

---

## 8. 에러 / 엣지 케이스

| 상황 | 처리 |
|---|---|
| 존재하지 않는 nickname | `notFound()` → 기본 404 |
| 한글 nickname URL | `encodeURIComponent` (Link 생성 시) / `decodeURIComponent` (params 수신 시) |
| nickname unique 충돌 | DB 23505 catch → 400 `nickname_taken` |
| 30일 제한 위반 | 400 `nickname_change_too_soon` + `next_change_available_at` |
| 임시 닉네임 → 본 닉네임 첫 변경 | `nickname_changed_at` 처음 set, 이후부터 30일 제한 적용 |
| privacy false 필드 | 서버에서 마스킹 (null) |
| 본인 식별 검증 | 클라 신뢰 안 함, RLS owner-only update가 강제 |
| 작성 댓글 없음 | "아직 작성한 댓글이 없습니다" 빈 상태 |
| 본인 보유 뱃지 0개 | 자동 grant 트리거가 newbie 보장. fallback 빈 상태 표시 |
| 익명 댓글 (user_id NULL) | "탈퇴한 사용자", 링크/뱃지 없음 |
| `total_vote_score` RPC 미적용 상태에서 페이지 로드 | RPC 없으면 RSC 에러 → 마이그 적용은 PR-A 머지 직후 즉시 |

---

## 9. 보안

- **마스킹 책임은 앱 계층.** RLS는 `user_profiles_public.world read`로 모든 컬럼 read 허용. visibility 토글 적용은 RSC와 PATCH 응답에서 `maskProfile` helper가 처리.
- **nickname URL 노출**은 unique constraint + 정규식 제약(`^[가-힣a-zA-Z0-9_]+$`)으로 SQL injection / XSS 무관.
- **PATCH 권한**은 RLS owner-only update가 강제. 클라가 다른 user_id를 보내도 row 매칭 안 됨.
- **30일 제한 우회 방지** — 클라에서 nickname을 임시 닉네임으로 잠시 변경해서 제한을 리셋하려 해도, 임시 닉네임 패턴 (`^user_[0-9a-f]{8}$`)은 사용자가 직접 입력 불가능 (uuid 8자리 prefix를 외워서 정확히 자기 것으로 맞추기 어렵고, 다른 사람의 임시 닉네임은 unique 충돌). 추가 가드 불필요.

---

## 10. PR 분할

### 10.1 PR-A — 프로필 페이지 + 편집 + 마이그

**머지 시점부터 보이는 것:**
- `/profile/[nickname]` 라우트로 누구나 본인/타인 프로필 조회 가능
- 본인일 때 인라인 편집 모드 (bio/target_round/university/visibility 토글)
- 본 닉네임 첫 설정 + 30일 1회 제한
- 뱃지 5종 시각화 (보유/미보유)
- 작성 댓글 페이지네이션
- 임시 닉네임 본인 배너

**Task 추정:** 마이그 1 + RPC 1 + RSC page 1 + 편집 controller 1 + PATCH endpoint 1 + comments endpoint 1 + helper 1 + StatCard 재활용 + 컴포넌트 5~6개. 약 10~12 task.

### 10.2 PR-B — 댓글 인라인 합류

**머지 시점부터 보이는 것:**
- 모든 댓글 작성자 nickname이 클릭 가능 → 프로필 이동
- 운영자/검수자/인기 댓글 뱃지가 댓글 옆에 인라인 노출
- NavBar user pill 클릭 시 본인 프로필로 이동

**Task 추정:** CommentAuthorInline 신규 + CommentThread fetch 보강 + CommentItem/ReplyGroup 작성자 슬롯 교체 + NavBar pill 링크화 + useMyNickname 훅. 약 6~8 task. 마이그 0.

---

## 11. 시딩 / 운영 영향

- **PR-A 머지 즉시** Seongju가 본인 프로필 진입해 닉네임/자기소개/준비회차 채워둘 수 있음 (현재 임시 닉네임 상태). 베타 시드 댓글이 본 닉네임으로 노출되도록 사전 준비.
- **운영자 뱃지 수동 grant**는 SQL Editor로 `insert into badges (user_id, badge_type, awarded_by) values (...)`. PR-B 머지 후 시드 운영자 댓글이 자동으로 [운영자] 뱃지를 달고 노출.

---

## 12. 후속 / V2

- **합격생 뱃지 (V2)** — `passed` 또는 별도 enum. 인증 워크플로우는 ROADMAP §26.
- **닉네임 history 테이블 (V2)** — 변경 이력 추적, impersonation 감사. 현재는 `nickname_changed_at` 단일 컬럼만.
- **프로필 통계 denormalized (P2)** — 베타 후 트래픽 보고 `user_profiles_public.total_vote_score` 등 추가 검토. 현재는 on-the-fly로 충분.
- **드롭다운 메뉴 (P3)** — NavBar pill 클릭 시 프로필/설정/로그아웃 드롭다운. 현재는 단일 링크.
- **댓글 작성 시점 임시 닉네임 강제 (P2)** — UX 결정, 별도 spec.
- **가입 폼에 nickname 필드 추가 (P2)** — `handle_new_user()` 트리거에서 user_meta_data 사용. ROADMAP §A에 정의되어 있으나 현재 PR 범위 밖.

---

## 13. 메모리 / 학습 적용

- **embedded join 함정** (comment_core_done) — comments↔user_profiles_public, comments↔badges는 두 쿼리 stitch.
- **CLI db push "up to date" 함정** (community_tables_done) — 마이그 PR-A에서 SQL Editor 우회 가능성 대비.
- **bash CWD inner-cd 잠김** (comment_replies_done) — subagent 단일 라인 chain.
- **subagent commit이 pre-staged 휩쓸기** (dday_widget_done) — explicit path + push 금지.
- **Tailwind v4 utility runtime 주입** (notifications_mvp_done) — inline style + CSS var.
- **literal-copy 직접 Write 최적화** (vote_sort_done, report_blind_done) — 단순 신규 컴포넌트는 controller 직접 Write로 subagent 호출 절약.
- **카테고리/이름 rename 시 denormalized 컬럼 주의** (report_blind_done) — 이번 PR엔 해당 없음 (rename 없음).

---

## 14. 자체 review 체크리스트

- [x] Placeholder 없음 (TBD/TODO 없음)
- [x] 결정 11항목과 본문 일관 (라우트/편집/PR 분할 등 모든 섹션이 §2 결정과 일치)
- [x] 단일 PR 범위 적절 (두 PR로 분할, 각 6~12 task로 적정)
- [x] 모호성 없음 (각 결정에 명확한 옵션 채택)
- [x] 보안 / RLS / 마스킹 책임 분리 명시
- [x] 함정 메모리 반영 (§13)
