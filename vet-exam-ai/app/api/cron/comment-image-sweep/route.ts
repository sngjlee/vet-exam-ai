// vet-exam-ai/app/api/cron/comment-image-sweep/route.ts
// Vercel Cron이 일 1회 호출. service_role로 RLS 우회.
// 24h 이전 Storage 객체 중 comments.image_urls에 미참조 건 batch delete.
// comment_image_upload_log의 24h 이전 row도 함께 cleanup.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { urlToStoragePath } from "../../../../lib/comments/imageUrlValidate";

const BUCKET = "comment-images";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BATCH = 100;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 1) Collect referenced storage paths from all comment image_urls
  const { data: refRows, error: refErr } = await admin
    .from("comments")
    .select("image_urls")
    .not("image_urls", "eq", "{}");
  if (refErr) {
    return NextResponse.json(
      { error: "fetch_referenced_failed", detail: refErr.message },
      { status: 500 }
    );
  }
  const referenced = new Set<string>();
  for (const row of refRows ?? []) {
    for (const url of (row.image_urls ?? []) as string[]) {
      const path = urlToStoragePath(url);
      if (path) referenced.add(path);
    }
  }

  // 2) Walk storage tree: {userId}/{yyyymm}/* and collect orphans
  const cutoff = Date.now() - MAX_AGE_MS;
  let scanned = 0;
  const orphans: string[] = [];

  const { data: userDirs } = await admin.storage.from(BUCKET).list("", { limit: 1000 });
  for (const userDir of userDirs ?? []) {
    if (!userDir.name) continue;
    const { data: monthDirs } = await admin.storage
      .from(BUCKET)
      .list(userDir.name, { limit: 1000 });
    for (const mdir of monthDirs ?? []) {
      if (!mdir.name) continue;
      const prefix = `${userDir.name}/${mdir.name}`;
      const { data: files } = await admin.storage
        .from(BUCKET)
        .list(prefix, { limit: 1000 });
      for (const f of files ?? []) {
        if (!f.name) continue;
        scanned += 1;
        const path = `${prefix}/${f.name}`;
        if (referenced.has(path)) continue;
        const created = f.created_at ? Date.parse(f.created_at) : Date.now();
        if (created > cutoff) continue; // too young
        orphans.push(path);
      }
    }
  }

  // 3) Batch-delete orphans
  let deleted = 0;
  for (let i = 0; i < orphans.length; i += BATCH) {
    const slice = orphans.slice(i, i + BATCH);
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(slice);
    if (!rmErr) deleted += slice.length;
  }

  // 4) Cleanup upload_log rows older than 24h
  const cutoffIso = new Date(cutoff).toISOString();
  const { error: logErr } = await admin
    .from("comment_image_upload_log")
    .delete()
    .lt("created_at", cutoffIso);
  if (logErr) {
    return NextResponse.json({
      ok: true,
      scanned,
      deleted,
      log_cleanup_error: logErr.message,
    });
  }

  return NextResponse.json({ ok: true, scanned, deleted });
}
