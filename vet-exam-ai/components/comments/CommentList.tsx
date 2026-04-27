"use client";

import CommentItem, { type CommentItemData } from "./CommentItem";
import CommentReplyGroup from "./CommentReplyGroup";

export type RootWithReplies = CommentItemData & {
  replies: CommentItemData[];
  isPlaceholder?: boolean;
};

type Props = {
  questionId: string;
  roots: RootWithReplies[];
  currentUserId: string | null;
  replyingToId: string | null;
  onStartReply: (id: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (parentId: string, newComment: CommentItemData) => void;
  onDelete: (id: string) => void;
};

export default function CommentList({
  questionId,
  roots,
  currentUserId,
  replyingToId,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onDelete,
}: Props) {
  if (roots.length === 0) {
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {roots.map((root) => {
        const composerOpenForRoot = replyingToId === root.id;
        const showGroup = root.replies.length > 0 || composerOpenForRoot;
        const canDeleteRoot =
          !root.isPlaceholder &&
          currentUserId !== null &&
          root.user_id === currentUserId;
        return (
          <div
            key={root.id}
            style={{ display: "flex", flexDirection: "column", gap: 0 }}
          >
            <CommentItem
              comment={root}
              canDelete={canDeleteRoot}
              onDelete={onDelete}
              onStartReply={
                root.isPlaceholder || currentUserId === null
                  ? undefined
                  : onStartReply
              }
              isPlaceholder={root.isPlaceholder}
            />
            {showGroup && (
              <CommentReplyGroup
                questionId={questionId}
                parentId={root.id}
                replies={root.replies}
                currentUserId={currentUserId}
                isComposerOpen={composerOpenForRoot}
                onSubmitReply={onSubmitReply}
                onCancelReply={onCancelReply}
                onDelete={onDelete}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
