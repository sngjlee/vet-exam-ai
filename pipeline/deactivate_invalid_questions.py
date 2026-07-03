"""검증 규칙을 위반하는 활성 문항을 is_active=false 로 비활성화.

upload.py 의 validate_question_row 규칙(choices==5, answer∈choices, 필수 필드)을
그대로 적용해, 이미 노출 중인 불량 문항을 사용자에게서 숨긴다.

기본은 dry-run (아무것도 바꾸지 않음). 실제 반영은 --apply 필요.

Usage:
    python deactivate_invalid_questions.py                # dry-run: 대상만 출력
    python deactivate_invalid_questions.py --apply        # is_active=false 반영
    python deactivate_invalid_questions.py --only KVLE-2897 [--apply]   # 특정 문항만
    python deactivate_invalid_questions.py --json out.json # 대상 목록 저장

Env (pipeline/.env):
    SUPABASE_URL
    SUPABASE_SERVICE_KEY   (service_role — RLS 우회, is_active 갱신에 필요)
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


def fetch_active(client: httpx.Client, url: str) -> list[dict]:
    rows: list[dict] = []
    for start in range(0, 100_000, PAGE_SIZE):
        resp = client.get(
            f"{url}/rest/v1/questions?select={AUDIT_SELECT}&is_active=eq.true&order=id.asc",
            headers={"Range": f"{start}-{start + PAGE_SIZE - 1}"},
            timeout=60.0,
        )
        resp.raise_for_status()
        page = resp.json()
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
    return rows


def deactivate(client: httpx.Client, url: str, question_id: str) -> None:
    """id 기준으로 is_active=false 로 갱신 (service_role 필요)."""
    resp = client.patch(
        f"{url}/rest/v1/questions",
        params={"id": f"eq.{question_id}"},
        headers={"Content-Type": "application/json", "Prefer": "return=minimal"},
        json={"is_active": False},
        timeout=30.0,
    )
    resp.raise_for_status()


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--apply", action="store_true", help="실제로 is_active=false 반영 (없으면 dry-run)")
    p.add_argument("--only", action="append", default=[],
                   help="특정 public_id 만 대상 (여러 번 지정 가능). 없으면 위반 문항 전체")
    p.add_argument("--json", help="대상 목록을 이 경로에 JSON 으로 저장")
    args = p.parse_args()

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY 가 설정되지 않음 (pipeline/.env 확인)")
        sys.exit(1)
    if args.apply and not key:
        print("ERROR: --apply 에는 service_role 키가 필요합니다.")
        sys.exit(1)

    only = set(args.only)
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    with httpx.Client(headers=headers) as client:
        rows = fetch_active(client, url)

        targets: list[dict] = []
        for row in rows:
            errors = validate_question_row(row)
            if not errors:
                continue
            if only and row.get("public_id") not in only:
                continue
            targets.append(
                {"id": row["id"], "public_id": row.get("public_id"), "errors": errors}
            )

        print(f"활성 문항 {len(rows)} 중 비활성화 대상: {len(targets)}")
        for t in targets:
            print(f"  {t['public_id'] or '(no-public-id)'} :: {', '.join(t['errors'])}")

        if args.json:
            Path(args.json).write_text(json.dumps(targets, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"대상 목록 저장: {args.json}")

        if not targets:
            print("대상 없음. 종료.")
            return

        if not args.apply:
            print("\n[dry-run] 아무것도 바꾸지 않았습니다. 실제 반영하려면 --apply 를 붙이세요.")
            return

        done, failed = 0, 0
        for t in targets:
            try:
                deactivate(client, url, t["id"])
                done += 1
            except httpx.HTTPStatusError as e:
                failed += 1
                print(f"  [fail] {t['public_id']}: HTTP {e.response.status_code} {e.response.text[:150]}")

        print(f"\n=== 완료: {done} 문항 비활성화, 실패 {failed} ===")


if __name__ == "__main__":
    main()
