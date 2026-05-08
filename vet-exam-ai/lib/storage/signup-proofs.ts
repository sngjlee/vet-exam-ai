import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

const BUCKET = "signup-proofs";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export type ProofUploadResult =
  | { ok: true;  path: string }
  | { ok: false; error: "auth_required" | "bad_type" | "too_large" | "upload_failed"; message?: string };

function safeExt(file: File): "jpg" | "png" | "webp" | null {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png")  return "png";
  if (file.type === "image/webp") return "webp";
  return null;
}

function uuidish(): string {
  return (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2));
}

export async function uploadSignupProof(
  supabase: SupabaseClient<Database>,
  userId: string,
  file: File,
): Promise<ProofUploadResult> {
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: "bad_type", message: "JPG, PNG, WEBP만 업로드 가능합니다." };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: "too_large", message: "파일은 5MB 이하만 업로드 가능합니다." };
  }
  const ext = safeExt(file);
  if (!ext) return { ok: false, error: "bad_type" };

  const path = `${userId}/${uuidish()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    return { ok: false, error: "upload_failed", message: error.message };
  }
  return { ok: true, path };
}

export async function signedProofUrl(
  supabase: SupabaseClient<Database>,
  path: string,
  expiresInSec: number = 300,
): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSec);
  return data?.signedUrl ?? null;
}
