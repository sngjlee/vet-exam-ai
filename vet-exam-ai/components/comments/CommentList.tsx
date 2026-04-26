"use client";

import CommentItem, { type CommentItemData } from "./CommentItem";

type Props = {
  comments: CommentItemData[];
  currentUserId: string | null;
  onDelete: (id: string) => void;
};

export default function CommentList({ comments, currentUserId, onDelete }: Props) {
  if (comments.length === 0) {
    return (
      <div
        style={{
          padding: "20px 16px",
          textAlign: "center",
          color: "var(--text-faint)",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        아직 의견이 없습니다.
        <br />첫 댓글을 남겨보세요.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {comments.map((c) => (
        <CommentItem
          key={c.id}
          comment={c}
          canDelete={currentUserId !== null && c.user_id === currentUserId}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
