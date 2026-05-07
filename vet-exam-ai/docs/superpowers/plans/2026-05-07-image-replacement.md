# Image Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미지 큐(`/admin/image-questions`) 분류 작업 중 저작권 위험 원본을 admin 자작 이미지로 교체 + 활성화 + 사용자측 `/questions/[id]` 렌더링까지 한 PR에서 end-to-end 처리.

**Architecture:** (1) 마이그 — 새 enum 값 `activate_with_replacement` + `_original` 백업 컬럼 2개 + 신규 public Storage 버킷 + 신규 RPC `triage_question_replace_and_activate` + 기존 `triage_question_revert` 교체. (2) Server route — `/api/admin/image-replacement/upload` (admin guard + service_role + slug + magic number/dim 검증, `/api/comments/upload` 패턴 미러). (3) Admin UI — TriageCard에 6번째 액션 + 인라인 폼(`TriageReplaceForm`) 추가, `_original` 우선 thumbnail. (4) User UI — 신규 `QuestionImageGallery` 컴포넌트 + `QuestionReadOnly`에 stem/explanation 위치 삽입 + types/API mapping 확장.

**Tech Stack:** Next.js 16 App Router + React 19, `@supabase/ssr` + `createAdminClient` (service_role), PostgreSQL (enum, plpgsql SECURITY DEFINER RPC, Storage policies), 기존 `lib/comments/imageCompress.ts`(client webp 압축) + `lib/webp-dimensions.ts`(magic/dim 검증) 재사용.

**Spec:** `vet-exam-ai/docs/superpowers/specs/2026-05-07-image-replacement-design.md`

**Branch:** `feat/image-replacement` (Task 0에서 생성)

**중요 — 경로 규칙:**
- Web 코드: `vet-exam-ai/...` (예: `vet-exam-ai/app/admin/image-questions/_components/triage-card.tsx`)
- 마이그: `vet-exam-ai/supabase/migrations/...`
- Spec/Plan: `vet-exam-ai/docs/superpowers/...`
- 모든 git/npm 명령은 repo root(`C:\Users\Theriogenology\Desktop\vet-exam-ai`)에서 실행. inner `cd vet-exam-ai && ...` 사용 시 다음 Bash 호출이 inner CWD에 잠기므로 `cd` 없이 절대 경로/`-C` flag 사용 권장.
- typecheck 명령은 `npm run typecheck` 없음 — 반드시 `cd vet-exam-ai && npx tsc --noEmit` (한 줄에서 chain).

---

## Pre-flight

- [ ] **Step P-1: 브랜치 생성 + 상태 확인**

```bash
git status
git log --oneline -3
git checkout -b feat/image-replacement
```

Expected: `On branch main` clean, 최근 커밋에 `a56a364 spec: image replacement — self-review fixes` 보임. `feat/image-replacement` 브랜치로 전환.

- [ ] **Step P-2: 최신 마이그 timestamp 확인**

```bash
ls vet-exam-ai/supabase/migrations
```

Expected: 최신이 `20260506000000_image_triage.sql`. 신규 파일은 `20260507000000_image_replacement.sql`로 작성.

- [ ] **Step P-3: 환경변수 확인**

```bash
grep "SUPABASE_SERVICE_ROLE_KEY" vet-exam-ai/.env.local
```

Expected: 한 줄 발견(값은 비공개, 존재만 확인). 없으면 사용자에게 `pre_done.md` 메모리 참고해 채우라고 알릴 것.

---

## Task 1: Migration — enum value + `_original` columns + public bucket + RPCs

**Files:**
- Create: `vet-exam-ai/supabase/migrations/20260507000000_image_replacement.sql`

- [ ] **Step 1.1: 마이그레이션 파일 작성**

Create `vet-exam-ai/supabase/migrations/20260507000000_image_replacement.sql` with this exact content:

```sql
-- =============================================================================
-- Image replacement — admin uploads legal replacement, swaps DB pointer,
-- preserves original in private bucket. User-facing public bucket.
-- =============================================================================

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

-- 4. RLS — public read만. write/update/delete는 service_role bypass
drop policy if exists "public read replacement" on storage.objects;
create policy "public read replacement" on storage.objects
  for select to public
  using (bucket_id = 'question-images-public');

-- =============================================================================
-- RPC: 교체 + 활성화 (단일 트랜잭션)
-- =============================================================================
create or replace function public.triage_question_replace_and_activate(
  p_question_id        text,
  p_question_files     text[],
  p_explanation_files  text[],
  p_note               text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id         uuid := auth.uid();
  v_q_count_existing int;
  v_e_count_existing int;
  v_q_count_new      int;
  v_e_count_new      int;
begin
  if not exists (
    select 1 from profiles
     where id = v_admin_id and role = 'admin' and is_active
  ) then
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

  perform log_admin_action(
    'image_triage_decide'::audit_action,
    'question',
    p_question_id,
    null,
    jsonb_build_object(
      'status',  'activate_with_replacement',
      'q_files', p_question_files,
      'e_files', p_explanation_files,
      'note',    p_note
    ),
    null
  );
end $$;

revoke all on function public.triage_question_replace_and_activate(text, text[], text[], text) from public;
grant execute on function public.triage_question_replace_and_activate(text, text[], text[], text) to authenticated;

-- =============================================================================
-- RPC: revert 교체 — `_original` 우선 복원, 없으면 기존 로직 (이미지 큐 1차 호환)
-- =============================================================================
create or replace function public.triage_question_revert(
  p_question_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_old      record;
begin
  if not exists (
    select 1 from profiles
     where id = v_admin_id and role = 'admin' and is_active
  ) then
    raise exception 'forbidden: admin only';
  end if;

  select * into v_old from question_image_triage where question_id = p_question_id;
  if not found then return; end if;

  delete from question_image_triage where question_id = p_question_id;

  -- _original 백업이 있으면 거기서 복원, 없으면 기존 has_image 정책
  update questions
     set question_image_files    = coalesce(question_image_files_original,    question_image_files),
         explanation_image_files = coalesce(explanation_image_files_original, explanation_image_files),
         question_image_files_original    = null,
         explanation_image_files_original = null,
         is_active                        = not ('has_image' = any(tags))
   where id = p_question_id;

  perform log_admin_action(
    'image_triage_revert'::audit_action,
    'question',
    p_question_id,
    jsonb_build_object('status', v_old.status, 'note', v_old.note),
    null,
    null
  );
end $$;

revoke all on function public.triage_question_revert(text) from public;
grant execute on function public.triage_question_revert(text) to authenticated;
```

