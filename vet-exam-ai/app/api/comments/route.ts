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
  const { question_id, parent_id, type, body_text } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Reply branch: validate parent + force type
  let effectiveType = type as
    | "memorization"
    | "correction"
    | "explanation"
    | "question"
    | "discussion"
    | undefined;
  let effectiveParentId: string | null = null;

  if (parent_id) {
    const { data: parent, error: parentErr } = await supabase
      .from("comments")
      .select("id, question_id, parent_id, status")
      .eq("id", parent_id)
      .maybeSingle();

    if (parentErr) {
      return NextResponse.json({ error: parentErr.message }, { status: 500 });
    }
    if (!parent || parent.status !== "visible") {
      return NextResponse.json(
        { error: "Parent comment not found" },
        { status: 404 }
      );
    }
    if (parent.question_id !== question_id) {
      return NextResponse.json(
        { error: "Parent belongs to another question" },
        { status: 400 }
      );
    }
    if (parent.parent_id !== null) {
      return NextResponse.json(
        { error: "Cannot reply to a reply (depth limit 1)" },
        { status: 400 }
      );
    }
    effectiveType = "discussion"; // force — request type ignored for replies
    effectiveParentId = parent_id;
  } else {
    // Root branch — refine guarantees `type` is present here
    if (!effectiveType) {
      return NextResponse.json(
        { error: "type is required for root comments" },
        { status: 400 }
      );
    }
  }

  const body_html = renderCommentMarkdown(body_text);

  const { data, error } = await supabase
    .from("comments")
    .insert({
      question_id,
      user_id: user.id,
      parent_id: effectiveParentId,
      type: effectiveType,
      body_text,
      body_html,
    })
    .select(
      "id, question_id, user_id, parent_id, type, body_text, body_html, status, created_at, updated_at"
    )
    .single();

  if (error) {
    // Postgres CHECK violations → 422; depth trigger raise → 409; else 500
    if (error.code === "23514") {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (
      error.message?.includes("Comments cannot be nested beyond 1 level") ||
      error.code === "P0001"
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
