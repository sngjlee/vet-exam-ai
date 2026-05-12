"use client";

import { useState, useTransition } from "react";
import { toggleUpvote } from "@/app/board/_actions";

type Props = {
  postId: string;
  count: number;
  initialUpvoted: boolean;
  disabled?: boolean;
};

export function UpvoteButton({ postId, count, initialUpvoted, disabled }: Props) {
  const [upvoted, setUpvoted] = useState(initialUpvoted);
  const [localCount, setLocalCount] = useState(count);
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    if (disabled || pending) return;
    const nextUpvoted = !upvoted;
    setUpvoted(nextUpvoted);
    setLocalCount((c) => c + (nextUpvoted ? 1 : -1));
    startTransition(async () => {
      try {
        await toggleUpvote(postId);
      } catch {
        // 롤백
        setUpvoted(!nextUpvoted);
        setLocalCount((c) => c + (nextUpvoted ? -1 : 1));
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 rounded-full border px-3 py-1 text-sm disabled:opacity-50 transition-colors"
      style={{
        borderColor: upvoted ? "var(--teal-border)" : "var(--rule)",
        background: upvoted ? "var(--teal-dim)" : "transparent",
        color: upvoted ? "var(--teal)" : "var(--text)",
      }}
      aria-pressed={upvoted}
    >
      <span>{upvoted ? "👍" : "👍🏻"}</span>
      <span>{localCount}</span>
    </button>
  );
}