- [ ] **Step 1.2: 커밋**

```bash
git add vet-exam-ai/supabase/migrations/20260507000000_image_replacement.sql
git commit -m "image-replace: migration — enum + _original cols + public bucket + RPCs"
```

- [ ] **Step 1.3: SQL Editor 적용 (사용자 액션)**

이 단계는 사용자가 Supabase Dashboard SQL Editor에 `20260507000000_image_replacement.sql` 전체 내용을 붙여 실행. CLI `db push`는 메모리 `community_tables_done.md` 함정 회피하기 위해 사용 X.

사용자에게 다음 메시지 전달:
> 마이그 파일을 Supabase Dashboard SQL Editor에 직접 붙여넣어 실행해주세요. 성공하면 "Success. No rows returned" 표시 + Database > Storage에서 `question-images-public` 버킷이 public으로 생성됨. 적용 완료 알려주시면 Task 2 진행합니다.

---

## Task 2: TS slug helper

**Files:**
- Create: `vet-exam-ai/lib/admin/storage-key.ts`

- [ ] **Step 2.1: 헬퍼 작성**

Create `vet-exam-ai/lib/admin/storage-key.ts`:

```ts
// Convert non-ASCII characters in a storage key to UTF-8 byte hex.
// Matches the Python helper in `pipeline/_storage_key.py` (e.g. "해부" → "ed95b4ebb680").
// Supabase Storage rejects non-ASCII keys (`InvalidKey`), so question_id slugs
// containing Korean characters must be hex-encoded before being used as paths.
export function toStorageKey(input: string): string {
  return input.replace(/[^\x20-\x7e]/g, (ch) => {
    const bytes = new TextEncoder().encode(ch);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  });
}
```

- [ ] **Step 2.2: typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2.3: 커밋**

```bash
git add vet-exam-ai/lib/admin/storage-key.ts
git commit -m "image-replace: TS storage key slug helper (hex non-ASCII)"
```

---

## Task 3: Server upload route — POST + DELETE

**Files:**
- Create: `vet-exam-ai/app/api/admin/image-replacement/upload/route.ts`

- [ ] **Step 3.1: 라우트 작성**

Create `vet-exam-ai/app/api/admin/image-replacement/upload/route.ts`:

```ts
// vet-exam-ai/app/api/admin/image-replacement/upload/route.ts
// POST: admin이 압축한 webp blob + question_id/role/index 동봉. 검증 후
//   public 버킷 업로드, 파일명만 응답.
// DELETE: ?key=<filename> 으로 best-effort 삭제 (admin guard).

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { readWebpDimensions } from "../../../../../lib/webp-dimensions";
import { toStorageKey } from "../../../../../lib/admin/storage-key";

const MAX_BYTES = 1_048_576; // 1MB
const MAX_DIM = 2200;
const BUCKET = "question-images-public";

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Authentication required" };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile || profile.role !== "admin" || !profile.is_active) {
    return { ok: false, status: 403, error: "forbidden: admin only" };
  }
  return { ok: true, userId: user.id };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const lengthHeader = req.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_BYTES + 8192) {
    return NextResponse.json({ error: "too_large" }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const file        = formData.get("file");
  const questionId  = formData.get("question_id");
  const role        = formData.get("role");
  const indexStr    = formData.get("index");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (typeof questionId !== "string" || questionId.length === 0) {
    return NextResponse.json({ error: "missing_question_id" }, { status: 400 });
  }
  if (role !== "q" && role !== "e") {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }
  const index = typeof indexStr === "string" ? Number.parseInt(indexStr, 10) : NaN;
  if (!Number.isInteger(index) || index < 0 || index > 99) {
    return NextResponse.json({ error: "invalid_index" }, { status: 400 });
  }

  if (file.type !== "image/webp") {
    return NextResponse.json({ error: "invalid_mime" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (
    buffer.length < 12 ||
    buffer.readUInt32BE(0) !== 0x52494646 ||
    buffer.readUInt32BE(8) !== 0x57454250
  ) {
    return NextResponse.json({ error: "invalid_magic" }, { status: 400 });
  }
  const dims = readWebpDimensions(buffer);
  if (!dims) {
    return NextResponse.json({ error: "decode_failed" }, { status: 400 });
  }
  if (dims.width > MAX_DIM || dims.height > MAX_DIM) {
    return NextResponse.json({ error: "dimensions_exceeded" }, { status: 400 });
  }

  const slug      = toStorageKey(questionId);
  const ts        = Math.floor(Date.now() / 1000);
  const filename  = `${slug}_${role}_${index}_${ts}.webp`;

  const admin = createAdminClient();
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
      upsert: false,
    });
  if (uploadErr) {
    console.error("[image-replace] upload failed", uploadErr);
    return NextResponse.json({ error: "storage_upload_failed" }, { status: 500 });
  }

  return NextResponse.json({ filename });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "missing_key" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).remove([key]);
  if (error) {
    console.error("[image-replace] delete failed", error);
    return NextResponse.json({ error: "storage_delete_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3.2: typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3.3: 커밋**

```bash
git add vet-exam-ai/app/api/admin/image-replacement/upload/route.ts
git commit -m "image-replace: server route — admin guard + service_role + slug + webp validation"
```

---

## Task 4: Triage labels — add new enum value

**Files:**
- Modify: `vet-exam-ai/lib/admin/triage-labels.ts`

- [ ] **Step 4.1: 라벨 추가**

Modify `vet-exam-ai/lib/admin/triage-labels.ts` — replace the entire content with:

```ts
import type { Database } from "../supabase/types";

