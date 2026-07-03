# B1 — Phase 2 (코드 CUTOVER) 변경 목록

작성: 2026-07-03 · 상태: **✅ 구현 완료 (typecheck/build/lint 통과). 배포 전 마이그 2개 선적용 필요.**

## 구현 결과 (2026-07-03)

18개 파일 수정 + 마이그 2개 추가. 채택 방식: **API가 내부 id를 안 내보내고 `id` 자리에
public_id(KVLE)를 넣음** → 클라이언트 수십 곳 무수정, 내부 id는 클라에 아예 도달 안 함.
서버 쓰기/읽기는 `question_public_id` 컬럼으로 전환.

**배포 전 필수 (Supabase SQL Editor, 순서 무관하되 코드 배포 前):**
- `20260703000001_b1_question_id_nullable.sql` — 구 question_id NOT NULL 해제 (⚠️ 이거 없으면 배포 즉시 모든 INSERT 실패)
- `20260703010000_b1_stats_summary_public_id.sql` — 대시보드 RPC 누출 차단
- (`20260703000000` Phase 1 expand는 이미 적용됨)

**검증:** `npx tsc --noEmit` 클린 / `next build` 성공 / `eslint` 0 에러 / `check:migrations` ok.

**알려진 한계 (비차단):**
- 게스트 localStorage 오답노트가 배포 전 내부 id로 저장돼 있으면, 로그인 시 그 값이
  wrong_notes.question_public_id에 그대로 들어감(FK 없어 저장은 됨, 표시 정상). 재응답 시 KVLE로 자연 교체.
- question_corrections **insert 경로**는 코드에 없음(현재 0행, admin RPC/수동). 향후 propose insert 추가 시 question_public_id 세팅 필요.

---

작성: 2026-07-03 · 원래 상태: 검토 대기
선행: Phase 1 마이그레이션 `vet-exam-ai/supabase/migrations/20260703000000_b1_add_question_public_id.sql` (작성 완료, 적용 대기)
플랜 원본: `.omo/plans/b1-internal-id-exposure-migration.md`
인벤토리 근거: 코드베이스 전수 grep (2026-07-03)

## 목표 한 줄

공개 표면(API 응답·RPC 반환·딥링크)에서 내부 `questions.id`(`3.5_산과_63회_q011` = 회차+과목)를
완전히 제거하고 `public_id`(KVLE-xxxx)만 오가게 한다. 내부 id는 서버/admin 전용 PK로 유지.

## 핵심 설계 결정 (검토 필요)

**결정 1 — 클라이언트 식별자:** `Question.id`(내부) 필드를 **응답에서 제거**하고 클라이언트는
`publicId`(KVLE)만 사용. `lib/questions/types.ts`의 `id` 를 optional/서버전용으로 강등하거나
클라이언트 타입에서 삭제. (대안: `id` 자리에 public_id 값을 넣기 — 코드 변경 최소지만 의미 혼탁 → 비추천)

**결정 2 — 배포 순서(무중단):**
1. Phase 1 마이그(컬럼+백필+FK) 적용 → 새 컬럼 준비 (기존 코드는 여전히 `question_id` 사용, 무영향)
2. Phase 2 코드 + RPC 마이그를 **한 배포로** 반영 → 쓰기/읽기가 `question_public_id`로 전환
3. 번인 후 Phase 3 마이그(구 `question_id` 컬럼/FK drop) — 별건

**결정 3 — RPC 변경은 Phase 2 배포와 함께 적용하는 별도 마이그(예: `20260703010000_b1_rpcs_public_id.sql`)로 묶는다.**

---

## A. 급소 — 클라이언트 라운드트립 (반드시 함께 바뀌어야 깨지지 않음)

내부 id가 클라 → 서버로 되돌아가 `attempts`/`wrong_notes` FK 키가 되는 경로. 순서 어긋나면 답변 기록이 깨진다.

