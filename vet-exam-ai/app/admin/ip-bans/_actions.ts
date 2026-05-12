"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

function userErrorMessage(raw: string | null): string {
  if (!raw) return "일시적인 오류가 발생했습니다.";
  if (/[가-힣]/.test(raw)) return raw;
  if (/invalid input syntax for type cidr/i.test(raw)) return "IP/대역 형식이 올바르지 않습니다 (예: 1.2.3.4 또는 1.2.3.0/24).";
  return "권한이 부족하거나 일시적인 오류입니다.";
}

function redirectWithError(message: string): never {
  redirect(`/admin/ip-bans?error=${encodeURIComponent(message)}`);
}

export async function addIpBan(formData: FormData): Promise<void> {
  const cidrRaw = String(formData.get("cidr") ?? "").trim();
  const reason  = String(formData.get("reason") ?? "").trim();

  if (!cidrRaw)  redirectWithError("IP 또는 대역을 입력해 주세요.");
  if (!reason)   redirectWithError("사유를 입력해 주세요.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_ip_ban", {
    p_cidr:   cidrRaw,
    p_reason: reason,
  });
  if (error) redirectWithError(userErrorMessage(error.message));

  revalidatePath("/admin/ip-bans");
}

export async function revokeIpBan(formData: FormData): Promise<void> {
  const id   = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!id) redirectWithError("필수 입력이 누락되었습니다.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_ip_ban", {
    p_id:   id,
    p_note: note,
  });
  if (error) redirectWithError(userErrorMessage(error.message));

  revalidatePath("/admin/ip-bans");
}
