// vet-exam-ai/components/comments/CommentList.tsx
"use client";

import CommentItem, { type CommentItemData } from "./CommentItem";
import CommentReplyGroup from "./CommentReplyGroup";
import CommentSortToggle from "./CommentSortToggle";
import type { SortMode } from "../../lib/comments/voteSchema";

type VoteValue = 1 | -1;

export type RootWithReplies = CommentItemData & {
  replies: CommentItemData[];
  isPlaceholder?: boolean;
};

type Props = {
  questionId: string;
  roots: RootWithReplies[];
  scoreById: Map<string, number>;
  myVoteById: Map<string, VoteValue>;
  currentUserId: string | null;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  replyingToId: string | null;
  onStartReply: (id: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (parentId: string, newComment: CommentItemData) => void;
  onDelete: (id: string) => void;
  onVoteChange: (commentId: string, value: VoteValue, prev: VoteValue | null) => void;
  onUnauthedAttempt?: () => void;
};

export default function CommentList({
  questionId,
  roots,
  scoreById,
  myVoteById,
  currentUserId,
  sortMode,
  onSortChange,
  replyingToId,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onDelete,
  onVoteChange,
  onUnauthedAttempt,
}: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          minHeight: 24,
        }}
      >
        {roots.length > 0 && (
          <CommentSortToggle value={sortMode} onChange={onSortChange} />
        )}
      </div>

      {roots.length === 0 ? (
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
      ) : (
        roots.map((root) => {
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
                score={scoreById.get(root.id) ?? 0}
                myVote={myVoteById.get(root.id) ?? null}
                isOwner={
                  currentUserId !== null && root.user_id === currentUserId
                }
                isAuthed={currentUserId !== null}
                canDelete={canDeleteRoot}
                onDelete={onDelete}
                onVoteChange={onVoteChange}
                onUnauthedAttempt={onUnauthedAttempt}
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
                  scoreById={scoreById}
                  myVoteById={myVoteById}
                  currentUserId={currentUserId}
                  isComposerOpen={composerOpenForRoot}
                  onSubmitReply={onSubmitReply}
                  onCancelReply={onCancelReply}
                  onDelete={onDelete}
                  onVoteChange={onVoteChange}
                  onUnauthedAttempt={onUnauthedAttempt}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
