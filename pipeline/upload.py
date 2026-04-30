"""rewritten JSON → Supabase questions 테이블 업로드.

Usage:
    python upload.py pipeline/output/rewritten/1.1_해부_66회.json
    python upload.py --all
    python upload.py <file> --dry-run               # DB write 없이 payload 미리보기
    python upload.py <file> --limit 3
    python upload.py --all --filter 1.1             # 파일명에 '1.1' 포함된 것만

규칙:
    - PostgREST `Prefer: resolution=merge-duplicates`로 id 기준 upsert (재실행 idempotent).
    - has_question_image=true 인 문제는 is_active=false 로 저장 (이미지 렌더링 미구현, Phase 2).
    - source='past_exam', tags=['vet40'] (+ 'has_image' 조건부) 고정.
    - rewritten JSON의 questions[] 배열만 사용. failed/skipped는 무시.

Env (pipeline/.env):
    SUPABASE_URL          (예: https://tjltxwvtnbwilgaokfyw.supabase.co)
    SUPABASE_SERVICE_KEY  (service_role key — RLS bypass)

미지원 (out of scope):
    - 이미지를 Supabase Storage 로 업로드 → upload_images.py 사용
    - 기존 row 정리/삭제 (드물게 필요할 때 수동 SQL)

주의: 이미지 분류 시작 후 374건 대상으로 재실행 금지. is_active=false 로 reset됨.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

PIPELINE_ROOT = Path(__file__).parent
REWRITTEN_ROOT = PIPELINE_ROOT / "output" / "rewritten"

load_dotenv(PIPELINE_ROOT / ".env")


def build_row(doc: dict, q: dict) -> dict[str, Any]:
    """rewritten JSON의 questions[] 항목 1개 → questions 테이블 row dict."""
    has_image = bool(q.get("has_question_image"))
    tags = ["vet40"]
    if has_image:
        tags.append("has_image")

    return {
        "id":              q["id"],
        "question":        q["question"],
        "choices":         q["choices"],
        "answer":          q["answer"],
        "explanation":     q["explanation"],
        "category":        doc["subject_full"],
        "subject":         doc["subject_full"],
        "topic":           None,
        "difficulty":      None,
        "source":          "past_exam",
        "year":            doc["year"],
        "session":         doc["session"],
        "round":           doc["round"],
        "community_notes": q.get("community_notes"),
        "tags":            tags,
        "is_active":       not has_image,
        "question_image_files":    q.get("question_images", []),
        "explanation_image_files": q.get("explanation_images", []),
    }


def dedup_ids(rows: list[dict], file_name: str) -> list[dict]:
    """Batch 내 id 중복 해소.

    원본 파싱 단계에서 같은 source_number 가 서로 다른 두 문제로 잡힌 경우
    (vet40 HWP 파싱 한계) batch upsert 가 ON CONFLICT 21000 으로 실패한다.
    같은 id 가 N 번째 (N≥2) 등장하면 'b','c',... 접미사를 붙여 별개 row 로
    저장해서 두 문제 모두 보존한다.
    """
    seen: dict[str, int] = {}
    out: list[dict] = []
    for r in rows:
        original = r["id"]
        n = seen.get(original, 0)
        if n > 0:
            new_id = f"{original}{chr(ord('a') + n)}"
            print(f"  [dedup] {original} → {new_id} ({file_name})")
            r = {**r, "id": new_id}
        seen[original] = n + 1
        out.append(r)
    return out


def upsert_rows(client: httpx.Client, url: str, rows: list[dict]) -> None:
    """PostgREST 로 questions 테이블에 bulk upsert (id 기준).

    실패 시 httpx HTTPStatusError 가 raise — 호출 측에서 잡아 처리.
    """
    if not rows:
        return

    response = client.post(
        f"{url}/rest/v1/questions",
        headers={
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        json=rows,
        timeout=30.0,
    )
    response.raise_for_status()


def process_file(
    client: httpx.Client,
    url: str,
    input_path: Path,
    limit: int | None = None,
    dry_run: bool = False,
) -> dict:
    """JSON 1개 처리 → 통계 dict 리턴."""
    with open(input_path, encoding="utf-8") as f:
        doc = json.load(f)

    questions = doc.get("questions") or []
    if limit is not None:
        questions = questions[:limit]

    rows = [build_row(doc, q) for q in questions]
    rows = dedup_ids(rows, input_path.name)
    image_rows = sum(1 for r in rows if not r["is_active"])

    stats = {
        "rows_total":    len(rows),
        "rows_active":   len(rows) - image_rows,
        "rows_inactive": image_rows,  # has_image → is_active=false
    }

    if dry_run:
        if rows:
            print(f"  [dry-run] payload 첫 행:\n{json.dumps(rows[0], ensure_ascii=False, indent=2)}")
        print(f"  [dry-run] 총 {len(rows)} rows ({stats['rows_active']} active, {stats['rows_inactive']} inactive)")
        return stats

    try:
        upsert_rows(client, url, rows)
    except httpx.HTTPStatusError as e:
        print(f"  [fail] {e.response.status_code}: {e.response.text[:300]}")
        stats["error"] = f"HTTP {e.response.status_code}"
        return stats

    return stats


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("input", nargs="?", help="입력 JSON 파일 (--all 일 때 생략)")
    p.add_argument("--all", action="store_true",
                   help="output/rewritten/ 안의 모든 JSON 처리")
    p.add_argument("--filter",
                   help="--all 과 함께 사용. 파일명에 이 문자열이 포함된 것만 처리")
    p.add_argument("--exclude", action="append", default=[],
                   help="--all 과 함께 사용. 파일명에 이 문자열이 포함된 건 제외 (여러 번 지정 가능)")
    p.add_argument("--limit", type=int,
                   help="파일당 문제 수 제한 (테스트용)")
    p.add_argument("--dry-run", action="store_true",
                   help="DB write 없이 payload 미리보기만")
    args = p.parse_args()

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY 가 설정되지 않음 (pipeline/.env 확인)")
        sys.exit(1)

    if args.all:
        inputs = sorted(REWRITTEN_ROOT.glob("*.json"))
        if args.filter:
            inputs = [f for f in inputs if args.filter in f.name]
        if args.exclude:
            inputs = [f for f in inputs if not any(ex in f.name for ex in args.exclude)]
    elif args.input:
        p_in = Path(args.input)
        if not p_in.is_absolute():
            p_in = Path.cwd() / p_in
        inputs = [p_in]
    else:
        print("ERROR: 입력 파일을 지정하거나 --all 옵션 사용")
        sys.exit(1)

    if not inputs:
        print("처리할 파일 없음.")
        sys.exit(0)

    grand = {"rows_total": 0, "rows_active": 0, "rows_inactive": 0, "files_ok": 0, "files_failed": 0}
    t0 = time.time()

    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    with httpx.Client(headers=headers) as client:
        for input_path in inputs:
            print(f"\n== {input_path.name} ==")
            try:
                stats = process_file(client, url, input_path, limit=args.limit, dry_run=args.dry_run)
            except KeyboardInterrupt:
                print("\n중단됨.")
                break
            except Exception as e:
                print(f"  [fail] {type(e).__name__}: {e}")
                grand["files_failed"] += 1
                continue

            if "error" in stats:
                grand["files_failed"] += 1
            else:
                grand["files_ok"] += 1
                grand["rows_total"]    += stats["rows_total"]
                grand["rows_active"]   += stats["rows_active"]
                grand["rows_inactive"] += stats["rows_inactive"]

            print(
                f"  {stats['rows_total']} rows "
                f"(active {stats['rows_active']}, inactive {stats['rows_inactive']})"
                + (" [dry-run]" if args.dry_run else "")
            )

    elapsed = time.time() - t0
    mode = "dry-run" if args.dry_run else "upserted"
    print(
        f"\n=== 완료: {grand['files_ok']} 파일 {mode}, "
        f"{grand['rows_total']} rows "
        f"(active {grand['rows_active']}, inactive {grand['rows_inactive']}), "
        f"실패 {grand['files_failed']} 파일, {elapsed:.1f}초 ==="
    )


if __name__ == "__main__":
    main()
