"""Supabase Storage 키 변환 헬퍼.

Supabase Storage는 객체 키에 printable ASCII (0x20-0x7E)만 허용 — 한글 등
non-ASCII는 InvalidKey 에러로 거부된다. 따라서 디스크/JSON 의 raw 파일명을
업로드/INSERT 시점에 ASCII 슬러그로 변환한다.

변환 규칙: non-ASCII 문자는 UTF-8 바이트의 hex 문자열로 inline 치환.
ASCII 문자는 그대로 둔다. ASCII-only 입력은 idempotent (변환 없음).

예) 1.1_해부_57회_q013_note1.jpg → 1.1_ed95b4ebb680_57ed9a8c_q013_note1.jpg

사용처:
- upload_images.py: Storage 업로드 키
- backfill_image_files.py / upload.py: questions.{question,explanation}_image_files 컬럼 값
- (TS) lib/admin/image-triage-storage.ts → createSignedUrls()는 DB 값을 그대로 전달
"""

from __future__ import annotations


def to_storage_key(filename: str) -> str:
    """Raw 파일명 → ASCII-only 슬러그.

    Idempotent: ASCII-only 입력은 그대로 반환.
    """
    out: list[str] = []
    for ch in filename:
        if ord(ch) < 128:
            out.append(ch)
        else:
            out.append(ch.encode("utf-8").hex())
    return "".join(out)
