import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/auth/requireUser";
import { jsonError, ApiError } from "../../../../lib/api/errors";
import { logError } from "../../../../lib/utils/logging";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    logError("[notifications/unread-count] failed", error);
    return jsonError(ApiError.Internal, 500);
  }

  return NextResponse.json({ count: count ?? 0 });
}
