// vet-exam-ai/components/board/SuggestionStatusBadge.tsx
import type { Database } from "@/lib/supabase/types";
import { SUGGESTION_STATUS_LABEL } from "@/lib/board/labels";

type Status = Database["public"]["Enums"]["suggestion_status"];

const COLOR: Record<Status, { bg: string; fg: string }> = {
  received:  { bg: "#eef2ff", fg: "#3730a3" },
  reviewing: { bg: "#fef3c7", fg: "#92400e" },
  accepted:  { bg: "#dcfce7", fg: "#166534" },
  rejected:  { bg: "#fee2e2", fg: "#991b1b" },
};

export function SuggestionStatusBadge({ status }: { status: Status }) {
  const { bg, fg } = COLOR[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: bg, color: fg }}
    >
      {SUGGESTION_STATUS_LABEL[status]}
    </span>
  );
}
