import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoardPostComposer } from "@/components/board/BoardPostComposer";

export const dynamic = "force-dynamic";

export default async function EditSuggestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect(`/auth/login?next=/board/suggestions/${id}/edit`);

  const { data: post } = await supabase
    .from("board_posts")
    .select(
      "id,kind,user_id,title,body_text,image_urls,is_anonymized,visibility,suggestion_status",
    )
    .eq("id", id)
    .eq("kind", "suggestion")
    .single();

  if (!post) notFound();
  if (post.user_id !== userRes.user.id) redirect(`/board/suggestions/${id}`);
  if (post.visibility !== "visible") redirect(`/board/suggestions/${id}`);
  if (
    post.suggestion_status === "accepted" ||
    post.suggestion_status === "rejected"
  )
    redirect(`/board/suggestions/${id}`);

  return (
    <div>
      <h2 className="text-xl font-semibold">건의 수정</h2>
      <div className="mt-4">
        <BoardPostComposer
          mode="edit"
          kind="suggestion"
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
