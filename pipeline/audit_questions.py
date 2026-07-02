"""라이브 questions 테이블 품질 감사 (read-only).

upload.py 의 validate_question_row 를 그대로 적용해 이미 DB 에 들어간 문항 중
규칙 위반(choices!=5, answer∈choices 아님, 필수 필드 빈값 등)을 찾아 보고한다.
DB 는 수정하지 않는다.

Usage:
    python audit_questions.py                # 활성 문항만 (기본)
    python audit_questions.py --all          # 비활성 포함 전수
    python audit_questions.py --json out.json  # 결과를 JSON 으로 저장

Env (pipeline/.env):
    SUPABASE_URL
    SUPABASE_SERVICE_KEY   (또는 anon key — questions read 가능하면 됨)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

from upload import validate_question_row

PIPELINE_ROOT = Path(__file__).parent
load_dotenv(PIPELINE_ROOT / ".env")

PAGE_SIZE = 1000
AUDIT_SELECT = "id,public_id,question,choices,answer,explanation,is_active"


def fetch_all(client: httpx.Client, url: str, active_only: bool) -> list[dict]:
    rows: list[dict] = []
    for start in range(0, 100_000, PAGE_SIZE):
        params = f"select={AUDIT_SELECT}&order=id.asc"
        if active_only:
            params += "&is_active=eq.true"
        resp = client.get(
            f"{url}/rest/v1/questions?{params}",
            headers={"Range": f"{start}-{start + PAGE_SIZE - 1}"},
            timeout=60.0,
        )
        resp.raise_for_status()
        page = resp.json()
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
    return rows


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--all", action="store_true", help="비활성 문항도 포함해 전수 검사")
    p.add_argument("--json", help="불량 문항 목록을 이 경로에 JSON 으로 저장")
    args = p.parse_args()

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "")
    if not url or not key:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY 가 설정되지 않음 (pipeline/.env 확인)")
        sys.exit(1)

    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    with httpx.Client(headers=headers) as client:
        rows = fetch_all(client, url, active_only=not args.all)

    scope = "전체" if args.all else "활성"
    bad: list[dict] = []
    for row in rows:
        errors = validate_question_row(row)
        if errors:
            bad.append(
                {
                    "public_id": row.get("public_id"),
                    "is_active": row.get("is_active"),
                    "errors": errors,
                }
            )

    print(f"감사 대상({scope}): {len(rows)} 문항")
    print(f"불량 문항: {len(bad)}")

    by_type: dict[str, int] = {}
    for item in bad:
        for err in item["errors"]:
            key_name = err.split("(")[0].split("는")[0].strip().split(" ")[0]
            by_type[key_name] = by_type.get(key_name, 0) + 1
    if by_type:
        print("유형별:", json.dumps(by_type, ensure_ascii=False))

    for item in bad:
        pid = item["public_id"] or "(no-public-id)"
        active = "" if item["is_active"] else " [inactive]"
        print(f"  {pid}{active} :: {', '.join(item['errors'])}")

    if args.json:
        Path(args.json).write_text(json.dumps(bad, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n결과 저장: {args.json}")

    # 불량이 있으면 비정상 종료 코드 → CI/스크립트에서 게이트로 사용 가능
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
