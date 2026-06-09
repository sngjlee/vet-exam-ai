"use server";

import { createClient } from "../../lib/supabase/server";
import { createAdminClient } from "../../lib/supabase/admin";
import { validateNewPassword } from "../../lib/profile/passwordPolicy";

export type ChangePasswordResult =
  | { ok: true }
  | {
      ok: false;
      error: "auth_required" | "wrong_current_password" | "invalid_input" | "update_failed";
    };

export type DeleteAccountResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "auth_required"
        | "email_mismatch"
        | "wrong_current_password"
        | "delete_failed";
    };

export async function changePassword(
  current: string,
  next: string,
  confirm: string,
): Promise<ChangePasswordResult> {
  // 1) Defense-in-depth: validate inputs server-side too
  const policy = validateNewPassword(current, next, confirm);
  if (!policy.ok) {
    return { ok: false, error: "invalid_input" };
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
    console.error("[changePassword] updateUser failed:", updateErr.message);
    return { ok: false, error: "update_failed" };
  }

  return { ok: true };
}

export async function deleteAccount(
  currentPassword: string,
  confirmEmail: string,
): Promise<DeleteAccountResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return { ok: false, error: "auth_required" };
  }

  if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, error: "email_mismatch" };
  }

  const { error: reauthErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthErr) {
    return { ok: false, error: "wrong_current_password" };
  }

  const admin = createAdminClient();
  const { data: application } = await admin
    .from("signup_applications")
    .select("proof_storage_path")
    .eq("user_id", user.id)
    .maybeSingle();

  const proofPath = application?.proof_storage_path;
  if (typeof proofPath === "string" && proofPath.length > 0) {
    const { error: storageErr } = await admin.storage
      .from("signup-proofs")
      .remove([proofPath]);
    if (storageErr) {
      console.warn("[deleteAccount] signup proof cleanup failed:", storageErr.message);
    }
  }

  const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
  if (deleteErr) {
    console.error("[deleteAccount] deleteUser failed:", deleteErr.message);
    return { ok: false, error: "delete_failed" };
  }

  await supabase.auth.signOut();
  return { ok: true };
}
