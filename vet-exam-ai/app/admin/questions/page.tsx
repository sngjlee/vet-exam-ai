import { createClient } from "../../../lib/supabase/server";
import { getFilterOptions } from "../../../lib/admin/filter-options";
import { AdminQuestionsFilters } from "../_components/admin-questions-filters";
import { AdminQuestionsTable, type AdminQuestionRow } from "../_components/admin-questions-table";
import { AdminQuestionsPager } from "../_components/admin-questions-pager";
import {
  parseAdminQuestionsSearchParams,
  type ParsedSearchParams,
  type SortKey,
} from "./_lib/parse-search-params";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const SORT_MAP: Record<SortKey, { col: string; ascending: boolean }> = {
  recent: { col: "created_at", ascending: false },
  round:  { col: "round",      ascending: true  },
  kvle:   { col: "public_id",  ascending: true  },
};

async function loadQuestions(
  sp: ParsedSearchParams
): Promise<{ rows: AdminQuestionRow[]; total: number }> {
  const supabase = await createClient();
  let q = supabase
    .from("questions")
    .select(
      "id, public_id, round, session, year, subject, category, question, answer, choices, is_active, created_at",
      { count: "exact" }
    );

  if (sp.round != null)    q = q.eq("round",    sp.round);
  if (sp.year != null)     q = q.eq("year",     sp.year);
  if (sp.session != null)  q = q.eq("session",  sp.session);
  if (sp.subject)          q = q.eq("subject",  sp.subject);
  if (sp.category)         q = q.eq("category", sp.category);
  if (sp.is_active != null) q = q.eq("is_active", sp.is_active);
  if (sp.q) {
    q = q.or(`public_id.ilike.%${sp.q}%,question.ilike.%${sp.q}%`);
  }

  const { col, ascending } = SORT_MAP[sp.sort];
  const offset = (sp.page - 1) * PAGE_SIZE;
  const { data, count, error } = await q
    .order(col, { ascending })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error || !data) return { rows: [], total: 0 };
  return { rows: data as AdminQuestionRow[], total: count ?? 0 };
}

export default async function AdminQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = await searchParams;
  const sp = parseAdminQuestionsSearchParams(raw);

  const [options, { rows, total }] = await Promise.all([
    getFilterOptions(),
    loadQuestions(sp),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const clampedPage = Math.min(sp.page, totalPages);
  const currentClamped: ParsedSearchParams = { ...sp, page: clampedPage };

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
            문제 관리
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            총 {total.toLocaleString("ko-KR")}건
          </p>
        </div>
      </header>

      <AdminQuestionsFilters current={currentClamped} options={options} />
      <AdminQuestionsTable rows={rows} />
      <AdminQuestionsPager current={currentClamped} totalPages={totalPages} />
    </div>
  );
}
