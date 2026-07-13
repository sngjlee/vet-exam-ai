// vet-exam-ai/lib/comments/imageUrlValidate.ts
// comments.image_urls 입력 무결성 — origin/path/owner 검증.
// 다른 사용자의 path를 자기 댓글에 박는 위조 차단.

import { z } from "zod";

export const MAX_IMAGES_PER_COMMENT = 3;

export const ImageUrlsSchema = z
  .array(z.string().url())
  .max(MAX_IMAGES_PER_COMMENT)
  .default([]);

let cachedPrefix: string | null = null;

function publicPrefix(): string {
  if (cachedPrefix !== null) return cachedPrefix;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  cachedPrefix = `${url.replace(/\/$/, "")}/storage/v1/object/public/comment-images/`;
  return cachedPrefix;
}

/**
 * 모든 URL이 본인 prefix(`{comment_image_prefix}/...`)인지 검증.
 * ownerPrefix = profiles.comment_image_prefix — 공개 URL에 auth UUID를
 * 싣지 않기 위한 불투명 랜덤 프리픽스 (getCommentImagePrefix로 조회).
 * @returns 첫 번째로 발견된 위반 URL (없으면 null)
 */
export function findInvalidImageUrl(urls: string[], ownerPrefix: string): string | null {
  const PUBLIC_PREFIX = publicPrefix();
  for (const url of urls) {
    if (!url.startsWith(PUBLIC_PREFIX)) return url;
    const remainder = url.slice(PUBLIC_PREFIX.length);
    const segments = remainder.split("/");
    if (segments.length !== 3) return url;
    // length === 3 guarantees all three segments are present.
    if (segments[0] !== ownerPrefix) return url;
    if (!/^\d{6}$/.test(segments[1]!)) return url;
    if (!/^[A-Za-z0-9_-]{16}\.webp$/.test(segments[2]!)) return url;
  }
  return null;
}

/**
 * Storage path 형태로 변환 (delete/sweep용).
 * URL이 화이트리스트 prefix일 때만 호출. 아니면 null.
 */
export function urlToStoragePath(url: string): string | null {
  const PUBLIC_PREFIX = publicPrefix();
  if (!url.startsWith(PUBLIC_PREFIX)) return null;
  return url.slice(PUBLIC_PREFIX.length);
}
