# Image Triage Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `is_active=false`로 보류된 374건(`has_image=true`)을 admin이 5종 액션 중 하나로 분류하는 워크플로우. `activate_no_image`는 즉시 공개, 나머지 4종은 후속 처리 큐에 적재.

**Architecture:** (1) 마이그 — `image_triage_status` enum + `question_image_triage` 테이블(1:1) + 비공개 Storage 버킷 + 3종 RPC + `questions`에 이미지 파일명 컬럼 2개. (2) Pipeline — `upload_images.py`(Storage 업로드) + `backfill_image_files.py`(메타 1회 백필) + `upload.py` 신규 컬럼 적재 패치. (3) UI — `/admin/image-questions` 라우트(서버 fetch + 필터 + 카드 리스트 + 일괄 액션 바 + 단순 lightbox). (4) `/admin` 대시보드 카드 + 사이드바 진입.

**Tech Stack:** Next.js 16 App Router + React 19, `@supabase/ssr` server client, PostgreSQL (enum, generated columns, plpgsql SECURITY DEFINER RPC, Storage policies), httpx + python-dotenv (pipeline scripts).

**Spec:** `vet-exam-ai/docs/superpowers/specs/2026-04-30-image-questions-triage-queue-design.md`

**Branch:** `feat/image-triage-queue` (이미 생성됨, spec commit `0ebae1c` 적재)

**중요 — 경로 규칙:**
- Web 코드: `vet-exam-ai/...` (예: `vet-exam-ai/app/admin/image-questions/page.tsx`)
- 마이그: `vet-exam-ai/supabase/migrations/...`
- Pipeline: `pipeline/...` (레포 루트, 중첩 X)
- Spec/Plan: `vet-exam-ai/docs/superpowers/...`
- 모든 git/npm 명령은 `vet-exam-ai/`에서 실행 (또는 `git -C vet-exam-ai`)
- typecheck 명령은 `npm run typecheck` 없음 — 반드시 `cd vet-exam-ai && npx tsc --noEmit`

---

## Pre-flight

- [ ] **Step P-1: 브랜치/커밋 확인**

```bash
git -C vet-exam-ai status
git -C vet-exam-ai log --oneline -3
```

Expected: `On branch feat/image-triage-queue` clean, 최근 커밋에 `0ebae1c spec: image-triage-queue ...` 보임.

- [ ] **Step P-2: 최신 마이그 timestamp 확인**

```bash
ls vet-exam-ai/supabase/migrations | tail -3
```

Expected: 최신이 `20260505000000_search_v1.sql`. 신규 파일은 `20260506000000_image_triage.sql`로 작성.

---

## Task 1: Migration SQL — enum + table + RLS + columns + bucket + 3 RPCs

**Files:**
- Create: `vet-exam-ai/supabase/migrations/20260506000000_image_triage.sql`

- [ ] **Step 1.1: 마이그레이션 파일 작성**

Create `vet-exam-ai/supabase/migrations/20260506000000_image_triage.sql` with this exact content:

```sql
-- =============================================================================
-- Image triage queue — admin 5-action workflow for has_image questions
-- =============================================================================
-- Adds:
--   1. image_triage_status enum (pending / activate_no_image / needs_rewrite /
--      needs_rebuild / needs_license / remove)
--   2. audit_action enum extension (image_triage_decide, image_triage_revert)
--   3. question_image_triage table (1:1 with questions, admin-only RLS)
--   4. questions.question_image_files / explanation_image_files (text[])
--   5. Storage bucket question-images-private (admin signed URL only)
--   6. RPCs: triage_question_decide, triage_questions_bulk_activate,
--            triage_question_revert (all SECURITY DEFINER + admin guard)
-- =============================================================================

-- 1. enum 신설
do $$ begin
  if not exists (select 1 from pg_type where typname = 'image_triage_status') then
    create type public.image_triage_status as enum (
      'pending',
      'activate_no_image',
      'needs_rewrite',
      'needs_rebuild',
      'needs_license',
      'remove'
    );
  end if;
end $$;

-- 2. audit_action 확장
alter type public.audit_action add value if not exists 'image_triage_decide';
alter type public.audit_action add value if not exists 'image_triage_revert';

-- 3. 분류 상태 테이블
create table if not exists public.question_image_triage (
  question_id  uuid primary key references public.questions(id) on delete cascade,
  status       public.image_triage_status not null,
  note         text,
  decided_by   uuid not null references auth.users(id),
  decided_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists question_image_triage_status_idx
  on public.question_image_triage(status);

create index if not exists question_image_triage_decided_at_idx
  on public.question_image_triage(decided_at desc);

-- updated_at 트리거 (set_updated_at은 기존 community 마이그에서 정의됨)
drop trigger if exists question_image_triage_set_updated_at on public.question_image_triage;
create trigger question_image_triage_set_updated_at
  before update on public.question_image_triage
  for each row execute function public.set_updated_at();

-- 4. RLS — admin only
alter table public.question_image_triage enable row level security;

drop policy if exists "admin read triage" on public.question_image_triage;
create policy "admin read triage" on public.question_image_triage
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'admin' and p.is_active
  ));

drop policy if exists "admin write triage" on public.question_image_triage;
create policy "admin write triage" on public.question_image_triage
  for all to authenticated
  using (exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'admin' and p.is_active
  ))
  with check (exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'admin' and p.is_active
  ));

-- 5. 이미지 파일명 컬럼 (questions)
alter table public.questions
  add column if not exists question_image_files    text[] not null default '{}',
  add column if not exists explanation_image_files text[] not null default '{}';

-- 6. Storage 버킷 (private)
insert into storage.buckets (id, name, public)
values ('question-images-private', 'question-images-private', false)
on conflict (id) do nothing;

drop policy if exists "admin signed url access" on storage.objects;
create policy "admin signed url access" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'question-images-private'
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'admin' and p.is_active
    )
  );

-- =============================================================================
-- RPC 1: 단건 분류 (upsert + activate_no_image면 is_active=true 동시 flip)
-- =============================================================================
create or replace function public.triage_question_decide(
  p_question_id uuid,
  p_status      public.image_triage_status,
  p_note        text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id   uuid := auth.uid();
  v_old_status public.image_triage_status;
begin
  if not exists (
    select 1 from profiles
     where id = v_admin_id and role = 'admin' and is_active
  ) then
    raise exception 'forbidden: admin only';
  end if;

  select status into v_old_status
    from question_image_triage where question_id = p_question_id;

  insert into question_image_triage (question_id, status, note, decided_by)
  values (p_question_id, p_status, p_note, v_admin_id)
  on conflict (question_id) do update
    set status     = excluded.status,
        note       = excluded.note,
        decided_by = excluded.decided_by,
        decided_at = now(),
        updated_at = now();

  if p_status = 'activate_no_image' then
    update questions set is_active = true where id = p_question_id;
  end if;

  perform log_admin_action(
    'image_triage_decide'::audit_action,
    'question',
    p_question_id::text,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_status, 'note', p_note),
    null
  );
end $$;

revoke all on function public.triage_question_decide(uuid, public.image_triage_status, text) from public;
grant execute on function public.triage_question_decide(uuid, public.image_triage_status, text) to authenticated;

-- =============================================================================
-- RPC 2: 일괄 활성화 (activate_no_image 전용, 단일 트랜잭션)
-- =============================================================================
create or replace function public.triage_questions_bulk_activate(
  p_ids  uuid[],
  p_note text default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_count    int;
begin
  if not exists (
    select 1 from profiles
     where id = v_admin_id and role = 'admin' and is_active
  ) then
    raise exception 'forbidden: admin only';
  end if;

  insert into question_image_triage (question_id, status, note, decided_by)
  select unnest(p_ids), 'activate_no_image', p_note, v_admin_id
  on conflict (question_id) do update
    set status     = 'activate_no_image',
        note       = excluded.note,
        decided_by = excluded.decided_by,
        decided_at = now(),
        updated_at = now();

  update questions set is_active = true where id = any(p_ids);
  get diagnostics v_count = row_count;

  perform log_admin_action(
    'image_triage_decide'::audit_action,
    'question_batch',
    'bulk-' || extract(epoch from now())::text,
    null,
    jsonb_build_object('count', v_count, 'ids', to_jsonb(p_ids), 'note', p_note),
    null
  );
  return v_count;
end $$;

revoke all on function public.triage_questions_bulk_activate(uuid[], text) from public;
grant execute on function public.triage_questions_bulk_activate(uuid[], text) to authenticated;

-- =============================================================================
-- RPC 3: 되돌리기 (triage row 삭제 + is_active 원본 정책으로 원복)
-- =============================================================================
create or replace function public.triage_question_revert(
  p_question_id uuid
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

  -- pipeline 원본 정책 (`upload.py:67`): has_image면 is_active=false
  update questions
     set is_active = not ('has_image' = any(tags))
   where id = p_question_id;

  perform log_admin_action(
    'image_triage_revert'::audit_action,
    'question',
    p_question_id::text,
    jsonb_build_object('status', v_old.status, 'note', v_old.note),
    null,
    null
  );
end $$;

revoke all on function public.triage_question_revert(uuid) from public;
grant execute on function public.triage_question_revert(uuid) to authenticated;
```

