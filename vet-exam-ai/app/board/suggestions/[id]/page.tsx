import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoardPostCard } from "@/components/board/BoardPostCard";
import { BoardCommentList } from "@/components/board/BoardCommentList";
import { BoardCommentComposer } from "@/components/board/BoardCommentComposer";

export const dynamic = "force-dynamic";

export default async function SuggestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: post }, { data: userRes }, { data: comments }] = await Promise.all([
    supabase.from("board_posts").select("*").eq("id", id).eq("kind", "suggestion").single(),
    supabase.auth.getUser(),
    supabase.from("board_post_comments")
      .select("*")
      .eq("post_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!post) notFound();

  const viewer = userRes.user ?? null;
  let viewerIsAdmin = false;
  let hasUpvoted = false;

  if (viewer) {
    const [{ data: profile }, { data: up }] = await Promise.all([
      supabase.from("profiles").select("role,is_active").eq("id", viewer.id).single(),
      supabase.from("board_post_upvotes")
        .select("post_id")
        .eq("post_id", id)
        .eq("user_id", viewer.id)
        .maybeSingle(),
    ]);
    viewerIsAdmin = profile?.role === "admin" && profile?.is_active === true;
    hasUpvoted = !!up;
  }

  const allUserIds = Array.from(new Set([
    post.user_id,
    ...((comments ?? []).map((c) => c.user_id)),
  ].filter(Boolean) as string[]));

  const nicknames = new Map<string, string | null>();
  if (allUserIds.length > 0) {
    const { data: nicks } = await supabase
      .from("user_profiles_public")
      .select("user_id,nickname")
      .in("user_id", allUserIds);
    for (const n of nicks ?? []) nicknames.set(n.user_id, n.nickname);
  }

  return (
    <div className="space-y-6">
      <BoardPostCard
        post={post}
        authorNickname={post.user_id ? nicknames.get(post.user_id) ?? null : null}
        viewerId={viewer?.id ?? null}
        viewerIsAdmin={viewerIsAdmin}
        hasUpvoted={hasUpvoted}
      />

      <section>
        <h2 className="text-lg font-semibold">댓글 {post.comment_count}</h2>
        <div className="mt-3 space-y-3">
          <BoardCommentComposer postId={post.id} kindSegment="suggestions" />
          <BoardCommentList
            comments={comments ?? []}
            nicknames={nicknames}
            viewerId={viewer?.id ?? null}
            viewerIsAdmin={viewerIsAdmin}
            postId={post.id}
            kindSegment="suggestions"
          />
        </div>
      </section>
    </div>
  );
}
