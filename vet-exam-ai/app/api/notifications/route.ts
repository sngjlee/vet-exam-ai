import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function GET(req: NextRequest) {
  const limitParam = req.nextUrl.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam != null) {
    const parsed = Number(limitParam);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
    }
    limit = Math.min(Math.floor(parsed), MAX_LIMIT);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // 1) Notifications for this user, newest first.
  const { data: rows, error } = await supabase
    .from("notifications")
    .select("id, type, payload, related_comment_id, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const safeRows = rows ?? [];

  // 2) Stitch related comments — batched lookup by id.
  const commentIds = Array.from(
    new Set(
      safeRows
        .map((r) => r.related_comment_id)
        .filter((v): v is string => v != null),
    ),
  );

  type RelatedComment = {
    id: string;
    question_id: string;
    parent_id: string | null;
  };

  const relatedById = new Map<string, RelatedComment>();
  if (commentIds.length > 0) {
    const { data: comments, error: commentErr } = await supabase
      .from("comments")
      .select("id, question_id, parent_id")
      .in("id", commentIds);

    if (commentErr) {
      // Don't fail the whole list — degrade related_comment to null.
      console.warn("[GET /api/notifications] comments stitch failed", commentErr);
    } else {
      for (const c of comments ?? []) {
        relatedById.set(c.id, {
          id: c.id,
          question_id: c.question_id,
          parent_id: c.parent_id,
        });
      }
    }
  }

  const items = safeRows.map((row) => ({
    id: row.id,
    type: row.type,
    payload: row.payload as Record<string, unknown>,
    read_at: row.read_at,
    created_at: row.created_at,
    related_comment:
      row.related_comment_id != null
        ? relatedById.get(row.related_comment_id) ?? null
        : null,
  }));

  return NextResponse.json({ items });
}
