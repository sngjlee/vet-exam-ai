import type { Database } from "../../../../lib/supabase/types";

export type SignupStatus = Database["public"]["Enums"]["signup_status"];

export const STATUS_LABEL: Record<SignupStatus, string> = {
  pending_proof:  "증빙 미제출",
  pending_review: "검토 대기",
  approved:       "승인 완료",
  rejected:       "거부됨",
};

export function formatRound(round: number): string {
  return `${round}회`;
}

export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
