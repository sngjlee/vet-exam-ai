// vet-exam-ai/components/board/BoardCommentList.tsx
import type { Database } from "@/lib/supabase/types";
import { BoardCommentItem } from "./BoardCommentItem";

type Comment = Database["public"]["Tables"]["board_post_comments"]["Row"];

type NicknameMap = Map<string, string | null>;

type Props = {
  comments: Comment[];
  nicknames: NicknameMap;
  viewerId: string | null;
  viewerIsAdmin: boolean;
  postId: string;
  kindSegment: "suggestions" | "announcements";
};

export function BoardCommentList({
  comments, nicknames, viewerId, viewerIsAdmin, postId, kindSegment,
}: Props) {
  if (comments.length === 0) {
    return (
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>
        아직 댓글이 없습니다.
      </div>
    );
  }

  // 1-level threading: root → replies
  const roots = comments.filter((c) => c.parent_id == null);
  const repliesByParent = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parent_id) {
      const arr = repliesByParent.get(c.parent_id) ?? [];
      arr.push(c);
      repliesByParent.set(c.parent_id, arr);
    }
  }

  return (
    <ul className="space-y-3">
      {roots.flatMap((c) => [
        <BoardCommentItem
          key={c.id}
          comment={c}
          authorNickname={c.user_id ? nicknames.get(c.user_id) ?? null : null}
          viewerId={viewerId}
          viewerIsAdmin={viewerIsAdmin}
          postId={postId}
          kindSegment={kindSegment}
          isReply={false}
        />,
        ...(repliesByParent.get(c.id) ?? []).map((r) => (
          <BoardCommentItem
            key={r.id}
            comment={r}
            authorNickname={r.user_id ? nicknames.get(r.user_id) ?? null : null}
            viewerId={viewerId}
            viewerIsAdmin={viewerIsAdmin}
            postId={postId}
            kindSegment={kindSegment}
            isReply={true}
          />
        )),
      ])}
    </ul>
  );
}
