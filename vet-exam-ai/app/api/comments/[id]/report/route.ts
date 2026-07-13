import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "../../../../../lib/auth/requireUser";
import { ReportRequestSchema } from "../../../../../lib/comments/reportSchema";
import { checkRateLimit, RATE_LIMITS } from "../../../../../lib/rate-limit";
import { jsonError, ApiError } from "../../../../../lib/api/errors";
import { logError } from "../../../../../lib/utils/logging";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return jsonError(ApiError.MissingParam, 400);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError(ApiError.InvalidJson, 400);
  }

  const parsed = ReportRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(ApiError.ValidationFailed, 422, { issues: parsed.error.issues });
  }
  const { reason, description } = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const rl = await checkRateLimit(RATE_LIMITS.commentReport, user.id);
  if (!rl.allowed) {
    const res = jsonError(ApiError.RateLimited, 429);
    res.headers.set("Retry-After", String(rl.retryAfterSeconds));
    return res;
  }

  const { data: comment, error: commentErr } = await supabase
    .from("comments")
    .select("user_id, status")
    .eq("id", id)
    .maybeSingle();

  if (commentErr) {
    logError("[comments/[id]/report] POST select comment failed", commentErr);
    return jsonError(ApiError.Internal, 500);
  }
  if (!comment) {
    return jsonError(ApiError.NotFound, 404);
  }
  if (comment.user_id === user.id) {
    return jsonError(ApiError.Forbidden, 403);
  }
  if (comment.status !== "visible" && comment.status !== "hidden_by_votes") {
    return jsonError(ApiError.Gone, 410);
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
      return jsonError(ApiError.Conflict, 409);
    }
    logError("[comments/[id]/report] POST insert failed", insertErr);
    return jsonError(ApiError.Internal, 500);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
