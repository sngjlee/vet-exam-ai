# 이미지 큐 1차 — has_image 374건 분류 워크플로우 (Phase 2 진입)

**날짜**: 2026-04-30
**범위**: ROADMAP Phase 2 진입 — `is_active=false`로 보류 중인 374건(`has_image=true`)을 admin이 5종 액션 중 하나로 분류하고, 그 중 "이미지 의존 없음" 분류분을 즉시 활성화한다.
**제외**: 문제 상세 페이지 이미지 렌더링, react-photo-view lightbox, 다중 admin cross-check, OCR/vision 자동 분류, license/credit 메타 컬럼, 카테고리별 사전 큐레이션.

## 목표

vet40 원본 이미지를 그대로 노출할 수 없다는 PRD §1.4 가드를 유지하면서, 374건을 1건씩 검토 가능한 상태로 옮긴다. rewrite 결과만으로 풀리는 문제는 즉시 활성화하여 외과/해부/병리/영상 카테고리의 노출을 회복한다.

## 핵심 결정 요약

| 항목 | 결정 | 사유 |
|---|---|---|
| 썸네일 전달 | 비공개 Supabase Storage 버킷 (`question-images-private`) + signed URL | prod에서도 모바일/외부 접속 가능, 검수자 확장성, vet40 원본은 admin only |
| 분류 상태 저장 | 별도 `question_image_triage` 테이블 (1:1, question_id PK) | `questions` 스키마 비대화 회피, 향후 image 메타 확장 슬롯 |
| activate 즉시성 | `activate_no_image` 액션은 즉시 `questions.is_active=true` flip | 180건 1초컷 + audit log로 revert 추적 가능 |
| 일괄 액션 | `activate_no_image`만 multi-select bulk 지원 | 가장 빈번 + 가장 안전한 결정에 한정, 나머지 4종은 본문 정독 필요 |
| 진입 범위 | 374건 전체 + 카테고리/회차/status 필터 | 한 카테고리 몰아서 보면 분류 일관성 ↑ |
| 업로드 스크립트 | 이번 PR에 포함 (`pipeline/upload_images.py`, idempotent) | 머지 = 큐 가동, 신규 회차 추가 시 재사용 가능 |
| audit 흐름 | 기존 `log_admin_action` + 신규 enum 2개 (`image_triage_decide`, `image_triage_revert`) | `/admin/audit` 자동 노출 |

## 데이터 모델 + 마이그

마이그 timestamp = `20260506000000_image_triage.sql` (검색 v1의 `20260505000000` 이후).

```sql
-- 1. enum 확장
create type public.image_triage_status as enum (
  'pending',              -- 미분류 (기본값, row 미존재 = 동일 의미)
  'activate_no_image',    -- 이미지 없이 활성화 (questions.is_active=true 동시 flip)
  'needs_rewrite',        -- rewrite 부족, 이미지 의존 표현 빼고 재작성 필요
  'needs_rebuild',        -- 자체 도식 재제작 후 활성화 (Phase 2)
  'needs_license',        -- 병변/방사선/조직 사진 라이선스 확보 (장기 보류)
  'remove'                -- 출제 의존성 너무 커서 영구 폐기
);

alter type public.audit_action add value if not exists 'image_triage_decide';
alter type public.audit_action add value if not exists 'image_triage_revert';

-- 2. 분류 상태 테이블
create table public.question_image_triage (
  question_id  uuid primary key references public.questions(id) on delete cascade,
  status       public.image_triage_status not null,
  note         text,
  decided_by   uuid not null references auth.users(id),
  decided_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index question_image_triage_status_idx on public.question_image_triage(status);
create index question_image_triage_decided_at_idx on public.question_image_triage(decided_at desc);

-- updated_at 트리거 (기존 패턴)
create trigger question_image_triage_set_updated_at
  before update on public.question_image_triage
  for each row execute function public.set_updated_at();

-- 3. RLS — admin only
alter table public.question_image_triage enable row level security;

create policy "admin read" on public.question_image_triage
  for select to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'admin' and p.is_active));

create policy "admin write" on public.question_image_triage
  for all to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'admin' and p.is_active))
  with check (exists (select 1 from public.profiles p
                       where p.id = auth.uid() and p.role = 'admin' and p.is_active));

-- 4. 이미지 파일명 컬럼 (questions)
alter table public.questions
  add column if not exists question_image_files    text[] not null default '{}',
  add column if not exists explanation_image_files text[] not null default '{}';

-- 5. Storage 버킷 (private)
insert into storage.buckets (id, name, public)
values ('question-images-private', 'question-images-private', false)
on conflict (id) do nothing;

create policy "admin signed url access" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'question-images-private'
    and exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role = 'admin' and p.is_active)
  );
```

