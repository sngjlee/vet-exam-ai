// vet-exam-ai/lib/comments/imageUrlValidate.ts
// comments.image_urls 입력 무결성 — origin/path/owner 검증.
// 다른 사용자의 path를 자기 댓글에 박는 위조 차단.

import { z } from "zod";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
}
const PUBLIC_PREFIX = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/comment-images/`;

export const MAX_IMAGES_PER_COMMENT = 3;

export const ImageUrlsSchema = z
  .array(z.string().url())
  .max(MAX_IMAGES_PER_COMMENT)
  .default([]);

/**
 * 모든 URL이 본인 prefix(`{userId}/...`)인지 검증.
 * @returns 첫 번째로 발견된 위반 URL (없으면 null)
 */
export function findInvalidImageUrl(urls: string[], ownerUserId: string): string | null {
  for (const url of urls) {
    if (!url.startsWith(PUBLIC_PREFIX)) return url;
    const remainder = url.slice(PUBLIC_PREFIX.length);
    const segments = remainder.split("/");
    if (segments.length !== 3) return url;
    if (segments[0] !== ownerUserId) return url;
    if (!/^\d{6}$/.test(segments[1])) return url;
    if (!/^[A-Za-z0-9_-]{16}\.webp$/.test(segments[2])) return url;
  }
  return null;
}

/**
 * Storage path 형태로 변환 (delete/sweep용).
 * URL이 화이트리스트 prefix일 때만 호출. 아니면 null.
 */
export function urlToStoragePath(url: string): string | null {
  if (!url.startsWith(PUBLIC_PREFIX)) return null;
  return url.slice(PUBLIC_PREFIX.length);
}
