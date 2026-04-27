"use client";

import CommentItem, { type CommentItemData } from "./CommentItem";
import CommentReplyComposer from "./CommentReplyComposer";

type Props = {
  questionId: string;
  parentId: string;
  replies: CommentItemData[];
  currentUserId: string | null;
  isComposerOpen: boolean;
  onSubmitReply: (parentId: string, newComment: CommentItemData) => void;
  onCancelReply: () => void;
  onDelete: (id: string) => void;
};

export default function CommentReplyGroup({
  questionId,
  parentId,
  replies,
  currentUserId,
  isComposerOpen,
  onSubmitReply,
  onCancelReply,
  onDelete,
}: Props) {
  return (
    <div
      style={{
        marginLeft: 0,
        paddingLeft: 20,
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginTop: 8,
      }}
    >
      {replies.map((r) => (
        <CommentItem
          key={r.id}
          comment={r}
          canDelete={currentUserId !== null && r.user_id === currentUserId}
          onDelete={onDelete}
          isReply
        />
      ))}
      {isComposerOpen && (
        <CommentReplyComposer
          questionId={questionId}
          parentId={parentId}
          onSubmitted={(c) => onSubmitReply(parentId, c)}
          onCancel={onCancelReply}
        />
      )}
    </div>
  );
}
