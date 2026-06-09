import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BoardPostListItem } from "@/components/board/BoardPostListItem";
import { SUGGESTION_STATUS_LABEL } from "@/lib/board/labels";

export const dynamic = "force-dynamic";

type SP = { sort?: string; status?: string; page?: string };

const PAGE_SIZE = 20;

export default async function SuggestionsListPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const pageRaw = Number(sp.page ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const sort = sp.sort === "popular" ? "popular" : "latest";
  const status = ["received", "reviewing", "accepted", "rejected"].includes(sp.status ?? "")
    ? (sp.status as "received" | "reviewing" | "accepted" | "rejected")
    : null;

  const supabase = await createClient();
  let q = supabase
    .from("board_posts")
    .select(
      "id,kind,title,suggestion_status,is_anonymized,user_id,upvote_count,comment_count,created_at,is_pinned"
    )
    .eq("kind", "suggestion")
    .eq("visibility", "visible");
  if (status) q = q.eq("suggestion_status", status);
  q =
    sort === "popular"
      ? q.order("upvote_count", { ascending: false }).order("created_at", { ascending: false })
      : q.order("created_at", { ascending: false });
  q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const { data: rows } = await q;
  const posts = (rows ?? []).slice(0, PAGE_SIZE);
  const hasNextPage = (rows ?? []).length > PAGE_SIZE;

  // 작성자 닉네임 batch
  const userIds = Array.from(
    new Set(posts.map((p) => p.user_id).filter(Boolean) as string[])
  );
  const nicknames = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: nicks } = await supabase
      .from("user_profiles_public")
      .select("user_id,nickname")
      .in("user_id", userIds);
    for (const n of nicks ?? []) nicknames.set(n.user_id, n.nickname);
  }

  const navLinkStyle = (active: boolean) => ({
    color: active ? "var(--teal)" : "var(--text-muted)",
    fontWeight: active ? 700 : 400,
    textDecoration: "none",
  });
  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (sort === "popular") params.set("sort", "popular");
    if (status) params.set("status", status);
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    return query ? `?${query}` : "?";
  };

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

      <div
        className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
      >
        <span style={{ color: "var(--text-muted)" }}>
          채택된 건의는 운영 반영 흐름을 확인할 수 있습니다.
        </span>
        <Link
          href={`?status=accepted${sort === "popular" ? "&sort=popular" : ""}`}
          className="rounded-md px-2 py-1 text-xs font-semibold"
          style={{ color: "var(--teal)", background: "var(--teal-dim)", textDecoration: "none" }}
        >
          채택 글 보기
        </Link>
      </div>

      <ul className="mt-4 space-y-2">
        {posts.map((p) => (
          <li key={p.id}>
            <BoardPostListItem
              post={p}
              authorNickname={p.user_id ? nicknames.get(p.user_id) ?? null : null}
            />
          </li>
        ))}
        {posts.length === 0 ? (
          <li className="text-sm" style={{ color: "var(--text-muted)" }}>건의글이 없습니다.</li>
        ) : null}
      </ul>

      {page > 1 || hasNextPage ? (
        <nav className="mt-4 flex justify-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          {page > 1 ? <Link href={pageHref(page - 1)}>이전</Link> : null}
          <span>{page}</span>
          {hasNextPage ? <Link href={pageHref(page + 1)}>다음</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