- [ ] **Step 1.2: 검증 SQL을 README 메모로 작성** (실제 적용은 머지 후 SQL Editor)

이 단계는 코드 변경 없이 plan 본인의 검증 SQL 섹션 보존만. 머지 후 SQL Editor 적용 시 아래 7개 쿼리 실행:

```sql
-- (1) enum 확인
select unnest(enum_range(null::image_triage_status));
-- (2) 테이블 + 인덱스
select tablename from pg_tables where tablename = 'question_image_triage';
select indexname from pg_indexes where tablename = 'question_image_triage';
-- (3) RLS 정책 2개
select policyname from pg_policies where tablename = 'question_image_triage';
-- (4) questions 신규 컬럼 2개
select column_name from information_schema.columns
 where table_name = 'questions' and column_name like '%_image_files';
-- (5) 버킷
select * from storage.buckets where id = 'question-images-private';
-- (6) Storage 정책
select policyname from pg_policies
 where schemaname = 'storage' and policyname = 'admin signed url access';
-- (7) RPC 3종
select proname from pg_proc where proname like 'triage_%';
```

- [ ] **Step 1.3: 커밋**

```bash
git -C vet-exam-ai add supabase/migrations/20260506000000_image_triage.sql
git -C vet-exam-ai commit -m "image-triage: migration — enum + table + RLS + columns + bucket + 3 RPCs"
```

---

## Task 2: pipeline/upload_images.py — Storage 일괄 업로드 스크립트

**Files:**
- Create: `pipeline/upload_images.py`

- [ ] **Step 2.1: 스크립트 작성**

Create `pipeline/upload_images.py` with this exact content:

```python
"""pipeline/output/images/ → Supabase Storage (question-images-private) 업로드.

Usage:
    python upload_images.py --all
    python upload_images.py --all --dry-run
    python upload_images.py --all --filter 1.1
    python upload_images.py --all --limit 50

규칙:
    - 비공개 버킷 question-images-private 에 동일 파일명으로 upsert
    - 신규 회차 추가 시 그대로 재실행 (idempotent)
    - service_role key 사용 (RLS bypass)

Env (pipeline/.env):
    SUPABASE_URL          (예: https://tjltxwvtnbwilgaokfyw.supabase.co)
    SUPABASE_SERVICE_KEY  (service_role key)
"""

from __future__ import annotations

import argparse
import mimetypes
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

PIPELINE_ROOT = Path(__file__).parent
IMAGES_ROOT   = PIPELINE_ROOT / "output" / "images"
BUCKET        = "question-images-private"

load_dotenv(PIPELINE_ROOT / ".env")

# Windows CP949 회피 — 한국어 파일명 출력 안전
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)


def guess_content_type(filename: str) -> str:
    ct, _ = mimetypes.guess_type(filename)
    if ct:
        return ct
    ext = filename.rsplit(".", 1)[-1].lower()
    return {
        "bmp":  "image/bmp",
        "jpg":  "image/jpeg",
        "jpeg": "image/jpeg",
        "png":  "image/png",
        "gif":  "image/gif",
        "webp": "image/webp",
    }.get(ext, "application/octet-stream")


def upload_one(client: httpx.Client, url: str, key: str, filepath: Path) -> bool:
    """단일 파일 업로드 (upsert). 성공 시 True."""
    with open(filepath, "rb") as f:
        body = f.read()

    response = client.post(
        f"{url}/storage/v1/object/{BUCKET}/{key}",
        headers={
            "Content-Type":  guess_content_type(filepath.name),
            "x-upsert":      "true",
            "Cache-Control": "max-age=3600",
        },
        content=body,
        timeout=60.0,
    )
    if response.status_code in (200, 201):
        return True
    print(f"  [fail] {key}: HTTP {response.status_code} {response.text[:200]}")
    return False


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--all", action="store_true", help="output/images/ 전체 업로드")
    p.add_argument("--filter", help="파일명 부분 매칭 포함만")
    p.add_argument("--exclude", action="append", default=[], help="파일명 부분 매칭 제외 (여러 번)")
    p.add_argument("--limit", type=int, help="최대 N개 (테스트)")
    p.add_argument("--dry-run", action="store_true", help="업로드 없이 대상 파일 목록만")
    args = p.parse_args()

    if not args.all:
        p.error("--all 필수")

    url     = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not service:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY 설정되지 않음 (pipeline/.env)")

    if not IMAGES_ROOT.exists():
        sys.exit(f"이미지 디렉터리 없음: {IMAGES_ROOT}")

    files = sorted(IMAGES_ROOT.iterdir())
    files = [f for f in files if f.is_file()]
    if args.filter:
        files = [f for f in files if args.filter in f.name]
    for ex in args.exclude:
        files = [f for f in files if ex not in f.name]
    if args.limit:
        files = files[: args.limit]

    if args.dry_run:
        print(f"[dry-run] 대상 {len(files)}개")
        for f in files[:10]:
            print(f"  {f.name} ({guess_content_type(f.name)}, {f.stat().st_size} bytes)")
        if len(files) > 10:
            print(f"  ... +{len(files) - 10}")
        return

    print(f"[upload] 대상 {len(files)}개 → bucket={BUCKET}")
    success = 0
    failed  = 0
    with httpx.Client(headers={
        "apikey":        service,
        "Authorization": f"Bearer {service}",
    }) as client:
        for i, f in enumerate(files, 1):
            ok = upload_one(client, url, f.name, f)
            if ok:
                success += 1
            else:
                failed += 1
            if i % 50 == 0 or i == len(files):
                print(f"  [{i}/{len(files)}] success={success} failed={failed}")

    print(f"[done] success={success} failed={failed}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2.2: 스크립트 import 검증** (실행은 머지 후, dry-run 한 번만)

Run: `cd pipeline && .venv/Scripts/python.exe -c "import upload_images; print('OK')"`
Expected: `OK`

(실제 실행은 머지 후 운영 단계에서 `pipeline/.venv/Scripts/python.exe pipeline/upload_images.py --all --dry-run` → 대상 ~2208개 확인 후 `--all` 본실행.)

- [ ] **Step 2.3: 커밋**

```bash
git -C vet-exam-ai add ../pipeline/upload_images.py
git -C vet-exam-ai commit -m "image-triage: pipeline upload_images.py — Storage upsert (idempotent)"
```

(주의: pipeline은 레포 루트라 git에서 `../pipeline/...` 경로지만, 실제로는 같은 git 워킹트리. `git -C vet-exam-ai`도 같은 레포 가리킴. 위 명령이 안 되면 `git add pipeline/upload_images.py`를 레포 루트에서 실행.)

---

## Task 3: pipeline/backfill_image_files.py — 메타 컬럼 1회 백필

**Files:**
- Create: `pipeline/backfill_image_files.py`

- [ ] **Step 3.1: 스크립트 작성**

Create `pipeline/backfill_image_files.py` with this exact content:

```python
"""rewritten JSON → questions.question_image_files / explanation_image_files
컬럼만 UPDATE. is_active / tags 등 다른 컬럼은 절대 건드리지 않음.

374건 1회 백필 전용. 신규 회차 추가 시엔 upload.py가 처리.

Usage:
    python backfill_image_files.py --all
    python backfill_image_files.py --all --dry-run
    python backfill_image_files.py --all --filter 1.1
    python backfill_image_files.py --all --limit 50
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

PIPELINE_ROOT  = Path(__file__).parent
REWRITTEN_ROOT = PIPELINE_ROOT / "output" / "rewritten"

load_dotenv(PIPELINE_ROOT / ".env")
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)


def patch_question(client: httpx.Client, url: str, qid: str,
                   question_files: list[str], explanation_files: list[str]) -> bool:
    """단일 row UPDATE — 두 컬럼만."""
    response = client.patch(
        f"{url}/rest/v1/questions",
        params={"id": f"eq.{qid}"},
        headers={
            "Content-Type": "application/json",
            "Prefer":       "return=minimal",
        },
        json={
            "question_image_files":    question_files,
            "explanation_image_files": explanation_files,
        },
        timeout=30.0,
    )
    if response.status_code in (200, 204):
        return True
    print(f"  [fail] {qid}: HTTP {response.status_code} {response.text[:200]}")
    return False


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--all", action="store_true", help="rewritten/ 전체 처리")
    p.add_argument("--filter", help="파일명 부분 매칭 포함만")
    p.add_argument("--exclude", action="append", default=[], help="파일명 부분 매칭 제외 (여러 번)")
    p.add_argument("--limit", type=int, help="파일당 N문제 (테스트)")
    p.add_argument("--dry-run", action="store_true", help="DB write 없이 대상 미리보기")
    args = p.parse_args()

    if not args.all:
        p.error("--all 필수")

    url     = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not service:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY 설정되지 않음 (pipeline/.env)")

    if not REWRITTEN_ROOT.exists():
        sys.exit(f"rewritten 디렉터리 없음: {REWRITTEN_ROOT}")

    files = sorted(REWRITTEN_ROOT.glob("*.json"))
    if args.filter:
        files = [f for f in files if args.filter in f.name]
    for ex in args.exclude:
        files = [f for f in files if ex not in f.name]

    print(f"[backfill] 대상 파일 {len(files)}개")
    total_q = 0
    total_with_img = 0
    success = 0
    failed  = 0

    with httpx.Client(headers={
        "apikey":        service,
        "Authorization": f"Bearer {service}",
    }) as client:
        for fi, fpath in enumerate(files, 1):
            with open(fpath, encoding="utf-8") as f:
                doc = json.load(f)
            questions = doc.get("questions") or []
            if args.limit:
                questions = questions[: args.limit]

            for q in questions:
                total_q += 1
                qfiles = q.get("question_images") or []
                efiles = q.get("explanation_images") or []
                if not qfiles and not efiles:
                    continue
                total_with_img += 1
                qid = q.get("id")
                if not qid:
                    continue

                if args.dry_run:
                    print(f"  [dry-run] {qid}: q={qfiles[:2]}{'...' if len(qfiles) > 2 else ''} "
                          f"e={efiles[:2]}{'...' if len(efiles) > 2 else ''}")
                    continue

                ok = patch_question(client, url, qid, qfiles, efiles)
                if ok:
                    success += 1
                else:
                    failed += 1

            if fi % 10 == 0 or fi == len(files):
                print(f"  [{fi}/{len(files)}] questions={total_q} with_img={total_with_img} "
                      f"success={success} failed={failed}")

    print(f"[done] questions={total_q} with_img={total_with_img} success={success} failed={failed}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 3.2: import 검증**

Run: `cd pipeline && .venv/Scripts/python.exe -c "import backfill_image_files; print('OK')"`
Expected: `OK`

- [ ] **Step 3.3: 커밋**

```bash
git -C vet-exam-ai add ../pipeline/backfill_image_files.py
git -C vet-exam-ai commit -m "image-triage: pipeline backfill_image_files.py — one-shot metadata backfill"
```

---

## Task 4: pipeline/upload.py 패치 — 신규 컬럼 적재

**Files:**
- Modify: `pipeline/upload.py:51-68` (`build_row` 리턴 dict)
- Modify: `pipeline/upload.py:1-23` (docstring 갱신)

- [ ] **Step 4.1: build_row에 두 컬럼 추가**

Edit `pipeline/upload.py`. 현재 `build_row`의 return dict (line 51~68 영역):

```python
    return {
        "id":              q["id"],
        "question":        q["question"],
        ...
        "tags":            tags,
        "is_active":       not has_image,
    }
```

위 dict의 `"is_active": not has_image,` 다음 줄에 두 항목 추가 — closing brace 바로 위:

```python
        "tags":            tags,
        "is_active":       not has_image,
        "question_image_files":    q.get("question_images", []),
        "explanation_image_files": q.get("explanation_images", []),
    }
```

- [ ] **Step 4.2: docstring "미지원" 섹션 갱신**

`pipeline/upload.py` 파일 상단 docstring의 "미지원 (out of scope)" 섹션:

```python
미지원 (out of scope):
    - 이미지를 Supabase Storage 로 업로드 (Phase 2)
    - 기존 row 정리/삭제 (드물게 필요할 때 수동 SQL)
"""
```

다음으로 교체:

```python
미지원 (out of scope):
    - 이미지를 Supabase Storage 로 업로드 → upload_images.py 사용
    - 기존 row 정리/삭제 (드물게 필요할 때 수동 SQL)

