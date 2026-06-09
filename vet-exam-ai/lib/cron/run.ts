import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import type { Database } from "../supabase/types";
import { captureOperationalError } from "../utils/logging";

type AdminClient = SupabaseClient<Database>;

type CronResult = Record<string, unknown>;

type CronStatus = "success" | "failure";

function serializeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown cron error";
}

async function recordCronRun(
  admin: AdminClient,
  entry: {
    jobName: string;
    status: CronStatus;
    startedAt: Date;
    detail?: CronResult | null;
    error?: string | null;
  },
) {
  const finishedAt = new Date();
  const durationMs = Math.max(0, finishedAt.getTime() - entry.startedAt.getTime());

  const { error } = await admin.from("cron_run_logs").insert({
    job_name: entry.jobName,
    status: entry.status,
    duration_ms: durationMs,
    detail: entry.detail ?? null,
    error: entry.error ?? null,
    started_at: entry.startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
  });

  if (error) {
    console.warn("[cron] run log insert failed:", error.message);
    captureOperationalError(error, {
      area: "cron",
      operation: "record_cron_run",
      failureKind: "cron_run_log_insert_failed",
      level: "warning",
      tags: { cron_job: entry.jobName },
    });
  }
}

export async function runCronJob(
  req: NextRequest,
  jobName: string,
  handler: (admin: AdminClient) => Promise<CronResult>,
) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const admin = createAdminClient();

  try {
    const result = await handler(admin);
    await recordCronRun(admin, {
      jobName,
      status: "success",
      startedAt,
      detail: result,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = serializeError(error);
    captureOperationalError(error, {
      area: "cron",
      operation: "run_cron_job",
      failureKind: "cron_handler_failed",
      tags: { cron_job: jobName },
    });

    await recordCronRun(admin, {
      jobName,
      status: "failure",
      startedAt,
      error: message,
    });

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
