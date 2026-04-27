"use client";

import { ChevronDown } from "lucide-react";

type Props = {
  commentId: string;
  reason: "votes" | "reports";
  score?: number;
  canExpand: boolean;
  onExpand?: (id: string) => void;
};

export default function CommentCollapsedRow({
  commentId,
  reason,
  score,
  canExpand,
  onExpand,
}: Props) {
  const label =
    reason === "votes"
      ? `누적 비추천으로 접힘${typeof score === "number" ? ` (${score})` : ""}`
      : "신고로 임시 비공개된 댓글입니다";

  return (
    <div
      id={`comment-${commentId}`}
      style={{
        background: "var(--bg)",
        border: "1px dashed var(--border)",
        borderRadius: 10,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        fontSize: 12,
        color: "var(--text-faint)",
      }}
    >
      <span>{label}</span>
      {canExpand && onExpand && (
        <button
          type="button"
          onClick={() => onExpand(commentId)}
          aria-label="댓글 펼치기"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-faint)",
            cursor: "pointer",
            padding: 4,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          펼치기 <ChevronDown size={12} />
        </button>
      )}
    </div>
  );
}
