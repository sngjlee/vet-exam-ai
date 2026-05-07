# 이미지 교체 — 분류 큐 인라인 업로드 + 사용자측 렌더링

**날짜**: 2026-05-07
**범위**: 이미지 큐(`/admin/image-questions`)에서 분류 작업 중 저작권 위험 원본을 admin이 직접 제작한 교체본으로 swap, 동시에 사용자측 `/questions/[id]` 페이지에서 교체본 렌더링까지 end-to-end 처리.
**제외**: 라이선스/출처 메타데이터, AI 자동 생성, 정형 검토 단계, 다중 admin 교차검수, 캡션 자동 라벨링, 이미지 부분 교체(슬롯별 granular), 별도 cron 기반 cleanup, 사용자측 댓글 이미지 검색.

## 핵심 결정 요약

| 항목 | 결정 | 사유 |
|---|---|---|
| PR 범위 | admin 업로드 + 사용자측 렌더링 한 PR | 교체 결과 즉시 검증 가능. Phase 2 별도 PR 분리 시 검증 단절 |
| 출처/메타 | 본인 자작 전제, 메타 컬럼 없음 (YAGNI) | 수의학 도해는 자작/AI/임상 사진이 주력. CC-BY 도입 시 마이그 1개로 추가 가능 |
| 교체 단위 | 전체 swap (all-or-nothing). 모든 슬롯 채워야 활성화 | UI 단순, 정합성 명확. 슬롯 인덱스 추적 비용 회피 |
| 업로드 UI | 카드 인라인 + 즉시 활성화 (1단계) | 1인 admin 분류 흐름 안에서 한 카드 끝까지 처리 |
| 원본 처리 | Storage 보존 (admin private RLS), DB 컬럼만 swap | 사용자 노출 0, revert 즉시 가능, 마이그 단순. 이번 PR 규모(201건)에서 cron archive ROI 부족 |
| 사용자측 렌더링 | inline + lightbox (`CommentImageGallery` 패턴 재사용) | 의학 도해는 thumbnail 가독성 부족, 확대 필수 |
| Storage 버킷 | 신규 public 버킷 `question-images-public` | 사용자측 단순 read, signed URL 인프라 회피 |
| 클라이언트 압축 | 기존 `lib/comments/imageCompress.ts` 재사용 | max ~1MB, 댓글 첨부와 동일 패턴 |
| 신규 status enum | `activate_with_replacement` 추가 (기존 5종 + 1) | `activate_no_image`와 병렬, audit/필터 일관 |
| 슬롯 0 문제 | 큐 entry 자체가 안 생김 (백필이 has_image만 entry 생성) | 별도 처리 불필요 |

## 데이터 모델 + 마이그

마이그 timestamp = `20260507000000_image_replacement.sql` (이미지 큐 1차 `20260506000000` 이후).

```sql
-- 1. enum 확장
alter type public.image_triage_status add value if not exists 'activate_with_replacement';

-- 2. 원본 백업 컬럼 (revert용)
alter table public.questions
  add column if not exists question_image_files_original    text[],
  add column if not exists explanation_image_files_original text[];

-- 3. 신규 public Storage 버킷
insert into storage.buckets (id, name, public)
values ('question-images-public', 'question-images-public', true)
on conflict (id) do nothing;

-- 4. RLS — 누구나 read만. write/update/delete는 service_role 경유 (RLS bypass)
drop policy if exists "public read replacement" on storage.objects;
create policy "public read replacement" on storage.objects
  for select to public
  using (bucket_id = 'question-images-public');
```

> Storage write는 admin API 라우트가 service_role 키로 처리 (`/api/admin/image-replacement/upload`). 댓글 업로드(`/api/comments/upload`)와 동일 패턴 — RLS bypass라 INSERT/UPDATE/DELETE 정책 불필요.

### 데이터 흐름
- **원본**: `question-images-private` (admin-only RLS) — 그대로 보존
- **교체본**: `question-images-public` (전세계 read) — 신규 버킷
- **DB**: `questions.{question,explanation}_image_files`는 활성 파일명만, 원본 파일명은 `_original` 컬럼에 백업 (NULL이면 미교체 상태)
- **사용자측**: DB 컬럼 → public 버킷 URL 단순 lookup

### 파일명 규칙
pipeline의 hex slug 패턴(`pipeline/_storage_key.py`)을 TS로 포팅. Admin 업로드 키:
```
<question_id_slug>_<role>_<index>_<unix_ts>.webp
```
- `question_id_slug` = `lib/admin/storage-key.ts`의 `toStorageKey()` 결과 (Python `_storage_key.py`와 동일 hex 인코딩 — 한글 → UTF-8 byte hex). KVLE-NNNN 같은 ASCII id는 no-op.
- `role` = `q`(문제) 또는 `e`(해설)
- `index` = 0-based 슬롯 인덱스
- `unix_ts` = 충돌 회피 + 재교체 시 CDN 캐시 무효화
- 확장자는 항상 `.webp` (클라이언트 압축이 webp로 변환)

