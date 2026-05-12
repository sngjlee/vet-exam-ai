// vet-exam-ai/components/board/BoardCommentItem.tsx
"use client";

import { useState } from "react";
import type { Database } from "@/lib/supabase/types";
import { ReportButton } from "./ReportButton";
import { BoardCommentComposer } from "./BoardCommentComposer";

type Comment = Database["public"]["Tables"]["board_post_comments"]["Row"];

type Props = {
  comment: Comment;
  authorNickname: string | null;
  viewerId: string | null;
  viewerIsAdmin: boolean;
  postId: string;
  kindSegment: "suggestions" | "announcements";
  isReply: boolean;
};

export function BoardCommentItem({
  comment, authorNickname, viewerId, viewerIsAdmin, postId, kindSegment, isReply,
}: Props) {
  const [replying, setReplying] = useState(false);
  const isOwner = viewerId !== null && viewerId === comment.user_id;
  const author = comment.is_anonymized ? "익명" : (authorNickname ?? "탈퇴한 사용자");

  return (
    <li
      className={isReply ? "ml-6 pl-4" : ""}
      style={isReply ? { borderLeft: "1px solid var(--border)" } : undefined}
    >
      <div
        className="rounded-md p-3"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
      >
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          <span className="font-semibold" style={{ color: "var(--text)" }}>{author}</span>
          {viewerIsAdmin && comment.is_anonymized && authorNickname ? (
            <span className="ml-2 text-xs" style={{ color: "var(--text-faint)" }}>
              (작성자: {authorNickname})
            </span>
          ) : null}
          {" · "}
          {new Date(comment.created_at).toLocaleString("ko-KR")}
          {comment.edit_count > 0 ? (
            <span className="ml-1 text-xs" style={{ color: "var(--text-faint)" }}>(수정됨)</span>
          ) : null}
        </div>
        <div
          className="prose prose-invert prose-sm mt-1 max-w-none"
          style={{ color: "var(--text)" }}
          dangerouslySetInnerHTML={{ __html: comment.body_html }}
        />
        <div className="mt-2 flex items-center gap-3 text-xs">
          {!isReply && viewerId ? (
            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className="hover:underline"
              style={{ color: "var(--text-muted)" }}
            >
              {replying ? "취소" : "답글"}
            </button>
          ) : null}
          {!isOwner && viewerId ? (
            <ReportButton kind="comment" id={comment.id} postId={postId} kindSegment={kindSegment} />
          ) : null}
        </div>
      </div>
      {replying ? (
        <div className="mt-2 ml-4">
          <BoardCommentComposer
            postId={postId}
            kindSegment={kindSegment}
            parentId={comment.id}
            onDone={() => setReplying(false)}
          />
        </div>
      ) : null}
    </li>
  );
}
