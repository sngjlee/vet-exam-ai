import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

const PAGE_SIZE = 20;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ user_id: string }> },
) {
  const { user_id } = await params;
  const url = new URL(req.url);
  const offsetRaw = url.searchParams.get("offset");
  const offset = Math.max(0, parseInt(offsetRaw ?? "0", 10) || 0);

  const supabase = await createClient();

  // Peek 1 extra row to determine has_more.
  const { data: comments, error: cErr } = await supabase
    .from("comments")
    .select("id, question_id, body_text, vote_score, type, created_at")
    .eq("user_id", user_id)
    .eq("status", "visible")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE);

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const rows = comments ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  // Stitch question stems (two-query pattern; embedded join unsupported).
  const questionIds = Array.from(new Set(page.map((c) => c.question_id)));
  const stemById = new Map<string, string>();
  if (questionIds.length > 0) {
    const { data: qs, error: qErr } = await supabase
      .from("questions")
      .select("id, question")
      .in("id", questionIds);
    if (qErr) {
      return NextResponse.json({ error: qErr.message }, { status: 500 });
    }
    for (const q of qs ?? []) {
      stemById.set(q.id, q.question);
    }
  }

  const result = page.map((c) => ({
    id: c.id,
    question_id: c.question_id,
    question_stem_preview: (stemById.get(c.question_id) ?? "").slice(0, 80),
    body_text_preview: c.body_text.slice(0, 120),
    vote_score: c.vote_score,
    type: c.type,
    created_at: c.created_at,
  }));

  return NextResponse.json({ comments: result, has_more: hasMore });
}
