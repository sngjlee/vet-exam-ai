import { requireAdmin } from "../../../lib/admin/guards";
import { createClient } from "../../../lib/supabase/server";
import { parseIpBansSearchParams } from "./_lib/parse-ip-bans-search-params";
import { IpBanAddForm } from "./_components/ip-ban-add-form";
import { IpBanTable, type IpBanRow } from "./_components/ip-ban-table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

async function loadPage(
  sp: ReturnType<typeof parseIpBansSearchParams>,
): Promise<{
  rows:               IpBanRow[];
  creatorNicknameMap: Record<string, string | null>;
}> {
  const supabase = await createClient();

  let q = supabase
    .from("ip_bans")
    .select("id, cidr, reason, created_by, created_at");

  if (sp.q) {
    // PostgREST filter strings aren't parameterized — strip characters that
    // could break out of the ILIKE expression. Admin-only surface, but cheap
    // defense in depth.
    const safe = sp.q.replace(/[(),%*]/g, "");
    if (safe.length > 0) {
      q = q.or(`cidr::text.ilike.%${safe}%,reason.ilike.%${safe}%`);
    }
  }

  const offset = (sp.page - 1) * PAGE_SIZE;
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    return { rows: [], creatorNicknameMap: {} };
  }

  const rows: IpBanRow[] = (data ?? []).map((r) => ({
    id:         r.id as string,
    cidr:       String(r.cidr),
    reason:     r.reason as string,
    created_by: r.created_by as string,
    created_at: r.created_at as string,
  }));

  const creatorIds = Array.from(new Set(rows.map((r) => r.created_by)));
  const creatorNicknameMap: Record<string, string | null> = {};
  if (creatorIds.length > 0) {
    const { data: profs } = await supabase
      .from("user_profiles_public")
      .select("user_id, nickname")
      .in("user_id", creatorIds);
    for (const p of profs ?? []) {
      if (p.user_id) creatorNicknameMap[p.user_id] = p.nickname;
    }
  }

  return { rows, creatorNicknameMap };
}

export default async function AdminIpBansPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const raw = await searchParams;
  const sp  = parseIpBansSearchParams(raw);

  const { rows, creatorNicknameMap } = await loadPage(sp);

  const errorRaw = raw["error"];
  const errorMsg = Array.isArray(errorRaw) ? errorRaw[0] : errorRaw;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          IP 차단
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          가입/로그인 진입 시 차단됩니다 (정상 이용 중인 사용자에게는 영향 없음).
        </p>
      </header>

      <div
        className="mb-4 rounded p-3 text-xs"
        style={{ background: "var(--amber-dim)", border: "1px solid var(--amber)", color: "var(--text)" }}
        role="note"
      >
        ⚠️ 한국 KT/SKT/LGU+ 모바일 통신망은 다수 사용자가 동일 공인 IP를 공유합니다.
        단일 IP 영구 차단 시 무관한 사용자가 동시 차단될 수 있습니다.
        가능하면 CIDR /32 보다는 사용자 정지(/admin/users)를 우선 검토하세요.
      </div>

      {errorMsg && (
        <div
          className="mb-4 rounded p-3 text-sm"
          style={{ background: "var(--danger-soft, #fde8e8)", color: "var(--danger, #c0392b)", border: "1px solid var(--danger, #c0392b)" }}
          role="alert"
        >
          {errorMsg}
        </div>
      )}

      <IpBanAddForm />
      <IpBanTable rows={rows} creatorNicknameMap={creatorNicknameMap} />
    </div>
  );
}
