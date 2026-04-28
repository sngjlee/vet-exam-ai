"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import type { Database } from "../../../lib/supabase/types";

type UserRole  = Database["public"]["Enums"]["user_role"];
type BadgeType = Database["public"]["Enums"]["badge_type"];

function userErrorMessage(raw: string | null): string {
  if (!raw) return "일시적인 오류가 발생했습니다.";
  // Korean P0001 messages from RPC raise — pass through. Anything else gets generalized.
  if (/[가-힣]/.test(raw)) return raw;
  return "권한이 부족하거나 일시적인 오류입니다.";
}

function redirectWithError(message: string): never {
  redirect(`/admin/users?error=${encodeURIComponent(message)}`);
}

export async function setRole(formData: FormData): Promise<void> {
  const userId  = String(formData.get("user_id") ?? "");
  const newRole = String(formData.get("new_role") ?? "") as UserRole;
  const note    = String(formData.get("note") ?? "").trim() || null;

  if (!userId || !newRole) redirectWithError("필수 입력이 누락되었습니다.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_role", {
    p_user_id:  userId,
    p_new_role: newRole,
    p_note:     note,
  });
  if (error) redirectWithError(userErrorMessage(error.message));

  revalidatePath("/admin/users");
}

export async function setActive(formData: FormData): Promise<void> {
  const userId    = String(formData.get("user_id") ?? "");
  const newActive = formData.get("new_active") === "true";
  const note      = String(formData.get("note") ?? "").trim() || null;

  if (!userId) redirectWithError("필수 입력이 누락되었습니다.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_active", {
    p_user_id:    userId,
    p_new_active: newActive,
    p_note:       note,
  });
  if (error) redirectWithError(userErrorMessage(error.message));

  revalidatePath("/admin/users");
}

export async function grantBadge(formData: FormData): Promise<void> {
  const userId    = String(formData.get("user_id") ?? "");
  const badgeType = String(formData.get("badge_type") ?? "") as BadgeType;
  const reason    = String(formData.get("reason") ?? "").trim() || null;

  if (!userId || !badgeType) redirectWithError("필수 입력이 누락되었습니다.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_badge", {
    p_user_id:    userId,
    p_badge_type: badgeType,
    p_reason:     reason,
  });
  if (error) redirectWithError(userErrorMessage(error.message));

  revalidatePath("/admin/users");
}

export async function revokeBadge(formData: FormData): Promise<void> {
  const userId    = String(formData.get("user_id") ?? "");
  const badgeType = String(formData.get("badge_type") ?? "") as BadgeType;
  const note      = String(formData.get("note") ?? "").trim() || null;

  if (!userId || !badgeType) redirectWithError("필수 입력이 누락되었습니다.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_badge", {
    p_user_id:    userId,
    p_badge_type: badgeType,
    p_note:       note,
  });
  if (error) redirectWithError(userErrorMessage(error.message));

  revalidatePath("/admin/users");
}

export async function issuePasswordResetLink(formData: FormData): Promise<void> {
  const userId = String(formData.get("user_id") ?? "");
  const note   = String(formData.get("note") ?? "").trim() || null;

  if (!userId) redirectWithError("필수 입력이 누락되었습니다.");

  // 1) guard + audit (RLS context — runs as the requesting admin).
  //    Audit precedes link generation: a stranded audit row recording an
  //    attempt is preferable to an unaudited issuance.
  const supabase = await createClient();
  const { error: rpcErr } = await supabase.rpc("log_password_reset_issued", {
    p_user_id: userId,
    p_note:    note,
  });
  if (rpcErr) redirectWithError(userErrorMessage(rpcErr.message));

  // 2) email lookup via service role (auth.users not exposed via REST)
  const admin = createAdminClient();
  const { data: u, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !u?.user?.email) {
    redirectWithError("대상 회원의 이메일을 찾을 수 없습니다.");
  }

  // 3) generate one-time recovery link
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type:  "recovery",
    email: u!.user!.email!,
  });
  if (linkErr || !link?.properties?.action_link) {
    redirectWithError("링크 발급에 실패했습니다.");
  }

  // 4) display via redirect query — short-lived, admin should copy immediately.
  //    Not stored in DB. URL = credential.
  revalidatePath("/admin/users");
  redirect(
    `/admin/users?reset_link=${encodeURIComponent(link!.properties.action_link)}` +
      `&reset_for=${encodeURIComponent(userId)}`,
  );
}
