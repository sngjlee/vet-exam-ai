import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { runDailyCommentSeeding } from "../../../../lib/cron/comment-seeding";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDailyCommentSeeding(createAdminClient());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown comment seeding error",
      },
      { status: 500 },
    );
  }
}
