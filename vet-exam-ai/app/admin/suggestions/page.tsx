// vet-exam-ai/app/admin/suggestions/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SuggestionStatusBadge } from "@/components/board/SuggestionStatusBadge";
import { formatKstDateTime } from "@/lib/utils/datetime";
import { SuggestionActionRow } from "./_components/suggestion-action-row";
import { ALL_REPORT_REASONS, REPORT_REASON_KO } from "@/lib/admin/report-labels";
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type SP = { status?: string; reason?: string; page?: string };
const PAGE_SIZE = 20;
const VALID = ["received", "reviewing", "accepted", "rejected"] as const;
type ReportReason = Database["public"]["Enums"]["report_reason"];

type ReportSummary = {
  total: number;
  reasons: Partial<Record<ReportReason, number>>;
};

function buildHref(params: { status?: string | null; reason?: string | null; page?: number }) {
  const out = new URLSearchParams();
  if (params.status) out.set("status", params.status);
  if (params.reason) out.set("reason", params.reason);
  if (params.page && params.page > 1) out.set("page", String(params.page));
  const query = out.toString();
  return query ? `?${query}` : "/admin/suggestions";
}

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
  const reasonFilter = (ALL_REPORT_REASONS as readonly string[]).includes(sp.reason ?? "")
    ? (sp.reason as ReportReason)
    : null;
  const page = Math.max(1, Number(sp.page ?? "1"));

  let filteredPostIds: string[] | null = null;
  if (reasonFilter) {
    const { data: reports } = await supabase
      .from("board_post_reports")
      .select("post_id")
      .eq("status", "pending")
      .eq("reason", reasonFilter)
      .limit(1000);
    filteredPostIds = Array.from(new Set((reports ?? []).map((report) => report.post_id)));
  }

  let q = supabase.from("board_posts")
    .select("id,title,suggestion_status,is_anonymized,user_id,upvote_count,comment_count,report_count,created_at,visibility",
            { count: "exact" })
    .eq("kind", "suggestion");
  if (statusFilter) q = q.eq("suggestion_status", statusFilter);
  if (filteredPostIds) {
    if (filteredPostIds.length > 0) q = q.in("id", filteredPostIds);
    else q = q.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  q = q
    .order("report_count", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data: posts, count } = await q;

  const userIds = Array.from(new Set((posts ?? []).map((p) => p.user_id).filter(Boolean) as string[]));
  const nicknames = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: nicks } = await supabase
      .from("user_profiles_public").select("user_id,nickname").in("user_id", userIds);
    for (const n of nicks ?? []) nicknames.set(n.user_id, n.nickname);
  }

  const postIds = (posts ?? []).map((post) => post.id);
  const reportSummary = new Map<string, ReportSummary>();
  if (postIds.length > 0) {
    const { data: pendingReports } = await supabase
      .from("board_post_reports")
      .select("post_id,reason")
      .in("post_id", postIds)
      .eq("status", "pending");
    for (const report of pendingReports ?? []) {
      const summary = reportSummary.get(report.post_id) ?? { total: 0, reasons: {} };
      summary.total += 1;
      const reason = report.reason as ReportReason;
      summary.reasons[reason] = (summary.reasons[reason] ?? 0) + 1;
      reportSummary.set(report.post_id, summary);
    }
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>건의 관리</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          상태 변경은 작성자에게 알림이 발송됩니다.
        </p>
      </header>

      <nav className="flex flex-wrap gap-3 text-sm">
        <Link
          href={buildHref({ reason: reasonFilter })}
          style={{
            color: !statusFilter ? "var(--teal)" : "var(--text-muted)",
            fontWeight: !statusFilter ? 700 : 400,
            textDecoration: "none",
          }}
        >
          전체
        </Link>
        {VALID.map((s) => (
          <Link
            key={s}
            href={buildHref({ status: s, reason: reasonFilter })}
            style={{
              color: s === statusFilter ? "var(--teal)" : "var(--text-muted)",
              fontWeight: s === statusFilter ? 700 : 400,
              textDecoration: "none",
            }}
          >
            {s === "received" ? "접수"
              : s === "reviewing" ? "검토 중"
              : s === "accepted" ? "채택" : "반려"}
          </Link>
        ))}
      </nav>

      <nav className="flex flex-wrap gap-2 text-xs">
        <Link
          href={buildHref({ status: statusFilter })}
          className="rounded-full px-2 py-1"
          style={{
            color: !reasonFilter ? "var(--teal)" : "var(--text-muted)",
            border: !reasonFilter ? "1px solid var(--teal-border)" : "1px solid var(--rule)",
            background: !reasonFilter ? "var(--teal-dim)" : "transparent",
            textDecoration: "none",
          }}
        >
          신고 사유 전체
        </Link>
        {ALL_REPORT_REASONS.map((reason) => (
          <Link
            key={reason}
            href={buildHref({ status: statusFilter, reason })}
            className="rounded-full px-2 py-1"
            style={{
              color: reason === reasonFilter ? "var(--teal)" : "var(--text-muted)",
              border: reason === reasonFilter ? "1px solid var(--teal-border)" : "1px solid var(--rule)",
              background: reason === reasonFilter ? "var(--teal-dim)" : "transparent",
              textDecoration: "none",
            }}
          >
            {REPORT_REASON_KO[reason]}
          </Link>
        ))}
      </nav>

      <ul className="space-y-3">
        {(posts ?? []).map((p) => (
          <li
            key={p.id}
            className="rounded-md p-4"
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {p.suggestion_status ? <SuggestionStatusBadge status={p.suggestion_status} /> : null}
                  {p.visibility !== "visible" ? (
                    <span className="text-xs" style={{ color: "var(--wrong)" }}>{p.visibility}</span>
                  ) : null}
                </div>
                <Link
                  href={`/board/suggestions/${p.id}`}
                  className="mt-1 block text-base font-semibold hover:underline"
                  style={{ color: "var(--text)" }}
                >
                  {p.title}
                </Link>
                <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {p.is_anonymized ? "익명" : (p.user_id ? nicknames.get(p.user_id) ?? "탈퇴" : "탈퇴")}
                  {p.is_anonymized && p.user_id ? (
                    <span className="ml-1" style={{ color: "var(--text-faint)" }}>
                      (작성자: {nicknames.get(p.user_id) ?? "탈퇴"})
                    </span>
                  ) : null}
                  {" · "}
                  👍 {p.upvote_count} · 💬 {p.comment_count}
                  {p.report_count > 0 ? (
                    <span className="ml-1" style={{ color: "var(--wrong)" }}>🚩 {p.report_count}</span>
                  ) : null}
                  {" · "}
                  {formatKstDateTime(p.created_at)}
                </div>
                {reportSummary.get(p.id) ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(reportSummary.get(p.id)!.reasons).map(([reason, reasonCount]) => (
                      <span
                        key={reason}
                        className="rounded-full px-2 py-0.5 text-[11px]"
                        style={{
                          color: reason === "advertising" ? "var(--wrong)" : "var(--text-muted)",
                          background: reason === "advertising" ? "var(--wrong-dim)" : "var(--surface)",
                          border: reason === "advertising"
                            ? "1px solid rgba(192,74,58,0.3)"
                            : "1px solid var(--rule)",
                        }}
                      >
                        {REPORT_REASON_KO[reason as ReportReason]} {reasonCount}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-3">
              <SuggestionActionRow
                postId={p.id}
                currentStatus={p.suggestion_status}
                currentVisibility={p.visibility}
              />
            </div>
          </li>
        ))}
        {(posts ?? []).length === 0 ? (
          <li className="text-sm" style={{ color: "var(--text-muted)" }}>건의글이 없습니다.</li>
        ) : null}
      </ul>

      {totalPages > 1 ? (
        <nav className="flex justify-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          {page > 1 ? (
            <Link href={buildHref({ status: statusFilter, reason: reasonFilter, page: page - 1 })}>이전</Link>
          ) : null}
          <span>{page} / {totalPages}</span>
          {page < totalPages ? (
            <Link href={buildHref({ status: statusFilter, reason: reasonFilter, page: page + 1 })}>다음</Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
