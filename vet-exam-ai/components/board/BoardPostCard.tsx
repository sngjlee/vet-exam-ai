// vet-exam-ai/components/board/BoardPostCard.tsx
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import { SuggestionStatusBadge } from "./SuggestionStatusBadge";
import { SUGGESTION_TERMINAL } from "@/lib/board/labels";
import { UpvoteButton } from "./UpvoteButton";
import { ReportButton } from "./ReportButton";

type Post = Database["public"]["Tables"]["board_posts"]["Row"];

type Props = {
  post: Post;
  authorNickname: string | null;
  viewerId: string | null;
  viewerIsAdmin: boolean;
  hasUpvoted: boolean;
};

export function BoardPostCard({
  post, authorNickname, viewerId, viewerIsAdmin, hasUpvoted,
}: Props) {
  const isOwner = viewerId !== null && viewerId === post.user_id;
  const seg = post.kind === "suggestion" ? "suggestions" : "announcements";
  const locked = post.suggestion_status
    ? SUGGESTION_TERMINAL.has(post.suggestion_status)
    : false;
  const author = post.is_anonymized ? "익명" : (authorNickname ?? "탈퇴한 사용자");

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-6">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {post.is_pinned ? <span className="text-xs font-bold text-amber-600">📌 고정</span> : null}
            {post.suggestion_status ? <SuggestionStatusBadge status={post.suggestion_status} /> : null}
          </div>
          <h1 className="mt-1 text-xl font-bold text-gray-900">{post.title}</h1>
          <div className="mt-1 text-sm text-gray-500">
            {author}
            {viewerIsAdmin && post.is_anonymized && authorNickname ? (
              <span className="ml-2 text-xs text-gray-400">(작성자: {authorNickname})</span>
            ) : null}
            {" · "}
            {new Date(post.created_at).toLocaleString("ko-KR")}
            {post.edit_count > 0 ? <span className="ml-1 text-xs text-gray-400">(수정됨)</span> : null}
          </div>
        </div>
        {isOwner && !locked ? (
          <div className="flex gap-2 text-sm">
            <Link href={`/board/${seg}/${post.id}/edit`} className="text-blue-600 hover:underline">수정</Link>
            <form action={async () => {
              "use server";
              const { softDeletePost } = await import("@/app/board/_actions");
              await softDeletePost(post.id);
            }}>
              <button className="text-red-600 hover:underline">삭제</button>
            </form>
          </div>
        ) : null}
      </header>

      <div
        className="prose mt-4 max-w-none"
        dangerouslySetInnerHTML={{ __html: post.body_html }}
      />

      {post.resolution_note ? (
        <aside className="mt-4 rounded-md border-l-4 border-emerald-500 bg-emerald-50 p-3 text-sm">
          <div className="font-semibold text-emerald-800">운영자 코멘트</div>
          <div className="mt-1 whitespace-pre-wrap text-emerald-900">{post.resolution_note}</div>
        </aside>
      ) : null}

      <footer className="mt-4 flex items-center gap-3 border-t border-gray-100 pt-3 text-sm">
        <UpvoteButton
          postId={post.id}
          count={post.upvote_count}
          initialUpvoted={hasUpvoted}
          disabled={isOwner || viewerId === null}
        />
        {viewerId !== null && !isOwner ? (
          <ReportButton kind="post" id={post.id} />
        ) : null}
      </footer>
    </article>
  );
}
