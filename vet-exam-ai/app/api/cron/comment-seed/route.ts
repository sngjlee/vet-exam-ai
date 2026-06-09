import type { NextRequest } from "next/server";
import { runDailyCommentSeeding } from "../../../../lib/cron/comment-seeding";
import { runCronJob } from "../../../../lib/cron/run";

export async function GET(req: NextRequest) {
  return runCronJob(req, "comment-seed", runDailyCommentSeeding);
}