| # | 파일:라인 | 현재 | 변경 |
|---|---|---|---|
| A1 | `app/api/questions/route.ts:40` `QUESTION_SELECT` | `id, public_id, ...` | 내부 `id`는 select 유지(서버 조회용), **응답 매핑에서 제외** |
| A2 | `app/api/questions/route.ts:48` `toQuestion` | `id: row.id, publicId, year, source` | `id` 제거, `publicId` 필수화, **`year`·`source` 응답 제외**(year=INTERNAL-only) |
| A3 | `app/api/questions/route.ts:69` `toQuestionSummary` | `id: row.id` | `id` 제거, `publicId`만 |
| A4 | `lib/questions/types.ts:6,7,19` | `id`, `publicId?`, `year?`(INTERNAL) | 클라 타입에서 `id` 제거·`publicId` 필수, `year`/`source` 서버 전용 분리 |
| A5 | `components/QuestionCard.tsx:91` | `questionId: question.id` | `questionId: question.publicId` (KVLE 전송) |
| A6 | `lib/hooks/useQuestion.ts:26` | `?id=${questionId}` | 그대로 OK (API가 이미 `public_id`로 조회, `route.ts:227`). 파라미터 값만 KVLE가 됨 |

## B. attempts 쓰기 (client-direct)

| # | 파일:라인 | 변경 |
|---|---|---|
| B1 | `lib/attempts/types.ts:3` | `questionId` 의미 = KVLE로 변경 (필드명 유지 가능) |
| B2 | `lib/attempts/supabaseRepo.ts:18` | `question_id: payload.questionId` → **`question_public_id: payload.questionId`** |
| B3 | `lib/supabase/types.ts:120,131` | attempts Row/Insert에 `question_public_id: string` 추가 (구 `question_id`는 Phase 3까지 유지) |

## C. wrong_notes 쓰기 (client-direct)

| # | 파일:라인 | 변경 |
|---|---|---|
| C1 | `lib/wrongNotes/supabaseRepo.ts:49` | `question_id: note.questionId` → `question_public_id: note.questionId` |
| C2 | `lib/wrongNotes/supabaseRepo.ts:66` | `onConflict: "user_id,question_id"` → **`"user_id,question_public_id"`** (Phase 1이 UNIQUE 인덱스 생성함) |
| C3 | `lib/wrongNotes/migrateGuestNotes.ts:42` | 동일 전환 + onConflict |
| C4 | `lib/wrongNotes/localStorageRepo.ts:26` | 게스트 로컬 저장은 `questionId`(=KVLE)로 자연 통일. 마이그레이션 시 기존 로컬 키가 내부 id면 1회 매핑 필요 여부 검토 |
| C5 | `lib/supabase/types.ts:185,200` | wrong_notes Row/Insert에 `question_public_id: string | null` 추가 |

## D. comments (서버 라우트)

| # | 파일:라인 | 변경 |
|---|---|---|
| D1 | `lib/comments/schema.ts:17` | `question_id` 입력 = KVLE 수용 (min(1) 대신 KVLE 패턴 검증 권장) |
| D2 | `app/api/comments/route.ts:186,259` | POST insert: `question_public_id` 컬럼에 저장 |
| D3 | `app/api/comments/route.ts:40,100,109` | GET: `question_public_id` select + `.in("public_id", ...)`로 questions 조회. **응답에서 `questionId` 제외 여부 결정**(현재 CommentPreview에 노출 중) |
| D4 | `app/api/comments/votes-mine/route.ts:9,26` | 파라미터·필터 `question_public_id` |
| D5 | `app/api/comments/reports-mine/route.ts` | 동일 |
| D6 | `app/api/comments/pins/route.ts:15,35,105` | 파라미터·필터 + `onConflict: "user_id,question_public_id"` (※ comment_pins 테이블도 Phase 1에 컬럼/인덱스 추가 필요 — **아래 미해결 1 참조**) |
| D7 | `app/api/comments/correction-status/route.ts:19,36` | 파라미터·필터 `question_public_id` (question_corrections 테이블 — **미해결 1**) |
| D8 | `lib/comments/list.ts:9`, `lib/comments/schema.ts` | `questionId` 타입 = KVLE |
| D9 | `lib/cron/comment-seeding.ts:32,328` | 하드코딩 내부 id `"1.1_해부_66회_q003"` → 해당 KVLE로 교체 (또는 seed 시 public_id 조회) |
| D10 | `lib/supabase/types.ts:292,313` | comments Row/Insert에 `question_public_id` 추가 |

