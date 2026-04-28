import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "../../../../lib/supabase/server";

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
    return NextResponse.json(
      { error: "question_id is required" },
      { status: 400 },
    );
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
    .eq("question_id", questionId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let parsed: z.infer<typeof pinPayload>;
  try {
    parsed = pinPayload.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  // Check current pin to decide between toggle-off and replace.
  const { data: existing, error: existingErr } = await supabase
    .from("comment_pins")
    .select("id, comment_id")
    .eq("user_id", user.id)
    .eq("question_id", parsed.question_id)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  if (existing && existing.comment_id === parsed.comment_id) {
    // Same comment → unpin.
    const { error: delErr } = await supabase
      .from("comment_pins")
      .delete()
      .eq("id", existing.id);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
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
        question_id: parsed.question_id,
        comment_id: parsed.comment_id,
      },
      { onConflict: "user_id,question_id" },
    );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { pinned: true, comment_id: parsed.comment_id },
    { status: 200 },
  );
}
