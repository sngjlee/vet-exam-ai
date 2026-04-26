import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { CreateCommentSchema } from "../../../lib/comments/schema";
import { renderCommentMarkdown } from "../../../lib/comments/sanitize";

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateCommentSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { question_id, type, body_text } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body_html = renderCommentMarkdown(body_text);

  const { data, error } = await supabase
    .from("comments")
    .insert({
      question_id,
      user_id: user.id,
      type,
      body_text,
      body_html,
    })
    .select(
      "id, question_id, user_id, type, body_text, body_html, status, created_at, updated_at"
    )
    .single();

  if (error) {
    const status = error.code === "23514" ? 422 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data, { status: 201 });
}
