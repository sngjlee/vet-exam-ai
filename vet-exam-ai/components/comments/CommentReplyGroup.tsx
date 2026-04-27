"use client";

import CommentItem, { type CommentItemData } from "./CommentItem";
import CommentReplyComposer from "./CommentReplyComposer";

type VoteValue = 1 | -1;

type Props = {
  questionId: string;
  parentId: string;
  replies: CommentItemData[];
  scoreById: Map<string, number>;
  myVoteById: Map<string, VoteValue>;
  currentUserId: string | null;
  isComposerOpen: boolean;
  onSubmitReply: (parentId: string, newComment: CommentItemData) => void;
  onCancelReply: () => void;
  onDelete: (id: string) => void;
  onVoteChange: (commentId: string, value: VoteValue, prev: VoteValue | null) => void;
  onUnauthedAttempt?: () => void;
};

export default function CommentReplyGroup({
  questionId,
  parentId,
  replies,
  scoreById,
  myVoteById,
  currentUserId,
  isComposerOpen,
  onSubmitReply,
  onCancelReply,
  onDelete,
  onVoteChange,
  onUnauthedAttempt,
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
          score={scoreById.get(r.id) ?? 0}
          myVote={myVoteById.get(r.id) ?? null}
          isOwner={currentUserId !== null && r.user_id === currentUserId}
          isAuthed={currentUserId !== null}
          canDelete={currentUserId !== null && r.user_id === currentUserId}
          onDelete={onDelete}
          onVoteChange={onVoteChange}
          onUnauthedAttempt={onUnauthedAttempt}
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
