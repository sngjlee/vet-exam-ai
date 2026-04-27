import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

type Body = { read?: boolean };

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.read !== true) {
    return NextResponse.json(
      { error: "Only { read: true } is supported" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data: existing, error: selectErr } = await supabase
    .from("notifications")
    .select("id, read_at")
    .eq("id", id)
    .maybeSingle();

  if (selectErr) {
    return NextResponse.json({ error: selectErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  if (existing.read_at != null) {
    return NextResponse.json({ ok: true });
  }

  const { error: updateErr } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
