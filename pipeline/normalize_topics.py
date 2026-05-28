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
    python normalize_topics.py --alias-file output/topic-alias-suggestions.approved.json --apply
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
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


@dataclass(frozen=True)
class AliasRule:
    source: str
    target: str
    category: str | None = None


def parse_alias_rule(raw: dict[str, Any]) -> AliasRule | None:
    source = raw.get("source")
    target = raw.get("target")
    category = raw.get("category")
    if not isinstance(source, str) or not isinstance(target, str):
        raise ValueError("rich aliases require string source and target")
    if category is not None and not isinstance(category, str):
        raise ValueError("rich alias category must be a string when present")

    source_topic = normalize_topic(source)
    target_topic = normalize_topic(target)
    category_name = normalize_topic(category) if isinstance(category, str) else None
    if not source_topic or not target_topic:
        raise ValueError("alias source and target must not be empty")
    if source_topic == target_topic:
        return None
    return AliasRule(source=source_topic, target=target_topic, category=category_name or None)


def load_aliases(path: Path) -> list[AliasRule]:
    """Load either a flat {source: target} map or rich {"aliases": [...]} JSON."""
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)

    rules: list[AliasRule] = []
    if isinstance(raw, dict) and isinstance(raw.get("aliases"), list):
        for item in raw["aliases"]:
            if not isinstance(item, dict):
                raise ValueError("rich alias entries must be JSON objects")
            rule = parse_alias_rule(item)
            if rule is not None:
                rules.append(rule)
    elif isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                raise ValueError("rich alias entries must be JSON objects")
            rule = parse_alias_rule(item)
            if rule is not None:
                rules.append(rule)
    elif isinstance(raw, dict):
        for source, target in raw.items():
            if not isinstance(source, str) or not isinstance(target, str):
                raise ValueError("flat alias keys and values must be strings")
            rule = parse_alias_rule({"source": source, "target": target})
            if rule is not None:
                rules.append(rule)
    else:
        raise ValueError("alias file must be a JSON object or array")

    unique: dict[tuple[str | None, str, str], AliasRule] = {}
    for rule in rules:
        unique[(rule.category, rule.source, rule.target)] = rule
    return validate_alias_rules(list(unique.values()))


def validate_alias_rules(rules: list[AliasRule]) -> list[AliasRule]:
    """Reject ambiguous alias maps that could flip topics back and forth."""
    by_source: dict[tuple[str | None, str], str] = {}
    errors: list[str] = []

    for rule in rules:
        source_key = (rule.category, rule.source)
        existing_target = by_source.get(source_key)
        if existing_target is not None and existing_target != rule.target:
            errors.append(
                f"{rule.category or '*'}: {rule.source!r} maps to both "
                f"{existing_target!r} and {rule.target!r}"
            )
        by_source[source_key] = rule.target

    for rule in rules:
        reverse_target = by_source.get((rule.category, rule.target))
        if reverse_target == rule.source:
            errors.append(
                f"{rule.category or '*'}: conflicting two-way alias "
                f"{rule.source!r} <-> {rule.target!r}"
            )

    if errors:
        joined = "\n  - ".join(errors)
        raise ValueError(f"alias file has conflicting rules:\n  - {joined}")

    return rules


def fetch_alias_rows(
    client: httpx.Client,
    url: str,
    *,
    rule: AliasRule,
    category: str | None,
) -> list[dict[str, Any]]:
    """Fetch rows that currently use one of the alias source topics."""
    select_cols = "id,category,subject,topic"
    rows: list[dict[str, Any]] = []

    if category and rule.category and category != rule.category:
        return rows

    offset = 0
    while True:
        params = {
            "select": select_cols,
            "topic": f"eq.{rule.source}",
            "order": "id.asc",
            "limit": "1000",
            "offset": str(offset),
        }
        effective_category = rule.category or category
        if effective_category:
            params["category"] = f"eq.{effective_category}"

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
        work: list[tuple[AliasRule, dict[str, Any]]] = []
        for rule in aliases:
            rows = fetch_alias_rows(supabase, url, rule=rule, category=args.category)
            work.extend((rule, row) for row in rows)

        seen_ids: set[tuple[str, str]] = set()
        deduped: list[tuple[AliasRule, dict[str, Any]]] = []
        for rule, row in work:
            key = (str(row["id"]), rule.target)
            if key in seen_ids:
                continue
            seen_ids.add(key)
            deduped.append((rule, row))

        rows = [row for _, row in deduped]
        print(f"[normalize] 대상 row {len(rows)}개")

        for index, (rule, row) in enumerate(deduped, 1):
            qid = str(row["id"])
            source_topic = normalize_topic(str(row.get("topic") or ""))
            target_topic = rule.target
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
