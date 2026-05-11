// vet-exam-ai/components/board/BoardPostListItem.tsx
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import { SuggestionStatusBadge } from "./SuggestionStatusBadge";

type Post = Pick<
  Database["public"]["Tables"]["board_posts"]["Row"],
  | "id" | "kind" | "title" | "is_pinned"
  | "suggestion_status" | "is_anonymized"
  | "upvote_count" | "comment_count" | "created_at"
>;

type Props = {
  post: Post;
  authorNickname: string | null;
};

function formatRelative(iso: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return date.toLocaleDateString("ko-KR");
}

export function BoardPostListItem({ post, authorNickname }: Props) {
  const kindSegment = post.kind === "suggestion" ? "suggestions" : "announcements";
  const author = post.is_anonymized ? "익명" : (authorNickname ?? "탈퇴한 사용자");

  return (
    <Link
      href={`/board/${kindSegment}/${post.id}`}
      className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {post.is_pinned ? <span className="text-xs font-bold text-amber-600">📌 고정</span> : null}
          {post.suggestion_status ? (
            <SuggestionStatusBadge status={post.suggestion_status} />
          ) : null}
        </div>
        <h3 className="mt-1 truncate text-base font-semibold text-gray-900">{post.title}</h3>
        <div className="mt-1 text-xs text-gray-500">
          {author} · {formatRelative(post.created_at)}
        </div>
      </div>
      <div className="shrink-0 text-right text-xs text-gray-500">
        <div>👍 {post.upvote_count}</div>
        <div>💬 {post.comment_count}</div>
      </div>
    </Link>
  );
}
