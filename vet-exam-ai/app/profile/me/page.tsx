import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfileMePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login?next=/profile/me");
  }

  // Idempotent backfill — safety net for handle_new_user trigger orphans.
  // RPC returns the guaranteed nickname (existing or newly-created user_xxx).
  const { data: nickname, error } = await supabase.rpc("ensure_my_profile_public");
  if (error || !nickname) {
    throw new Error(
      `Failed to bootstrap profile: ${error?.message ?? "RPC returned no nickname"}`,
    );
  }

  redirect(`/profile/${encodeURIComponent(nickname)}`);
}