주의: 이미지 분류 시작 후 374건 대상으로 재실행 금지. is_active=false 로 reset됨.
"""
```

- [ ] **Step 4.3: 커밋**

```bash
git -C vet-exam-ai add ../pipeline/upload.py
git -C vet-exam-ai commit -m "image-triage: pipeline upload.py — populate image file columns on new rows"
```

---

## Task 5: lib/supabase/types.ts — 신규 enum + 테이블 + RPC 시그니처

**Files:**
- Modify: `vet-exam-ai/lib/supabase/types.ts`

- [ ] **Step 5.1: 현재 types.ts 확인**

Run: `head -80 vet-exam-ai/lib/supabase/types.ts`
Expected: 기존 `Database` 인터페이스 + `Tables` / `Enums` / `Functions` 섹션 확인.

- [ ] **Step 5.2: Enums에 image_triage_status 추가**

Edit `vet-exam-ai/lib/supabase/types.ts`. `Enums` 섹션 (또는 `Database["public"]["Enums"]`) 안에 추가:

```ts
image_triage_status:
  | "pending"
  | "activate_no_image"
  | "needs_rewrite"
  | "needs_rebuild"
  | "needs_license"
  | "remove";
```

audit_action enum이 이미 정의돼 있으면 그 union에 두 값 추가:

```ts
// 기존:
audit_action: "..." | "report_uphold" | "report_dismiss" | ...
// 변경:
audit_action: "..." | "report_uphold" | "report_dismiss" | ... | "image_triage_decide" | "image_triage_revert"
```

- [ ] **Step 5.3: questions 테이블에 신규 컬럼 추가**

`Database["public"]["Tables"]["questions"]["Row"]` (또는 동등 위치)에 추가:

```ts
question_image_files:    string[];
explanation_image_files: string[];
```

`Insert` / `Update` 타입에도 동일 (optional):

```ts
question_image_files?:    string[];
explanation_image_files?: string[];
```

- [ ] **Step 5.4: question_image_triage 테이블 타입 추가**

`Database["public"]["Tables"]` 객체에 신규 키 추가:

```ts
question_image_triage: {
  Row: {
    question_id: string;
    status:      Database["public"]["Enums"]["image_triage_status"];
    note:        string | null;
    decided_by:  string;
    decided_at:  string;
    updated_at:  string;
  };
  Insert: {
    question_id: string;
    status:      Database["public"]["Enums"]["image_triage_status"];
    note?:       string | null;
    decided_by:  string;
    decided_at?: string;
    updated_at?: string;
  };
  Update: {
    question_id?: string;
    status?:      Database["public"]["Enums"]["image_triage_status"];
    note?:        string | null;
    decided_by?:  string;
    decided_at?:  string;
    updated_at?:  string;
  };
  Relationships: [];
};
```

- [ ] **Step 5.5: Functions에 RPC 3종 시그니처 추가**

`Database["public"]["Functions"]` 객체에 추가:

```ts
triage_question_decide: {
  Args: {
    p_question_id: string;
    p_status:      Database["public"]["Enums"]["image_triage_status"];
    p_note?:       string | null;
  };
  Returns: void;
};
triage_questions_bulk_activate: {
  Args: {
    p_ids:  string[];
    p_note?: string | null;
  };
  Returns: number;
};
triage_question_revert: {
  Args: {
    p_question_id: string;
  };
  Returns: void;
};
```

- [ ] **Step 5.6: typecheck 통과 확인**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors. (이 단계에서 신규 컬럼/테이블 사용처 0개라 단순 추가만으로 통과.)

- [ ] **Step 5.7: 커밋**

```bash
git -C vet-exam-ai add lib/supabase/types.ts
git -C vet-exam-ai commit -m "image-triage: types — image_triage_status enum + question_image_triage table + 3 RPCs + image file columns"
```

---

## Task 6: lib/admin/triage-labels.ts — 5종 status Korean 라벨 + 색상

**Files:**
- Create: `vet-exam-ai/lib/admin/triage-labels.ts`

- [ ] **Step 6.1: 라벨 모듈 작성**

Create `vet-exam-ai/lib/admin/triage-labels.ts` with this exact content:

```ts
import type { Database } from "../supabase/types";

export type ImageTriageStatus = Database["public"]["Enums"]["image_triage_status"];

export const TRIAGE_STATUS_ORDER: ImageTriageStatus[] = [
  "pending",
  "activate_no_image",
  "needs_rewrite",
  "needs_rebuild",
  "needs_license",
  "remove",
];

export const TRIAGE_STATUS_LABEL: Record<ImageTriageStatus, string> = {
  pending:           "미분류",
  activate_no_image: "이미지 없이 활성화",
  needs_rewrite:     "재작성 필요",
  needs_rebuild:     "도식 재제작",
  needs_license:     "라이선스 필요",
  remove:            "폐기",
};

export const TRIAGE_STATUS_SHORT: Record<ImageTriageStatus, string> = {
  pending:           "미분류",
  activate_no_image: "활성화",
  needs_rewrite:     "재작성",
  needs_rebuild:     "재제작",
  needs_license:     "라이선스",
  remove:            "폐기",
};

// Tailwind/CSS color tokens — admin pill 색상
export const TRIAGE_STATUS_COLOR: Record<ImageTriageStatus, { bg: string; fg: string }> = {
  pending:           { bg: "var(--surface-raised)", fg: "var(--text-muted)" },
  activate_no_image: { bg: "rgba(34, 197, 94, 0.12)",  fg: "rgb(22, 163, 74)" }, // green
  needs_rewrite:     { bg: "rgba(234, 179, 8, 0.12)",  fg: "rgb(161, 98, 7)"  }, // yellow
  needs_rebuild:     { bg: "rgba(59, 130, 246, 0.12)", fg: "rgb(29, 78, 216)" }, // blue
  needs_license:     { bg: "rgba(249, 115, 22, 0.12)", fg: "rgb(194, 65, 12)" }, // orange
  remove:            { bg: "rgba(239, 68, 68, 0.12)",  fg: "rgb(185, 28, 28)" }, // red
};

export function isImageTriageStatus(v: unknown): v is ImageTriageStatus {
  return typeof v === "string" && TRIAGE_STATUS_ORDER.includes(v as ImageTriageStatus);
}
```

- [ ] **Step 6.2: typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6.3: 커밋**

```bash
git -C vet-exam-ai add lib/admin/triage-labels.ts
git -C vet-exam-ai commit -m "image-triage: lib — triage status labels and colors"
```

---

## Task 7: lib/admin/triage.ts — 서버 액션 wrapper (3종 RPC)

**Files:**
- Create: `vet-exam-ai/lib/admin/triage.ts`

- [ ] **Step 7.1: 서버 액션 모듈 작성**

Create `vet-exam-ai/lib/admin/triage.ts` with this exact content:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import type { ImageTriageStatus } from "./triage-labels";

export type TriageActionResult =
  | { ok: true; count?: number }
  | { ok: false; error: string };

export async function triageQuestionDecide(
  questionId: string,
  status: ImageTriageStatus,
  note: string | null,
): Promise<TriageActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("triage_question_decide", {
    p_question_id: questionId,
    p_status:      status,
    p_note:        note,
  });
  if (error) {
    console.error("[triage] decide failed", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/image-questions");
  revalidatePath("/admin");
  return { ok: true };
}

export async function triageQuestionsBulkActivate(
  ids: string[],
  note: string | null,
): Promise<TriageActionResult> {
  if (ids.length === 0) return { ok: false, error: "선택된 항목이 없습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("triage_questions_bulk_activate", {
    p_ids:  ids,
    p_note: note,
  });
  if (error) {
    console.error("[triage] bulk activate failed", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/image-questions");
  revalidatePath("/admin");
  return { ok: true, count: (data as number | null) ?? ids.length };
}

export async function triageQuestionRevert(
  questionId: string,
): Promise<TriageActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("triage_question_revert", {
    p_question_id: questionId,
  });
  if (error) {
    console.error("[triage] revert failed", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/image-questions");
  revalidatePath("/admin");
  return { ok: true };
}
```

- [ ] **Step 7.2: typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7.3: 커밋**

```bash
git -C vet-exam-ai add lib/admin/triage.ts
git -C vet-exam-ai commit -m "image-triage: lib — server actions wrapping 3 RPCs"
```

---

## Task 8: lib/admin/image-triage-storage.ts — signed URL 일괄 발급

**Files:**
- Create: `vet-exam-ai/lib/admin/image-triage-storage.ts`

- [ ] **Step 8.1: signed URL helper 작성**

Create `vet-exam-ai/lib/admin/image-triage-storage.ts` with this exact content:

```ts
import { createClient } from "../supabase/server";

const BUCKET = "question-images-private";
const TTL_SECONDS = 60 * 60; // 1 hour

export type SignedImage = { filename: string; url: string | null };

/**
 * 일괄 signed URL 발급. 파일명 → URL 매핑 반환.
 * createSignedUrls 한 번 호출 (개별 호출 N번보다 빠름).
 * 실패한 파일은 url=null로 표시.
 */
export async function getSignedImageUrls(
  filenames: string[],
): Promise<SignedImage[]> {
  if (filenames.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(filenames, TTL_SECONDS);

  if (error || !data) {
    console.error("[triage-storage] createSignedUrls failed", error);
    return filenames.map((f) => ({ filename: f, url: null }));
  }

  // data 순서가 입력 순서와 같다는 보장이 없으므로 path 기준 매칭
  const map = new Map<string, string | null>();
  for (const item of data) {
    map.set(item.path ?? "", item.signedUrl ?? null);
  }
  return filenames.map((f) => ({ filename: f, url: map.get(f) ?? null }));
}
```

- [ ] **Step 8.2: typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 8.3: 커밋**

```bash
git -C vet-exam-ai add lib/admin/image-triage-storage.ts
git -C vet-exam-ai commit -m "image-triage: lib — bulk signed URL helper for private bucket"
```

---

## Task 9: parse-search-params — image-questions 라우트용

**Files:**
- Create: `vet-exam-ai/app/admin/image-questions/_lib/parse-search-params.ts`

- [ ] **Step 9.1: 디렉터리 + 파일 작성**

Create `vet-exam-ai/app/admin/image-questions/_lib/parse-search-params.ts` with this exact content:

```ts
import { TRIAGE_STATUS_ORDER, type ImageTriageStatus } from "../../../../lib/admin/triage-labels";

export type TriageFilterStatus = "unclassified" | "all" | ImageTriageStatus;

export type ParsedTriageSearchParams = {
  page:     number;
  category?: string;
  round?:    number;
  status:   TriageFilterStatus;
};

const STATUS_VALUES: TriageFilterStatus[] = ["unclassified", "all", ...TRIAGE_STATUS_ORDER];

function int(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function nonEmpty(v: string | undefined, max = 60): string | undefined {
  if (!v) return undefined;
  const trimmed = v.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseTriageSearchParams(
  raw: { [key: string]: string | string[] | undefined },
): ParsedTriageSearchParams {
  const get = (k: string): string | undefined => {
    const v = raw[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const page = Math.max(1, int(get("page")) ?? 1);
  const category = nonEmpty(get("category"));
  const round = int(get("round"));

  const statusRaw = get("status") as TriageFilterStatus | undefined;
  const status: TriageFilterStatus =
    statusRaw && STATUS_VALUES.includes(statusRaw) ? statusRaw : "unclassified";

  return { page, category, round, status };
}

export function buildTriageSearchString(
  current: ParsedTriageSearchParams,
  override: Partial<Record<keyof ParsedTriageSearchParams, string | number | undefined>>,
): string {
  const out = new URLSearchParams();
  const merged: Record<string, string> = {};

  function set(k: string, v: string | number | undefined) {
    if (v === undefined || v === "") return;
    merged[k] = String(v);
  }

  set("page", current.page);
  set("category", current.category);
  set("round", current.round);
  set("status", current.status);

  for (const [k, v] of Object.entries(override)) {
    if (v === undefined || v === null || v === "") {
      delete merged[k];
    } else {
      merged[k] = String(v);
    }
  }

  if (merged.page === "1") delete merged.page;
  if (merged.status === "unclassified") delete merged.status;

  for (const [k, v] of Object.entries(merged)) out.set(k, v);
  const s = out.toString();
  return s ? `?${s}` : "";
}
```

- [ ] **Step 9.2: typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 9.3: 커밋**

```bash
git -C vet-exam-ai add app/admin/image-questions/_lib/parse-search-params.ts
git -C vet-exam-ai commit -m "image-triage: search params parser for queue page"
```

---

## Task 10: triage-image.tsx — 단일 썸네일 (server, signed URL)

**Files:**
- Create: `vet-exam-ai/app/admin/image-questions/_components/triage-image.tsx`

- [ ] **Step 10.1: 컴포넌트 작성**

Create `vet-exam-ai/app/admin/image-questions/_components/triage-image.tsx` with this exact content:

```tsx
import { TriageLightbox } from "./triage-lightbox";

export function TriageImage({
  filename,
  url,
  label,
}: {
  filename: string;
  url: string | null;
  label: string;
}) {
  if (!url) {
    return (
      <div
        title={`업로드 누락: ${filename}`}
        style={{
          width:        96,
          height:       96,
          background:   "var(--surface-raised)",
          border:       "1px dashed var(--rule)",
          color:        "var(--text-muted)",
          fontSize:     11,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          textAlign:    "center",
          padding:      4,
          borderRadius: 4,
        }}
      >
        없음
      </div>
    );
  }

  return <TriageLightbox url={url} filename={filename} label={label} />;
}
```

- [ ] **Step 10.2: 커밋** (lightbox 의존이라 typecheck는 다음 task 후)

```bash
git -C vet-exam-ai add app/admin/image-questions/_components/triage-image.tsx
git -C vet-exam-ai commit -m "image-triage: triage-image — server thumbnail with signed URL"
```

---

## Task 11: triage-lightbox.tsx — 클릭 확대 (client, native dialog)

**Files:**
- Create: `vet-exam-ai/app/admin/image-questions/_components/triage-lightbox.tsx`

- [ ] **Step 11.1: 컴포넌트 작성**

Create `vet-exam-ai/app/admin/image-questions/_components/triage-lightbox.tsx` with this exact content:

```tsx
"use client";

import { useRef } from "react";

export function TriageLightbox({
  url,
  filename,
  label,
}: {
  url: string;
  filename: string;
  label: string;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  function open() {
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        title={`${label}: ${filename} (클릭 시 확대)`}
        style={{
          padding:      0,
          border:       "1px solid var(--rule)",
          borderRadius: 4,
          background:   "var(--surface-raised)",
          cursor:       "zoom-in",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`${label} ${filename}`}
          style={{
            width:        96,
            height:       96,
            objectFit:    "contain",
            display:      "block",
          }}
        />
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          // backdrop click 시 닫기
          if (e.target === dialogRef.current) close();
        }}
        style={{
          padding:      0,
          border:       "none",
          borderRadius: 8,
          maxWidth:     "min(90vw, 1200px)",
          maxHeight:    "90vh",
          background:   "transparent",
        }}
      >
        <div style={{ position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`${label} ${filename}`}
            style={{
              maxWidth:     "min(90vw, 1200px)",
              maxHeight:    "90vh",
              display:      "block",
              background:   "white",
              borderRadius: 8,
            }}
          />
          <button
            type="button"
            onClick={close}
            style={{
              position:   "absolute",
              top:        8,
              right:      8,
              padding:    "4px 10px",
              fontSize:   13,
              background: "rgba(0,0,0,0.7)",
              color:      "white",
              border:     "none",
              borderRadius: 4,
              cursor:     "pointer",
            }}
          >
            닫기
          </button>
        </div>
      </dialog>
    </>
  );
}
```

- [ ] **Step 11.2: typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 11.3: 커밋**

```bash
git -C vet-exam-ai add app/admin/image-questions/_components/triage-lightbox.tsx
git -C vet-exam-ai commit -m "image-triage: triage-lightbox — native dialog for image zoom"
```

---

## Task 12: triage-card.tsx — 단일 문제 카드 (client, 5종 액션 + revert + 메모 + 체크박스)

**Files:**
- Create: `vet-exam-ai/app/admin/image-questions/_components/triage-card.tsx`

- [ ] **Step 12.1: 컴포넌트 작성**

Create `vet-exam-ai/app/admin/image-questions/_components/triage-card.tsx` with this exact content:

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import {
  triageQuestionDecide,
  triageQuestionRevert,
} from "../../../../lib/admin/triage";
import {
  TRIAGE_STATUS_LABEL,
  TRIAGE_STATUS_COLOR,
  type ImageTriageStatus,
} from "../../../../lib/admin/triage-labels";

export type TriageCardData = {
  id:           string;
  publicId:     string | null;
  round:        number | null;
  category:     string;
  question:     string;
  choices:      string[];
  answer:       string;
  explanation:  string | null;
  questionImages:    { filename: string; url: string | null }[];
  explanationImages: { filename: string; url: string | null }[];
  triageStatus: ImageTriageStatus | null; // null = pending (row 미존재)
  triageNote:   string | null;
};

const ACTION_BUTTONS: { status: ImageTriageStatus; label: string; primary: boolean }[] = [
  { status: "activate_no_image", label: "활성화",       primary: true  },
  { status: "needs_rewrite",     label: "재작성 필요",  primary: false },
  { status: "needs_rebuild",     label: "도식 재제작",  primary: false },
  { status: "needs_license",     label: "라이선스 필요", primary: false },
  { status: "remove",            label: "폐기",         primary: false },
];

export function TriageCard({
  row,
  selected,
  onToggle,
  thumbnailSlot,
}: {
  row: TriageCardData;
  selected: boolean;
  onToggle: (id: string, checked: boolean) => void;
  thumbnailSlot: ReactNode;
}) {
  const [note, setNote] = useState(row.triageNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDecide(status: ImageTriageStatus) {
    setError(null);
    startTransition(async () => {
      const trimmed = note.trim();
      const result = await triageQuestionDecide(
        row.id,
        status,
        trimmed.length > 0 ? trimmed : null,
      );
      if (!result.ok) setError(result.error);
    });
  }

  function handleRevert() {
    setError(null);
    startTransition(async () => {
      const result = await triageQuestionRevert(row.id);
      if (!result.ok) setError(result.error);
    });
  }

  const decided = row.triageStatus !== null;
  const decidedColor = row.triageStatus
    ? TRIAGE_STATUS_COLOR[row.triageStatus]
    : null;

  return (
    <div
      className="rounded-lg p-4"
      style={{
        background:  "var(--surface-raised)",
        border:      "1px solid var(--rule)",
        opacity:     pending ? 0.6 : 1,
        transition:  "opacity 0.15s ease",
      }}
    >
      {/* 헤더: 체크박스 + KVLE + 카테고리 + 회차 + 분류 상태 */}
      <div className="flex items-center gap-3 mb-3" style={{ fontSize: 13 }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggle(row.id, e.target.checked)}
          aria-label={`${row.publicId ?? row.id} 선택`}
          disabled={decided}
          style={{ cursor: decided ? "not-allowed" : "pointer" }}
        />
        <Link
          href={`/admin/questions/${row.id}`}
          className="kvle-mono"
          style={{ color: "var(--teal)", textDecoration: "underline" }}
        >
          {row.publicId ?? row.id.slice(0, 8)}
        </Link>
        <span style={{ color: "var(--text-muted)" }}>·</span>
        <span>{row.category}</span>
        {row.round != null && (
          <>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span style={{ color: "var(--text-muted)" }}>{row.round}회</span>
          </>
        )}
        {decided && decidedColor && (
          <span
            style={{
              marginLeft:   "auto",
              padding:      "2px 8px",
              borderRadius: 999,
              fontSize:     11,
              background:   decidedColor.bg,
              color:        decidedColor.fg,
            }}
          >
            {TRIAGE_STATUS_LABEL[row.triageStatus!]}
          </span>
        )}
      </div>

      {/* 본문 */}
      <div style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 10 }}>
        <div style={{ fontWeight: 500, marginBottom: 6 }}>{row.question}</div>
        <ol style={{ paddingLeft: 20, margin: 0, color: "var(--text-muted)" }}>
          {row.choices.map((c, i) => (
            <li
              key={i}
              style={{
                color:      c === row.answer ? "var(--teal)" : undefined,
                fontWeight: c === row.answer ? 500 : undefined,
              }}
            >
              {c}
            </li>
          ))}
        </ol>
        {row.explanation && (
          <div style={{ marginTop: 8, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
            <span style={{ color: "var(--text)", fontWeight: 500 }}>해설: </span>
            {row.explanation}
          </div>
        )}
      </div>

      {/* 썸네일 (server에서 signed URL 발급 + 주입) */}
      {thumbnailSlot && (
        <div style={{ marginBottom: 12 }}>{thumbnailSlot}</div>
      )}

      {/* 액션 버튼 */}
      {!decided && (
        <div className="flex flex-wrap gap-2" style={{ marginBottom: 8 }}>
          {ACTION_BUTTONS.map((b) => (
            <button
              key={b.status}
              type="button"
              onClick={() => handleDecide(b.status)}
              disabled={pending}
              style={{
                padding:      "6px 12px",
                fontSize:     12,
                borderRadius: 4,
                border:       `1px solid ${b.primary ? "var(--teal)" : "var(--rule)"}`,
                background:   b.primary ? "var(--teal)" : "var(--surface)",
                color:        b.primary ? "white" : "var(--text)",
                cursor:       pending ? "wait" : "pointer",
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      {decided && (
        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
          <button
            type="button"
            onClick={handleRevert}
            disabled={pending}
            style={{
              padding:      "6px 12px",
              fontSize:     12,
              borderRadius: 4,
              border:       "1px solid var(--rule)",
              background:   "var(--surface)",
              color:        "var(--text-muted)",
              cursor:       pending ? "wait" : "pointer",
            }}
          >
            분류 되돌리기
          </button>
          {row.triageNote && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              메모: {row.triageNote}
            </span>
          )}
        </div>
      )}

      {/* 메모 입력 */}
      {!decided && (
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

      {error && (
        <div style={{ marginTop: 8, color: "rgb(185, 28, 28)", fontSize: 12 }}>
          오류: {error}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 12.2: typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 12.3: 커밋**

```bash
git -C vet-exam-ai add app/admin/image-questions/_components/triage-card.tsx
git -C vet-exam-ai commit -m "image-triage: triage-card — single question card with 5 actions + revert + memo"
```

---

## Task 13: bulk-activate-bar.tsx — 일괄 활성화 바 (client, confirm dialog)

**Files:**
- Create: `vet-exam-ai/app/admin/image-questions/_components/bulk-activate-bar.tsx`

- [ ] **Step 13.1: 컴포넌트 작성**

Create `vet-exam-ai/app/admin/image-questions/_components/bulk-activate-bar.tsx` with this exact content:

```tsx
"use client";

import { useTransition } from "react";
import { triageQuestionsBulkActivate } from "../../../../lib/admin/triage";

export function BulkActivateBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}) {
  const [pending, startTransition] = useTransition();

  if (selectedIds.length === 0) return null;

  function handleActivate() {
    const message =
      `${selectedIds.length}건을 즉시 공개합니다.\n` +
      `되돌리려면 /admin/audit에서 추적 후 1건씩 revert 해야 합니다.\n\n` +
      `계속하시겠습니까?`;
    if (!window.confirm(message)) return;

    startTransition(async () => {
      const result = await triageQuestionsBulkActivate(selectedIds, null);
      if (!result.ok) {
        window.alert(`일괄 활성화 실패: ${result.error}`);
        return;
      }
      window.alert(`${result.count ?? selectedIds.length}건 활성화 완료`);
      onClear();
    });
  }

  return (
    <div
      className="flex items-center gap-3 rounded-lg p-3 mb-3"
      style={{
        background: "rgba(34, 197, 94, 0.08)",
        border:     "1px solid rgba(34, 197, 94, 0.4)",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 500 }}>
        ✓ {selectedIds.length}건 선택됨
      </span>
      <button
        type="button"
        onClick={handleActivate}
        disabled={pending}
        style={{
          marginLeft:   "auto",
          padding:      "6px 14px",
          fontSize:     12,
          borderRadius: 4,
          background:   "rgb(22, 163, 74)",
          color:        "white",
          border:       "none",
          cursor:       pending ? "wait" : "pointer",
        }}
      >
        {pending ? "처리 중…" : "선택 항목 즉시 활성화"}
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={pending}
        style={{
          padding:      "6px 10px",
          fontSize:     12,
          borderRadius: 4,
          background:   "var(--surface)",
          color:        "var(--text-muted)",
          border:       "1px solid var(--rule)",
          cursor:       pending ? "wait" : "pointer",
        }}
      >
        선택 해제
      </button>
    </div>
  );
}
```

- [ ] **Step 13.2: typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 13.3: 커밋**

```bash
git -C vet-exam-ai add app/admin/image-questions/_components/bulk-activate-bar.tsx
git -C vet-exam-ai commit -m "image-triage: bulk-activate-bar — multi-select activation with confirm dialog"
```

---

## Task 14: triage-list.tsx — 카드 + 체크박스 상태 관리 (client wrapper)

**Files:**
- Create: `vet-exam-ai/app/admin/image-questions/_components/triage-list.tsx`

- [ ] **Step 14.1: 컴포넌트 작성**

Create `vet-exam-ai/app/admin/image-questions/_components/triage-list.tsx` with this exact content:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { TriageCard, type TriageCardData } from "./triage-card";
import { BulkActivateBar } from "./bulk-activate-bar";

export type TriageListItem = {
  data: TriageCardData;
  thumbnailSlot: ReactNode;
};

export function TriageList({ items }: { items: TriageListItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clear() {
    setSelected(new Set());
  }

  if (items.length === 0) {
    return (
      <div
        className="rounded-lg p-10 text-center text-sm"
        style={{
          background: "var(--surface-raised)",
          border:     "1px solid var(--rule)",
          color:      "var(--text-muted)",
        }}
      >
        조건에 맞는 문제가 없습니다.
      </div>
    );
  }

  return (
    <div>
      <BulkActivateBar selectedIds={Array.from(selected)} onClear={clear} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((it) => (
          <TriageCard
            key={it.data.id}
            row={it.data}
            selected={selected.has(it.data.id)}
            onToggle={toggle}
            thumbnailSlot={it.thumbnailSlot}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 14.2: typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 14.3: 커밋**

```bash
git -C vet-exam-ai add app/admin/image-questions/_components/triage-list.tsx
git -C vet-exam-ai commit -m "image-triage: triage-list — selection state + bulk bar wrapper"
```

---

## Task 15: triage-filters.tsx — 사이드 필터 (client form)

**Files:**
- Create: `vet-exam-ai/app/admin/image-questions/_components/triage-filters.tsx`

- [ ] **Step 15.1: 컴포넌트 작성**

Create `vet-exam-ai/app/admin/image-questions/_components/triage-filters.tsx` with this exact content:

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  TRIAGE_STATUS_LABEL,
  TRIAGE_STATUS_ORDER,
} from "../../../../lib/admin/triage-labels";
import {
  buildTriageSearchString,
  parseTriageSearchParams,
  type TriageFilterStatus,
} from "../_lib/parse-search-params";

export function TriageFilters({
  categories,
  rounds,
}: {
  categories: string[];
  rounds: number[];
}) {
  const pathname = usePathname();
  const router   = useRouter();
  const sp       = useSearchParams();
  const [pending, startTransition] = useTransition();

  const raw: Record<string, string> = {};
  sp.forEach((v, k) => { raw[k] = v; });
  const current = parseTriageSearchParams(raw);

  function navigate(override: Parameters<typeof buildTriageSearchString>[1]) {
    const next = buildTriageSearchString({ ...current, page: 1 }, override);
    startTransition(() => {
      router.push(`${pathname}${next}`);
    });
  }

  const labelStyle: React.CSSProperties = {
    display:    "block",
    fontSize:   11,
    color:      "var(--text-muted)",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };
  const selectStyle: React.CSSProperties = {
    width:        "100%",
    padding:      "6px 8px",
    fontSize:     13,
    borderRadius: 4,
    border:       "1px solid var(--rule)",
    background:   "var(--surface)",
    color:        "var(--text)",
  };

  return (
    <aside
      className="rounded-lg p-3"
      style={{
        background: "var(--surface-raised)",
        border:     "1px solid var(--rule)",
        opacity:    pending ? 0.6 : 1,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>분류 상태</label>
        <select
          value={current.status}
          onChange={(e) => navigate({ status: e.target.value as TriageFilterStatus })}
          style={selectStyle}
        >
          <option value="unclassified">미분류만</option>
          <option value="all">전체</option>
          {TRIAGE_STATUS_ORDER.filter((s) => s !== "pending").map((s) => (
            <option key={s} value={s}>
              {TRIAGE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>카테고리</label>
        <select
          value={current.category ?? ""}
          onChange={(e) => navigate({ category: e.target.value || undefined })}
          style={selectStyle}
        >
          <option value="">전체</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>회차</label>
        <select
          value={current.round ?? ""}
          onChange={(e) => navigate({ round: e.target.value || undefined })}
          style={selectStyle}
        >
          <option value="">전체</option>
          {rounds.map((r) => (
            <option key={r} value={r}>{r}회</option>
          ))}
        </select>
      </div>
    </aside>
  );
}
```

- [ ] **Step 15.2: typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 15.3: 커밋**

```bash
git -C vet-exam-ai add app/admin/image-questions/_components/triage-filters.tsx
git -C vet-exam-ai commit -m "image-triage: triage-filters — sidebar select for status / category / round"
```

---

## Task 16: page.tsx — 큐 페이지 (server, fetch + 페이지네이션 + 조립)

**Files:**
- Create: `vet-exam-ai/app/admin/image-questions/page.tsx`

- [ ] **Step 16.1: 페이지 작성**

Create `vet-exam-ai/app/admin/image-questions/page.tsx` with this exact content:

```tsx
import Link from "next/link";
import { requireAdmin } from "../../../lib/admin/guards";
import { createClient } from "../../../lib/supabase/server";
import { getSignedImageUrls } from "../../../lib/admin/image-triage-storage";
import {
  buildTriageSearchString,
  parseTriageSearchParams,
} from "./_lib/parse-search-params";
import { TriageList, type TriageListItem } from "./_components/triage-list";
import { TriageFilters } from "./_components/triage-filters";
import { TriageImage } from "./_components/triage-image";
import type { TriageCardData } from "./_components/triage-card";
import type { ImageTriageStatus } from "../../../lib/admin/triage-labels";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type QuestionRow = {
  id: string;
  public_id: string | null;
  round: number | null;
  category: string;
  question: string;
  choices: string[];
  answer: string;
  explanation: string | null;
  question_image_files: string[];
  explanation_image_files: string[];
};

type TriageRow = {
  question_id: string;
  status: ImageTriageStatus;
  note: string | null;
};

async function loadFilterOptions(): Promise<{ categories: string[]; rounds: number[] }> {
  const supabase = await createClient();

  // 모든 has_image 문제의 카테고리/회차 distinct
  const { data } = await supabase
    .from("questions")
    .select("category, round")
    .contains("tags", ["has_image"])
    .order("category");

  const cats = new Set<string>();
  const rounds = new Set<number>();
  for (const r of data ?? []) {
    if (r.category) cats.add(r.category as string);
    if (typeof r.round === "number") rounds.add(r.round);
  }
  return {
    categories: Array.from(cats).sort(),
    rounds:     Array.from(rounds).sort((a, b) => b - a),
  };
}

async function loadQueue(sp: ReturnType<typeof parseTriageSearchParams>): Promise<{
  items: QuestionRow[];
  triageMap: Map<string, TriageRow>;
  total: number;
}> {
  const supabase = await createClient();

  // 1. has_image 문제 + 필터
  let q = supabase
    .from("questions")
    .select(
      "id, public_id, round, category, question, choices, answer, explanation, question_image_files, explanation_image_files",
      { count: "exact" },
    )
    .contains("tags", ["has_image"]);

  if (sp.category) q = q.eq("category", sp.category);
  if (sp.round != null) q = q.eq("round", sp.round);

  // status 필터: triage 테이블과 left join 효과를 두 단계로 처리
  let triageIdsForStatus: string[] | null = null;
  if (sp.status === "unclassified") {
    // triage row 없는 question만 — 첫 쿼리 후 코드에서 필터
  } else if (sp.status === "all") {
    // 필터 없음
  } else {
    // 특정 status 매칭 — triage row 먼저 가져와서 question_id로 in 필터
    const { data: tr } = await supabase
      .from("question_image_triage")
      .select("question_id")
      .eq("status", sp.status);
    triageIdsForStatus = (tr ?? []).map((r) => r.question_id);
    if (triageIdsForStatus.length === 0) {
      return { items: [], triageMap: new Map(), total: 0 };
    }
    q = q.in("id", triageIdsForStatus);
  }

  const offset = (sp.page - 1) * PAGE_SIZE;
  const { data, count, error } = await q
    .order("round", { ascending: true })
    .order("public_id", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error || !data) {
    return { items: [], triageMap: new Map(), total: 0 };
  }

  // 2. 같은 페이지 question id로 triage rows 일괄 fetch
  const ids = (data as QuestionRow[]).map((r) => r.id);
  let triageMap = new Map<string, TriageRow>();
  if (ids.length > 0) {
    const { data: tr } = await supabase
      .from("question_image_triage")
      .select("question_id, status, note")
      .in("question_id", ids);
    for (const r of (tr ?? []) as TriageRow[]) {
      triageMap.set(r.question_id, r);
    }
  }

  // 3. unclassified 필터 후처리
  let items = data as QuestionRow[];
  if (sp.status === "unclassified") {
    items = items.filter((r) => !triageMap.has(r.id));
  }

  return { items, triageMap, total: count ?? 0 };
}

async function buildListItems(
  rows: QuestionRow[],
  triageMap: Map<string, TriageRow>,
): Promise<TriageListItem[]> {
  // 모든 페이지의 이미지 파일명 합쳐서 한 번에 signed URL 발급
  const allFiles = Array.from(
    new Set(
      rows.flatMap((r) => [
        ...r.question_image_files,
        ...r.explanation_image_files,
      ]),
    ),
  );
  const signed = await getSignedImageUrls(allFiles);
  const urlMap = new Map(signed.map((s) => [s.filename, s.url]));

  return rows.map((row) => {
    const tr = triageMap.get(row.id) ?? null;

    const data: TriageCardData = {
      id:          row.id,
      publicId:    row.public_id,
      round:       row.round,
      category:    row.category,
      question:    row.question,
      choices:     row.choices,
      answer:      row.answer,
      explanation: row.explanation,
      questionImages:    row.question_image_files.map((f) => ({
        filename: f,
        url:      urlMap.get(f) ?? null,
      })),
      explanationImages: row.explanation_image_files.map((f) => ({
        filename: f,
        url:      urlMap.get(f) ?? null,
      })),
      triageStatus: tr ? tr.status : null,
      triageNote:   tr ? tr.note : null,
    };

    const thumbnailSlot =
      data.questionImages.length + data.explanationImages.length === 0 ? null : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {data.questionImages.map((img) => (
            <TriageImage
              key={`q-${img.filename}`}
              filename={img.filename}
              url={img.url}
              label="문제"
            />
          ))}
          {data.explanationImages.map((img) => (
            <TriageImage
              key={`e-${img.filename}`}
              filename={img.filename}
              url={img.url}
              label="해설"
            />
          ))}
        </div>
      );

    return { data, thumbnailSlot };
  });
}

export default async function AdminImageQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();

  const raw = await searchParams;
  const sp = parseTriageSearchParams(raw);

  const [{ categories, rounds }, queue] = await Promise.all([
    loadFilterOptions(),
    loadQueue(sp),
  ]);

  const items = await buildListItems(queue.items, queue.triageMap);

  const totalPages = Math.max(1, Math.ceil(queue.total / PAGE_SIZE));
  const prevHref = sp.page > 1
    ? `/admin/image-questions${buildTriageSearchString(sp, { page: sp.page - 1 })}`
    : null;
  const nextHref = sp.page < totalPages
    ? `/admin/image-questions${buildTriageSearchString(sp, { page: sp.page + 1 })}`
    : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16 }}>
      <TriageFilters categories={categories} rounds={rounds} />

      <div>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
            이미지 큐
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            has_image 문제 {queue.total.toLocaleString("ko-KR")}건 — 현재 페이지 {items.length}건 표시
          </p>
        </header>

        <TriageList items={items} />

        {totalPages > 1 && (
          <nav
            className="flex items-center justify-between mt-4"
            style={{ fontSize: 13 }}
          >
            <div style={{ color: "var(--text-muted)" }}>
              {sp.page} / {totalPages} 페이지
            </div>
            <div className="flex gap-2">
              {prevHref ? (
                <Link href={prevHref} style={{ color: "var(--teal)", textDecoration: "underline" }}>
                  ← 이전
                </Link>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>← 이전</span>
              )}
              {nextHref ? (
                <Link href={nextHref} style={{ color: "var(--teal)", textDecoration: "underline" }}>
                  다음 →
                </Link>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>다음 →</span>
              )}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 16.2: typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 16.3: 커밋**

```bash
git -C vet-exam-ai add app/admin/image-questions/page.tsx
git -C vet-exam-ai commit -m "image-triage: page — server fetch + filters + paginated card list"
```

---

## Task 17: 사이드바 진입 추가

**Files:**
- Modify: `vet-exam-ai/app/admin/_components/admin-nav-items.ts`

- [ ] **Step 17.1: 신규 항목 추가**

Edit `vet-exam-ai/app/admin/_components/admin-nav-items.ts`. 현재 import 라인 (line 1~10):

```ts
import {
  LayoutDashboard,
  FileText,
  Users,
  GraduationCap,
  Flag,
  GitPullRequest,
  History,
  type LucideIcon,
} from "lucide-react";
```

`History` 다음에 `Image` 아이콘 추가:

```ts
import {
  LayoutDashboard,
  FileText,
  Image as ImageIcon,
  Users,
  GraduationCap,
  Flag,
  GitPullRequest,
  History,
  type LucideIcon,
} from "lucide-react";
```

(JSX 충돌 회피로 alias `ImageIcon` 사용.)

`ADMIN_NAV_ITEMS` 배열 수정 — `"문제"` 다음에 `"이미지 큐"` 항목 삽입:

```ts
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { label: "대시보드",  href: "/admin",                icon: LayoutDashboard },
  { label: "문제",      href: "/admin/questions",      icon: FileText },
  { label: "이미지 큐", href: "/admin/image-questions", icon: ImageIcon },
  { label: "회원",      href: "/admin/users",          icon: Users },
  { label: "시험",      href: "/admin/exams",          icon: GraduationCap, disabled: true },
  { label: "신고",      href: "/admin/reports",        icon: Flag },
  { label: "정정",      href: "/admin/corrections",    icon: GitPullRequest },
  { label: "감사",      href: "/admin/audit",          icon: History },
];
```

- [ ] **Step 17.2: typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 17.3: 커밋**

```bash
git -C vet-exam-ai add app/admin/_components/admin-nav-items.ts
git -C vet-exam-ai commit -m "image-triage: admin sidebar — add 이미지 큐 entry"
```

---

## Task 18: 대시보드 카드 — "이미지 큐 미분류 N건"

**Files:**
- Modify: `vet-exam-ai/app/admin/page.tsx`

- [ ] **Step 18.1: 카운트 fetch 추가**

Edit `vet-exam-ai/app/admin/page.tsx`. 현재 `loadCounts` 함수의 Promise.all (line 27~32):

```ts
  const [total, active, rounds, categories] = await Promise.all([
    supabase.from("questions").select("*", { count: "exact", head: true }),
    supabase.from("questions").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.rpc("count_questions_distinct", { col: "round" }),
    supabase.rpc("count_questions_distinct", { col: "category" }),
  ]);
```

다음으로 교체 (이미지 큐 미분류 카운트 추가):

```ts
  const [total, active, rounds, categories, hasImageTotal, triageCount] = await Promise.all([
    supabase.from("questions").select("*", { count: "exact", head: true }),
    supabase.from("questions").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.rpc("count_questions_distinct", { col: "round" }),
    supabase.rpc("count_questions_distinct", { col: "category" }),
    supabase.from("questions").select("*", { count: "exact", head: true }).contains("tags", ["has_image"]),
    supabase.from("question_image_triage").select("*", { count: "exact", head: true }),
  ]);

  const imageQueuePending =
    hasImageTotal.count != null && triageCount.count != null
      ? Math.max(0, hasImageTotal.count - triageCount.count)
      : null;
```

리턴 객체에 `imageQueuePending` 추가:

```ts
  return {
    total: total.error ? null : total.count ?? 0,
    active: active.error ? null : active.count ?? 0,
    rounds: rounds.error ? null : (rounds.data as number | null) ?? 0,
    categories: categories.error ? null : (categories.data as number | null) ?? 0,
    imageQueuePending,
  };
```

함수 시그니처도 갱신:

```ts
async function loadCounts(): Promise<{
  total:               CountResult;
  active:              CountResult;
  rounds:              CountResult;
  categories:          CountResult;
  imageQueuePending:   CountResult;
}> {
```

- [ ] **Step 18.2: 페이지 본체에서 카드 추가 (HubCard 패턴 따라)**

`/admin/page.tsx` 본체 JSX에 "이미지 큐" HubCard를 적절한 위치(다른 hub들과 같은 섹션)에 추가. 현재 파일을 한 번 끝까지 읽고, 기존 HubCard 사용 패턴 그대로 따라:

```bash
cat vet-exam-ai/app/admin/page.tsx
```

기존 HubCard 한 개 (예: `/admin/questions`) 아래에 동일한 구조로 추가:

```tsx
<HubCard
  href="/admin/image-questions"
  label="이미지 큐"
  desc={
    counts.imageQueuePending == null
      ? "분류 대기 카운트 로드 실패"
      : `미분류 ${counts.imageQueuePending.toLocaleString("ko-KR")}건`
  }
  icon={ImageIcon}
/>
```

상단 import에 `Image as ImageIcon` 추가 (lucide-react).

- [ ] **Step 18.3: typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 18.4: 커밋**

```bash
git -C vet-exam-ai add app/admin/page.tsx
git -C vet-exam-ai commit -m "image-triage: admin dashboard — pending count card"
```

---

## Task 19: Final — typecheck + 빌드 + 머지 준비

- [ ] **Step 19.1: 전체 typecheck**

Run: `cd vet-exam-ai && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 19.2: 프로덕션 빌드 시도** (page-data collection 함정 검출용 — RSC 직렬화 / module-load env throw)

Run: `cd vet-exam-ai && npm run build`
Expected: build success. `Generating static pages` 단계에서 admin 페이지는 force-dynamic이라 prerender 시도 안 함.

If build fails:
- "Cannot serialize" → Server Component에서 Client Component에 함수 prop 인라인 전달 여부 확인 (memory `feedback_rsc_inline_fn_trap.md`)
- "process.env not defined" → module top에서 env throw 여부 확인 (memory `feedback_module_load_env_throw.md`)

- [ ] **Step 19.3: lint**

Run: `cd vet-exam-ai && npm run lint`
Expected: 0 errors. warning은 OK.

- [ ] **Step 19.4: 커밋 + push**

새 변경 없으면 skip. 있으면 별도 commit.

```bash
git -C vet-exam-ai push -u origin feat/image-triage-queue
```

- [ ] **Step 19.5: PR 생성 안내**

`gh` CLI가 Windows에 설치되지 않은 경우 (memory `admin_prd_done.md`), GitHub UI에서 PR 생성:
- URL: `https://github.com/sngjlee/vet-exam-ai/compare/main...feat/image-triage-queue`
- Title: `image-triage: admin queue for has_image 374 questions (Phase 2 진입)`
- Body: 스펙 링크 + 운영 액션 체크리스트 (마이그/upload_images.py/backfill_image_files.py 순서)

---

## 머지 후 운영 액션 (별도 — 코드 task 아님)

> 다음 단계는 PR이 머지된 후 사용자가 직접 수행. 본 plan의 task가 아님.

1. Supabase SQL Editor에서 `20260506000000_image_triage.sql` 실행 + 검증 SQL 7개 통과 확인
2. `pipeline/.venv/Scripts/python.exe pipeline/upload_images.py --all --dry-run` (대상 ~2208개 확인)
3. `pipeline/.venv/Scripts/python.exe pipeline/upload_images.py --all` (~5분)
4. `pipeline/.venv/Scripts/python.exe pipeline/backfill_image_files.py --all --dry-run --limit 1` (1건 미리보기)
5. `pipeline/.venv/Scripts/python.exe pipeline/backfill_image_files.py --all` (~2분)
6. `https://www.kvle.app/admin/image-questions` 진입 → 외과 81건 분류 시도, UX/시간 측정
7. 메모리 갱신 (분류 분포 + 다음 단계 = needs_rebuild 큐 처리 인프라 / Phase 2 렌더링)
