// vet-exam-ai/app/api/cron/signup-proof-purge/route.ts
// Vercel Cron이 일 1회 호출. service_role로 RLS 우회.
// rejected 상태로 30일 경과한 signup_applications 행의 학생증 이미지를 Storage에서
// 삭제하고 proof_storage_path를 NULL로 비운다 (행 자체는 audit trail로 유지).
//
// pg_cron 대체 — Supabase의 storage.protect_delete() 트리거가
// `delete from storage.objects ...`를 차단하므로 Storage API를 사용한다.
// 같은 패턴: app/api/cron/comment-image-sweep/route.ts

import type { NextRequest } from "next/server";
import { runDailyCommentSeeding } from "../../../../lib/cron/comment-seeding";
import { runCronJob } from "../../../../lib/cron/run";

const BUCKET = "signup-proofs";
const BATCH = 100;

export async function GET(req: NextRequest) {
  return runCronJob(req, "signup-proof-purge", async (admin) => {
    let commentSeeding:
      | Awaited<ReturnType<typeof runDailyCommentSeeding>>
      | { ok: false; error: string }
      | null = null;

    const cutoffIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error: selErr } = await admin
      .from("signup_applications")
      .select("user_id, proof_storage_path")
      .eq("status", "rejected")
      .lt("last_rejection_at", cutoffIso)
      .not("proof_storage_path", "is", null);
    if (selErr) throw new Error(`fetch_expired_failed: ${selErr.message}`);

    const paths = (rows ?? [])
      .map((r) => r.proof_storage_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);

    const scanned = paths.length;
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
        return {
          ok: true,
          scanned,
          deleted,
          path_clear_error: rpcErr.message,
          commentSeeding,
        };
      }
    }

    try {
      commentSeeding = await runDailyCommentSeeding(admin);
    } catch (error) {
      commentSeeding = {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown comment seeding error",
      };
    }

    return {
      ok: true,
      scanned,
      deleted,
      commentSeeding,
    };
  });
}
