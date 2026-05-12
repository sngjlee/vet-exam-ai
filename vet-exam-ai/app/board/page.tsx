import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const sectionStyle = {
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
} as const;

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
      <section className="rounded-lg p-4" style={sectionStyle}>
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>📢 공지</h2>
          <Link
            href="/board/announcements"
            className="text-sm hover:underline"
            style={{ color: "var(--teal)" }}
          >
            전체 →
          </Link>
        </header>
        <ul className="mt-3 space-y-2 text-sm">
          {(annRes.data ?? []).map((p) => (
            <li key={p.id}>
              <Link
                href={`/board/announcements/${p.id}`}
                className="hover:underline"
                style={{ color: "var(--text)" }}
              >
                {p.is_pinned ? "📌 " : ""}{p.title}
              </Link>
            </li>
          ))}
          {(annRes.data ?? []).length === 0 ? (
            <li style={{ color: "var(--text-muted)" }}>아직 공지가 없습니다.</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-lg p-4" style={sectionStyle}>
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>💬 건의</h2>
          <Link
            href="/board/suggestions"
            className="text-sm hover:underline"
            style={{ color: "var(--teal)" }}
          >
            전체 →
          </Link>
        </header>
        <ul className="mt-3 space-y-2 text-sm">
          {(sugRes.data ?? []).map((p) => (
            <li key={p.id}>
              <Link
                href={`/board/suggestions/${p.id}`}
                className="hover:underline"
                style={{ color: "var(--text)" }}
              >
                {p.title}
              </Link>
              <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                👍 {p.upvote_count} · 💬 {p.comment_count}
              </span>
            </li>
          ))}
          {(sugRes.data ?? []).length === 0 ? (
            <li style={{ color: "var(--text-muted)" }}>아직 건의가 없습니다.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