## RPCs (모두 SECURITY DEFINER + admin guard 내장)

```sql
-- 단건 분류 (upsert, status='activate_no_image'면 questions.is_active=true 동시 flip)
create function public.triage_question_decide(
  p_question_id uuid,
  p_status      public.image_triage_status,
  p_note        text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin_id uuid := auth.uid();
  v_old_status public.image_triage_status;
begin
  -- admin guard
  if not exists (select 1 from profiles where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'forbidden: admin only';
  end if;

  select status into v_old_status from question_image_triage where question_id = p_question_id;

  insert into question_image_triage (question_id, status, note, decided_by)
  values (p_question_id, p_status, p_note, v_admin_id)
  on conflict (question_id) do update
    set status = excluded.status,
        note = excluded.note,
        decided_by = excluded.decided_by,
        decided_at = now(),
        updated_at = now();

  if p_status = 'activate_no_image' then
    update questions set is_active = true where id = p_question_id;
  end if;

  perform log_admin_action(
    'image_triage_decide', 'question', p_question_id::text,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_status, 'note', p_note),
    null
  );
end $$;

-- 일괄 활성화 (activate_no_image 전용)
create function public.triage_questions_bulk_activate(
  p_ids uuid[],
  p_note text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_admin_id uuid := auth.uid();
  v_count int;
begin
  if not exists (select 1 from profiles where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'forbidden: admin only';
  end if;

  insert into question_image_triage (question_id, status, note, decided_by)
  select unnest(p_ids), 'activate_no_image', p_note, v_admin_id
  on conflict (question_id) do update
    set status = 'activate_no_image',
        note = excluded.note,
        decided_by = excluded.decided_by,
        decided_at = now(),
        updated_at = now();

  update questions set is_active = true where id = any(p_ids);
  get diagnostics v_count = row_count;

  perform log_admin_action(
    'image_triage_decide', 'question_batch', 'bulk-' || extract(epoch from now())::text,
    null,
    jsonb_build_object('count', v_count, 'ids', to_jsonb(p_ids), 'note', p_note),
    null
  );
  return v_count;
end $$;

-- 되돌리기 (단건, triage row 삭제 + is_active 원복)
create function public.triage_question_revert(p_question_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin_id uuid := auth.uid();
  v_old record;
begin
  if not exists (select 1 from profiles where id = v_admin_id and role = 'admin' and is_active) then
    raise exception 'forbidden: admin only';
  end if;

  select * into v_old from question_image_triage where question_id = p_question_id;
  if not found then return; end if;

  delete from question_image_triage where question_id = p_question_id;

  -- pipeline 원본 정책으로 원복: has_image면 is_active=false
  update questions
    set is_active = not ('has_image' = any(tags))
    where id = p_question_id;

  perform log_admin_action(
    'image_triage_revert', 'question', p_question_id::text,
    jsonb_build_object('status', v_old.status, 'note', v_old.note),
    null,
    null
  );
end $$;
```

## 서버 액션 / 라이브러리

`vet-exam-ai/lib/admin/triage.ts`:
- `triageQuestionDecide(questionId, status, note)` → RPC wrapper
- `triageQuestionsBulkActivate(ids, note)` → RPC wrapper
- `triageQuestionRevert(questionId)` → RPC wrapper
- `getSignedImageUrls(filenames: string[])` → `supabase.storage.from('question-images-private').createSignedUrl(...)` 일괄 처리, 1시간 TTL

`vet-exam-ai/lib/admin/triage-labels.ts`:
- 5종 status Korean 라벨 + 색상 클래스 매핑 (활성화: green, 재작성: yellow, 재제작: blue, 라이선스: orange, 폐기: red)

## UI

신규 라우트: **`/admin/image-questions`**

사이드바 추가: `vet-exam-ai/app/admin/_components/admin-nav-items.ts`에 "이미지 큐" 항목 (`ImageIcon`) 신설, 위치는 "문제" 다음.

