// vet-exam-ai/app/api/comments/upload/route.ts
// POST: 클라이언트 압축이 끝난 단건 WebP를 받아 검증 후 Storage put + URL 응답.
// DELETE: 본인 path만 best-effort 삭제 (취소 동작).
// 검증 계층: 인증 → content-length → magic number → 디코딩 width/height → 시간당 cap.

import { NextResponse, type NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { readWebpDimensions } from "../../../../lib/webp-dimensions";
import { urlToStoragePath } from "../../../../lib/comments/imageUrlValidate";

const MAX_BYTES = 1_048_576; // 1MB
const MAX_DIM = 2200; // 2000px + 10% margin
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1h
const RATE_LIMIT = 10; // 10 uploads / hour / user
const BUCKET = "comment-images";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const lengthHeader = req.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_BYTES + 8192 /* multipart overhead */) {
    return NextResponse.json({ error: "too_large" }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (file.type !== "image/webp") {
    return NextResponse.json({ error: "invalid_mime" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Magic number: "RIFF....WEBP"
  if (
    buffer.length < 12 ||
    buffer.readUInt32BE(0) !== 0x52494646 || // "RIFF"
    buffer.readUInt32BE(8) !== 0x57454250 // "WEBP"
  ) {
    return NextResponse.json({ error: "invalid_magic" }, { status: 400 });
  }

  const dims = readWebpDimensions(buffer);
  if (!dims) {
    return NextResponse.json({ error: "decode_failed" }, { status: 400 });
  }
  if (dims.width > MAX_DIM || dims.height > MAX_DIM) {
    return NextResponse.json({ error: "dimensions_exceeded" }, { status: 400 });
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count: recentCount, error: countErr } = await admin
    .from("comment_image_upload_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if (countErr) {
    return NextResponse.json({ error: "rate_lookup_failed" }, { status: 500 });
  }
  if ((recentCount ?? 0) >= RATE_LIMIT) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
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
    return NextResponse.json({ error: "upload_failed", detail: uploadErr.message }, { status: 500 });
  }

  await admin.from("comment_image_upload_log").insert({
    user_id: user.id,
    storage_path: path,
  });

  const { data: publicData } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: publicData.publicUrl, path }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }
  const path = urlToStoragePath(url);
  if (!path) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }
  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error: removeErr } = await admin.storage.from(BUCKET).remove([path]);
  if (removeErr) {
    return NextResponse.json({ ok: false, detail: removeErr.message }, { status: 200 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
