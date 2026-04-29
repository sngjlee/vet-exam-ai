import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { EditCommentSchema } from "../../../../lib/comments/schema";
import { renderCommentMarkdown } from "../../../../lib/comments/sanitize";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data: existing, error: selectErr } = await supabase
    .from("comments")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();

  if (selectErr) {
    return NextResponse.json({ error: selectErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: updateErr } = await supabase
    .from("comments")
    .update({ status: "hidden_by_author" })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}

export async function PATCH(
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

  const parsed = EditCommentSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const { body_text } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data: existing, error: selectErr } = await supabase
    .from("comments")
    .select("id, user_id, status, body_text, body_html, created_at, updated_at, edit_count")
    .eq("id", id)
    .maybeSingle();

  if (selectErr) {
    return NextResponse.json({ error: selectErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (existing.status !== "visible") {
    return NextResponse.json(
      { error: "이 댓글은 더 이상 수정할 수 없습니다" },
      { status: 409 }
    );
  }

  if (existing.body_text === body_text) {
    return NextResponse.json(
      {
        id: existing.id,
        body_text: existing.body_text,
        body_html: existing.body_html,
        edit_count: existing.edit_count,
        updated_at: existing.updated_at,
        created_at: existing.created_at,
      },
      { status: 200 }
    );
  }

  const body_html = renderCommentMarkdown(body_text);

  const { data: updated, error: updateErr } = await supabase
    .from("comments")
    .update({ body_text, body_html })
    .eq("id", id)
    .select("id, body_text, body_html, edit_count, updated_at, created_at")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json(updated, { status: 200 });
}
