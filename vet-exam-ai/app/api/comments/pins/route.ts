import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "../../../../lib/supabase/server";
import { requireUser } from "../../../../lib/auth/requireUser";
import { jsonError, ApiError } from "../../../../lib/api/errors";
import { logError } from "../../../../lib/utils/logging";

const pinPayload = z.object({
  question_id: z.string().min(1),
  comment_id: z.string().uuid(),
});

// GET /api/comments/pins?question_id=X — returns the user's pinned comment_id
// for this question, or null if nothing is pinned. Logged-out users always
// receive null.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const questionId = url.searchParams.get("question_id");
  if (!questionId) {
    return jsonError(ApiError.MissingParam, 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ comment_id: null }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("comment_pins")
    .select("comment_id")
    .eq("user_id", user.id)
    .eq("question_public_id", questionId)
    .maybeSingle();

  if (error) {
    logError("[comments/pins] GET lookup failed", error);
    return jsonError(ApiError.Internal, 500);
  }

  return NextResponse.json(
    { comment_id: data?.comment_id ?? null },
    { status: 200 },
  );
}

// POST /api/comments/pins — toggle.
// - If the user already has THIS comment pinned for this question → unpin (delete).
// - Otherwise upsert: replaces any existing pin on the same question.
//
// Returns: { pinned: boolean, comment_id: string | null }
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  let parsed: z.infer<typeof pinPayload>;
  try {
    parsed = pinPayload.parse(await req.json());
  } catch {
    return jsonError(ApiError.ValidationFailed, 400);
  }

  // Check current pin to decide between toggle-off and replace.
  const { data: existing, error: existingErr } = await supabase
    .from("comment_pins")
    .select("id, comment_id")
    .eq("user_id", user.id)
    .eq("question_public_id", parsed.question_id)
    .maybeSingle();

  if (existingErr) {
    logError("[comments/pins] POST existing lookup failed", existingErr);
    return jsonError(ApiError.Internal, 500);
  }

  if (existing && existing.comment_id === parsed.comment_id) {
    // Same comment → unpin.
    const { error: delErr } = await supabase
      .from("comment_pins")
      .delete()
      .eq("id", existing.id);
    if (delErr) {
      logError("[comments/pins] POST unpin delete failed", delErr);
      return jsonError(ApiError.Internal, 500);
    }
    return NextResponse.json(
      { pinned: false, comment_id: null },
      { status: 200 },
    );
  }

  // Either no pin yet, or pinning a different comment. Upsert by unique key.
  const { error: upsertErr } = await supabase
    .from("comment_pins")
    .upsert(
      {
        user_id: user.id,
        // B1: parsed.question_id is the KVLE public id.
        question_public_id: parsed.question_id,
        comment_id: parsed.comment_id,
      },
      { onConflict: "user_id,question_public_id" },
    );

  if (upsertErr) {
    logError("[comments/pins] POST upsert failed", upsertErr);
    return jsonError(ApiError.Internal, 500);
  }

  return NextResponse.json(
    { pinned: true, comment_id: parsed.comment_id },
    { status: 200 },
  );
}
