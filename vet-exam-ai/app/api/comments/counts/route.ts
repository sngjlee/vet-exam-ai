import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { jsonError, ApiError } from "../../../../lib/api/errors";
import { logError } from "../../../../lib/utils/logging";

const MAX_IDS = 200;
// PostgREST caps a response at max_rows (1000); page so busy question sets
// aren't under-counted.
const PAGE_SIZE = 1000;

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({});
  }
  if (ids.length > MAX_IDS) {
    return jsonError(ApiError.ValidationFailed, 400);
  }

  const supabase = await createClient();
  const counts: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));

  // Count only visible comments (exclude hidden/blinded/author-deleted) so the
  // badge matches what a viewer can actually open — the thread list uses the same
  // status='visible' filter. Page by the unique id so no row is skipped when a
  // question set holds more than PAGE_SIZE comments.
  for (let from = 0; ; from += PAGE_SIZE) {
    // B1: `ids` are KVLE public ids; count against question_public_id.
    const { data, error } = await supabase
      .from("comments")
      .select("question_public_id")
      .eq("status", "visible")
      .in("question_public_id", ids)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      logError("[comments/counts] page fetch failed", error);
      return jsonError(ApiError.Internal, 500);
    }

    const page = data ?? [];
    for (const row of page) {
      if (!row.question_public_id) continue;
      counts[row.question_public_id] = (counts[row.question_public_id] ?? 0) + 1;
    }
    if (page.length < PAGE_SIZE) break;
  }

  return NextResponse.json(counts);
}