### TS slug 헬퍼 (신규: `lib/admin/storage-key.ts`)
```ts
export function toStorageKey(input: string): string {
  // Replace each non-ASCII char with its UTF-8 byte hex sequence.
  return input.replace(/[^\x20-\x7e]/g, (ch) => {
    const bytes = new TextEncoder().encode(ch);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  });
}
```
Python `_storage_key.py`와 동일 출력 (e.g. `해부` → `ed95b4ebb680`). 운영 일관성 확보.

## 신규 RPC: `triage_question_replace_and_activate`

```sql
create or replace function public.triage_question_replace_and_activate(
  p_question_id        text,
  p_question_files     text[],   -- 새 파일명 (public 버킷, 슬롯 순서)
  p_explanation_files  text[],
  p_note               text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_q_count_existing int;
  v_e_count_existing int;
  v_q_count_new      int;
  v_e_count_new      int;
begin
  if not exists (select 1 from profiles
                  where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'forbidden: admin only';
  end if;

  select coalesce(array_length(question_image_files, 1), 0),
         coalesce(array_length(explanation_image_files, 1), 0)
    into v_q_count_existing, v_e_count_existing
    from questions where id = p_question_id;

  v_q_count_new := coalesce(array_length(p_question_files, 1), 0);
  v_e_count_new := coalesce(array_length(p_explanation_files, 1), 0);

  if v_q_count_new <> v_q_count_existing then
    raise exception 'replacement slot count mismatch (question): expected %, got %',
      v_q_count_existing, v_q_count_new;
  end if;
  if v_e_count_new <> v_e_count_existing then
    raise exception 'replacement slot count mismatch (explanation): expected %, got %',
      v_e_count_existing, v_e_count_new;
  end if;

  update questions
     set question_image_files_original    = coalesce(question_image_files_original,    question_image_files),
         explanation_image_files_original = coalesce(explanation_image_files_original, explanation_image_files),
         question_image_files             = coalesce(p_question_files,    '{}'),
         explanation_image_files          = coalesce(p_explanation_files, '{}'),
         is_active                        = true
   where id = p_question_id;

  insert into question_image_triage (question_id, status, note, decided_by)
  values (p_question_id, 'activate_with_replacement', p_note, v_admin_id)
  on conflict (question_id) do update
    set status     = 'activate_with_replacement',
        note       = excluded.note,
        decided_by = excluded.decided_by,
        decided_at = now(),
        updated_at = now();

  perform log_admin_action('image_triage_decide'::audit_action, 'question',
    p_question_id, null,
    jsonb_build_object('status',  'activate_with_replacement',
                       'q_files', p_question_files,
                       'e_files', p_explanation_files,
                       'note',    p_note),
    null);
end $$;

revoke all on function public.triage_question_replace_and_activate(text, text[], text[], text) from public;
grant execute on function public.triage_question_replace_and_activate(text, text[], text[], text) to authenticated;
```

### 기존 `triage_question_revert` 확장

```sql
-- 핵심 변경: _original 백업이 있으면 거기서 복원
update questions
   set question_image_files    = coalesce(question_image_files_original,    question_image_files),
       explanation_image_files = coalesce(explanation_image_files_original, explanation_image_files),
       question_image_files_original    = null,
       explanation_image_files_original = null,
       is_active                = not ('has_image' = any(tags))
 where id = p_question_id;
```
교체본 public 버킷 파일은 **삭제하지 않음** (재교체 시 재사용 가능, 사용자 노출은 DB swap만으로 즉시 차단됨 — 사용자측 렌더링은 원본 `question_image_files`를 보고 private 버킷에 요청 → 403). 정기 cleanup은 별건 cron 외부 스코프.

## Admin UI — TriageCard 인라인 폼

### 카드 레이아웃 변경
기존 5개 액션 버튼 줄에 6번째 "교체 활성화" 버튼 추가 (primary 스타일, expandable 영역 토글).

```
[ 활성화 ] [ 재작성 필요 ] [ 도식 재제작 ] [ 라이선스 필요 ] [ 폐기 ] [ 교체 활성화 ▼ ]

(펼침 시)
┌─ 교체 이미지 업로드 ─────────────────────────┐
│ 문제 이미지 (3 슬롯)                          │
│ ┌────┐ → [파일 선택]                         │
│ │원본│   슬롯 1                               │
│ └────┘                                       │
│ ┌────┐ → [✓ 교체본 미리보기]                 │
│ │원본│   슬롯 2                               │
│ └────┘                                       │
│ ┌────┐ → [파일 선택]                         │
│ │원본│   슬롯 3                               │
│ └────┘                                       │
│                                              │
│ 해설 이미지 (1 슬롯)                          │
│ ┌────┐ → [파일 선택]                         │
│ │원본│   슬롯 1                               │
│ └────┘                                       │
│                                              │
│ 메모 (선택): [____________]                  │
│                          [ 교체 활성화 ]     │ ← 모두 채워질 때까지 disabled
└──────────────────────────────────────────────┘
```

