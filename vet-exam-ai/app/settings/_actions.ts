"use server";

import { createClient } from "../../lib/supabase/server";
import { validateNewPassword } from "../../lib/profile/passwordPolicy";

export type ChangePasswordResult =
  | { ok: true }
  | {
      ok: false;
      error: "auth_required" | "wrong_current_password" | "invalid_input" | "update_failed";
      message?: string;
    };

export async function changePassword(
  current: string,
  next: string,
  confirm: string,
): Promise<ChangePasswordResult> {
  // 1) Defense-in-depth: validate inputs server-side too
  const policy = validateNewPassword(current, next, confirm);
  if (!policy.ok) {
    return { ok: false, error: "invalid_input", message: policy.error };
  }

  const supabase = await createClient();

  // 2) Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { ok: false, error: "auth_required" };
  }

  // 3) Re-authenticate with current password (defends against session-hijack
  //    permanent takeover via password change)
  const { error: reauthErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (reauthErr) {
    return { ok: false, error: "wrong_current_password" };
  }

  // 4) Update to new password
  const { error: updateErr } = await supabase.auth.updateUser({ password: next });
  if (updateErr) {
    return { ok: false, error: "update_failed", message: updateErr.message };
  }

  return { ok: true };
}
