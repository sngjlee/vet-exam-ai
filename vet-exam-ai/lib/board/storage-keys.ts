// vet-exam-ai/lib/board/storage-keys.ts
// Storage path slug for board post/comment images. Same bucket as comments
// (`comment-images`) but a distinct prefix.

import { randomUUID } from "crypto";

export function postImagePath(postId: string, originalName: string): string {
  const ext = extractExt(originalName);
  return `boards/${postId}/${randomUUID()}${ext}`;
}

export function postCommentImagePath(
  postId: string,
  commentId: string,
  originalName: string,
): string {
  const ext = extractExt(originalName);
  return `boards/${postId}/comments/${commentId}/${randomUUID()}${ext}`;
}

function extractExt(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  const ext = name.slice(i).toLowerCase();
  // ASCII-only allowed in Supabase storage keys (see supabase_storage_ascii_only memory)
  if (!/^\.[a-z0-9]{1,5}$/.test(ext)) return "";
  return ext;
}
