"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
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
