import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoardPostListItem } from "@/components/board/BoardPostListItem";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AnnouncementsListPage({
  searchParams,
}: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1"));
  const supabase = await createClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login?next=/board/announcements");
  const { data: profile } = await supabase
    .from("profiles").select("role,is_active").eq("id", userRes.user.id).single();
  const isAdmin = profile?.role === "admin" && profile?.is_active === true;

  const { data: posts, count } = await supabase
    .from("board_posts")
    .select("id,kind,title,is_pinned,is_anonymized,user_id,upvote_count,comment_count,suggestion_status,created_at",
            { count: "exact" })
    .eq("kind", "announcement")
    .eq("visibility", "visible")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const userIds = Array.from(new Set((posts ?? []).map((p) => p.user_id).filter(Boolean) as string[]));
  const nicknames = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: nicks } = await supabase
      .from("user_profiles_public").select("user_id,nickname").in("user_id", userIds);
    for (const n of nicks ?? []) nicknames.set(n.user_id, n.nickname);
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">📢 공지</h2>
        {isAdmin ? (
          <Link href="/board/announcements/new"
            className="rounded-md bg-blue-600 px-3 py-1 text-sm font-semibold text-white">
            새 공지 작성
          </Link>
        ) : null}
      </div>
      <ul className="mt-4 space-y-2">
        {(posts ?? []).map((p) => (
          <li key={p.id}>
            <BoardPostListItem
              post={p}
              authorNickname={p.user_id ? nicknames.get(p.user_id) ?? null : null}
            />
          </li>
        ))}
        {(posts ?? []).length === 0 ? <li className="text-sm text-gray-500">공지가 없습니다.</li> : null}
      </ul>
      {totalPages > 1 ? (
        <nav className="mt-4 flex justify-center gap-2 text-sm">
          {page > 1 ? <Link href={`?page=${page - 1}`}>이전</Link> : null}
          <span>{page} / {totalPages}</span>
          {page < totalPages ? <Link href={`?page=${page + 1}`}>다음</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
