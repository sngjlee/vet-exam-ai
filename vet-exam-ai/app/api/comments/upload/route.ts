// vet-exam-ai/app/api/comments/upload/route.ts
// POST: 클라이언트 압축이 끝난 단건 WebP를 받아 검증 후 Storage put + URL 응답.
// DELETE: 본인 path만 best-effort 삭제 (취소 동작).
// 검증 계층: 인증 → content-length → magic number → 디코딩 width/height → 시간당 cap.

import { NextResponse, type NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { requireUser } from "../../../../lib/auth/requireUser";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { readWebpDimensions } from "../../../../lib/webp-dimensions";
import { urlToStoragePath } from "../../../../lib/comments/imageUrlValidate";
import { captureOperationalError, classifySupabaseFailure } from "../../../../lib/utils/logging";
import { jsonError } from "../../../../lib/api/errors";

const MAX_BYTES = 1_048_576; // 1MB
const MAX_DIM = 2200; // 2000px + 10% margin
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1h
const RATE_LIMIT = 10; // 10 uploads / hour / user
const BUCKET = "comment-images";

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const lengthHeader = req.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_BYTES + 8192 /* multipart overhead */) {
    return jsonError("too_large", 400);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError("invalid_payload", 400);
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError("missing_file", 400);
  }
  if (file.type !== "image/webp") {
    return jsonError("invalid_mime", 400);
  }
  if (file.size > MAX_BYTES) {
    return jsonError("too_large", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Magic number: "RIFF....WEBP"
  if (
    buffer.length < 12 ||
    buffer.readUInt32BE(0) !== 0x52494646 || // "RIFF"
    buffer.readUInt32BE(8) !== 0x57454250 // "WEBP"
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

  const admin = createAdminClient();
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count: recentCount, error: countErr } = await admin
    .from("comment_image_upload_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if (countErr) {
    captureOperationalError(countErr, {
      area: "supabase",
      operation: "comment_image_upload_rate_lookup",
      failureKind: classifySupabaseFailure(countErr),
      tags: { storage_bucket: BUCKET },
    });
    return jsonError("rate_lookup_failed", 500);
  }
  if ((recentCount ?? 0) >= RATE_LIMIT) {
    return jsonError("rate_limited", 429);
  }

  const yyyymm = new Date().toISOString().slice(0, 7).replace("-", "");
  const path = `${user.id}/${yyyymm}/${nanoid(16)}.webp`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadErr) {
    captureOperationalError(uploadErr, {
      area: "storage",
      operation: "comment_image_upload",
      failureKind: "storage_upload_failed",
      tags: { storage_bucket: BUCKET },
    });
    return jsonError("upload_failed", 500);
  }

  const { error: logErr } = await admin.from("comment_image_upload_log").insert({
    user_id: user.id,
    storage_path: path,
  });
  if (logErr) {
    captureOperationalError(logErr, {
      area: "supabase",
      operation: "comment_image_upload_log",
      failureKind: classifySupabaseFailure(logErr),
      level: "warning",
      tags: { storage_bucket: BUCKET },
    });
  }

  const { data: publicData } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: publicData.publicUrl, path }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return jsonError("missing_url", 400);
  }
  const path = urlToStoragePath(url);
  if (!path) {
    return jsonError("invalid_url", 400);
  }
  if (!path.startsWith(`${user.id}/`)) {
    return jsonError("forbidden", 403);
  }

  const admin = createAdminClient();
  const { error: removeErr } = await admin.storage.from(BUCKET).remove([path]);
  if (removeErr) {
    captureOperationalError(removeErr, {
      area: "storage",
      operation: "comment_image_delete",
      failureKind: "storage_delete_failed",
      level: "warning",
      tags: { storage_bucket: BUCKET },
    });
    return NextResponse.json({ ok: false }, { status: 200 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