### 신규 컴포넌트: `triage-replace-form.tsx`
TriageCard 내부에 자식으로 마운트. Props: `questionId`, `questionImages`, `explanationImages` (원본 thumbnail signed URL 포함, server에서 주입).

### 클라이언트 흐름
1. 각 슬롯 file input — `compressForUpload()` 으로 client-side webp 압축 (HEIC/large JPEG 처리)
2. 파일 선택 즉시 슬롯에 thumbnail preview 표시 (`URL.createObjectURL(blob)`, 업로드 전 단계, 메모리 only)
3. 모든 슬롯 채워지면 "교체 활성화" 버튼 enabled
4. 클릭 시:
   - 각 blob을 `/api/admin/image-replacement/upload` POST (multipart, `role` + `index` + `question_id` 동봉)
   - 서버: admin guard → magic number/dimension 검증 → `toStorageKey(question_id)` 슬러그 → service_role로 public 버킷 업로드 → 파일명 응답
   - 모든 슬롯 업로드 성공 → `triage_question_replace_and_activate(qid, [filenames_q], [filenames_e], note)` RPC 호출 (RPC는 인증된 client supabase 사용)
   - 부분 실패 시 이미 업로드된 파일은 best-effort `DELETE /api/admin/image-replacement/upload?key=...`. 실패한 파일은 orphan으로 남음 (별건 cron cleanup)
5. 성공 시 `router.refresh()` (Server Component refresh)

### 서버 라우트: `/api/admin/image-replacement/upload`
파일: `app/api/admin/image-replacement/upload/route.ts`. 댓글 업로드 라우트(`app/api/comments/upload/route.ts`) 패턴 미러링.

POST body (multipart):
- `file`: webp blob (max 1MB)
- `question_id`: text
- `role`: `q` | `e`
- `index`: number (0-based)

검증 계층:
1. admin guard (`profiles.role='admin' and is_active`)
2. content-length ≤ 1MB + 8KB margin
3. mime = `image/webp`
4. magic number = `RIFF...WEBP` (`lib/webp-dimensions.ts` 재사용)
5. width/height ≤ 2200

성공 응답: `{ filename: string }` (public 버킷 내 파일명만, full URL 아님 — RPC는 파일명만 받음)

DELETE: `?key=<filename>` 으로 best-effort 삭제 (admin guard).

### `lib/admin/triage.ts` 신규 함수
```ts
export async function triageQuestionReplaceAndActivate(args: {
  questionId: string;
  questionFiles: string[];
  explanationFiles: string[];
  note: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }>
```

## 사용자측 렌더링

### `QuestionReadOnly.tsx` 수정
2개 위치에 `<QuestionImageGallery />` 삽입:

```tsx
{/* Question stem 다음, choices 전 */}
{question.questionImageFiles && question.questionImageFiles.length > 0 && (
  <QuestionImageGallery files={question.questionImageFiles} altPrefix="문제 이미지" />
)}

{/* 해설 텍스트 다음 */}
{question.explanationImageFiles && question.explanationImageFiles.length > 0 && (
  <QuestionImageGallery files={question.explanationImageFiles} altPrefix="해설 이미지" />
)}
```

### 신규 컴포넌트: `components/QuestionImageGallery.tsx`
- public 버킷 URL 계산: `supabase.storage.from('question-images-public').getPublicUrl(filename).data.publicUrl`
- `CommentImageGallery` 의 lightbox 인터랙션 패턴 재사용 (전체화면 모달, ESC/click outside 닫기)
- 그리드 레이아웃:
  - 1장: max-width 600px (데스크톱), 100% (모바일, < 640px)
  - 2-4장: 2-column grid
- alt 텍스트: `${altPrefix} ${i + 1}` (단순 인덱스, 캡션 메타 없음)
- private 버킷 파일을 가리키는 경우(=미교체 상태) → public URL이 404 → `<img onError={() => setHidden(true)}>` 으로 hide (broken image icon 노출 방지). 미교체 문제는 어차피 `is_active=false`라 사용자측 페이지에 도달 못함 — defensive check.

### `lib/questions.ts` 타입 확장
```ts
export type Question = {
  // ... 기존 필드
  questionImageFiles?: string[];
  explanationImageFiles?: string[];
};
```
`useQuestions` hook의 select 절과 RPC mapping에 두 컬럼 추가.

## revert + 엣지 케이스

