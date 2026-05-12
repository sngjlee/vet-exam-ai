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

  const navLinkStyle = (active: boolean) => ({
    color: active ? "var(--teal)" : "var(--text-muted)",
    fontWeight: active ? 700 : 400,
    textDecoration: "none",
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {(["latest", "popular"] as const).map((s) => (
            <Link
              key={s}
              href={`?sort=${s}${status ? `&status=${status}` : ""}`}
              style={navLinkStyle(s === sort)}
            >
              {s === "latest" ? "최신" : "인기"}
            </Link>
          ))}
          <span style={{ color: "var(--text-faint)" }}>|</span>
          <Link href="?" style={navLinkStyle(!status)}>
            전체
          </Link>
          {(["received", "reviewing", "accepted", "rejected"] as const).map((s) => (
            <Link
              key={s}
              href={`?status=${s}${sort === "popular" ? "&sort=popular" : ""}`}
              style={navLinkStyle(s === status)}
            >
              {SUGGESTION_STATUS_LABEL[s]}
            </Link>
          ))}
        </div>
        <Link
          href="/board/suggestions/new"
          className="rounded-md px-3 py-1 text-sm font-semibold"
          style={{ background: "var(--teal)", color: "#080D1A", textDecoration: "none" }}
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
          <li className="text-sm" style={{ color: "var(--text-muted)" }}>건의글이 없습니다.</li>
        ) : null}
      </ul>

      {totalPages > 1 ? (
        <nav className="mt-4 flex justify-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
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
