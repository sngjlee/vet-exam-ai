// vet-exam-ai/app/api/comments/votes-mine/route.ts
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
    return NextResponse.json({}, { status: 200 });
  }

  // step 1: collect comment ids on this question (root + reply)
  const { data: ids, error: idsErr } = await supabase
    .from("comments")
    .select("id")
    .eq("question_public_id", questionId)
    .limit(QUESTION_COMMENT_STATE_LOOKUP_LIMIT);

  if (idsErr) {
    logError("[comments/votes-mine] GET ids lookup failed", idsErr);
    return jsonError(ApiError.Internal, 500);
  }
  if (!ids || ids.length === 0) {
    return NextResponse.json({}, { status: 200 });
  }

  // step 2: my votes within those comment ids
  const commentIds = ids.map((r) => r.id);
  const { data: votes, error: votesErr } = await supabase
    .from("comment_votes")
    .select("comment_id, value")
    .eq("user_id", user.id)
    .in("comment_id", commentIds);

  if (votesErr) {
    logError("[comments/votes-mine] GET votes lookup failed", votesErr);
    return jsonError(ApiError.Internal, 500);
  }

  const map: Record<string, 1 | -1> = {};
  for (const v of votes ?? []) {
    map[v.comment_id] = v.value === 1 ? 1 : -1;
  }
  return NextResponse.json(map, { status: 200 });
}
