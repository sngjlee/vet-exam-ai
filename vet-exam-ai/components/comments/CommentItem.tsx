"use client";

import { Trash2, MessageCircle } from "lucide-react";
import type { CommentType } from "../../lib/comments/schema";

export type CommentItemData = {
  id: string;
  user_id: string | null;
  type: CommentType;
  body_html: string;
  created_at: string;
  authorNickname: string | null;
};

type Props = {
  comment: CommentItemData;
  canDelete: boolean;
  onDelete: (id: string) => void;
  onStartReply?: (id: string) => void;
  isReply?: boolean;
  isPlaceholder?: boolean;
};

const TYPE_META: Record<CommentType, { label: string; color: string; bg: string }> = {
  memorization: { label: "💡 암기법", color: "#B45309", bg: "#FEF3C7" },
  correction: { label: "⚠ 정정", color: "#9F1239", bg: "#FFE4E6" },
  explanation: { label: "📘 추가설명", color: "#075985", bg: "#E0F2FE" },
  question: { label: "❓ 질문", color: "#5B21B6", bg: "#EDE9FE" },
  discussion: { label: "💬 토론", color: "#334155", bg: "#E2E8F0" },
};

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

export default function CommentItem({
  comment,
  canDelete,
  onDelete,
  onStartReply,
  isReply,
  isPlaceholder,
}: Props) {
  if (isPlaceholder) {
    return (
      <div
        style={{
          background: "var(--bg)",
          border: "1px dashed var(--border)",
          borderRadius: 10,
          padding: "12px 14px",
          fontSize: 12,
          color: "var(--text-faint)",
          fontStyle: "italic",
        }}
      >
        [작성자에 의해 삭제된 댓글]
      </div>
    );
  }

  const meta = TYPE_META[comment.type];
  const author =
    comment.user_id === null
      ? "탈퇴한 사용자"
      : comment.authorNickname ?? `익명-${comment.user_id.slice(-4)}`;

  return (
    <div
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
        {!isReply && (
          <span
            style={{
              background: meta.bg,
              color: meta.color,
              borderRadius: 999,
              padding: "2px 8px",
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            {meta.label}
          </span>
        )}
        <span style={{ color: "var(--text)", fontWeight: 600 }}>@{author}</span>
        <span style={{ color: "var(--text-faint)" }}>· {formatRelative(comment.created_at)}</span>
        <div style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
          {!isReply && onStartReply && (
            <button
              type="button"
              onClick={() => onStartReply(comment.id)}
              aria-label="답글 달기"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-faint)",
                cursor: "pointer",
                padding: 4,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <MessageCircle size={14} />
              답글
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(comment.id)}
              aria-label="댓글 삭제"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-faint)",
                cursor: "pointer",
                padding: 4,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          fontSize: 13,
          color: "var(--text)",
          lineHeight: 1.7,
        }}
        dangerouslySetInnerHTML={{ __html: comment.body_html }}
      />
    </div>
  );
}
