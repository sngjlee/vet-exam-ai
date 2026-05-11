// vet-exam-ai/app/admin/suggestions/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SuggestionStatusBadge } from "@/components/board/SuggestionStatusBadge";
import {
  updateSuggestionStateAction,
  setBoardPostVisibilityAction,
} from "./_actions";

export const dynamic = "force-dynamic";

type SP = { status?: string; page?: string };
const PAGE_SIZE = 20;
const VALID = ["received", "reviewing", "accepted", "rejected"] as const;

export default async function AdminSuggestionsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");
  const { data: profile } = await supabase
    .from("profiles").select("role,is_active").eq("id", userRes.user.id).single();
  if (!(profile?.role === "admin" && profile?.is_active === true)) {
    redirect("/dashboard");
  }

  const statusFilter = (VALID as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as typeof VALID[number])
    : null;
  const page = Math.max(1, Number(sp.page ?? "1"));

  let q = supabase.from("board_posts")
    .select("id,title,suggestion_status,is_anonymized,user_id,upvote_count,comment_count,report_count,created_at,visibility",
            { count: "exact" })
    .eq("kind", "suggestion");
  if (statusFilter) q = q.eq("suggestion_status", statusFilter);
  q = q.order("created_at", { ascending: false })
       .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data: posts, count } = await q;

  const userIds = Array.from(new Set((posts ?? []).map((p) => p.user_id).filter(Boolean) as string[]));
  const nicknames = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: nicks } = await supabase
      .from("user_profiles_public").select("user_id,nickname").in("user_id", userIds);
    for (const n of nicks ?? []) nicknames.set(n.user_id, n.nickname);
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">건의 모더레이션</h1>
        <p className="text-sm text-gray-600">상태 변경은 작성자에게 알림이 발송됩니다.</p>
      </header>

      <nav className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/suggestions" className={!statusFilter ? "font-bold text-blue-600" : "text-gray-600 hover:underline"}>전체</Link>
        {VALID.map((s) => (
          <Link key={s} href={`?status=${s}`}
            className={s === statusFilter ? "font-bold text-blue-600" : "text-gray-600 hover:underline"}>
            {s === "received" ? "접수"
              : s === "reviewing" ? "검토중"
              : s === "accepted" ? "채택" : "반려"}
          </Link>
        ))}
      </nav>

      <ul className="space-y-3">
        {(posts ?? []).map((p) => (
          <li key={p.id} className="rounded-md border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {p.suggestion_status ? <SuggestionStatusBadge status={p.suggestion_status} /> : null}
                  {p.visibility !== "visible" ? (
                    <span className="text-xs text-red-600">{p.visibility}</span>
                  ) : null}
                </div>
                <Link href={`/board/suggestions/${p.id}`} className="mt-1 block text-base font-semibold hover:underline">
                  {p.title}
                </Link>
                <div className="mt-1 text-xs text-gray-500">
                  {p.is_anonymized ? "익명" : (p.user_id ? nicknames.get(p.user_id) ?? "탈퇴" : "탈퇴")}
                  {p.is_anonymized && p.user_id ? (
                    <span className="ml-1 text-gray-400">(작성자: {nicknames.get(p.user_id) ?? "탈퇴"})</span>
                  ) : null}
                  {" · "}
                  👍 {p.upvote_count} · 💬 {p.comment_count}
                  {p.report_count > 0 ? <span className="ml-1 text-red-600">🚩 {p.report_count}</span> : null}
                  {" · "}
                  {new Date(p.created_at).toLocaleString("ko-KR")}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {VALID.map((s) => (
                <form key={s} action={async () => {
                  "use server";
                  await updateSuggestionStateAction({ post_id: p.id, new_status: s });
                }}>
                  <button className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100"
                    disabled={p.suggestion_status === s}>
                    {s === "received" ? "접수로" : s === "reviewing" ? "검토중으로"
                      : s === "accepted" ? "채택" : "반려"}
                  </button>
                </form>
              ))}
              {p.visibility === "visible" ? (
                <form action={async () => {
                  "use server";
                  await setBoardPostVisibilityAction({ post_id: p.id, visibility: "removed_by_admin" });
                }}>
                  <button className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                    삭제
                  </button>
                </form>
              ) : (
                <form action={async () => {
                  "use server";
                  await setBoardPostVisibilityAction({ post_id: p.id, visibility: "visible" });
                }}>
                  <button className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100">
                    복구
                  </button>
                </form>
              )}
            </div>
          </li>
        ))}
        {(posts ?? []).length === 0 ? <li className="text-sm text-gray-500">건의글이 없습니다.</li> : null}
      </ul>

      {totalPages > 1 ? (
        <nav className="flex justify-center gap-2 text-sm">
          {page > 1 ? <Link href={`?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}`}>이전</Link> : null}
          <span>{page} / {totalPages}</span>
          {page < totalPages ? <Link href={`?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}`}>다음</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
