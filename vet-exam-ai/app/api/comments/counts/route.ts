import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

const MAX_IDS = 200;

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({});
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: `Too many ids (max ${MAX_IDS})` },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .select("question_id")
    .in("question_id", ids);

  if (error) {
    return NextResponse.json({}, { status: 500 });
  }

  const counts: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const row of data ?? []) {
    counts[row.question_id] = (counts[row.question_id] ?? 0) + 1;
  }
  return NextResponse.json(counts);
}
