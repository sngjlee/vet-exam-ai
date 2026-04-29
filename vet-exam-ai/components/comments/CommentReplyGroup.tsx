"use client";

import CommentItem, { type CommentItemData } from "./CommentItem";
import CommentReplyComposer from "./CommentReplyComposer";
import CommentCollapsedRow from "./CommentCollapsedRow";
import type { EditedCommentRow } from "./CommentEditComposer";
import type { BadgeType } from "../../lib/profile/badgeMeta";

type VoteValue = 1 | -1;
type CommentStatus = "visible" | "hidden_by_votes" | "blinded_by_report";

export type ReplyRow = CommentItemData & { status: CommentStatus };

type Props = {
  questionId: string;
  parentId: string;
  replies: ReplyRow[];
  scoreById: Map<string, number>;
  myVoteById: Map<string, VoteValue>;
  reportedIds: Set<string>;
  expandedIds: Set<string>;
  currentUserId: string | null;
  isComposerOpen: boolean;
  onSubmitReply: (parentId: string, newComment: CommentItemData) => void;
  onCancelReply: () => void;
  onDelete: (id: string) => void;
  onReport: (id: string) => void;
  onVoteChange: (commentId: string, value: VoteValue, prev: VoteValue | null) => void;
  onUnauthedAttempt?: () => void;
  onExpand: (id: string) => void;
  authorBadgesById: Map<string, BadgeType[]>;
  editingId: string | null;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaved: (row: EditedCommentRow) => void;
  onShowHistory: (id: string, editCount: number) => void;
  onConflict?: () => void;
};

export default function CommentReplyGroup({
  questionId,
  parentId,
  replies,
  scoreById,
  myVoteById,
  reportedIds,
  expandedIds,
  currentUserId,
  isComposerOpen,
  onSubmitReply,
  onCancelReply,
  onDelete,
  onReport,
  onVoteChange,
  onUnauthedAttempt,
  onExpand,
  authorBadgesById,
  editingId,
  onStartEdit,
  onCancelEdit,
  onSaved,
  onShowHistory,
  onConflict,
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
      {replies.map((r) => {
        const isOwner = currentUserId !== null && r.user_id === currentUserId;
        const expanded = expandedIds.has(r.id);

        if (r.status === "hidden_by_votes" && !expanded && !isOwner) {
          return (
            <CommentCollapsedRow
              key={r.id}
              commentId={r.id}
              reason="votes"
              score={scoreById.get(r.id)}
              canExpand
              onExpand={onExpand}
            />
          );
        }
        if (r.status === "blinded_by_report" && !isOwner) {
          return (
            <CommentCollapsedRow
              key={r.id}
              commentId={r.id}
              reason="reports"
              canExpand={false}
            />
          );
        }
        return (
          <CommentItem
            key={r.id}
            comment={r}
            score={scoreById.get(r.id) ?? 0}
            myVote={myVoteById.get(r.id) ?? null}
            status={r.status}
            isOwner={isOwner}
            isAuthed={currentUserId !== null}
            isReported={reportedIds.has(r.id)}
            canDelete={isOwner}
            authorBadges={
              r.user_id ? authorBadgesById.get(r.user_id) ?? [] : []
            }
            isEditing={editingId === r.id}
            onDelete={onDelete}
            onReport={onReport}
            onVoteChange={onVoteChange}
            onUnauthedAttempt={onUnauthedAttempt}
            onStartEdit={isOwner ? onStartEdit : undefined}
            onCancelEdit={onCancelEdit}
            onSaved={onSaved}
            onShowHistory={onShowHistory}
            onConflict={onConflict}
            isReply
          />
        );
      })}
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
