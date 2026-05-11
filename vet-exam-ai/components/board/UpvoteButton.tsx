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
      className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${
        upvoted ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-700"
      } disabled:opacity-50`}
      aria-pressed={upvoted}
    >
      <span>{upvoted ? "👍" : "👍🏻"}</span>
      <span>{localCount}</span>
    </button>
  );
}
