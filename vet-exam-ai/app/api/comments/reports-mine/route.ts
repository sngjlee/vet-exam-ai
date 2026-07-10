import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { jsonError, ApiError } from "../../../../lib/api/errors";
import { logError } from "../../../../lib/utils/logging";

const QUESTION_COMMENT_STATE_LOOKUP_LIMIT = 1000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const questionId = url.searchParams.get("question_id");
  if (!questionId) {
    return jsonError(ApiError.MissingParam, 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json([], { status: 200 });
  }

  const { data: ids, error: idsErr } = await supabase
    .from("comments")
    .select("id")
    .eq("question_public_id", questionId)
    .limit(QUESTION_COMMENT_STATE_LOOKUP_LIMIT);

  if (idsErr) {
    logError("[comments/reports-mine] GET ids lookup failed", idsErr);
    return jsonError(ApiError.Internal, 500);
  }
  if (!ids || ids.length === 0) {
    return NextResponse.json([], { status: 200 });
  }

  const commentIds = ids.map((r) => r.id);
  const { data: reports, error: reportsErr } = await supabase
    .from("comment_reports")
    .select("comment_id")
    .eq("reporter_id", user.id)
    .in("comment_id", commentIds);

  if (reportsErr) {
    logError("[comments/reports-mine] GET reports lookup failed", reportsErr);
    return jsonError(ApiError.Internal, 500);
  }

  const reported = (reports ?? []).map((r) => r.comment_id);
  return NextResponse.json(reported, { status: 200 });
}
