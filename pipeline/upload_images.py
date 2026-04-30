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