## E. RPC (별도 마이그 + 호출부)

| # | 대상 | 변경 |
|---|---|---|
| E1 | `get_my_stats_summary` (`supabase/migrations/20260605000000_...`) | recentAttempts select `question_id` → `question_public_id`. 타입 `lib/supabase/types.ts:904-915` 동기화 (**대시보드 누출 차단**) |
| E2 | `search_comments` (`.../20260608000000_...`) | 반환에서 `question_id` 제거 (`question_public_id` 이미 존재). 타입 `types.ts:1016-1028` |
| E3 | `search_questions` (`.../20260505000000_search_v1.sql` 계열) | 반환에서 내부 `id` 제거 (`public_id` 유지). 타입 `types.ts:996-1006`, 호출부 `app/api/search/route.ts:66` |

## F. 딥링크 / 알림

| # | 파일:라인 | 변경 |
|---|---|---|
| F1 | `lib/notifications/format.ts:22-23` `buildCommentHref` | `rel.question_id` → `rel.question_public_id` (현재 **내부 id를 딥링크로 노출**) |
| F2 | `lib/notifications/format.ts:26-31` `buildQuestionHref` | 이미 `question_public_id` 우선 — fallback의 `question_id` 제거 |
| F3 | `app/questions/[id]/page.tsx` + `useQuestion` | 이미 public_id 수용. cutover 후 legacy 내부 id URL은 404 → 선택적 redirect 검토 |

## G. Admin / 서버 전용 — **변경 불필요 (내부 id 유지 정당)**

클라이언트에 노출되지 않으므로 그대로 둔다:
- `app/admin/corrections/page.tsx`, `app/admin/image-questions/page.tsx`, `app/admin/quality/page.tsx`
- `lib/admin/triage.ts` (RPC `p_question_id` 내부 사용)
- `lib/og/fetch-meta.ts:47` (댓글 count 서버 조회는 내부 id OK)
- `app/profile/[nickname]/page.tsx`, `app/api/profile/[user_id]/comments` — 응답에 question_id 미노출(서버 조회만). **단 딥링크 만들 때 public_id 써야 하면 F와 함께 점검**

---

## 미해결 / 추가 확인 (검토 시 결정)

1. ~~comment_pins / question_corrections 테이블도 `question_id` FK 보유~~ **해결됨** —
   두 테이블 정의 확인(둘 다 `question_id → questions(id)`, 라이브 0행) 후 **Phase 1 마이그에 블록 4·5로 추가 완료.**
   D6 핀 onConflict용 UNIQUE(`user_id,question_public_id`)도 포함.
2. **CommentPreview 응답의 `questionId` 노출** — 클라가 딥링크 만들 때 필요할 수 있음. KVLE로 바꿔 노출하면 안전. 완전 제거 vs KVLE로 대체 결정.
3. **localStorage 게스트 오답노트(C4)** — 기존 로컬 키가 내부 id인 사용자의 1회 마이그레이션 매핑 필요 여부.
4. **legacy 내부 id URL redirect(F3)** — 카톡 등에 이미 뿌려진 내부 id 링크가 있으면 404. 초기라 무시 가능하나 확인.

## 검증 (Phase 2 배포 전, staging 권장 / 최소 로컬)

- `/api/questions` 응답에 내부 `id`·`year`·`source` **없음** 확인
- 답변 제출 → `attempts.question_public_id` 채워짐 / 오답 → wrong_note KVLE로 생성 / 정답 재시도 삭제
- 댓글 생성·조회·검색·핀·투표·신고 KVLE 기준 동작
- 대시보드 recentAttempts에 내부 id 없음
- 알림 딥링크가 KVLE로 해소
- `npm run ci` (check:migrations + lint + typecheck + build) green + `smoke:public` 15/15

## 규모

- Phase 1 마이그: 1파일 (작성 완료, +comment_pins/corrections 블록 추가 예정)
- Phase 2 코드: ~20 파일 (A~F) + RPC 마이그 1파일 (E)
- Phase 3 마이그(contract): 1파일, 번인 후 별건
