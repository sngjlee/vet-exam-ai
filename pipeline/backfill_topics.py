"""Backfill questions.topic for existing rows.

This script is intentionally safe by default:
  - It never writes to Supabase unless --apply is passed.
  - Applying to all missing rows requires --confirm-all when --limit is omitted.
  - It can use topics already present in rewritten JSON, or generate missing
    topics with Anthropic.

Examples:
    python backfill_topics.py --from-rewritten --dry-run --limit 20
    python backfill_topics.py --generate-missing --dry-run --limit 20
    python backfill_topics.py --generate-missing --dry-run --category 내과학 --limit 50 --preview-output output/topic-preview.json
    python backfill_topics.py --generate-missing --dry-run --category 외과학 --force --model claude-sonnet-4-6 --limit 20
    python backfill_topics.py --generate-missing --apply --category 외과학 --force --model claude-sonnet-4-6 --limit 50 --offset 0
    python backfill_topics.py --generate-missing --apply --category 외과학 --force --model claude-sonnet-4-6 --limit 50 --offset 50
    python backfill_topics.py --generate-missing --apply --limit 50
    python backfill_topics.py --generate-missing --apply --confirm-all
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import anthropic
import httpx
from dotenv import load_dotenv

PIPELINE_ROOT = Path(__file__).parent
REWRITTEN_ROOT = PIPELINE_ROOT / "output" / "rewritten"

load_dotenv(PIPELINE_ROOT / ".env")
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)

TOPIC_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "topic": {
            "type": "string",
            "description": "문제의 핵심 개념을 나타내는 짧은 한국어 토픽명. 과목명을 반복하지 말고 2~20자로 작성.",
        },
    },
    "required": ["topic"],
    "additionalProperties": False,
}

TOPIC_SYSTEM_PROMPT = """너는 한국 수의사 국가시험 문제를 topic으로 분류하는 운영 도구다.

규칙:
- topic은 과목명보다 좁은 핵심 개념명으로 쓴다.
- 2~20자 한국어 명사구로 쓴다.
- 과목명, 회차, 연도, 세션, 문제번호를 반복하지 않는다.
- 쉼표로 여러 topic을 나열하지 말고 가장 대표적인 하나만 고른다.
- 질병명, 병원체명, 장기/계통, 약물군, 검사법, 처치명처럼 필터로 묶기 좋은 표현을 우선한다.
- 치료, 진단, 금기, 특성, 원인, 예후, 생리적 측정값 같은 세부 관점은 같은 질병/약물군/검사법으로 묶을 수 있으면 상위 topic으로 접는다.
- 예: 각막궤양 치료/각막궤양 스테로이드 금기 -> 각막궤양
- 예: 흡입마취제 특성/흡입마취 생리적 측정값/흡입마취 중 PaO2 -> 흡입마취
- 답을 바꾸거나 문제를 재작성하지 않는다. topic만 반환한다.

예: 자궁축농증, 백신, 학생 감수성, 요검사, 반추위 대사
"""

def normalize_topic(value: str) -> str:
    """Trim and normalize model/file topic output."""
    value = re.sub(r"\s+", " ", value).strip()
    value = value.strip(" ,.;:/|[](){}\"'")
    if value.lower().startswith("topic:"):
        value = value.split(":", 1)[1].strip()
    return value


def load_rewritten_topics() -> dict[str, str]:
    """Load id -> topic from rewritten JSON files when available."""
    topics: dict[str, str] = {}
    if not REWRITTEN_ROOT.exists():
        return topics

    for path in sorted(REWRITTEN_ROOT.glob("*.json")):
        with open(path, encoding="utf-8") as f:
            doc = json.load(f)
        for q in doc.get("questions") or []:
            qid = q.get("id")
            topic = q.get("topic")
            if not qid or not isinstance(topic, str):
                continue
            topic = normalize_topic(topic)
            if topic:
                topics[qid] = topic
    return topics


def fetch_missing_topic_rows(
    client: httpx.Client,
    url: str,
    *,
    category: str | None,
    ids: list[str],
    limit: int | None,
    force: bool,
    offset_start: int,
    active_only: bool,
) -> list[dict[str, Any]]:
    """Fetch rows that need topic backfill."""
    select_cols = ",".join(
        [
            "id",
            "question",
            "choices",
            "answer",
            "explanation",
            "category",
            "subject",
            "topic",
            "year",
            "round",
            "session",
        ]
    )

    if ids:
        rows: list[dict[str, Any]] = []
        for qid in ids:
            response = client.get(
                f"{url}/rest/v1/questions",
                params={"select": select_cols, "id": f"eq.{qid}", "limit": "1"},
                timeout=30.0,
            )
            response.raise_for_status()
            found = response.json()
            if found:
                row = found[0]
                if force or not normalize_topic(str(row.get("topic") or "")):
                    rows.append(row)
        return rows[:limit] if limit is not None else rows

    base_params: dict[str, str] = {
        "select": select_cols,
        "order": "category.asc,id.asc",
    }
    if not force:
        base_params["or"] = "(topic.is.null,topic.eq.)"
    if category:
        base_params["category"] = f"eq.{category}"
    if active_only:
        base_params["is_active"] = "eq.true"

    rows: list[dict[str, Any]] = []
    offset = offset_start
    while True:
        page_size = min(1000, limit - len(rows)) if limit is not None else 1000
        if page_size <= 0:
            break

        params = {
            **base_params,
            "limit": str(page_size),
            "offset": str(offset),
        }
        response = client.get(f"{url}/rest/v1/questions", params=params, timeout=30.0)
        response.raise_for_status()
        page = response.json()
        rows.extend(page)

        if len(page) < page_size:
            break
        offset += len(page)

    return rows


def build_topic_user_message(row: dict[str, Any]) -> str:
    choices = row.get("choices") or []
    if isinstance(choices, list):
        choices_block = "\n".join(f"{i + 1}. {choice}" for i, choice in enumerate(choices))
    else:
        choices_block = str(choices)

    explanation = str(row.get("explanation") or "")
    if len(explanation) > 900:
        explanation = explanation[:900] + "..."

    return f"""다음 문제의 topic 하나를 정해라.

