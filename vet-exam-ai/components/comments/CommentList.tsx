"use client";

import CommentItem, { type CommentItemData } from "./CommentItem";
import CommentReplyGroup, { type ReplyRow } from "./CommentReplyGroup";
import CommentSortToggle from "./CommentSortToggle";
import CommentCollapsedRow from "./CommentCollapsedRow";
import type { SortMode } from "../../lib/comments/voteSchema";

type VoteValue = 1 | -1;
type CommentStatus = "visible" | "hidden_by_votes" | "blinded_by_report";

export type RootWithReplies = CommentItemData & {
  status: CommentStatus;
  replies: ReplyRow[];
  isPlaceholder?: boolean;
};

type Props = {
  questionId: string;
  roots: RootWithReplies[];
  scoreById: Map<string, number>;
  myVoteById: Map<string, VoteValue>;
  reportedIds: Set<string>;
  expandedIds: Set<string>;
  currentUserId: string | null;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  replyingToId: string | null;
  onStartReply: (id: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (parentId: string, newComment: CommentItemData) => void;
  onDelete: (id: string) => void;
  onReport: (id: string) => void;
  onVoteChange: (commentId: string, value: VoteValue, prev: VoteValue | null) => void;
  onUnauthedAttempt?: () => void;
  onExpand: (id: string) => void;
  pinnedCommentId?: string | null;
  onTogglePin?: (id: string) => void;
};

export default function CommentList({
  questionId,
  roots,
  scoreById,
  myVoteById,
  reportedIds,
  expandedIds,
  currentUserId,
  sortMode,
  onSortChange,
  replyingToId,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onDelete,
  onReport,
  onVoteChange,
  onUnauthedAttempt,
  onExpand,
  pinnedCommentId,
  onTogglePin,
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
          const isOwner =
            currentUserId !== null && root.user_id === currentUserId;
          const expanded = expandedIds.has(root.id);

          let rootDisplay: React.ReactNode;
          if (root.isPlaceholder) {
            rootDisplay = (
              <CommentItem
                comment={root}
                score={scoreById.get(root.id) ?? 0}
                myVote={myVoteById.get(root.id) ?? null}
                status="visible"
                isOwner={false}
                isAuthed={currentUserId !== null}
                isReported={false}
                canDelete={false}
                onDelete={onDelete}
                onReport={onReport}
                onVoteChange={onVoteChange}
                onUnauthedAttempt={onUnauthedAttempt}
                onStartReply={undefined}
                isPlaceholder
              />
            );
          } else if (root.status === "hidden_by_votes" && !expanded && !isOwner) {
            rootDisplay = (
              <CommentCollapsedRow
                commentId={root.id}
                reason="votes"
                score={scoreById.get(root.id)}
                canExpand
                onExpand={onExpand}
              />
            );
          } else if (root.status === "blinded_by_report" && !isOwner) {
            rootDisplay = (
              <CommentCollapsedRow
                commentId={root.id}
                reason="reports"
                canExpand={false}
              />
            );
          } else {
            const canDeleteRoot = isOwner;
            rootDisplay = (
              <CommentItem
                comment={root}
                score={scoreById.get(root.id) ?? 0}
                myVote={myVoteById.get(root.id) ?? null}
                status={root.status}
                isOwner={isOwner}
                isAuthed={currentUserId !== null}
                isReported={reportedIds.has(root.id)}
                canDelete={canDeleteRoot}
                isPinned={pinnedCommentId === root.id}
                onDelete={onDelete}
                onReport={onReport}
                onVoteChange={onVoteChange}
                onUnauthedAttempt={onUnauthedAttempt}
                onStartReply={
                  currentUserId === null ? undefined : onStartReply
                }
                onTogglePin={onTogglePin}
              />
            );
          }

          return (
            <div
              key={root.id}
              style={{ display: "flex", flexDirection: "column", gap: 0 }}
            >
              {rootDisplay}
              {showGroup && (
                <CommentReplyGroup
                  questionId={questionId}
                  parentId={root.id}
                  replies={root.replies}
                  scoreById={scoreById}
                  myVoteById={myVoteById}
                  reportedIds={reportedIds}
                  expandedIds={expandedIds}
                  currentUserId={currentUserId}
                  isComposerOpen={composerOpenForRoot}
                  onSubmitReply={onSubmitReply}
                  onCancelReply={onCancelReply}
                  onDelete={onDelete}
                  onReport={onReport}
                  onVoteChange={onVoteChange}
                  onUnauthedAttempt={onUnauthedAttempt}
                  onExpand={onExpand}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
