"""Ask Anthropic to suggest topic alias merges from topic strings only.

This script does not send question bodies, choices, answers, explanations, user
data, or comments to Anthropic. It sends only per-category topic strings and
their counts, then writes reviewable alias suggestions.

The output is intentionally not applied to the DB. Review the JSON, delete any
bad aliases, save an approved copy, then run normalize_topics.py:

    python suggest_topic_aliases.py --output output/topic-alias-suggestions.json
    copy output\\topic-alias-suggestions.json output\\topic-alias-suggestions.approved.json
    python normalize_topics.py --alias-file output/topic-alias-suggestions.approved.json --dry-run
    python normalize_topics.py --alias-file output/topic-alias-suggestions.approved.json --apply

Optional:
    python suggest_topic_aliases.py --category 내과학 --output output/topic-alias-suggestions-internal.json
    python suggest_topic_aliases.py --inventory-output output/topic-inventory.json --no-ai
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import anthropic
import httpx
from dotenv import load_dotenv

PIPELINE_ROOT = Path(__file__).parent
DEFAULT_OUTPUT = PIPELINE_ROOT / "output" / "topic-alias-suggestions.json"

load_dotenv(PIPELINE_ROOT / ".env")
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)

ALIAS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "aliases": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "source": {"type": "string"},
                    "target": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "reason": {"type": "string"},
                },
                "required": ["source", "target", "confidence", "reason"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["aliases"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """너는 수의사 국가시험 문제은행의 topic alias를 정리하는 데이터 QA 도구다.

입력은 과목별 topic 문자열과 사용 빈도뿐이다. 문제 본문은 없다.

목표:
- 같은 개념인데 표기만 다른 topic을 하나의 대표 topic으로 합칠 후보를 제안한다.
- 대표 topic(target)은 반드시 입력 목록에 이미 있는 topic 중 하나를 고른다.
- source와 target이 정확히 같은 의미일 때만 제안한다.

제안해도 되는 예:
- "von Willebrand disease" -> "von Willebrand병"
- "심장사상충증" -> "심장사상충"
- "진성 당뇨병" -> "당뇨병"

제안하면 안 되는 예:
- 상위/하위 개념 관계: "피부염" -> "아토피 피부염"
- 같은 장기계지만 다른 질환: "유방염" -> "유방 종양"
- 검사명과 질병명 혼동: "요검사" -> "요석증"
- 과목이 다른 topic끼리의 병합

출력은 JSON schema를 따르고, 애매하면 제안하지 않는다.
"""
SYSTEM_PROMPT += """

