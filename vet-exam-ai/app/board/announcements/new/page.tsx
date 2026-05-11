import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoardPostComposer } from "@/components/board/BoardPostComposer";

export default async function NewAnnouncementPage() {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login?next=/board/announcements/new");
  const { data: profile } = await supabase
    .from("profiles").select("role,is_active").eq("id", userRes.user.id).single();
  if (!(profile?.role === "admin" && profile?.is_active === true)) {
    redirect("/board/announcements");
  }

  return (
    <div>
      <h2 className="text-xl font-semibold">새 공지 작성</h2>
      <p className="mt-1 text-sm text-gray-600">게시 즉시 모든 사용자에게 알림이 발송됩니다.</p>
      <div className="mt-4">
        <BoardPostComposer mode="create" kind="announcement" />
      </div>
    </div>
  );
}
