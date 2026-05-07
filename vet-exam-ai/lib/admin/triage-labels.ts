import type { Database } from "../supabase/types";

export type ImageTriageStatus = Database["public"]["Enums"]["image_triage_status"];

export const TRIAGE_STATUS_ORDER: ImageTriageStatus[] = [
  "pending",
  "activate_no_image",
  "activate_with_replacement",
  "needs_rewrite",
  "needs_rebuild",
  "needs_license",
  "remove",
];

export const TRIAGE_STATUS_LABEL: Record<ImageTriageStatus, string> = {
  pending:                   "미분류",
  activate_no_image:         "이미지 없이 활성화",
  activate_with_replacement: "교체 후 활성화",
  needs_rewrite:             "재작성 필요",
  needs_rebuild:             "도식 재제작",
  needs_license:             "라이선스 필요",
  remove:                    "폐기",
};

export const TRIAGE_STATUS_SHORT: Record<ImageTriageStatus, string> = {
  pending:                   "미분류",
  activate_no_image:         "활성화",
  activate_with_replacement: "교체활성화",
  needs_rewrite:             "재작성",
  needs_rebuild:             "재제작",
  needs_license:             "라이선스",
  remove:                    "폐기",
};

// Tailwind/CSS color tokens — admin pill 색상
export const TRIAGE_STATUS_COLOR: Record<ImageTriageStatus, { bg: string; fg: string }> = {
  pending:                   { bg: "var(--surface-raised)", fg: "var(--text-muted)" },
  activate_no_image:         { bg: "rgba(34, 197, 94, 0.12)",  fg: "rgb(22, 163, 74)" },
  activate_with_replacement: { bg: "rgba(20, 184, 166, 0.12)", fg: "rgb(13, 148, 136)" }, // teal
  needs_rewrite:             { bg: "rgba(234, 179, 8, 0.12)",  fg: "rgb(161, 98, 7)"  },
  needs_rebuild:             { bg: "rgba(59, 130, 246, 0.12)", fg: "rgb(29, 78, 216)" },
  needs_license:             { bg: "rgba(249, 115, 22, 0.12)", fg: "rgb(194, 65, 12)" },
  remove:                    { bg: "rgba(239, 68, 68, 0.12)",  fg: "rgb(185, 28, 28)" },
};

export function isImageTriageStatus(v: unknown): v is ImageTriageStatus {
  return typeof v === "string" && TRIAGE_STATUS_ORDER.includes(v as ImageTriageStatus);
}
