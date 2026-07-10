import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/auth/requireUser";
import { jsonError, ApiError } from "../../../../lib/api/errors";
import { logError } from "../../../../lib/utils/logging";

export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null)
    .select("id");

  if (error) {
    logError("[notifications/mark-all-read] failed", error);
    return jsonError(ApiError.Internal, 500);
  }

  return NextResponse.json({ updated: data?.length ?? 0 });
}
