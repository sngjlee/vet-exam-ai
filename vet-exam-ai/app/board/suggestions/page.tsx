import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BoardPostListItem } from "@/components/board/BoardPostListItem";
import { SUGGESTION_STATUS_LABEL } from "@/lib/board/labels";

export const dynamic = "force-dynamic";

type SP = { sort?: string; status?: string; page?: string };

const PAGE_SIZE = 20;

export default async function SuggestionsListPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1"));
  const sort = sp.sort === "popular" ? "popular" : "latest";
  const status = ["received", "reviewing", "accepted", "rejected"].includes(sp.status ?? "")
    ? (sp.status as "received" | "reviewing" | "accepted" | "rejected")
    : null;

  const supabase = await createClient();
  let q = supabase
    .from("board_posts")
    .select(
      "id,kind,title,suggestion_status,is_anonymized,user_id,upvote_count,comment_count,created_at,is_pinned",
      { count: "exact" }
    )
    .eq("kind", "suggestion")
    .eq("visibility", "visible");
  if (status) q = q.eq("suggestion_status", status);
  q =
    sort === "popular"
      ? q.order("upvote_count", { ascending: false }).order("created_at", { ascending: false })
      : q.order("created_at", { ascending: false });
  q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data: posts, count } = await q;

  // 작성자 닉네임 batch
  const userIds = Array.from(
    new Set((posts ?? []).map((p) => p.user_id).filter(Boolean) as string[])
  );
  const nicknames = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: nicks } = await supabase
      .from("user_profiles_public")
      .select("user_id,nickname")
      .in("user_id", userIds);
    for (const n of nicks ?? []) nicknames.set(n.user_id, n.nickname);
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 text-sm">
          {(["latest", "popular"] as const).map((s) => (
            <Link
              key={s}
              href={`?sort=${s}${status ? `&status=${status}` : ""}`}
              className={s === sort ? "font-bold text-blue-600" : "text-gray-600 hover:underline"}
            >
              {s === "latest" ? "최신" : "인기"}
            </Link>
          ))}
          <span className="text-gray-300">|</span>
          <Link
            href="?"
            className={!status ? "font-bold text-blue-600" : "text-gray-600 hover:underline"}
          >
            전체
          </Link>
          {(["received", "reviewing", "accepted", "rejected"] as const).map((s) => (
            <Link
              key={s}
              href={`?status=${s}${sort === "popular" ? "&sort=popular" : ""}`}
              className={s === status ? "font-bold text-blue-600" : "text-gray-600 hover:underline"}
            >
              {SUGGESTION_STATUS_LABEL[s]}
            </Link>
          ))}
        </div>
        <Link
          href="/board/suggestions/new"
          className="rounded-md bg-blue-600 px-3 py-1 text-sm font-semibold text-white"
        >
          건의 작성
        </Link>
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
        {(posts ?? []).length === 0 ? (
          <li className="text-sm text-gray-500">건의글이 없습니다.</li>
        ) : null}
      </ul>

      {totalPages > 1 ? (
        <nav className="mt-4 flex justify-center gap-2 text-sm">
          {page > 1 ? <Link href={`?page=${page - 1}`}>이전</Link> : null}
          <span>
            {page} / {totalPages}
          </span>
          {page < totalPages ? <Link href={`?page=${page + 1}`}>다음</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
