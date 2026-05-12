// vet-exam-ai/app/api/cron/signup-proof-purge/route.ts
// Vercel Cron이 일 1회 호출. service_role로 RLS 우회.
// rejected 상태로 30일 경과한 signup_applications 행의 학생증 이미지를 Storage에서
// 삭제하고 proof_storage_path를 NULL로 비운다 (행 자체는 audit trail로 유지).
//
// pg_cron 대체 — Supabase의 storage.protect_delete() 트리거가
// `delete from storage.objects ...`를 차단하므로 Storage API를 사용한다.
// 같은 패턴: app/api/cron/comment-image-sweep/route.ts

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

const BUCKET = "signup-proofs";
const BATCH = 100;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const cutoffIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error: selErr } = await admin
    .from("signup_applications")
    .select("user_id, proof_storage_path")
    .eq("status", "rejected")
    .lt("last_rejection_at", cutoffIso)
    .not("proof_storage_path", "is", null);
  if (selErr) {
    return NextResponse.json(
      { error: "fetch_expired_failed", detail: selErr.message },
      { status: 500 },
    );
  }

  const paths = (rows ?? [])
    .map((r) => r.proof_storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);

  let scanned = paths.length;
  let deleted = 0;
  const purgedPaths: string[] = [];

  for (let i = 0; i < paths.length; i += BATCH) {
    const slice = paths.slice(i, i + BATCH);
    const { data, error: rmErr } = await admin.storage.from(BUCKET).remove(slice);
    if (rmErr) continue;
    const removedNames = new Set(
      (data ?? []).map((o) => o.name).filter((n): n is string => typeof n === "string"),
    );
    for (const p of slice) {
      if (removedNames.has(p)) {
        deleted += 1;
        purgedPaths.push(p);
      }
    }
  }

  if (purgedPaths.length > 0) {
    const { error: rpcErr } = await admin.rpc("purge_signup_proof_paths", {
      p_paths: purgedPaths,
    });
    if (rpcErr) {
      return NextResponse.json({
        ok: true,
        scanned,
        deleted,
        path_clear_error: rpcErr.message,
      });
    }
  }

  return NextResponse.json({ ok: true, scanned, deleted });
}
