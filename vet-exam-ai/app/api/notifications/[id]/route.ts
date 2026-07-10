import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "../../../../lib/auth/requireUser";
import { jsonError, ApiError } from "../../../../lib/api/errors";
import { logError } from "../../../../lib/utils/logging";

type Body = { read?: boolean };

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return jsonError(ApiError.MissingParam, 400);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError(ApiError.InvalidJson, 400);
  }
  if (body.read !== true) {
    return jsonError(ApiError.ValidationFailed, 400);
  }

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { data: existing, error: selectErr } = await supabase
    .from("notifications")
    .select("id, read_at")
    .eq("id", id)
    .maybeSingle();

  if (selectErr) {
    logError("[notifications/:id] select failed", selectErr);
    return jsonError(ApiError.Internal, 500);
  }
  if (!existing) {
    return jsonError(ApiError.NotFound, 404);
  }

  if (existing.read_at != null) {
    return NextResponse.json({ ok: true });
  }

  const { error: updateErr } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);

  if (updateErr) {
    logError("[notifications/:id] update failed", updateErr);
    return jsonError(ApiError.Internal, 500);
  }

  return NextResponse.json({ ok: true });
}
