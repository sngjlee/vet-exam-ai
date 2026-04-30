import { createClient } from "../supabase/server";

const BUCKET = "question-images-private";
const TTL_SECONDS = 60 * 60; // 1 hour

export type SignedImage = { filename: string; url: string | null };

/**
 * 일괄 signed URL 발급. 파일명 → URL 매핑 반환.
 * createSignedUrls 한 번 호출 (개별 호출 N번보다 빠름).
 * 실패한 파일은 url=null로 표시.
 */
export async function getSignedImageUrls(
  filenames: string[],
): Promise<SignedImage[]> {
  if (filenames.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(filenames, TTL_SECONDS);

  if (error || !data) {
    console.error("[triage-storage] createSignedUrls failed", error);
    return filenames.map((f) => ({ filename: f, url: null }));
  }

  // data 순서가 입력 순서와 같다는 보장이 없으므로 path 기준 매칭
  const map = new Map<string, string | null>();
  for (const item of data) {
    map.set(item.path ?? "", item.signedUrl ?? null);
  }
  return filenames.map((f) => ({ filename: f, url: map.get(f) ?? null }));
}
