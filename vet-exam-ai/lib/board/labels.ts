// vet-exam-ai/lib/board/labels.ts
import type { Database } from "@/lib/supabase/types";

type Kind = Database["public"]["Enums"]["board_post_kind"];
type Status = Database["public"]["Enums"]["suggestion_status"];
type Visibility = Database["public"]["Enums"]["board_visibility"];

export const KIND_LABEL: Record<Kind, string> = {
  suggestion: "건의",
  announcement: "공지",
};

export const SUGGESTION_STATUS_LABEL: Record<Status, string> = {
  received: "접수",
  reviewing: "검토 중",
  accepted: "채택",
  rejected: "반려",
};

export const SUGGESTION_TERMINAL: ReadonlySet<Status> = new Set<Status>(["accepted", "rejected"]);

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  visible: "표시 중",
  hidden_by_author: "작성자 삭제",
  blinded_by_report: "임시 비공개",
  removed_by_admin: "운영자 삭제",
};
