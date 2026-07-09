// vet-exam-ai/app/api/admin/image-replacement/upload/route.ts
// POST: admin이 압축한 webp blob + question_id/role/index 동봉. 검증 후
//   public 버킷 업로드, 파일명만 응답.
// DELETE: ?key=<filename> 으로 best-effort 삭제 (admin guard).

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { readWebpDimensions } from "../../../../../lib/webp-dimensions";
import { toStorageKey } from "../../../../../lib/admin/storage-key";
import { captureOperationalError, logError } from "../../../../../lib/utils/logging";
import { jsonError } from "../../../../../lib/api/errors";

const MAX_BYTES = 1_048_576; // 1MB
const MAX_DIM = 2200;
const BUCKET = "question-images-public";

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "auth_required" };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile || profile.role !== "admin" || !profile.is_active) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true, userId: user.id };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const lengthHeader = req.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_BYTES + 8192) {
    return jsonError("too_large", 400);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError("invalid_payload", 400);
  }

  const file        = formData.get("file");
  const questionId  = formData.get("question_id");
  const role        = formData.get("role");
  const indexStr    = formData.get("index");

  if (!(file instanceof File)) {
    return jsonError("missing_file", 400);
  }
  if (typeof questionId !== "string" || questionId.length === 0) {
    return jsonError("missing_question_id", 400);
  }
  if (role !== "q" && role !== "e") {
    return jsonError("invalid_role", 400);
  }
  const index = typeof indexStr === "string" ? Number.parseInt(indexStr, 10) : NaN;
  if (!Number.isInteger(index) || index < 0 || index > 99) {
    return jsonError("invalid_index", 400);
  }

  if (file.type !== "image/webp") {
    return jsonError("invalid_mime", 400);
  }
  if (file.size > MAX_BYTES) {
    return jsonError("too_large", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (
    buffer.length < 12 ||
    buffer.readUInt32BE(0) !== 0x52494646 ||
    buffer.readUInt32BE(8) !== 0x57454250
  ) {
    return jsonError("invalid_magic", 400);
  }
  const dims = readWebpDimensions(buffer);
  if (!dims) {
    return jsonError("decode_failed", 400);
  }
  if (dims.width > MAX_DIM || dims.height > MAX_DIM) {
    return jsonError("dimensions_exceeded", 400);
  }

  const slug      = toStorageKey(questionId);
  const ts        = Math.floor(Date.now() / 1000);
  const filename  = `${slug}_${role}_${index}_${ts}.webp`;

  const admin = createAdminClient();
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
      upsert: false,
    });
  if (uploadErr) {
    logError("[image-replace] upload failed", uploadErr);
    captureOperationalError(uploadErr, {
      area: "storage",
      operation: "question_image_replacement_upload",
      failureKind: "storage_upload_failed",
      tags: { storage_bucket: BUCKET },
    });
    return jsonError("storage_upload_failed", 500);
  }

  return NextResponse.json({ filename });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key) return jsonError("missing_key", 400);

  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).remove([key]);
  if (error) {
    logError("[image-replace] delete failed", error);
    captureOperationalError(error, {
      area: "storage",
      operation: "question_image_replacement_delete",
      failureKind: "storage_delete_failed",
      level: "warning",
      tags: { storage_bucket: BUCKET },
    });
    return jsonError("storage_delete_failed", 500);
  }
  return NextResponse.json({ ok: true });
}
