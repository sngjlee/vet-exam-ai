// vet-exam-ai/app/api/comments/[id]/vote/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "../../../../../lib/auth/requireUser";
import { VoteRequestSchema } from "../../../../../lib/comments/voteSchema";
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

  const parsed = VoteRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(ApiError.ValidationFailed, 422, { issues: parsed.error.issues });
  }
  const { value } = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const rl = await checkRateLimit(RATE_LIMITS.commentVote, user.id);
  if (!rl.allowed) {
    const res = jsonError(ApiError.RateLimited, 429);
    res.headers.set("Retry-After", String(rl.retryAfterSeconds));
    return res;
  }

  // 1) load comment for owner / status checks
  const { data: comment, error: commentErr } = await supabase
    .from("comments")
    .select("user_id, status")
    .eq("id", id)
    .maybeSingle();

  if (commentErr) {
    logError("[comments/[id]/vote] POST select comment failed", commentErr);
    return jsonError(ApiError.Internal, 500);
  }
  if (!comment) {
    return jsonError(ApiError.NotFound, 404);
  }
  if (comment.user_id === user.id) {
    return jsonError(ApiError.Forbidden, 403);
  }
  if (comment.status !== "visible" && comment.status !== "hidden_by_votes") {
    return jsonError(ApiError.Conflict, 409);
  }

  // 2) load existing vote (if any) — toggle decision
  const { data: existing, error: existingErr } = await supabase
    .from("comment_votes")
    .select("value")
    .eq("comment_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingErr) {
    logError("[comments/[id]/vote] POST select existing vote failed", existingErr);
    return jsonError(ApiError.Internal, 500);
  }

  if (!existing) {
    // Upsert instead of insert: a concurrent request for the same
    // (comment_id, user_id) can win the race between the read above and this
    // write, which would fail a plain insert with 23505. On conflict we set the
    // requested value so the stored vote matches what we return — idempotent.
    const { error: upsertErr } = await supabase
      .from("comment_votes")
      .upsert({ comment_id: id, user_id: user.id, value }, { onConflict: "comment_id,user_id" });
    if (upsertErr) {
      logError("[comments/[id]/vote] POST upsert failed", upsertErr);
      return jsonError(ApiError.Internal, 500);
    }
    return NextResponse.json({ vote: value }, { status: 201 });
  }

  if (existing.value === value) {
    const { error: deleteErr } = await supabase
      .from("comment_votes")
      .delete()
      .eq("comment_id", id)
      .eq("user_id", user.id);
    if (deleteErr) {
      logError("[comments/[id]/vote] POST delete failed", deleteErr);
      return jsonError(ApiError.Internal, 500);
    }
    return NextResponse.json({ vote: null }, { status: 200 });
  }

  const { error: updateErr } = await supabase
    .from("comment_votes")
    .update({ value })
    .eq("comment_id", id)
    .eq("user_id", user.id);
  if (updateErr) {
    logError("[comments/[id]/vote] POST update failed", updateErr);
    return jsonError(ApiError.Internal, 500);
  }
  return NextResponse.json({ vote: value }, { status: 200 });
}
