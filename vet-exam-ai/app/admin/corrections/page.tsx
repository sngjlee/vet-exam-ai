import { createClient } from "../../../lib/supabase/server";
import { parseCorrectionsSearchParams } from "./_lib/parse-corrections-search-params";
import { CorrectionsFilters } from "./_components/corrections-filters";
import {
  CorrectionsTable,
  type CorrectionRow,
  type QuestionLite,
} from "./_components/corrections-table";
import { CorrectionsPager } from "./_components/corrections-pager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

async function loadPage(sp: ReturnType<typeof parseCorrectionsSearchParams>): Promise<{
  rows:        CorrectionRow[];
  totalPages:  number;
  questionMap: Record<string, QuestionLite>;
  nicknameMap: Record<string, string | null>;
}> {
  const supabase = await createClient();

  // Step 1: corrections page (created_at ASC, oldest pending first)
  let q = supabase
    .from("question_corrections")
    .select("*", { count: "exact" });
  if (sp.status !== "all") q = q.eq("status", sp.status);

  const offset = (sp.page - 1) * PAGE_SIZE;
  const { data, count } = await q
    .order("created_at", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  const rows = (data ?? []).map((r) => ({
    id:              r.id as string,
    question_id:     r.question_id as string,
    proposed_by:     (r.proposed_by as string | null) ?? null,
    proposed_change: (r.proposed_change as Record<string, unknown>) ?? {},
    status:          r.status as string,
    resolved_by:     (r.resolved_by as string | null) ?? null,
    resolved_at:     (r.resolved_at as string | null) ?? null,
    resolution_note: (r.resolution_note as string | null) ?? null,
    created_at:      r.created_at as string,
  })) as CorrectionRow[];

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  if (rows.length === 0) {
    return { rows, totalPages, questionMap: {}, nicknameMap: {} };
  }

  // Step 2: questions lookup
  const qIds = Array.from(new Set(rows.map((r) => r.question_id)));
  const { data: qs } = await supabase
    .from("questions")
    .select("id, public_id, question, answer, category, subject")
    .in("id", qIds);

  const questionMap: Record<string, QuestionLite> = {};
  for (const item of qs ?? []) {
    questionMap[item.id as string] = {
      id:        item.id as string,
      public_id: (item.public_id as string | null) ?? null,
      question:  (item.question as string) ?? "",
      answer:    (item.answer as string) ?? "",
      category:  (item.category as string | null) ?? null,
      subject:   (item.subject as string | null) ?? null,
    };
  }

  // Step 3: nickname map (proposer ∪ resolver)
  const userIds = new Set<string>();
  for (const r of rows) {
    if (r.proposed_by) userIds.add(r.proposed_by);
    if (r.resolved_by) userIds.add(r.resolved_by);
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

  return { rows, totalPages, questionMap, nicknameMap };
}

const ERROR_LABELS: Record<string, string> = {
  missing_target:     "대상 정정이 지정되지 않았습니다",
  invalid_resolution: "올바른 처리 결과를 선택하세요",
  db_error:           "저장 중 오류가 발생했습니다. 다시 시도하세요",
};

export default async function AdminCorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = await searchParams;
  const sp  = parseCorrectionsSearchParams(raw);

  const { rows, totalPages, questionMap, nicknameMap } = await loadPage(sp);
  const clamped = { ...sp, page: Math.min(sp.page, totalPages) };

  const errorRaw = Array.isArray(raw.error) ? raw.error[0] : raw.error;
  const errorMsg = errorRaw && ERROR_LABELS[errorRaw] ? ERROR_LABELS[errorRaw] : null;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          정정 큐
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          사용자 정정 제안을 검토하고 수락/거절합니다. 수락은 별도로 직접 수정해야 적용됩니다.
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

      <CorrectionsFilters current={clamped} />
      <CorrectionsTable rows={rows} questionMap={questionMap} nicknameMap={nicknameMap} />
      <CorrectionsPager current={clamped} totalPages={totalPages} />
    </div>
  );
}