페이지 레이아웃:
```
┌─ 좌측 필터 (admin-questions-filters 패턴 재사용) ──────┐
│  카테고리 (전체/외과/해부/병리/영상/...)               │
│  회차 (전체/57~66)                                     │
│  triage_status (기본: 미분류 / 활성화 / 재작성 / ... / 전체)│
├─ 상단 일괄 액션 바 (선택 1개 이상 시 노출) ─────────────┤
│  [✓ 23건 선택]  [선택 항목 즉시 활성화] (confirm dialog)│
├─ 카드 리스트 (50개씩 페이지네이션) ─────────────────────┤
│  ┌─────────────────────────────────────────────────┐  │
│  │ ☐ KVLE-0123 · 해부 · 57회                       │  │
│  │   문제: ...rewritten question...                │  │
│  │   ① ② ③ ④ ⑤ (정답: ③)                          │  │
│  │   해설: ...rewritten explanation...             │  │
│  │   ┌─────┐ ┌─────┐  ← question_images 썸네일      │  │
│  │   │ img │ │ img │     (signed URL, 클릭 시 확대)  │  │
│  │   └─────┘ └─────┘                                │  │
│  │ [활성화] [재작성 필요] [도식 재제작] [라이선스] [폐기]│  │
│  │ 메모: [_______________]  ← 입력 시 펼침            │  │
│  └─────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

신규 컴포넌트:
- `app/admin/image-questions/page.tsx` — server, fetch + 필터 파싱
- `app/admin/image-questions/_lib/parse-search-params.ts` — `/admin/questions` 패턴 그대로
- `app/admin/image-questions/_components/triage-list.tsx` — server, 카드 리스트 렌더
- `app/admin/image-questions/_components/triage-card.tsx` — client, 액션 버튼 + 메모 입력 + 체크박스
- `app/admin/image-questions/_components/triage-image.tsx` — server, signed URL + Next/Image
- `app/admin/image-questions/_components/triage-lightbox.tsx` — client, `<dialog>` 기반 단순 확대
- `app/admin/image-questions/_components/bulk-activate-bar.tsx` — client, 선택 상태 + confirm dialog

대시보드(`/admin/page.tsx`) 카드 1개 추가: "이미지 큐 미분류 N건" + 링크.

기본 큐 query: `questions.tags @> ARRAY['has_image']` AND `triage row 없음` (left join + is null) AND 필터 적용. 정렬: `round asc, public_id asc`.

## 이미지 업로드 / 백필 스크립트

세 갈래 변경 — 분류 시작 후 `upload.py` 재실행으로 `is_active`가 reset되는 사고를 막기 위해 백필을 별도 스크립트로 분리한다.

### `pipeline/upload_images.py` (신규)
- `pipeline/output/images/` 스캔 → `question-images-private` 버킷에 동일 파일명으로 upsert
- service role key 사용 (`pipeline/.env`의 `SUPABASE_SERVICE_ROLE_KEY`)
- CLI 옵션: `--dry-run`, `--limit N`, `--filter <substring>` (`upload.py` 패턴 일치)
- Idempotent — 신규 회차 추가 시 그대로 재실행
- 진행도: 50건마다 stdout flush (Windows CP949 대응 `PYTHONIOENCODING=utf-8` 필수)
- Content-Type: 확장자 기반 자동 (`bmp` → `image/bmp` 등)

### `pipeline/backfill_image_files.py` (신규, 1회성)
- `pipeline/output/rewritten/` 전체 스캔 → 각 question의 `question_images[]` / `explanation_images[]` 배열을 `questions.question_image_files` / `explanation_image_files` 컬럼에 **그 컬럼만** UPDATE
- `is_active` / `tags` / 기타 컬럼은 절대 건드리지 않음 (분류 후 활성화 상태 보존)
- CLI 옵션: `--dry-run`, `--limit N`, `--filter <substring>`
- 한 번 돌리고 끝. 신규 회차 추가 시엔 `upload.py`가 처리 (아래 패치)

### `pipeline/upload.py` 패치 (~3줄)
- `build_row()`에서 신규 컬럼 2개 추가:
  ```python
  "question_image_files":    q.get("question_images", []),
  "explanation_image_files": q.get("explanation_images", []),
  ```
- 신규 회차 추가 시 새 row에 자동 적재. 기존 374건엔 영향 0 (id 충돌 시 upsert가 모두 덮어쓰는 게 정상이지만, 분류 시작 후엔 `upload.py`를 374건 대상으로 재실행하지 않는다는 운영 규칙으로 가드)

### 운영 순서 (분류 시작 전 1회)
1. 마이그 SQL Editor 적용
2. `pipeline/.venv/Scripts/python.exe pipeline/upload_images.py --all` (Storage 일괄 업로드, ~5분)
3. `pipeline/.venv/Scripts/python.exe pipeline/backfill_image_files.py --all` (메타 컬럼만 백필, ~2분)
4. `/admin/image-questions` 진입 → 분류 시작

**중요**: 분류가 시작된 후엔 `upload.py`를 기존 374건 id 대상으로 재실행하면 안 됨 — 활성화된 row의 `is_active`가 false로 reset됨. 신규 회차 추가 시엔 새 id만 들어가므로 안전.

## Audit 흐름

기존 `log_admin_action` 그대로:

| 액션 | target_type | target_id | before | after |
|---|---|---|---|---|
| 단건 decide | `question` | `<uuid>` | `{status: old}` | `{status: new, note}` |
| 일괄 activate | `question_batch` | `bulk-<epoch>` | null | `{count, ids[], note}` |
| revert | `question` | `<uuid>` | `{status, note}` | null |

`/admin/audit` 페이지에서 자동 노출 (기존 인프라 사용, 추가 코드 0).

## 함정 / 운영 가드

- **마이그 timestamp** — 검색 v1 (`20260505000000`) 이후 = `20260506000000`. 신규 마이그 추가 시 충돌 회피 필수 (memory `profile_pra_done.md` 패턴).
- **CHECK constraint 동시 점검** — `questions.tags`에 `'has_image'` 새 marker 추가 케이스가 있다면 기존 CHECK 미적용 확인 (memory `feedback_check_constraint_audit.md`). 현재 스키마에선 tags가 free-form text[]라 영향 없음.
- **SECURITY DEFINER + set search_path** — RLS 적용 테이블에 INSERT/UPDATE하므로 모든 RPC에 `set search_path = public` 필수 (memory `feedback_security_definer_trigger.md`).
- **module load env throw 금지** — `pipeline/upload_images.py`는 Python 스크립트라 무관, 다만 web 코드 import 체인에 storage 클라이언트 module-level 초기화 두지 않을 것 (memory `feedback_module_load_env_throw.md`).
- **저작권 가드** — 버킷 절대 public 전환 금지. signed URL TTL 1시간 + admin role check. 외부 공유 차단.
- **bulk activate confirm dialog** — "23건을 즉시 공개합니다. 되돌리려면 /admin/audit에서 추적 후 1건씩 revert. 계속?" — 명시적 텍스트로 실수 방지.
- **revert 시 is_active 원복 로직** — `has_image` tag 기준으로 원복 (`update questions set is_active = not ('has_image' = any(tags))`). pipeline 원본 정책과 일치.
- **upload.py 재실행 사고 가드** — 분류 시작 후 `upload.py --all --force`를 374건 대상으로 돌리면 활성화된 row의 `is_active`가 false로 reset됨. 백필을 별도 `backfill_image_files.py`로 분리한 이유. 신규 회차 추가 시엔 새 id라 안전.

## 검증 SQL (마이그 후)

```sql
-- 1. enum / 테이블 / RLS 확인
select unnest(enum_range(null::image_triage_status));
select * from question_image_triage limit 1;
select * from pg_policies where tablename = 'question_image_triage';

-- 2. 컬럼 추가 확인
\d questions

-- 3. 버킷 확인
select * from storage.buckets where id = 'question-images-private';
select * from pg_policies where schemaname = 'storage' and policyname like '%admin signed url%';

-- 4. RPC 확인
\df triage_question_decide
\df triage_questions_bulk_activate
\df triage_question_revert

-- 5. 백필 후 카운트
select count(*) from questions where 'has_image' = any(tags);  -- 374
select count(*) from questions where question_image_files != '{}';  -- 비슷
select count(*) from question_image_triage;  -- 0 (초기)
```

## 머지 후 운영 액션

- [ ] 마이그 SQL Editor 적용
- [ ] `upload_images.py --all` 실행 (Storage 일괄 업로드)
- [ ] `backfill_image_files.py --all` 실행 (파일명 컬럼만 백필, is_active 보존)
- [ ] `/admin/image-questions` 첫 진입, 1 카테고리(외과 81) 분류 시도 — 결정 시간 / UX 마찰 측정
- [ ] 1주일 후 메모리 갱신 — 분류 분포, 다음 단계(needs_rebuild 처리 인프라 / Phase 2 렌더링) 우선순위 결정
