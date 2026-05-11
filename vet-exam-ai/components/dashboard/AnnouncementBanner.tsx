import { createClient } from "@/lib/supabase/server";
import { AnnouncementBannerClient } from "./AnnouncementBannerClient";

export async function AnnouncementBanner() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("board_posts")
    .select("id,title,is_pinned,created_at")
    .eq("kind", "announcement")
    .eq("visibility", "visible")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  const post = posts?.[0];
  if (!post) return null;

  return (
    <AnnouncementBannerClient
      postId={post.id}
      title={post.title}
      isPinned={post.is_pinned}
    />
  );
}
