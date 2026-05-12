import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoardPostComposer } from "@/components/board/BoardPostComposer";

export const dynamic = "force-dynamic";

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect(`/auth/login?next=/board/announcements/${id}/edit`);

  const { data: post } = await supabase
    .from("board_posts")
    .select(
      "id,kind,user_id,title,body_text,image_urls,is_anonymized,visibility",
    )
    .eq("id", id)
    .eq("kind", "announcement")
    .single();

  if (!post) notFound();
  if (post.user_id !== userRes.user.id) redirect(`/board/announcements/${id}`);
  if (post.visibility !== "visible") redirect(`/board/announcements/${id}`);

  return (
    <div>
      <h2 className="text-xl font-semibold">공지 수정</h2>
      <div className="mt-4">
        <BoardPostComposer
          mode="edit"
          kind="announcement"
          postId={post.id}
          initialTitle={post.title}
          initialBodyText={post.body_text}
          initialImageUrls={post.image_urls ?? []}
          initialAnonymized={post.is_anonymized}
        />
      </div>
    </div>
  );
}
