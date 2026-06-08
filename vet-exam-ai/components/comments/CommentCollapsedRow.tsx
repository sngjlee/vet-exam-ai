"use client";

import { ChevronDown } from "lucide-react";
import { COMMENT_MODERATION_COPY } from "../../lib/comments/moderationCopy";

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
      ? COMMENT_MODERATION_COPY.collapsedByVotes(score)
      : COMMENT_MODERATION_COPY.collapsedByReports;

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
        scrollMarginTop: 96,
      }}
    >
      <span>{label}</span>
      {canExpand && onExpand && (
        <button
          type="button"
          onClick={() => onExpand(commentId)}
          aria-label={COMMENT_MODERATION_COPY.expandCollapsed}
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
          {COMMENT_MODERATION_COPY.expandCollapsed} <ChevronDown size={12} />
        </button>
      )}
    </div>
  );
}
