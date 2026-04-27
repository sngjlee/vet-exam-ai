// vet-exam-ai/components/comments/CommentVoteButton.tsx
"use client";

import { ChevronUp, ChevronDown } from "lucide-react";

type VoteValue = 1 | -1;

type Props = {
  commentId: string;
  score: number;
  myVote: VoteValue | null;
  isOwner: boolean;
  isAuthed: boolean;
  size?: "normal" | "small";
  onVoteChange: (commentId: string, value: VoteValue, prev: VoteValue | null) => void;
  onUnauthedAttempt?: () => void;
};

export default function CommentVoteButton({
  commentId,
  score,
  myVote,
  isOwner,
  isAuthed,
  size = "normal",
  onVoteChange,
  onUnauthedAttempt,
}: Props) {
  const iconSize = size === "small" ? 14 : 16;
  const fontSize = size === "small" ? 11 : 12;
  const padding = size === "small" ? 2 : 3;
  const disabled = isOwner;

  function handleClick(value: VoteValue) {
    if (disabled) return;
    if (!isAuthed) {
      onUnauthedAttempt?.();
      return;
    }
    onVoteChange(commentId, value, myVote);
  }

  const upActive = myVote === 1;
  const downActive = myVote === -1;
  const baseColor = "var(--text-faint)";
  const upColor = upActive ? "var(--teal)" : baseColor;
  const downColor = downActive ? "var(--wrong)" : baseColor;
  const scoreColor = upActive
    ? "var(--teal)"
    : downActive
    ? "var(--wrong)"
    : "var(--text)";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
      aria-label="추천 / 비추천"
      title={isOwner ? "본인 댓글에는 투표할 수 없습니다" : undefined}
    >
      <button
        type="button"
        onClick={() => handleClick(1)}
        aria-label={upActive ? "추천 취소" : "추천"}
        aria-pressed={upActive}
        disabled={disabled}
        style={{
          background: "transparent",
          border: "none",
          padding,
          cursor: disabled ? "not-allowed" : "pointer",
          color: upColor,
          opacity: disabled ? 0.4 : 1,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <ChevronUp size={iconSize} strokeWidth={upActive ? 2.5 : 2} />
      </button>
      <span
        style={{
          fontSize,
          fontWeight: 600,
          minWidth: 16,
          textAlign: "center",
          color: scoreColor,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {score}
      </span>
      <button
        type="button"
        onClick={() => handleClick(-1)}
        aria-label={downActive ? "비추천 취소" : "비추천"}
        aria-pressed={downActive}
        disabled={disabled}
        style={{
          background: "transparent",
          border: "none",
          padding,
          cursor: disabled ? "not-allowed" : "pointer",
          color: downColor,
          opacity: disabled ? 0.4 : 1,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <ChevronDown size={iconSize} strokeWidth={downActive ? 2.5 : 2} />
      </button>
    </div>
  );
}
