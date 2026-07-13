import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { jsonError, ApiError } from "../../../../../lib/api/errors";
import { logError } from "../../../../../lib/utils/logging";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return jsonError(ApiError.MissingParam, 400);
  }

  const supabase = await createClient();

  const { data: comment, error: cErr } = await supabase
    .from("comments")
    .select("id, status, body_html, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (cErr) {
    logError("[comments/[id]/history] GET select comment failed", cErr);
    return jsonError(ApiError.Internal, 500);
  }
  if (!comment) {
    return jsonError(ApiError.NotFound, 404);
  }
  // Edit history is exposed only for currently-visible comments. Any hidden /
  // blinded / removed status must not leak prior body versions (RLS already
  // withholds blinded_by_report & removed_by_admin from non-owners; this also
  // covers hidden_by_votes and hidden_by_author).
  if (comment.status !== "visible") {
    return jsonError(ApiError.Gone, 410);
  }

  const { data: history, error: hErr } = await supabase
    .from("comment_edit_history")
    .select("body_html, edited_at")
    .eq("comment_id", id)
    .order("edited_at", { ascending: false });

  if (hErr) {
    logError("[comments/[id]/history] GET select history failed", hErr);
    return jsonError(ApiError.Internal, 500);
  }

  return NextResponse.json(
    {
      current: { body_html: comment.body_html, edited_at: comment.updated_at },
      history: history ?? [],
    },
    { status: 200 }
  );
}
