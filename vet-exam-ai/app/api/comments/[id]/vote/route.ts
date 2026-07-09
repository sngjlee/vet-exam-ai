// vet-exam-ai/app/api/comments/[id]/vote/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { VoteRequestSchema } from "../../../../../lib/comments/voteSchema";
import { checkRateLimit, RATE_LIMITS } from "../../../../../lib/rate-limit";

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

  const parsed = VoteRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const { value } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const rl = await checkRateLimit(supabase, RATE_LIMITS.commentVote, user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  // 1) load comment for owner / status checks
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
      { error: "Cannot vote on own comment" },
      { status: 403 }
    );
  }
  if (comment.status !== "visible" && comment.status !== "hidden_by_votes") {
    return NextResponse.json(
      { error: "Voting is not available on this comment" },
      { status: 409 }
    );
  }

  // 2) load existing vote (if any) — toggle decision
  const { data: existing, error: existingErr } = await supabase
    .from("comment_votes")
    .select("value")
    .eq("comment_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
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
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
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
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }
    return NextResponse.json({ vote: null }, { status: 200 });
  }

  const { error: updateErr } = await supabase
    .from("comment_votes")
    .update({ value })
    .eq("comment_id", id)
    .eq("user_id", user.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  return NextResponse.json({ vote: value }, { status: 200 });
}
