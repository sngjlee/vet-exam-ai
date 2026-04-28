import { createClient } from "../../../lib/supabase/server";
import { parseAuditSearchParams } from "./_lib/parse-audit-search-params";
import { AuditFilters } from "./_components/audit-filters";
import { AuditTable, type AuditRow } from "./_components/audit-table";
import { AuditPager } from "./_components/audit-pager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

async function loadPage(sp: ReturnType<typeof parseAuditSearchParams>): Promise<{
  rows: AuditRow[];
  totalPages: number;
  adminMap: Record<string, { nickname: string | null }>;
  questionMap: Record<string, { public_id: string | null }>;
}> {
  const supabase = await createClient();

  // Step 1: optionally resolve nickname filter to admin_id set
  let adminIdFilter: string[] | null = null;
  if (sp.admin) {
    const { data: matches } = await supabase
      .from("user_profiles_public")
      .select("user_id, nickname")
      .ilike("nickname", `%${sp.admin}%`)
      .limit(50);
    adminIdFilter = (matches ?? [])
      .map((m) => m.user_id as string)
      .filter((id): id is string => Boolean(id));
    if (adminIdFilter.length === 0) {
      return { rows: [], totalPages: 1, adminMap: {}, questionMap: {} };
    }
  }

  // Step 2: main audit query
  let q = supabase
    .from("admin_audit_logs")
    .select("*", { count: "exact" });

  if (sp.action) q = q.eq("action", sp.action);
  if (sp.target_type) q = q.eq("target_type", sp.target_type);
  if (adminIdFilter) q = q.in("admin_id", adminIdFilter);

  const offset = (sp.page - 1) * PAGE_SIZE;
  const { data, count } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const rows = (data ?? []) as AuditRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // Step 3: nickname lookup (separate query — no embedded join, PR #14 trap)
  const adminIds = Array.from(
    new Set(rows.map((r) => r.admin_id).filter((v): v is string => Boolean(v))),
  );
  const adminMap: Record<string, { nickname: string | null }> = {};
  if (adminIds.length > 0) {
    const { data: profs } = await supabase
      .from("user_profiles_public")
      .select("user_id, nickname")
      .in("user_id", adminIds);
    for (const p of profs ?? []) {
      if (p.user_id) adminMap[p.user_id] = { nickname: p.nickname };
    }
  }

  // Step 4: question KVLE lookup for question targets
  const questionIds = Array.from(
    new Set(
      rows
        .filter((r) => r.target_type === "question")
        .map((r) => r.target_id),
    ),
  );
  const questionMap: Record<string, { public_id: string | null }> = {};
  if (questionIds.length > 0) {
    const { data: qs } = await supabase
      .from("questions")
      .select("id, public_id")
      .in("id", questionIds);
    for (const q of qs ?? []) {
      questionMap[q.id] = { public_id: q.public_id };
    }
  }

  return { rows, totalPages, adminMap, questionMap };
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = await searchParams;
  const sp = parseAuditSearchParams(raw);

  const { rows, totalPages, adminMap, questionMap } = await loadPage(sp);
  const clamped: typeof sp = {
    ...sp,
    page: Math.min(sp.page, totalPages),
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          감사 로그
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          모든 운영자 액션은 자동으로 기록됩니다.
        </p>
      </header>

      <AuditFilters current={clamped} />
      <AuditTable rows={rows} adminMap={adminMap} questionMap={questionMap} />
      <AuditPager current={clamped} totalPages={totalPages} />
    </div>
  );
}
