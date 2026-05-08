import { requireAdmin } from "../../../lib/admin/guards";
import { createClient } from "../../../lib/supabase/server";
import { parseSignupAppsSearchParams } from "./_lib/parse-search-params";
import { QueueFilters } from "./_components/queue-filters";
import { QueuePager } from "./_components/queue-pager";
import { QueueTable } from "./_components/queue-table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParamsInput = Record<string, string | string[] | undefined> | undefined;

export default async function SignupApplicationsPage(
  { searchParams }: { searchParams: Promise<SearchParamsInput> },
) {
  await requireAdmin();
  const sp = parseSignupAppsSearchParams(await searchParams);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_signup_applications", {
    p_status:    sp.status,
    p_page:      sp.page,
    p_page_size: PAGE_SIZE,
  });

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>가입 신청</h1>
        <div style={{ color: "var(--wrong)" }}>큐 로딩 실패: {error.message}</div>
      </main>
    );
  }

  const rows = data ?? [];
  const totalCount = Number(rows[0]?.total_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, fontFamily: "var(--font-serif)" }}>
        가입 신청
      </h1>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>총 {totalCount}건</div>
      <QueueFilters active={sp.status} />
      <QueueTable rows={rows} />
      <QueuePager page={sp.page} totalPages={totalPages} />
    </main>
  );
}