과목: {row.get("category") or row.get("subject") or ""}
연도/회차: {row.get("year") or ""} / {row.get("round") or ""}

문제:
{row.get("question") or ""}

선택지:
{choices_block}

정답:
{row.get("answer") or ""}

해설:
{explanation}
"""


def generate_topic(client: anthropic.Anthropic, model: str, row: dict[str, Any]) -> str:
    """Generate a topic with Anthropic JSON schema output."""
    response = client.messages.create(
        model=model,
        max_tokens=256,
        system=TOPIC_SYSTEM_PROMPT,
        output_config={"format": {"type": "json_schema", "schema": TOPIC_SCHEMA}},
        messages=[{"role": "user", "content": build_topic_user_message(row)}],
    )
    text = next(block.text for block in response.content if block.type == "text")
    parsed = json.loads(text)
    topic = normalize_topic(parsed["topic"])
    if not topic:
        raise ValueError("empty topic")
    return topic


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


def write_preview(path: Path, proposals: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(proposals, f, ensure_ascii=False, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--from-rewritten", action="store_true", help="rewritten JSON에 있는 topic을 우선 사용")
    parser.add_argument("--generate-missing", action="store_true", help="topic이 없으면 Anthropic으로 생성")
    parser.add_argument("--model", default=os.environ.get("TOPIC_BACKFILL_MODEL", "claude-haiku-4-5"))
    parser.add_argument("--category", help="특정 category만 처리")
    parser.add_argument("--id", action="append", default=[], help="특정 question id만 처리. 여러 번 지정 가능")
    parser.add_argument("--limit", type=int, help="처리 row 수 제한")
    parser.add_argument("--offset", type=int, default=0, help="조회 시작 offset (--id 미사용 시)")
    parser.add_argument("--force", action="store_true", help="기존 topic이 있어도 새 topic 제안")
    parser.add_argument("--active-only", action="store_true", help="active 문제만 처리")
    parser.add_argument("--allow-failures", action="store_true", help="일부 row 실패가 있어도 exit code 0으로 종료")
    parser.add_argument("--dry-run", action="store_true", help="DB write 없이 제안만 출력")
    parser.add_argument("--apply", action="store_true", help="Supabase에 topic PATCH 실행")
    parser.add_argument("--confirm-all", action="store_true", help="--apply에서 --limit 없이 전체 처리 허용")
    parser.add_argument("--preview-output", type=Path, help="제안 목록을 JSON 파일로 저장")
    args = parser.parse_args()

    if not args.from_rewritten and not args.generate_missing:
        parser.error("--from-rewritten 또는 --generate-missing 중 하나가 필요합니다.")
    if args.apply and args.dry_run:
        parser.error("--apply와 --dry-run은 함께 사용할 수 없습니다.")
    if args.apply and args.limit is None and not args.id and not args.confirm_all:
        parser.error("전체 적용은 --confirm-all이 필요합니다. 먼저 --dry-run 또는 --limit으로 확인하세요.")
    if args.offset < 0:
        parser.error("--offset은 0 이상이어야 합니다.")

    dry_run = not args.apply

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not service:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY 설정되지 않음 (pipeline/.env)")

    rewritten_topics = load_rewritten_topics() if args.from_rewritten else {}
    if args.from_rewritten:
        print(f"[topics] rewritten JSON에서 {len(rewritten_topics)}개 topic 후보 로드")

    headers = {"apikey": service, "Authorization": f"Bearer {service}"}
    anthropic_client = anthropic.Anthropic() if args.generate_missing else None

    proposals: list[dict[str, str]] = []
    success = 0
    failed = 0
    skipped = 0
    t0 = time.time()

    with httpx.Client(headers=headers) as supabase:
        rows = fetch_missing_topic_rows(
            supabase,
            url,
            category=args.category,
            ids=args.id,
            limit=args.limit,
            force=args.force,
            offset_start=0 if args.id else args.offset,
            active_only=args.active_only,
        )
        print(f"[backfill] 대상 row {len(rows)}개 ({'dry-run' if dry_run else 'apply'})")

        for index, row in enumerate(rows, 1):
            qid = row["id"]
            source = "rewritten"
            topic = rewritten_topics.get(qid)

            if not topic and args.generate_missing:
                source = "generated"
                try:
                    assert anthropic_client is not None
                    topic = generate_topic(anthropic_client, args.model, row)
                except Exception as exc:
                    failed += 1
                    print(f"  [fail] {qid}: {type(exc).__name__}: {exc}")
                    continue

            if not topic:
                skipped += 1
                print(f"  [skip] {qid}: topic 후보 없음")
                continue

            proposal = {
                "id": qid,
                "category": str(row.get("category") or ""),
                "topic": topic,
                "source": source,
            }
            proposals.append(proposal)
            print(f"  [{index}/{len(rows)}] {qid} -> {topic} ({source})")

            if dry_run:
                continue

            if patch_topic(supabase, url, qid, topic):
                success += 1
            else:
                failed += 1

    if args.preview_output:
        write_preview(args.preview_output, proposals)
        print(f"[preview] {args.preview_output}")

    elapsed = time.time() - t0
    print(
        f"[done] proposed={len(proposals)} success={success} "
        f"skipped={skipped} failed={failed} elapsed={elapsed:.1f}s"
    )
    if failed and not args.allow_failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
