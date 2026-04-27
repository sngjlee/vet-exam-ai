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
    return NextResponse.json([], { status: 200 });
  }

  const { data: ids, error: idsErr } = await supabase
    .from("comments")
    .select("id")
    .eq("question_id", questionId)
    .limit(200);

  if (idsErr) {
    return NextResponse.json({ error: idsErr.message }, { status: 500 });
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
    return NextResponse.json({ error: reportsErr.message }, { status: 500 });
  }

  const reported = (reports ?? []).map((r) => r.comment_id);
  return NextResponse.json(reported, { status: 200 });
}
