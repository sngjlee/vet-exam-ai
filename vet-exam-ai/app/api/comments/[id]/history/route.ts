import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: comment, error: cErr } = await supabase
    .from("comments")
    .select("id, status, body_html, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  if (comment.status === "hidden_by_author") {
    return NextResponse.json({ error: "Comment unavailable" }, { status: 410 });
  }

  const { data: history, error: hErr } = await supabase
    .from("comment_edit_history")
    .select("body_html, edited_at")
    .eq("comment_id", id)
    .order("edited_at", { ascending: false });

  if (hErr) {
    return NextResponse.json({ error: hErr.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      current: { body_html: comment.body_html, edited_at: comment.updated_at },
      history: history ?? [],
    },
    { status: 200 }
  );
}
