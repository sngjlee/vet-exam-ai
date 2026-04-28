import type { Database } from "../supabase/types";

type CorrectionStatus = Database["public"]["Enums"]["correction_status"];

export const CORRECTION_STATUS_KO: Record<CorrectionStatus, string> = {
  proposed:  "제안됨",
  reviewing: "검토 중",
  accepted:  "수락됨",
  rejected:  "거절됨",
};

export const CORRECTION_RESOLUTION_KO: Record<"accepted" | "rejected", string> = {
  accepted: "정정 수락",
  rejected: "정정 거절",
};

export const ALL_CORRECTION_STATUSES: ReadonlyArray<CorrectionStatus> = [
  "proposed",
  "reviewing",
  "accepted",
  "rejected",
];