export type ImageTriageStatus = Database["public"]["Enums"]["image_triage_status"];

export const TRIAGE_STATUS_ORDER: ImageTriageStatus[] = [
  "pending",
  "activate_no_image",
  "activate_with_replacement",
  "needs_rewrite",
  "needs_rebuild",
  "needs_license",
  "remove",
];

export const TRIAGE_STATUS_LABEL: Record<ImageTriageStatus, string> = {
  pending:                   "미분류",
  activate_no_image:         "이미지 없이 활성화",
  activate_with_replacement: "교체 후 활성화",
  needs_rewrite:             "재작성 필요",
  needs_rebuild:             "도식 재제작",
  needs_license:             "라이선스 필요",
  remove:                    "폐기",
};

export const TRIAGE_STATUS_SHORT: Record<ImageTriageStatus, string> = {
  pending:                   "미분류",
  activate_no_image:         "활성화",
  activate_with_replacement: "교체활성화",
  needs_rewrite:             "재작성",
  needs_rebuild:             "재제작",
  needs_license:             "라이선스",
  remove:                    "폐기",
};

// Tailwind/CSS color tokens — admin pill 색상
export const TRIAGE_STATUS_COLOR: Record<ImageTriageStatus, { bg: string; fg: string }> = {
  pending:                   { bg: "var(--surface-raised)", fg: "var(--text-muted)" },
  activate_no_image:         { bg: "rgba(34, 197, 94, 0.12)",  fg: "rgb(22, 163, 74)" },
  activate_with_replacement: { bg: "rgba(20, 184, 166, 0.12)", fg: "rgb(13, 148, 136)" }, // teal
  needs_rewrite:             { bg: "rgba(234, 179, 8, 0.12)",  fg: "rgb(161, 98, 7)"  },
  needs_rebuild:             { bg: "rgba(59, 130, 246, 0.12)", fg: "rgb(29, 78, 216)" },
  needs_license:             { bg: "rgba(249, 115, 22, 0.12)", fg: "rgb(194, 65, 12)" },
  remove:                    { bg: "rgba(239, 68, 68, 0.12)",  fg: "rgb(185, 28, 28)" },
};

