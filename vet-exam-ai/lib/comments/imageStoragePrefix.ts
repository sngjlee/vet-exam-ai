// vet-exam-ai/lib/comments/imageStoragePrefix.ts
// comment-images 업로드 경로의 소유자 세그먼트 = profiles.comment_image_prefix.
// auth UUID를 공개 URL에 싣지 않기 위한 불투명 랜덤 프리픽스 (DB default로 생성).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

/**
 * 사용자의 comment-images 경로 프리픽스 조회.
 * user 클라이언트("profiles: owner read" RLS) / admin 클라이언트 모두 가능.
 * @returns 프리픽스 (행이 없거나 조회 실패 시 null)
 */
export async function getCommentImagePrefix(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("profiles")
    .select("comment_image_prefix")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.comment_image_prefix;
}
