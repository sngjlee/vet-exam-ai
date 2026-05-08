import { createClient } from "../supabase/server";
import type { Database } from "../supabase/types";

export type SignupStatus = Database["public"]["Enums"]["signup_status"];

export const SIGNUP_STATUS_LABEL: Record<SignupStatus, string> = {
  pending_proof:  "증빙 제출 필요",
  pending_review: "운영자 검토 중",
  approved:       "승인 완료",
  rejected:       "거부됨",
};

export async function getMySignupStatus(): Promise<{
  userId: string;
  status: SignupStatus;
} | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("signup_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;
  return { userId: user.id, status: data.signup_status };
}

export function pendingRedirectTarget(status: SignupStatus): string | null {
  switch (status) {
    case "pending_proof":  return "/auth/pending-proof";
    case "pending_review": return "/auth/pending-review";
    case "rejected":       return "/auth/rejected";
    case "approved":       return null;
    default: {
      const _exh: never = status;
      void _exh;
      return null;
    }
  }
}