### revert 시나리오
- 카드의 "분류 되돌리기" 버튼 클릭 → `triage_question_revert` RPC
- DB: `_original`에서 `question_image_files`로 복원, `_original` NULL로 reset, `is_active=false` (has_image 태그 가진 경우)
- Storage: 교체본 파일은 public 버킷에 그대로 남음 (재교체 시 재사용 가능)
- 사용자 노출: 즉시 차단 (DB가 원본 파일명 가리킴 → 사용자측 렌더링은 public 버킷에 원본 파일명 요청 → 404 → defensive hide)

### 재교체
한 번 교체한 카드를 다시 교체하려면? → "분류 되돌리기" → 펼침 영역에서 새 파일 업로드 → "교체 활성화". 이번 PR은 이 흐름만 지원. "교체된 상태에서 바로 재교체" 버튼은 YAGNI.

### 슬롯 수 변경 시
원본 슬롯 수와 교체본 슬롯 수 mismatch → RPC가 `slot count mismatch` 예외. 클라이언트는 disabled 가드로 사전 차단되지만, RPC도 server-side 검증.

### 비-admin 호출
RPC `forbidden: admin only` 예외, RLS도 admin 외 write 차단. 이중 가드.

### orphan 파일 (업로드 일부 성공 후 실패)
이번 PR 외부. 별건 cron으로 `question-images-public`에서 DB 어디에서도 참조되지 않은 파일을 주기적으로 cleanup (장래 작업).

## 테스트 시나리오 (admin 수동)

1. **happy path (1 slot)**: `question_image_files: ['a.jpg']` 문제 → 펼침 → b.jpg 선택 → 교체 활성화 → DB는 `['<id>_replacement_0_<ts>.jpg']`, `_original`은 `['a.jpg']`, `is_active=true`. 사용자측 페이지 접속 → public 버킷 이미지 표시.
2. **happy path (multi slot)**: q 2장 + e 1장 문제 → 모든 슬롯 채우면 버튼 활성, 누락 시 disabled.
3. **revert**: 교체된 카드 → "분류 되돌리기" → DB는 `['a.jpg']`로 복귀, `_original` NULL, `is_active=false`. 사용자측 페이지 도달 안 됨 (`is_active=false`).
4. **재교체**: revert 후 다시 펼침 → 새 파일 업로드 → 활성화. 이전 교체본은 public 버킷에 orphan으로 남음 (의도).
5. **mismatch**: 클라이언트 disabled 우회해 직접 RPC 호출 (q 슬롯 1개 부족) → `slot count mismatch (question)` 예외.
6. **비-admin RPC 직접 호출**: `forbidden: admin only` 예외.
7. **사용자측 lightbox**: 활성화된 문제의 이미지 클릭 → lightbox 모달 → ESC 닫기.
8. **사용자측 broken image (defensive)**: DB가 private 버킷 파일명 가리킴 (이론상 활성화된 문제면 발생 안 함, but DB 직접 조작 시) → `<img onerror>` hide.

## audit / observability

- `image_triage_decide` enum 재사용 — `/admin/audit`에 자동 노출
- diff payload: `{status: 'activate_with_replacement', q_files: [...], e_files: [...], note}` — JSON으로 어떤 파일로 교체됐는지 추적 가능
- `triage_question_revert`는 기존 audit 그대로

## 마이그 적용 절차

1. CLI dev 적용은 무시하고 SQL Editor에서 직접 적용 (memory `community_tables_done.md`의 "CLI db push up-to-date" 함정 회피)
2. 적용 순서:
   a. enum value 추가
   b. questions `_original` 컬럼 2개 추가
   c. Storage 버킷 신설 (`question-images-public`)
   d. RLS — public read 1개 정책 (write는 service_role bypass)
   e. RPC `triage_question_replace_and_activate` 신규
   f. RPC `triage_question_revert` 교체 (기존 함수 OR REPLACE)
3. 환경변수 확인: `SUPABASE_SERVICE_ROLE_KEY` 이미 설정됨 (`pre_done.md` 참고)
4. 적용 후 admin 본인 계정으로 happy path 1건 수동 검증 (외과 카테고리 1문제로)

## 마이그 timestamp 충돌

이미지 큐 1차가 `20260506000000`. 본 spec은 `20260507000000`. memory `profile_pra_done.md`의 timestamp 충돌 함정 회피 — 동일 timestamp 사용하지 않음.

## 이번 PR이 끝낸 후 남는 것

- 이미지 큐 분류 운영(외과 81건부터 등) — 별도 운영 작업
- public 버킷 orphan cleanup cron — 별건 작업, 운영 ~수개월 후 검토
- 캡션/저작자 표기가 필요해지는 시점 — `question_image_credits text[]` 추가 (마이그 1개)
- AI 자동 도해 생성 보조 도구 — 별건 spec
