import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { profileUpdateSchema } from "../../../lib/profile/schema";
import { canChangeNickname } from "../../../lib/profile/nickname";
import { maskProfile } from "../../../lib/profile/maskPrivacy";
import type { Database } from "../../../lib/supabase/types";

type ProfileUpdate = Database["public"]["Tables"]["user_profiles_public"]["Update"];

export async function PATCH(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = profileUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const update = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Fetch current row to evaluate nickname change rule.
  const { data: current, error: selectErr } = await supabase
    .from("user_profiles_public")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectErr) {
    return NextResponse.json({ error: selectErr.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
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
      return NextResponse.json(
        {
          error: "nickname_change_too_soon",
          next_change_available_at: policy.nextChangeAt.toISOString(),
        },
        { status: 400 },
      );
    }
    dbUpdate.nickname = update.nickname;
    dbUpdate.nickname_changed_at = new Date().toISOString();
  }

  if (Object.keys(dbUpdate).length === 0) {
    // Nothing to change; return current masked.
    return NextResponse.json(maskProfile(current, true));
  }

  const { data: updated, error: updateErr } = await supabase
    .from("user_profiles_public")
    .update(dbUpdate)
    .eq("user_id", user.id)
    .select()
    .single();

  if (updateErr) {
    // PostgREST error code "23505" = unique violation
    if ((updateErr as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "nickname_taken" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json(maskProfile(updated, true));
}
