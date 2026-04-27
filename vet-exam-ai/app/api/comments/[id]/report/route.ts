import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { ReportRequestSchema } from "../../../../../lib/comments/reportSchema";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ReportRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const { reason, description } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data: comment, error: commentErr } = await supabase
    .from("comments")
    .select("user_id, status")
    .eq("id", id)
    .maybeSingle();

  if (commentErr) {
    return NextResponse.json({ error: commentErr.message }, { status: 500 });
  }
  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  if (comment.user_id === user.id) {
    return NextResponse.json(
      { error: "Cannot report own comment" },
      { status: 403 }
    );
  }
  if (comment.status === "removed_by_admin") {
    return NextResponse.json(
      { error: "Comment is no longer available" },
      { status: 410 }
    );
  }

  const insertPayload = {
    comment_id: id,
    reporter_id: user.id,
    reason,
    description: description ?? null,
  };

  const { error: insertErr } = await supabase
    .from("comment_reports")
    .insert(insertPayload);

  if (insertErr) {
    if (insertErr.code === "23505") {
      return NextResponse.json(
        { error: "Already reported" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