Additional merge guidance:
- Merge topic variants that differ only by viewpoint suffixes such as 치료, 진단, 금기, 특성, 원인, 예후, 병태생리, 생리적 측정값, 모니터링, 합병증, 관리, 처치 when the same core disease, drug class, test, or procedure remains.
- Prefer the shorter existing topic as target when it is clinically clear.
- Examples: 각막궤양 치료 -> 각막궤양; 각막궤양 스테로이드 금기 -> 각막궤양; 흡입마취제 특성 -> 흡입마취; 흡입마취 생리적 측정값 -> 흡입마취.
- Do not merge genuinely different diseases, species, organs, procedures, or legal provisions just because the words look similar.
"""


def normalize_topic(value: str) -> str:
    return " ".join(value.strip().split())


def fetch_topic_rows(
    client: httpx.Client,
    url: str,
    *,
    category: str | None,
    include_inactive: bool,
) -> list[dict[str, Any]]:
    select_cols = "id,category,topic,is_active"
    rows: list[dict[str, Any]] = []
    offset = 0

    while True:
        params = {
            "select": select_cols,
            "topic": "not.is.null",
            "order": "category.asc,id.asc",
            "limit": "1000",
            "offset": str(offset),
        }
        if category:
            params["category"] = f"eq.{category}"
        if not include_inactive:
            params["is_active"] = "eq.true"

        response = client.get(f"{url}/rest/v1/questions", params=params, timeout=30.0)
        response.raise_for_status()
        page = response.json()
        rows.extend(page)
        if len(page) < 1000:
            break
        offset += len(page)

    return rows


def build_inventory(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    counts: dict[str, collections.Counter[str]] = {}
    for row in rows:
        category = normalize_topic(str(row.get("category") or "Uncategorized"))
        topic = normalize_topic(str(row.get("topic") or ""))
        if not topic:
            continue
        counts.setdefault(category, collections.Counter())[topic] += 1

    inventory: dict[str, list[dict[str, Any]]] = {}
    for category, counter in sorted(counts.items()):
        inventory[category] = [
            {"topic": topic, "count": count}
            for topic, count in sorted(counter.items(), key=lambda item: item[0].casefold())
        ]
    return inventory


def chunk_topics(topics: list[dict[str, Any]], chunk_size: int) -> list[list[dict[str, Any]]]:
    if chunk_size <= 0:
        return [topics]
    return [topics[i : i + chunk_size] for i in range(0, len(topics), chunk_size)]


def build_user_message(category: str, topics: list[dict[str, Any]]) -> str:
    payload = {
        "category": category,
        "topics": topics,
    }
    return (
        "아래 과목의 topic alias 후보를 제안해라. "
        "source와 target은 반드시 topics 목록의 topic 문자열과 정확히 일치해야 한다.\n\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )


def suggest_aliases_for_chunk(
    client: anthropic.Anthropic,
    *,
    model: str,
    category: str,
    topics: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    response = client.messages.create(
        model=model,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        output_config={"format": {"type": "json_schema", "schema": ALIAS_SCHEMA}},
        messages=[{"role": "user", "content": build_user_message(category, topics)}],
    )
    text = next(block.text for block in response.content if block.type == "text")
    parsed = json.loads(text)
    aliases = parsed.get("aliases") or []
    if not isinstance(aliases, list):
        raise ValueError("model returned aliases in an unexpected shape")
    return aliases


def validate_aliases(
    *,
    category: str,
    topics: list[dict[str, Any]],
    aliases: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    topic_counts = {item["topic"]: item["count"] for item in topics}
    valid: list[dict[str, Any]] = []
    for alias in aliases:
        source = normalize_topic(str(alias.get("source") or ""))
        target = normalize_topic(str(alias.get("target") or ""))
        confidence = str(alias.get("confidence") or "low")
        reason = normalize_topic(str(alias.get("reason") or ""))

        if not source or not target or source == target:
            continue
        if source not in topic_counts or target not in topic_counts:
            print(f"  [skip] {category}: model used unknown topic {source!r} -> {target!r}")
            continue

        valid.append(
            {
                "category": category,
                "source": source,
                "target": target,
                "confidence": confidence if confidence in {"high", "medium", "low"} else "low",
                "source_count": topic_counts[source],
                "target_count": topic_counts[target],
                "reason": reason,
            }
        )
    return valid


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--category", help="특정 category만 분석")
    parser.add_argument("--include-inactive", action="store_true", help="inactive 문제 topic도 포함")
    parser.add_argument("--model", default=os.environ.get("TOPIC_ALIAS_MODEL", "claude-haiku-4-5"))
    parser.add_argument("--chunk-size", type=int, default=350, help="카테고리별 1회 AI 요청 topic 수")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--inventory-output", type=Path, help="AI 입력 topic inventory도 저장")
    parser.add_argument("--no-ai", action="store_true", help="AI 호출 없이 inventory만 저장")
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not service:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY 설정되지 않음 (pipeline/.env)")
    if args.no_ai and not args.inventory_output:
        sys.exit("--no-ai는 --inventory-output과 함께 사용하세요")

    headers = {"apikey": service, "Authorization": f"Bearer {service}"}
    with httpx.Client(headers=headers) as supabase:
        rows = fetch_topic_rows(
            supabase,
            url,
            category=args.category,
            include_inactive=args.include_inactive,
        )
    inventory = build_inventory(rows)
    total_topics = sum(len(topics) for topics in inventory.values())
    print(f"[topics] categories={len(inventory)} unique_topics={total_topics}")

    if args.inventory_output:
        write_json(args.inventory_output, inventory)
        print(f"[inventory] {args.inventory_output}")
    if args.no_ai:
        return

    anthropic_client = anthropic.Anthropic()
    all_aliases: list[dict[str, Any]] = []
    started = time.time()

    for category, topics in inventory.items():
        print(f"[category] {category}: topics={len(topics)}")
        chunks = chunk_topics(topics, args.chunk_size)
        for chunk_index, chunk in enumerate(chunks, 1):
            print(f"  [ai] chunk {chunk_index}/{len(chunks)} topics={len(chunk)}")
            raw_aliases = suggest_aliases_for_chunk(
                anthropic_client,
                model=args.model,
                category=category,
                topics=chunk,
            )
            valid_aliases = validate_aliases(category=category, topics=chunk, aliases=raw_aliases)
            all_aliases.extend(valid_aliases)
            print(f"  [ai] aliases={len(valid_aliases)}")

    all_aliases.sort(key=lambda item: (item["category"], item["target"], item["source"]))
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": args.model,
        "data_sent": "category, topic, count only",
        "review_required": True,
        "aliases": all_aliases,
    }
    write_json(args.output, payload)

    elapsed = time.time() - started
    print(f"[output] {args.output}")
    print(f"[done] aliases={len(all_aliases)} elapsed={elapsed:.1f}s")


if __name__ == "__main__":
    main()
