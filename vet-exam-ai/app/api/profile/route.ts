import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "../../../lib/auth/requireUser";
import { profileUpdateSchema } from "../../../lib/profile/schema";
import { canChangeNickname } from "../../../lib/profile/nickname";
import { maskProfile } from "../../../lib/profile/maskPrivacy";
import type { Database } from "../../../lib/supabase/types";
import { jsonError, ApiError } from "../../../lib/api/errors";
import { logError } from "../../../lib/utils/logging";

type ProfileUpdate = Database["public"]["Tables"]["user_profiles_public"]["Update"];

export async function PATCH(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError(ApiError.InvalidJson, 400);
  }

  const parsed = profileUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(ApiError.ValidationFailed, 400, { issues: parsed.error.issues });
  }
  const update = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  // Fetch current row to evaluate nickname change rule. Uses the owner RPC
  // because university / target_round are no longer directly selectable by the
  // authenticated role (see 20260713000000_profile_privacy_column_hardening).
  const { data: current, error: selectErr } = await supabase
    .rpc("get_my_profile")
    .maybeSingle();

  if (selectErr) {
    logError("[profile] select failed", selectErr);
    return jsonError(ApiError.Internal, 500);
  }
  if (!current) {
    return jsonError(ApiError.NotFound, 404);
  }

  // Build the update payload.
  const dbUpdate: ProfileUpdate = {};
  if (update.bio !== undefined) dbUpdate.bio = update.bio;
  if (update.target_round !== undefined) dbUpdate.target_round = update.target_round;
  if (update.university !== undefined) dbUpdate.university = update.university;
  if (update.target_round_visible !== undefined)
    dbUpdate.target_round_visible = update.target_round_visible;
  if (update.university_visible !== undefined)
    dbUpdate.university_visible = update.university_visible;

  if (update.nickname !== undefined && update.nickname !== current.nickname) {
    const policy = canChangeNickname(current.nickname, current.nickname_changed_at);
    if (!policy.canChange) {
      return jsonError("nickname_change_too_soon", 400, {
        next_change_available_at: policy.nextChangeAt.toISOString(),
      });
    }
    dbUpdate.nickname = update.nickname;
    dbUpdate.nickname_changed_at = new Date().toISOString();
  }

  if (Object.keys(dbUpdate).length === 0) {
    // Nothing to change; return current masked.
    return NextResponse.json(maskProfile(current, true));
  }

  const { error: updateErr } = await supabase
    .from("user_profiles_public")
    .update(dbUpdate)
    .eq("user_id", user.id);

  if (updateErr) {
    // PostgREST error code "23505" = unique violation
    if ((updateErr as { code?: string }).code === "23505") {
      return jsonError("nickname_taken", 400);
    }
    logError("[profile] update failed", updateErr);
    return jsonError(ApiError.Internal, 500);
  }

  // Read the fresh row back via the owner RPC (the UPDATE ... RETURNING path
  // would expand to columns the authenticated role can no longer SELECT).
  const { data: updated, error: readErr } = await supabase
    .rpc("get_my_profile")
    .maybeSingle();

  if (readErr || !updated) {
    logError("[profile] readback failed", readErr);
    return jsonError(ApiError.Internal, 500);
  }

  return NextResponse.json(maskProfile(updated, true));
}
