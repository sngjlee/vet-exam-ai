"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { signedProofUrl } from "../../../lib/storage/signup-proofs";

export type AdminActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function approveSignupAction(userId: string, note: string | null): Promise<AdminActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_signup_application", {
    p_user_id: userId,
    p_note:    note ?? null,
  });
  if (error) return { ok: false, error: error.message };

  // RPC returns the captured proof_storage_path. Storage delete must go
  // through the Storage API (postgres trigger blocks direct DELETE on
  // storage.objects). Failures are best-effort: the row is already approved
  // and the user is unblocked; orphan cleanup belongs to a separate sweep.
  const path = data;
  if (typeof path === "string" && path.length > 0) {
    try {
      const admin = createAdminClient();
      await admin.storage.from("signup-proofs").remove([path]);
    } catch {
      // best-effort
    }
  }

  revalidatePath("/admin/signup-applications");
  return { ok: true };
}

export async function rejectSignupAction(userId: string, reason: string): Promise<AdminActionResult> {
  if (!reason || reason.trim().length < 3 || reason.length > 500) {
    return { ok: false, error: "거부 사유는 3~500자로 입력해 주세요." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_signup_application", {
    p_user_id: userId,
    p_reason:  reason.trim(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/signup-applications");
  return { ok: true };
}

export async function getProofImageUrlAction(path: string): Promise<{ url: string | null }> {
  const supabase = await createClient();
  const url = await signedProofUrl(supabase, path);
  return { url };
}
