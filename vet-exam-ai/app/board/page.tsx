import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BoardTabPage() {
  const supabase = await createClient();
  const [annRes, sugRes] = await Promise.all([
    supabase.from("board_posts")
      .select("id,title,created_at,is_pinned,is_anonymized,user_id")
      .eq("kind", "announcement")
      .eq("visibility", "visible")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(3),
    supabase.from("board_posts")
      .select("id,title,created_at,suggestion_status,is_anonymized,user_id,upvote_count,comment_count")
      .eq("kind", "suggestion")
      .eq("visibility", "visible")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">📢 공지</h2>
          <Link href="/board/announcements" className="text-sm text-blue-600 hover:underline">전체 →</Link>
        </header>
        <ul className="mt-3 space-y-2 text-sm">
          {(annRes.data ?? []).map((p) => (
            <li key={p.id}>
              <Link href={`/board/announcements/${p.id}`} className="hover:underline">
                {p.is_pinned ? "📌 " : ""}{p.title}
              </Link>
            </li>
          ))}
          {(annRes.data ?? []).length === 0 ? <li className="text-gray-500">아직 공지가 없습니다.</li> : null}
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">💬 건의</h2>
          <Link href="/board/suggestions" className="text-sm text-blue-600 hover:underline">전체 →</Link>
        </header>
        <ul className="mt-3 space-y-2 text-sm">
          {(sugRes.data ?? []).map((p) => (
            <li key={p.id}>
              <Link href={`/board/suggestions/${p.id}`} className="hover:underline">
                {p.title}
              </Link>
              <span className="ml-2 text-xs text-gray-500">
                👍 {p.upvote_count} · 💬 {p.comment_count}
              </span>
            </li>
          ))}
          {(sugRes.data ?? []).length === 0 ? <li className="text-gray-500">아직 건의가 없습니다.</li> : null}
        </ul>
      </section>
    </div>
  );
}
