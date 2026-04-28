import type { Database } from "../supabase/types";

type ReportReason = Database["public"]["Enums"]["report_reason"];
type ReportStatus = Database["public"]["Enums"]["report_status"];

export const REPORT_REASON_KO: Record<ReportReason, string> = {
  spam:           "스팸",
  misinformation: "허위/잘못된 정보",
  privacy:        "개인정보",
  hate_speech:    "혐오 표현",
  advertising:    "광고/홍보",
  copyright:      "저작권 침해",
  defamation:     "명예훼손",
  other:          "기타",
};

export const REPORT_STATUS_KO: Record<ReportStatus, string> = {
  pending:   "대기",
  reviewing: "검토 중",
  upheld:    "인정됨",
  dismissed: "기각됨",
};

export const REPORT_RESOLUTION_KO: Record<"upheld" | "dismissed", string> = {
  upheld:    "신고 인정",
  dismissed: "신고 기각",
};

export const ALL_REPORT_REASONS: ReadonlyArray<ReportReason> = [
  "spam",
  "misinformation",
  "privacy",
  "hate_speech",
  "advertising",
  "copyright",
  "defamation",
  "other",
];

export const ALL_REPORT_STATUSES: ReadonlyArray<ReportStatus> = [
  "pending",
  "reviewing",
  "upheld",
  "dismissed",
];
