"""Normalize questions.topic values using a topic alias map.

The script is safe by default:
  - It only prints proposed changes unless --apply is passed.
  - It only updates rows whose current topic exactly matches an alias key.
  - It never changes question text, answers, explanations, tags, or activity.

Usage:
    python normalize_topics.py --dry-run
    python normalize_topics.py --apply
    python normalize_topics.py --category 내과학 --dry-run
    python normalize_topics.py --alias-file topic_aliases.json --apply
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

PIPELINE_ROOT = Path(__file__).parent
DEFAULT_ALIAS_FILE = PIPELINE_ROOT / "topic_aliases.json"

load_dotenv(PIPELINE_ROOT / ".env")
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)


def normalize_topic(value: str) -> str:
    return " ".join(value.strip().split())


def load_aliases(path: Path) -> dict[str, str]:
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, dict):
        raise ValueError("alias file must be a JSON object")

    aliases: dict[str, str] = {}
    for source, target in raw.items():
        if not isinstance(source, str) or not isinstance(target, str):
            raise ValueError("alias keys and values must be strings")
        source_topic = normalize_topic(source)
        target_topic = normalize_topic(target)
        if not source_topic or not target_topic:
            raise ValueError("alias keys and values must not be empty")
        if source_topic != target_topic:
            aliases[source_topic] = target_topic
    return aliases


def fetch_alias_rows(
    client: httpx.Client,
    url: str,
    *,
    aliases: dict[str, str],
    category: str | None,
) -> list[dict[str, Any]]:
    """Fetch rows that currently use one of the alias source topics."""
    select_cols = "id,category,subject,topic"
    rows: list[dict[str, Any]] = []

    for source_topic in sorted(aliases):
        offset = 0
        while True:
            params = {
                "select": select_cols,
                "topic": f"eq.{source_topic}",
                "order": "id.asc",
                "limit": "1000",
                "offset": str(offset),
            }
            if category:
                params["category"] = f"eq.{category}"

            response = client.get(f"{url}/rest/v1/questions", params=params, timeout=30.0)
            response.raise_for_status()
            page = response.json()
            rows.extend(page)
            if len(page) < 1000:
                break
            offset += len(page)

    return rows


def patch_topic(client: httpx.Client, url: str, qid: str, topic: str) -> bool:
    response = client.patch(
        f"{url}/rest/v1/questions",
        params={"id": f"eq.{qid}"},
        headers={
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        json={"topic": topic},
        timeout=30.0,
    )
    if response.status_code in (200, 204):
        return True
    print(f"  [fail] {qid}: HTTP {response.status_code} {response.text[:200]}")
    return False


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--alias-file", type=Path, default=DEFAULT_ALIAS_FILE)
    parser.add_argument("--category", help="특정 category만 처리")
    parser.add_argument("--dry-run", action="store_true", help="DB write 없이 변경안만 출력")
    parser.add_argument("--apply", action="store_true", help="Supabase에 topic PATCH 실행")
    args = parser.parse_args()

    if args.apply and args.dry_run:
        parser.error("--apply와 --dry-run은 함께 사용할 수 없습니다.")
    dry_run = not args.apply

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not service:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY 설정되지 않음 (pipeline/.env)")

    aliases = load_aliases(args.alias_file)
    if not aliases:
        sys.exit("[normalize] alias가 없습니다")
    print(f"[normalize] alias {len(aliases)}개 로드 ({'dry-run' if dry_run else 'apply'})")

    headers = {"apikey": service, "Authorization": f"Bearer {service}"}
    success = 0
    failed = 0

    with httpx.Client(headers=headers) as supabase:
        rows = fetch_alias_rows(supabase, url, aliases=aliases, category=args.category)
        print(f"[normalize] 대상 row {len(rows)}개")

        for index, row in enumerate(rows, 1):
            qid = str(row["id"])
            source_topic = normalize_topic(str(row.get("topic") or ""))
            target_topic = aliases[source_topic]
            category = str(row.get("category") or "")
            print(f"  [{index}/{len(rows)}] {qid} ({category}): {source_topic} -> {target_topic}")

            if dry_run:
                continue
            if patch_topic(supabase, url, qid, target_topic):
                success += 1
            else:
                failed += 1

    print(f"[done] success={success} failed={failed}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
