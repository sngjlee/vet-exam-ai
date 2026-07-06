import Link from "next/link";
import { ChevronRight, Megaphone, MessageSquarePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const sectionStyle = {
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
} as const;

const primarySectionStyle = {
  ...sectionStyle,
  boxShadow: "var(--shadow-sm)",
} as const;

const secondarySectionStyle = {
  ...sectionStyle,
  boxShadow: "var(--shadow-sm)",
} as const;

export default async function BoardTabPage() {
  const supabase = await createClient();
  const [annRes, sugRes] = await Promise.all([
    supabase
      .from("board_posts")
      .select("id,title,created_at,is_pinned,is_anonymized,user_id")
      .eq("kind", "announcement")
      .eq("visibility", "visible")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("board_posts")
      .select("id,title,created_at,suggestion_status,is_anonymized,user_id,upvote_count,comment_count")
      .eq("kind", "suggestion")
      .eq("visibility", "visible")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const announcements = annRes.data ?? [];
  const suggestions = sugRes.data ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)]">
      <section className="rounded-lg p-4" style={primarySectionStyle}>
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--teal-dim)", color: "var(--teal)" }}
            >
              <Megaphone size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
                공지
              </h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                운영 안내와 중요한 업데이트
              </p>
            </div>
          </div>
          <Link
            href="/board/announcements"
            className="inline-flex items-center gap-1 text-sm font-semibold"
            style={{ color: "var(--teal)", textDecoration: "none" }}
          >
            전체
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
        </header>

        <ul className="mt-3 space-y-2 text-sm">
          {announcements.map((post) => (
            <li key={post.id}>
              <Link
                href={`/board/announcements/${post.id}`}
                className="block rounded-md px-2 py-2 hover:underline"
                style={{ color: "var(--text)", textDecoration: "none" }}
              >
                <span style={{ color: post.is_pinned ? "var(--amber)" : "var(--text-faint)" }}>
                  {post.is_pinned ? "고정" : "공지"}
                </span>
                <span className="ml-2 font-medium">{post.title}</span>
              </Link>
            </li>
          ))}
          {announcements.length === 0 ? (
            <li className="rounded-md px-2 py-6 text-center" style={{ color: "var(--text-muted)" }}>
              아직 등록된 공지가 없습니다.
            </li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-lg p-4" style={secondarySectionStyle}>
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--amber-dim)", color: "var(--amber)" }}
            >
              <MessageSquarePlus size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
                건의
              </h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                개선 의견과 진행 상태
              </p>
            </div>
          </div>
          <Link
            href="/board/suggestions"
            className="inline-flex items-center gap-1 text-sm font-semibold"
            style={{ color: "var(--teal)", textDecoration: "none" }}
          >
            전체
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
        </header>

        <ul className="mt-3 space-y-2 text-sm">
          {suggestions.map((post) => (
            <li key={post.id}>
              <Link
                href={`/board/suggestions/${post.id}`}
                className="block rounded-md px-2 py-2 hover:underline"
                style={{ color: "var(--text)", textDecoration: "none" }}
              >
                <span className="font-medium">{post.title}</span>
                <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  추천 {post.upvote_count} · 댓글 {post.comment_count}
                </span>
              </Link>
            </li>
          ))}
          {suggestions.length === 0 ? (
            <li className="rounded-md px-2 py-5 text-sm" style={{ color: "var(--text-muted)" }}>
              아직 등록된 건의가 없습니다.
              <Link
                href="/board/suggestions/new"
                className="mt-3 inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold"
                style={{ background: "var(--teal)", color: "#080D1A", textDecoration: "none" }}
              >
                건의 작성
                <ChevronRight size={15} aria-hidden="true" />
              </Link>
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