export function isImageTriageStatus(v: unknown): v is ImageTriageStatus {
  return typeof v === "string" && TRIAGE_STATUS_ORDER.includes(v as ImageTriageStatus);
}
```

- [ ] **Step 4.2: 커밋 (typecheck는 Task 6에서 types.ts 갱신 후 일괄)**

```bash
git add vet-exam-ai/lib/admin/triage-labels.ts
git commit -m "image-replace: add activate_with_replacement label/color/order"
```

---

## Task 5: Triage server action — `triageQuestionReplaceAndActivate`

**Files:**
- Modify: `vet-exam-ai/lib/admin/triage.ts`

- [ ] **Step 5.1: 함수 추가**

Modify `vet-exam-ai/lib/admin/triage.ts` — append this function at the end of the file:

```ts
export async function triageQuestionReplaceAndActivate(args: {
  questionId:       string;
  questionFiles:    string[];
  explanationFiles: string[];
  note:             string | null;
}): Promise<TriageActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("triage_question_replace_and_activate", {
    p_question_id:        args.questionId,
    p_question_files:     args.questionFiles,
    p_explanation_files:  args.explanationFiles,
    p_note:               args.note,
  });
  if (error) {
    console.error("[triage] replace-and-activate failed", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/image-questions");
  revalidatePath("/admin");
  return { ok: true };
}
```

- [ ] **Step 5.2: 커밋**

```bash
git add vet-exam-ai/lib/admin/triage.ts
git commit -m "image-replace: triage server action — replace and activate"
```

---

## Task 6: Supabase types — regenerate or manual patch

**Files:**
- Modify: `vet-exam-ai/lib/supabase/types.ts`

> 이 프로젝트는 typed schema가 수동 작성된 형태로 보임 (memory `typed_schema_done.md` 참고). 자동 generate가 없을 수 있음 — 수동 patch.

- [ ] **Step 6.1: types.ts enum 갱신**

Modify `vet-exam-ai/lib/supabase/types.ts` — line ~747-753에 `image_triage_status` enum이 multi-line 형식으로 존재. `"activate_no_image"` 다음 줄에 `"activate_with_replacement"` 추가:

```ts
      image_triage_status:
        | "pending"
        | "activate_no_image"
        | "activate_with_replacement"
        | "needs_rewrite"
        | "needs_rebuild"
        | "needs_license"
        | "remove";
```

- [ ] **Step 6.2: questions 행 타입에 `_original` 컬럼 추가**

같은 파일에서 questions 테이블의 Row 타입(예: `Row: { ... question_image_files: string[]; explanation_image_files: string[]; ...}`)을 찾아 두 컬럼 추가:

```ts
question_image_files_original:    string[] | null;
explanation_image_files_original: string[] | null;
```

(Insert/Update 변형이 있다면 두 곳 모두에 optional로 추가:)
```ts
question_image_files_original?:    string[] | null;
explanation_image_files_original?: string[] | null;
```

- [ ] **Step 6.3: 신규 RPC 시그니처 추가**

같은 파일의 `Functions:` 블록에서 기존 `triage_question_decide`/`triage_question_revert` 옆에 신규 함수 추가:

```ts
triage_question_replace_and_activate: {
  Args: {
    p_question_id:        string;
    p_question_files:     string[];
    p_explanation_files:  string[];
    p_note?:              string | null;
  };
  Returns: undefined;
};
```

- [ ] **Step 6.4: typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: 0 errors. 만약 `.rpc("triage_question_replace_and_activate", ...)` 미인식이면 Step 6.3 위치/구조 재확인.

- [ ] **Step 6.5: 커밋**

```bash
git add vet-exam-ai/lib/supabase/types.ts
git commit -m "image-replace: typed schema — new enum value, _original cols, RPC signature"
```

---

## Task 7: Question type + API — expose image file fields

**Files:**
- Modify: `vet-exam-ai/lib/questions/types.ts`
- Modify: `vet-exam-ai/app/api/questions/route.ts`

- [ ] **Step 7.1: Question 타입 확장**

Modify `vet-exam-ai/lib/questions/types.ts` — replace the entire `Question` interface with:

```ts
export interface Question {
  // --- core fields ---
  id: string;
  publicId?: string;
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
  category: string;

  // --- metadata fields (optional — existing data remains valid) ---
  subject?: string;
  topic?: string;
  difficulty?: Difficulty;
  source?: QuestionSource;
  year?: number;
  tags?: string[];
  isActive?: boolean;

  // --- image fields (replacement bucket filenames; absent/empty = no images) ---
  questionImageFiles?:    string[];
  explanationImageFiles?: string[];
}
```

(Keep `Difficulty` and `QuestionSource` exports unchanged.)

- [ ] **Step 7.2: API select/mapping에 컬럼 추가**

Modify `vet-exam-ai/app/api/questions/route.ts`:

(a) `QuestionApiRow` 타입 (file:1-22 부근)에 두 필드 추가 — `Pick`에 다음 두 키 추가:
```ts
| "question_image_files"
| "explanation_image_files"
```

(b) `toQuestion` 함수 반환에 매핑 추가 — `isActive: row.is_active,` 다음에:
```ts
questionImageFiles:    row.question_image_files ?? undefined,
explanationImageFiles: row.explanation_image_files ?? undefined,
```

(c) Supabase select 절(file:80-86 부근)의 `.select("...")`에 두 컬럼 추가 — 기존 컬럼 리스트 끝에:
```
, question_image_files, explanation_image_files
```

- [ ] **Step 7.3: typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7.4: 커밋**

```bash
git add vet-exam-ai/lib/questions/types.ts vet-exam-ai/app/api/questions/route.ts
git commit -m "image-replace: Question type + API — expose image file fields"
```

---

## Task 8: Admin page — show original thumbnails when replaced

**Files:**
- Modify: `vet-exam-ai/app/admin/image-questions/page.tsx`

> 교체 활성화된 카드도 admin이 원본을 비교 참조할 수 있어야 함. `_original`이 있으면 거기서 fetch, 없으면 기존 컬럼.

- [ ] **Step 8.1: QuestionRow 타입 + select 절에 `_original` 추가**

Modify `vet-exam-ai/app/admin/image-questions/page.tsx`:

(a) `QuestionRow` 타입(file:19-30 부근)에 두 필드 추가 — `explanation_image_files: string[];` 다음에:
```ts
question_image_files_original:    string[] | null;
explanation_image_files_original: string[] | null;
```

(b) `loadQueue`의 select 절(file:71)을 다음으로 교체:
```ts
.select(
  "id, public_id, round, category, question, choices, answer, explanation, question_image_files, explanation_image_files, question_image_files_original, explanation_image_files_original, tags",
  { count: "exact" },
)
```

(`tags`도 함께 추가 — Step 8.2에서 사용.)

- [ ] **Step 8.2: `buildListItems`에서 `_original` 우선 사용**

같은 파일 `buildListItems` 함수의 `allFiles` 계산 부분(file:135-142)을 다음으로 교체:

```ts
// 원본을 admin 참조용으로 표시 (교체 후에도 비교 가능). _original이 있으면 거기서, 없으면 active 컬럼.
const originalQ = (row: QuestionRow) => row.question_image_files_original ?? row.question_image_files;
const originalE = (row: QuestionRow) => row.explanation_image_files_original ?? row.explanation_image_files;

const allFiles = Array.from(
  new Set(
    rows.flatMap((r) => [...originalQ(r), ...originalE(r)]),
  ),
);
const signed = await getSignedImageUrls(allFiles);
const urlMap = new Map(signed.map((s) => [s.filename, s.url]));
```

`return rows.map((row) => {` 블록 안에서 `questionImages`/`explanationImages` 매핑(file:158-165)을 교체:
```ts
questionImages:    originalQ(row).map((f) => ({ filename: f, url: urlMap.get(f) ?? null })),
explanationImages: originalE(row).map((f) => ({ filename: f, url: urlMap.get(f) ?? null })),
```

- [ ] **Step 8.3: TriageCardData 타입에 슬롯 수 전달용 필드 추가**

`vet-exam-ai/app/admin/image-questions/_components/triage-card.tsx`의 `TriageCardData` 타입에 `originalSlotCounts` 추가 — `triageNote: string | null;` 위에:

```ts
originalSlotCounts: { question: number; explanation: number };
```

다시 `vet-exam-ai/app/admin/image-questions/page.tsx`의 `buildListItems`에서 `data: TriageCardData = { ... }` 객체에 매핑 추가 — `triageNote: tr ? tr.note : null,` 위에:
```ts
originalSlotCounts: {
  question:    originalQ(row).length,
  explanation: originalE(row).length,
},
```

- [ ] **Step 8.4: typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8.5: 커밋**

```bash
git add vet-exam-ai/app/admin/image-questions/page.tsx vet-exam-ai/app/admin/image-questions/_components/triage-card.tsx
git commit -m "image-replace: admin page — load _original cols + slot counts in card data"
```

---

## Task 9: TriageReplaceForm — inline upload widget

**Files:**
- Create: `vet-exam-ai/app/admin/image-questions/_components/triage-replace-form.tsx`

- [ ] **Step 9.1: 컴포넌트 작성**

Create `vet-exam-ai/app/admin/image-questions/_components/triage-replace-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { compressForUpload, ImageCompressError } from "../../../../lib/comments/imageCompress";
import { triageQuestionReplaceAndActivate } from "../../../../lib/admin/triage";

type Slot = {
  preview: string | null;   // local object URL for preview
  blob:    Blob | null;
  filename: string | null;  // server-returned filename after upload
  uploading: boolean;
  error: string | null;
};

function emptySlot(): Slot {
  return { preview: null, blob: null, filename: null, uploading: false, error: null };
}

type Props = {
  questionId: string;
  qSlotCount: number;
  eSlotCount: number;
  qOriginalUrls: (string | null)[]; // signed URLs for thumbnail reference
  eOriginalUrls: (string | null)[];
  note: string;
  onNoteChange: (v: string) => void;
  onError: (msg: string | null) => void;
};

export function TriageReplaceForm({
  questionId,
  qSlotCount,
  eSlotCount,
  qOriginalUrls,
  eOriginalUrls,
  note,
  onNoteChange,
  onError,
}: Props) {
  const [qSlots, setQSlots] = useState<Slot[]>(() => Array.from({ length: qSlotCount }, emptySlot));
  const [eSlots, setESlots] = useState<Slot[]>(() => Array.from({ length: eSlotCount }, emptySlot));
  const [submitting, startTransition] = useTransition();

  async function handleSelect(role: "q" | "e", index: number, file: File) {
    onError(null);
    const setSlots = role === "q" ? setQSlots : setESlots;

    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, uploading: true, error: null } : s)),
    );

    let blob: Blob;
    try {
      blob = await compressForUpload(file);
    } catch (e) {
      const msg = e instanceof ImageCompressError ? e.message
                : e instanceof Error ? e.message
                : "압축 실패";
      setSlots((prev) =>
        prev.map((s, i) => (i === index ? { ...s, uploading: false, error: msg } : s)),
      );
      return;
    }

    const previewUrl = URL.createObjectURL(blob);

    const fd = new FormData();
    fd.append("file", blob, "replacement.webp");
    fd.append("question_id", questionId);
    fd.append("role", role);
    fd.append("index", String(index));

    try {
      const res = await fetch("/api/admin/image-replacement/upload", {
        method: "POST",
        body:   fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = await res.json() as { filename: string };
      setSlots((prev) =>
        prev.map((s, i) =>
          i === index
            ? { preview: previewUrl, blob, filename: j.filename, uploading: false, error: null }
            : s,
        ),
      );
    } catch (e) {
      URL.revokeObjectURL(previewUrl);
      const msg = e instanceof Error ? e.message : "업로드 실패";
      setSlots((prev) =>
        prev.map((s, i) => (i === index ? { ...s, uploading: false, error: msg } : s)),
      );
    }
  }

  async function handleRemove(role: "q" | "e", index: number) {
    const setSlots = role === "q" ? setQSlots : setESlots;
    const slots    = role === "q" ? qSlots    : eSlots;
    const slot = slots[index];
    if (slot.preview) URL.revokeObjectURL(slot.preview);
    if (slot.filename) {
      // best-effort cleanup
      fetch(`/api/admin/image-replacement/upload?key=${encodeURIComponent(slot.filename)}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? emptySlot() : s)),
    );
  }

  const allFilled =
    qSlots.every((s) => s.filename !== null) &&
    eSlots.every((s) => s.filename !== null);

  function handleActivate() {
    onError(null);
    startTransition(async () => {
      const result = await triageQuestionReplaceAndActivate({
        questionId,
        questionFiles:    qSlots.map((s) => s.filename!),
        explanationFiles: eSlots.map((s) => s.filename!),
        note:             note.trim() || null,
      });
      if (!result.ok) onError(result.error);
    });
  }

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        background: "var(--surface)",
        border: "1px solid var(--rule)",
        borderRadius: 6,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
        교체 이미지 업로드
      </div>

      {qSlotCount > 0 && (
        <SlotGroup
          label="문제 이미지"
          slots={qSlots}
          originalUrls={qOriginalUrls}
          role="q"
          onSelect={handleSelect}
          onRemove={handleRemove}
          disabled={submitting}
        />
      )}
      {eSlotCount > 0 && (
        <SlotGroup
          label="해설 이미지"
          slots={eSlots}
          originalUrls={eOriginalUrls}
          role="e"
          onSelect={handleSelect}
          onRemove={handleRemove}
          disabled={submitting}
        />
      )}

      <input
        type="text"
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="메모 (선택)"
        maxLength={500}
        style={{
          width: "100%",
          marginTop: 8,
          padding: "6px 10px",
          fontSize: 12,
          borderRadius: 4,
          border: "1px solid var(--rule)",
          background: "var(--surface-raised)",
          color: "var(--text)",
        }}
      />

      <button
        type="button"
        onClick={handleActivate}
        disabled={!allFilled || submitting}
        style={{
          marginTop: 10,
          padding: "8px 14px",
          fontSize: 12,
          borderRadius: 4,
          border: "1px solid var(--teal)",
          background: allFilled && !submitting ? "var(--teal)" : "var(--surface-raised)",
          color:      allFilled && !submitting ? "white"        : "var(--text-muted)",
          cursor:     allFilled && !submitting ? "pointer"      : "not-allowed",
        }}
      >
        {submitting ? "활성화 중..." : "교체 활성화"}
      </button>
    </div>
  );
}

function SlotGroup({
  label,
  slots,
  originalUrls,
  role,
  onSelect,
  onRemove,
  disabled,
}: {
  label: string;
  slots: Slot[];
  originalUrls: (string | null)[];
  role: "q" | "e";
  onSelect: (role: "q" | "e", index: number, file: File) => void;
  onRemove: (role: "q" | "e", index: number) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
        {label} ({slots.length} 슬롯)
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {slots.map((slot, idx) => (
          <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* 원본 thumbnail (참조용) */}
            <div
              style={{
                width: 60, height: 60,
                background: "var(--surface-raised)",
                border: "1px solid var(--rule)",
                borderRadius: 4,
                overflow: "hidden",
                display: "grid",
                placeItems: "center",
                fontSize: 9,
                color: "var(--text-muted)",
                flexShrink: 0,
              }}
            >
              {originalUrls[idx] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={originalUrls[idx]!}
                  alt={`원본 ${idx + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span>원본</span>
              )}
            </div>

            <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 36 }}>
              슬롯 {idx + 1}
            </span>

            {/* 교체본 영역 */}
            {slot.preview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slot.preview}
                  alt={`교체 ${idx + 1}`}
                  style={{
                    width: 60, height: 60,
                    objectFit: "cover",
                    border: "2px solid var(--teal)",
                    borderRadius: 4,
                  }}
                />
                <button
                  type="button"
                  onClick={() => onRemove(role, idx)}
                  disabled={disabled}
                  style={{
                    fontSize: 11,
                    color: "rgb(185, 28, 28)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  취소
                </button>
              </>
            ) : (
              <>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  disabled={disabled || slot.uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onSelect(role, idx, f);
                    e.target.value = "";
                  }}
                  style={{ fontSize: 11 }}
                />
                {slot.uploading && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    업로드 중...
                  </span>
                )}
              </>
            )}
            {slot.error && (
              <span style={{ fontSize: 11, color: "rgb(185, 28, 28)" }}>
                {slot.error}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 9.2: typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 9.3: 커밋**

```bash
git add vet-exam-ai/app/admin/image-questions/_components/triage-replace-form.tsx
git commit -m "image-replace: TriageReplaceForm — inline upload widget"
```

---

## Task 10: TriageCard — integrate replace form (6th action)

**Files:**
- Modify: `vet-exam-ai/app/admin/image-questions/_components/triage-card.tsx`

- [ ] **Step 10.1: 액션 버튼 + form 토글 통합**

Modify `vet-exam-ai/app/admin/image-questions/_components/triage-card.tsx`:

(a) 파일 상단 import (line 1-13)에 추가:
```tsx
import { TriageReplaceForm } from "./triage-replace-form";
```

(b) 컴포넌트 본문 `const decided = row.triageStatus !== null;` (file:74) 위에 새 state 추가:
```tsx
const [showReplaceForm, setShowReplaceForm] = useState(false);
```

(c) 액션 버튼 줄(file:159-182) 끝 — `</div>` 직전에 6번째 버튼 추가 (`ACTION_BUTTONS` 배열에는 추가하지 않음 — 단순 status 토글이 아니라 폼을 펼치는 별개 동작):
```tsx
<button
  type="button"
  onClick={() => setShowReplaceForm((v) => !v)}
  disabled={pending}
  style={{
    padding:      "6px 12px",
    fontSize:     12,
    borderRadius: 4,
    border:       "1px solid var(--teal)",
    background:   showReplaceForm ? "var(--teal)" : "var(--surface)",
    color:        showReplaceForm ? "white"       : "var(--teal)",
    cursor:       pending ? "wait" : "pointer",
  }}
>
  교체 활성화 {showReplaceForm ? "▲" : "▼"}
</button>
```

(d) 같은 블록 `{!decided && (...)}` 닫힘 직후, 메모 `<input>` 블록(file:210-228) 직전에 폼 mount 추가:
```tsx
{!decided && showReplaceForm && (
  <TriageReplaceForm
    questionId={row.id}
    qSlotCount={row.originalSlotCounts.question}
    eSlotCount={row.originalSlotCounts.explanation}
    qOriginalUrls={row.questionImages.map((i) => i.url)}
    eOriginalUrls={row.explanationImages.map((i) => i.url)}
    note={note}
    onNoteChange={setNote}
    onError={setError}
  />
)}
```

(e) 메모 `<input>` 블록(file:210-228)을 `{!decided && !showReplaceForm && (...)}`로 감싸기 — 폼이 펼쳐졌을 때 중복 메모 입력 방지 (폼 내부에 메모 input이 있음):
```tsx
{!decided && !showReplaceForm && (
  <input
    type="text"
    value={note}
    onChange={(e) => setNote(e.target.value)}
    placeholder="메모 (선택, 분류 시 함께 저장)"
    maxLength={500}
    style={{
      width:        "100%",
      padding:      "6px 10px",
      fontSize:     12,
      borderRadius: 4,
      border:       "1px solid var(--rule)",
      background:   "var(--surface)",
      color:        "var(--text)",
    }}
  />
)}
```

- [ ] **Step 10.2: typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 10.3: 커밋**

```bash
git add vet-exam-ai/app/admin/image-questions/_components/triage-card.tsx
git commit -m "image-replace: TriageCard — 6th action 'replace and activate' + form integration"
```

---

## Task 11: QuestionImageGallery — user-facing component

**Files:**
- Create: `vet-exam-ai/components/QuestionImageGallery.tsx`

- [ ] **Step 11.1: 컴포넌트 작성**

Create `vet-exam-ai/components/QuestionImageGallery.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "../lib/supabase/client";

const BUCKET = "question-images-public";

type Props = {
  files:     string[];
  altPrefix: string;
};

export default function QuestionImageGallery({ files, altPrefix }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [hidden,  setHidden]  = useState<Set<number>>(() => new Set());

  const supabase = createClient();

  const urls = files.map((f) =>
    supabase.storage.from(BUCKET).getPublicUrl(f).data.publicUrl,
  );
  const visibleIndexes = urls.map((_, i) => i).filter((i) => !hidden.has(i));

  const close = useCallback(() => setOpenIdx(null), []);
  const next  = useCallback(
    () => setOpenIdx((i) => {
      if (i === null) return null;
      const pos = visibleIndexes.indexOf(i);
      return visibleIndexes[(pos + 1) % visibleIndexes.length];
    }),
    [visibleIndexes],
  );
  const prev = useCallback(
    () => setOpenIdx((i) => {
      if (i === null) return null;
      const pos = visibleIndexes.indexOf(i);
      return visibleIndexes[(pos - 1 + visibleIndexes.length) % visibleIndexes.length];
    }),
    [visibleIndexes],
  );

  useEffect(() => {
    if (openIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft")  prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIdx, close, next, prev]);

  if (visibleIndexes.length === 0) return null;

  const isSingle = visibleIndexes.length === 1;

  return (
    <>
      <div
        style={{
          display:   "grid",
          gridTemplateColumns: isSingle ? "1fr" : "repeat(2, 1fr)",
          gap:       8,
          margin:    "16px 0",
          maxWidth:  isSingle ? 600 : "100%",
        }}
      >
        {urls.map((url, idx) => {
          if (hidden.has(idx)) return null;
          return (
            <button
              key={url}
              type="button"
              onClick={() => setOpenIdx(idx)}
              style={{
                padding: 0,
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                background: "var(--surface)",
                cursor: "zoom-in",
                width: "100%",
              }}
              aria-label={`${altPrefix} ${idx + 1} 크게 보기`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`${altPrefix} ${idx + 1}`}
                onError={() => setHidden((prev) => new Set(prev).add(idx))}
                style={{ width: "100%", height: "auto", display: "block" }}
                loading="lazy"
              />
            </button>
          );
        })}
      </div>

      {openIdx !== null && (
        <Lightbox
          src={urls[openIdx]}
          alt={`${altPrefix} ${openIdx + 1}`}
          position={visibleIndexes.indexOf(openIdx) + 1}
          total={visibleIndexes.length}
          onClose={close}
          onNext={visibleIndexes.length > 1 ? next : undefined}
          onPrev={visibleIndexes.length > 1 ? prev : undefined}
        />
      )}
    </>
  );
}

function Lightbox({
  src,
  alt,
  position,
  total,
  onClose,
  onNext,
  onPrev,
}: {
  src: string;
  alt: string;
  position: number;
  total: number;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  return (
    <div
      onClick={onClose}
      onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStartX === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 60) {
          if (dx < 0 && onNext) onNext();
          else if (dx > 0 && onPrev) onPrev();
        }
        setTouchStartX(null);
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          cursor: "default",
        }}
      />
      {onPrev && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label="이전 이미지"
          style={navBtnStyle("left")}
        >
          ‹
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label="다음 이미지"
          style={navBtnStyle("right")}
        >
          ›
        </button>
      )}
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 20,
          color: "#fff",
          fontSize: 13,
          fontFamily: "var(--font-mono)",
        }}
      >
        {position} / {total}
      </div>
    </div>
  );
}

function navBtnStyle(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    [side]: 16,
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.15)",
    color: "#fff",
    border: "none",
    fontSize: 28,
    lineHeight: 1,
    cursor: "pointer",
  };
}
```

- [ ] **Step 11.2: typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 11.3: 커밋**

```bash
git add vet-exam-ai/components/QuestionImageGallery.tsx
git commit -m "image-replace: QuestionImageGallery — user-facing inline + lightbox"
```

---

## Task 12: QuestionReadOnly — integrate gallery

**Files:**
- Modify: `vet-exam-ai/components/QuestionReadOnly.tsx`

- [ ] **Step 12.1: import 추가**

Modify `vet-exam-ai/components/QuestionReadOnly.tsx` — line 1-5 부근의 import block에 추가:

```tsx
import QuestionImageGallery from "./QuestionImageGallery";
```

- [ ] **Step 12.2: stem 다음 + 해설 안에 gallery 삽입**

(a) Question stem 블록(file:69-75) `</h2>` 직후에 추가:
```tsx
{question.questionImageFiles && question.questionImageFiles.length > 0 && (
  <QuestionImageGallery
    files={question.questionImageFiles}
    altPrefix="문제 이미지"
  />
)}
```

(b) 해설 블록(file:135-161) 안 — `<p>` 태그(file:153-156) 다음에 추가:
```tsx
{question.explanationImageFiles && question.explanationImageFiles.length > 0 && (
  <QuestionImageGallery
    files={question.explanationImageFiles}
    altPrefix="해설 이미지"
  />
)}
```

- [ ] **Step 12.3: typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 12.4: 커밋**

```bash
git add vet-exam-ai/components/QuestionReadOnly.tsx
git commit -m "image-replace: QuestionReadOnly — render gallery for stem + explanation"
```

---

## Task 13: lint + final typecheck

- [ ] **Step 13.1: lint**

```bash
cd vet-exam-ai && npm run lint
```

Expected: 0 errors. 경고는 기존 코드 패턴이면 무시 가능.

- [ ] **Step 13.2: 전체 typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 13.3 (필요 시): build smoke test**

```bash
cd vet-exam-ai && npm run build
```

Expected: 빌드 성공. 이 단계는 시간이 오래 걸리므로 lint/typecheck 통과 시 생략 가능 — Vercel preview에서 자동 검증.

---

## Task 14: Manual verification (admin 본인 계정)

> 이 단계는 사용자가 brower에서 수행. 결과를 Claude에게 보고.

- [ ] **Step 14.1: dev 서버 기동**

```bash
cd vet-exam-ai && npm run dev
```

Expected: `Ready in ...s` + `http://localhost:3000`.

- [ ] **Step 14.2: Happy path (1 slot)**

1. `/admin/image-questions` 진입
2. 1개 슬롯 문제 한 건 선택 (외과 카테고리 권장)
3. "교체 활성화 ▼" 클릭 → 폼 펼침
4. 슬롯 1에 임의 이미지 (jpg/png/webp 무관) 업로드 → 미리보기 + "교체 활성화" 버튼 활성화 확인
5. "교체 활성화" 클릭 → 카드가 "교체 후 활성화" pill로 변경 + form 닫힘
6. Supabase Dashboard → Table Editor → questions → 해당 행 확인:
   - `question_image_files` = `['<id_slug>_q_0_<ts>.webp']`
   - `question_image_files_original` = `['<원래 파일명>']`
   - `is_active` = `true`

- [ ] **Step 14.3: 사용자측 렌더링**

1. 비-incognito tab에서 `/questions/<해당 id>` 또는 `/questions/<KVLE-NNNN>` 접근
2. 문제 본문(stem) 아래에 교체본 이미지 표시 확인
3. 이미지 클릭 → lightbox 모달 → ESC로 닫기

- [ ] **Step 14.4: revert**

1. `/admin/image-questions`에서 같은 카드의 "분류 되돌리기" 클릭
2. 카드 상태가 미분류로 복귀 + "교체 활성화 ▼" 다시 사용 가능
3. Supabase 확인:
   - `question_image_files` = `['<원래 파일명>']`
   - `question_image_files_original` = `null`
   - `is_active` = `false` (has_image 태그 있으므로)
4. 사용자측 페이지: `is_active=false`로 list에서 사라짐 → 직접 URL 접근 시 다시 has_image 비활성 정책 적용

- [ ] **Step 14.5: Multi-slot**

1. 슬롯 2-3개짜리 문제 골라서 한 슬롯만 채움 → "교체 활성화" 버튼 disabled 확인
2. 모든 슬롯 채움 → 활성화 → DB 확인

- [ ] **Step 14.6: 에러 시나리오**

1. 비정상 큰 파일(10MB+) 업로드 → "too_large" 에러 표시
2. devtools console에서 비-admin user로 직접 RPC 호출 시도 (가능하면) → `forbidden: admin only`

- [ ] **Step 14.7: 결과 보고**

성공/실패 시나리오를 Claude에게 보고. 실패 시 콘솔 에러 + Supabase Logs 함께 전달.

---

## Task 15: PR push

> Verification 통과 후. CRITICAL: 사용자 명시 승인 후에만 진행 (memory 함정 — subagent가 자동 push해버린 케이스 회피).

- [ ] **Step 15.1: 커밋 로그 확인**

```bash
git log --oneline main..feat/image-replacement
```

Expected: 본 plan의 12-13개 커밋 표시.

- [ ] **Step 15.2: push (사용자 승인 후)**

```bash
git push -u origin feat/image-replacement
```

- [ ] **Step 15.3: PR 생성 (사용자 승인 후)**

Windows에 `gh` CLI 미설치 가능성 — `pre_done.md` 참고. 미설치 시 사용자에게 PR URL 직접 만들도록 안내:
```
https://github.com/<owner>/<repo>/compare/main...feat/image-replacement?expand=1
```

PR title 예시: `feat: image replacement — admin upload + user-facing render`
PR body 템플릿:
```
## Summary
- 분류 큐(/admin/image-questions)에서 저작권 위험 원본을 admin 자작 교체본으로 swap
- 신규 enum `activate_with_replacement` + `_original` 백업 컬럼 + public Storage 버킷
- 사용자측 /questions/[id]에 교체본 inline + lightbox 렌더링

## Test plan
- [x] Happy path (1 slot)
- [x] 사용자측 렌더링 + lightbox
- [x] revert
- [x] multi-slot disabled gating
- [x] 에러 시나리오

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
