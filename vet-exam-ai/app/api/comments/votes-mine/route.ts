// vet-exam-ai/app/api/comments/votes-mine/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const questionId = url.searchParams.get("question_id");
  if (!questionId) {
    return NextResponse.json({ error: "question_id is required" }, { status: 400 });
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
    .eq("question_id", questionId)
    .limit(200);

  if (idsErr) {
    return NextResponse.json({ error: idsErr.message }, { status: 500 });
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
    return NextResponse.json({ error: votesErr.message }, { status: 500 });
  }

  const map: Record<string, 1 | -1> = {};
  for (const v of votes ?? []) {
    map[v.comment_id] = v.value === 1 ? 1 : -1;
  }
  return NextResponse.json(map, { status: 200 });
}
