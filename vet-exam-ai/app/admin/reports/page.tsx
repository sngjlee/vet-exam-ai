import { createClient } from "../../../lib/supabase/server";
import { parseReportsSearchParams } from "./_lib/parse-reports-search-params";
import { ReportsFilters } from "./_components/reports-filters";
import {
  ReportsTable,
  type ReportGroupRow,
  type RawReportRow,
  type CommentLite,
} from "./_components/reports-table";
import { ReportsPager } from "./_components/reports-pager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

async function loadPage(sp: ReturnType<typeof parseReportsSearchParams>): Promise<{
  groups:      ReportGroupRow[];
  totalPages:  number;
  commentMap:  Record<string, CommentLite>;
  rawMap:      Record<string, RawReportRow[]>;
  nicknameMap: Record<string, string | null>;
}> {
  const supabase = await createClient();

  // Step 1: comment_ids matching filters (oldest-pending first).
  // Supabase JS doesn't support group-by directly, so we paginate by comment_id
  // using a "select distinct comment_id" pattern via filters + dedup.

  let raw = supabase
    .from("comment_reports")
    .select("comment_id, reason, status, created_at", { count: "exact" });

  if (sp.status !== "all") raw = raw.eq("status", sp.status);
  if (sp.reason !== "all") raw = raw.eq("reason", sp.reason);

  const { data: rawAll, error: rawErr } = await raw
    .order("created_at", { ascending: true })
    .limit(2000);          // hard cap; PR-D will revisit if backlog grows past this

  if (rawErr || !rawAll) {
    return {
      groups:      [],
      totalPages:  1,
      commentMap:  {},
      rawMap:      {},
      nicknameMap: {},
    };
  }

  // group raw rows by comment_id (preserve oldest-first order)
  const seen = new Set<string>();
  const ordered: string[] = [];
  const grouped: Record<string, ReportGroupRow> = {};
  for (const r of rawAll) {
    const cid = r.comment_id as string;
    if (!seen.has(cid)) {
      seen.add(cid);
      ordered.push(cid);
      grouped[cid] = {
        comment_id:        cid,
        report_count:      0,
        reasons:           [],
        first_reported_at: r.created_at as string,
      };
    }
    grouped[cid].report_count += 1;
    grouped[cid].reasons.push(r.reason as string);
  }

  const totalGroups = ordered.length;
  const totalPages  = Math.max(1, Math.ceil(totalGroups / PAGE_SIZE));
  const offset      = (Math.min(sp.page, totalPages) - 1) * PAGE_SIZE;
  const pageIds     = ordered.slice(offset, offset + PAGE_SIZE);

  if (pageIds.length === 0) {
    return {
      groups:      [],
      totalPages,
      commentMap:  {},
      rawMap:      {},
      nicknameMap: {},
    };
  }

  // Step 2: comments lookup (filter out removed_by_admin / hidden_by_author).
  const { data: comments } = await supabase
    .from("comments")
    .select("id, body_html, body_text, status, user_id")
    .in("id", pageIds)
    .neq("status", "removed_by_admin")
    .neq("status", "hidden_by_author");

  const commentMap: Record<string, CommentLite> = {};
  for (const c of comments ?? []) {
    commentMap[c.id as string] = {
      id:        c.id as string,
      body_html: (c.body_html as string) ?? "",
      body_text: (c.body_text as string) ?? "",
      status:    c.status as string,
      user_id:   c.user_id as string,
    };
  }

  // Step 3: raw report rows for the visible groups (full detail per row).
  const visibleIds = pageIds.filter((id) => commentMap[id]);
  const { data: rawRows } = await supabase
    .from("comment_reports")
    .select("id, comment_id, reporter_id, reason, description, status, created_at")
    .in("comment_id", visibleIds)
    .order("created_at", { ascending: true });

  const rawMap: Record<string, RawReportRow[]> = {};
  for (const r of rawRows ?? []) {
    const cid = r.comment_id as string;
    if (!rawMap[cid]) rawMap[cid] = [];
    rawMap[cid].push({
      id:          r.id as string,
      comment_id:  cid,
      reporter_id: (r.reporter_id as string | null) ?? null,
      reason:      r.reason as string,
      description: (r.description as string | null) ?? null,
      status:      r.status as string,
      created_at:  r.created_at as string,
    });
  }

  // Step 4: nickname lookup (separate query — embedded join trap, PR #14).
  const userIds = new Set<string>();
  for (const id of visibleIds) {
    const c = commentMap[id];
    if (c) userIds.add(c.user_id);
  }
  for (const rs of Object.values(rawMap)) {
    for (const r of rs) if (r.reporter_id) userIds.add(r.reporter_id);
  }
  const nicknameMap: Record<string, string | null> = {};
  if (userIds.size > 0) {
    const { data: profs } = await supabase
      .from("user_profiles_public")
      .select("user_id, nickname")
      .in("user_id", Array.from(userIds));
    for (const p of profs ?? []) {
      if (p.user_id) nicknameMap[p.user_id as string] = (p.nickname as string | null) ?? null;
    }
  }

  const groups: ReportGroupRow[] = visibleIds.map((id) => grouped[id]);

  return { groups, totalPages, commentMap, rawMap, nicknameMap };
}

const ERROR_LABELS: Record<string, string> = {
  missing_target:     "대상 댓글이 지정되지 않았습니다",
  invalid_resolution: "올바른 처리 결과를 선택하세요",
  db_error:           "저장 중 오류가 발생했습니다. 다시 시도하세요",
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = await searchParams;
  const sp  = parseReportsSearchParams(raw);

  const { groups, totalPages, commentMap, rawMap, nicknameMap } = await loadPage(sp);
  const clamped = { ...sp, page: Math.min(sp.page, totalPages) };

  const errorRaw = Array.isArray(raw.error) ? raw.error[0] : raw.error;
  const errorMsg = errorRaw && ERROR_LABELS[errorRaw] ? ERROR_LABELS[errorRaw] : null;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          신고 큐
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          댓글 신고를 24시간 이내 검토하여 임시조치 결정을 내립니다.
        </p>
      </header>

      {errorMsg && (
        <div
          role="alert"
          className="mb-3 rounded p-3 text-sm"
          style={{ background: "var(--rose-dim)", border: "1px solid var(--rose)", color: "var(--rose)" }}
        >
          {errorMsg}
        </div>
      )}

      <ReportsFilters current={clamped} />
      <ReportsTable
        groups={groups}
        commentMap={commentMap}
        rawMap={rawMap}
        nicknameMap={nicknameMap}
      />
      <ReportsPager current={clamped} totalPages={totalPages} />
    </div>
  );
}
