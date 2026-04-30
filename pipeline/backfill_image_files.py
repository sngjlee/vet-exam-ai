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

from _storage_key import to_storage_key

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
                qfiles = [to_storage_key(n) for n in (q.get("question_images") or [])]
                efiles = [to_storage_key(n) for n in (q.get("explanation_images") or [])]
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
