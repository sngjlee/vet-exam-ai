"""rewritten JSON → Supabase questions 테이블 업로드.

Usage:
    python upload.py pipeline/output/rewritten/1.1_해부_66회.json
    python upload.py --all
    python upload.py <file> --dry-run               # DB write 없이 payload 미리보기
    python upload.py <file> --limit 3
    python upload.py --all --filter 1.1             # 파일명에 '1.1' 포함된 것만

규칙:
    - 업로드 전 검증 게이트 통과분만 upsert (choices==5, answer∈choices, 필수 필드 비어있지 않음).
      불량 행은 제외하고 사유를 출력. --skip-validation 으로 우회 가능(비상시).
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

from _storage_key import to_storage_key

PIPELINE_ROOT = Path(__file__).parent
REWRITTEN_ROOT = PIPELINE_ROOT / "output" / "rewritten"

load_dotenv(PIPELINE_ROOT / ".env")


EXPECTED_CHOICES = 5


def validate_question_row(row: dict[str, Any]) -> list[str]:
    """업로드 후보 row 1개 검증. 문제 목록(빈 리스트면 통과)을 리턴.

    수국시 문항 규칙:
        - id / question / answer / explanation 은 비어있지 않은 문자열
        - choices 는 정확히 5개, 각 항목 비어있지 않음, 중복 없음
        - answer 는 choices 중 하나와 정확히 일치
    """
    errors: list[str] = []

    qid = row.get("id")
    if not isinstance(qid, str) or not qid.strip():
        errors.append("id 누락/빈값")

    for field in ("question", "answer", "explanation"):
        val = row.get(field)
        if not isinstance(val, str) or not val.strip():
            errors.append(f"{field} 누락/빈값")

    choices = row.get("choices")
    if not isinstance(choices, list):
        errors.append("choices 리스트 아님")
    else:
        if len(choices) != EXPECTED_CHOICES:
            errors.append(f"choices 개수 {len(choices)} (기대 {EXPECTED_CHOICES})")
        if any(not isinstance(c, str) or not c.strip() for c in choices):
            errors.append("빈 choice 포함")
        if len(set(choices)) != len(choices):
            errors.append("choices 중복")
        answer = row.get("answer")
        if isinstance(answer, str) and answer.strip() and answer not in choices:
            errors.append("answer가 choices에 없음")

    return errors


def build_row(doc: dict, q: dict) -> dict[str, Any]:
    """rewritten JSON의 questions[] 항목 1개 → questions 테이블 row dict."""
    has_image = bool(q.get("has_question_image"))
    tags = ["vet40"]
    if has_image:
        tags.append("has_image")
    topic = q.get("topic")
    if isinstance(topic, str):
        topic = topic.strip() or None
    else:
        topic = None

    return {
        "id":              q["id"],
        "question":        q["question"],
        "choices":         q["choices"],
        "answer":          q["answer"],
        "explanation":     q["explanation"],
        "category":        doc["subject_full"],
        "subject":         doc["subject_full"],
        "topic":           topic,
        "difficulty":      None,
        "source":          "past_exam",
        "year":            doc["year"],
        "session":         doc["session"],
        "round":           doc["round"],
        "community_notes": q.get("community_notes"),
        "tags":            tags,
        "is_active":       not has_image,
        "question_image_files":    [to_storage_key(n) for n in (q.get("question_images") or [])],
        "explanation_image_files": [to_storage_key(n) for n in (q.get("explanation_images") or [])],
    }


def summarize_row_for_dry_run(row: dict[str, Any]) -> dict[str, str | int | bool | None]:
    choices = row.get("choices")
    question_images = row.get("question_image_files")
    explanation_images = row.get("explanation_image_files")
    return {
        "id": row["id"],
        "category": row["category"],
        "topic": row["topic"] if isinstance(row.get("topic"), str) else None,
        "year": row["year"] if isinstance(row.get("year"), int) else None,
        "is_active": bool(row["is_active"]),
        "question_chars": len(str(row.get("question") or "")),
        "explanation_chars": len(str(row.get("explanation") or "")),
        "choices_count": len(choices) if isinstance(choices, list) else 0,
        "question_image_count": len(question_images) if isinstance(question_images, list) else 0,
        "explanation_image_count": len(explanation_images) if isinstance(explanation_images, list) else 0,
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
    skip_validation: bool = False,
) -> dict:
    """JSON 1개 처리 → 통계 dict 리턴."""
    with open(input_path, encoding="utf-8") as f:
        doc = json.load(f)

    questions = doc.get("questions") or []
    if limit is not None:
        questions = questions[:limit]

    rows = [build_row(doc, q) for q in questions]
    rows = dedup_ids(rows, input_path.name)

    # 검증 게이트: 통과분만 업로드 후보. 불량 행은 제외하고 사유 보고.
    invalid: list[tuple[str, list[str]]] = []
    if skip_validation:
        valid_rows = rows
    else:
        valid_rows = []
        for r in rows:
            row_errors = validate_question_row(r)
            if row_errors:
                invalid.append((str(r.get("id") or "<no-id>"), row_errors))
            else:
                valid_rows.append(r)

    image_rows = sum(1 for r in valid_rows if not r["is_active"])

    stats = {
        "rows_total":    len(rows),
        "rows_valid":    len(valid_rows),
        "rows_invalid":  len(invalid),
        "rows_active":   len(valid_rows) - image_rows,
        "rows_inactive": image_rows,  # has_image → is_active=false
    }

    if invalid:
        print(f"  [validation] {len(invalid)} rows 검증 실패 — 업로드 제외:")
        for qid, row_errors in invalid:
            print(f"    - {qid}: {', '.join(row_errors)}")

    if dry_run:
        if valid_rows:
            preview = summarize_row_for_dry_run(valid_rows[0])
            print(f"  [dry-run] payload 첫 행 요약:\n{json.dumps(preview, ensure_ascii=False, indent=2)}")
        print(
            f"  [dry-run] 총 {len(rows)} rows "
            f"({stats['rows_valid']} 유효 / {stats['rows_invalid']} 제외; "
            f"{stats['rows_active']} active, {stats['rows_inactive']} inactive)"
        )
        return stats

    try:
        upsert_rows(client, url, valid_rows)
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
    p.add_argument("--skip-validation", action="store_true",
                   help="검증 게이트 우회 (choices==5, answer∈choices 등). 비상시에만 사용")
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

    grand = {"rows_total": 0, "rows_valid": 0, "rows_invalid": 0, "rows_active": 0, "rows_inactive": 0, "files_ok": 0, "files_failed": 0}
    t0 = time.time()

    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    with httpx.Client(headers=headers) as client:
        for input_path in inputs:
            print(f"\n== {input_path.name} ==")
            try:
                stats = process_file(
                    client, url, input_path,
                    limit=args.limit, dry_run=args.dry_run,
                    skip_validation=args.skip_validation,
                )
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
                grand["rows_valid"]    += stats.get("rows_valid", stats["rows_total"])
                grand["rows_invalid"]  += stats.get("rows_invalid", 0)
                grand["rows_active"]   += stats["rows_active"]
                grand["rows_inactive"] += stats["rows_inactive"]

            print(
                f"  {stats['rows_total']} rows "
                f"(active {stats['rows_active']}, inactive {stats['rows_inactive']}"
                + (f", 제외 {stats['rows_invalid']}" if stats.get("rows_invalid") else "")
                + ")"
                + (" [dry-run]" if args.dry_run else "")
            )

    elapsed = time.time() - t0
    mode = "dry-run" if args.dry_run else "upserted"
    print(
        f"\n=== 완료: {grand['files_ok']} 파일 {mode}, "
        f"{grand['rows_total']} rows "
        f"(active {grand['rows_active']}, inactive {grand['rows_inactive']}"
        + (f", 검증제외 {grand['rows_invalid']}" if grand["rows_invalid"] else "")
        + f"), 실패 {grand['files_failed']} 파일, {elapsed:.1f}초 ==="
    )


if __name__ == "__main__":
    main()
