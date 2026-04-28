import { requireAdmin } from "../../../lib/admin/guards";
import { createClient } from "../../../lib/supabase/server";
import type { Database } from "../../../lib/supabase/types";
import { parseUsersSearchParams } from "./_lib/parse-users-search-params";
import { UsersFilters } from "./_components/users-filters";
import { UsersTable, type UserRow } from "./_components/users-table";
import { UsersPager } from "./_components/users-pager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type BadgeType = Database["public"]["Enums"]["badge_type"];

async function loadPage(
  sp: ReturnType<typeof parseUsersSearchParams>,
  currentAdminId: string,
): Promise<{
  rows:           UserRow[];
  totalPages:     number;
  nicknameMap:    Record<string, string | null>;
  emailMap:       Record<string, string | null>;
  badgeMap:       Record<string, BadgeType[]>;
}> {
  const supabase = await createClient();

  // Step 1: optionally resolve q to user_id set (nickname OR email)
  let userIdFilter: string[] | null = null;
  if (sp.q) {
    const term = `%${sp.q}%`;

    const { data: nickMatches } = await supabase
      .from("user_profiles_public")
      .select("user_id")
      .ilike("nickname", term)
      .limit(200);
    const nickIds = (nickMatches ?? [])
      .map((m) => m.user_id as string | null)
      .filter((v): v is string => Boolean(v));

    let emailIds: string[] = [];
    if (sp.q.includes("@") || sp.q.length >= 3) {
      const { data: emailRows } = await supabase
        .schema("auth" as never)
        .from("users" as never)
        .select("id, email")
        .ilike("email" as never, term)
        .limit(200);
      // Fallback: if direct auth.users access denied (RLS), this returns empty.
      // We still get nickname results above.
      emailIds = ((emailRows as { id: string }[] | null) ?? [])
        .map((u) => u.id);
    }

    userIdFilter = Array.from(new Set([...nickIds, ...emailIds]));
    if (userIdFilter.length === 0) {
      return { rows: [], totalPages: 1, nicknameMap: {}, emailMap: {}, badgeMap: {} };
    }
  }

  // Step 2: profiles main query
  let q = supabase
    .from("profiles")
    .select("id, role, is_active, created_at", { count: "exact" });

  if (sp.role)               q = q.eq("role", sp.role);
  if (sp.active === "active")    q = q.eq("is_active", true);
  if (sp.active === "suspended") q = q.eq("is_active", false);
  if (userIdFilter)          q = q.in("id", userIdFilter);

  const offset = (sp.page - 1) * PAGE_SIZE;
  const { data, count } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const rows = (data ?? []) as UserRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const userIds = rows.map((r) => r.id);

  // Step 3: nickname lookup (separate query — embedded join trap PR #14)
  const nicknameMap: Record<string, string | null> = {};
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from("user_profiles_public")
      .select("user_id, nickname")
      .in("user_id", userIds);
    for (const p of profs ?? []) {
      if (p.user_id) nicknameMap[p.user_id] = p.nickname;
    }
  }

  // Step 4: badge lookup
  const badgeMap: Record<string, BadgeType[]> = {};
  if (userIds.length > 0) {
    const { data: bs } = await supabase
      .from("badges")
      .select("user_id, badge_type")
      .in("user_id", userIds);
    for (const b of bs ?? []) {
      if (!b.user_id) continue;
      const list = badgeMap[b.user_id] ?? [];
      list.push(b.badge_type as BadgeType);
      badgeMap[b.user_id] = list;
    }
  }

  // Step 5: email lookup via admin RPC (server-only)
  const emailMap: Record<string, string | null> = {};
  if (userIds.length > 0) {
    const { data: emails } = await supabase.rpc("list_admin_user_emails", {
      p_user_ids: userIds,
    });
    for (const e of emails ?? []) {
      emailMap[e.user_id] = e.email;
    }
  }

  return { rows, totalPages, nicknameMap, emailMap, badgeMap };
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { user } = await requireAdmin();
  const raw = await searchParams;
  const sp = parseUsersSearchParams(raw);

  const { rows, totalPages, nicknameMap, emailMap, badgeMap } = await loadPage(
    sp,
    user.id,
  );
  const clamped = { ...sp, page: Math.min(sp.page, totalPages) };

  const errorRaw = raw["error"];
  const errorMsg = Array.isArray(errorRaw) ? errorRaw[0] : errorRaw;

  const linkRaw  = raw["reset_link"];
  const resetLink = Array.isArray(linkRaw) ? linkRaw[0] : linkRaw;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          회원 관리
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          역할 변경 / 뱃지 부여 / 계정 정지는 모두 감사 로그에 기록됩니다.
        </p>
      </header>

      {errorMsg && (
        <div
          className="mb-4 rounded p-3 text-sm"
          style={{ background: "var(--danger-soft, #fde8e8)", color: "var(--danger, #c0392b)", border: "1px solid var(--danger, #c0392b)" }}
          role="alert"
        >
          {errorMsg}
        </div>
      )}

      {resetLink && (
        <div
          className="mb-4 rounded p-3 text-sm"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--teal)", color: "var(--text)" }}
          role="status"
        >
          <p className="mb-2 font-medium" style={{ color: "var(--teal)" }}>
            재설정 링크가 발급되었습니다 (1회용, 약 1시간 유효)
          </p>
          <code
            className="block break-all p-2 rounded text-xs kvle-mono"
            style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
          >
            {resetLink}
          </code>
          <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            이 링크를 사용자에게 전달하세요. 페이지를 떠나면 다시 볼 수 없습니다.
            발급 사실은 감사 로그에 기록됩니다.
          </p>
        </div>
      )}

      <UsersFilters current={clamped} />
      <UsersTable
        rows={rows}
        nicknameMap={nicknameMap}
        emailMap={emailMap}
        badgeMap={badgeMap}
        currentAdminId={user.id}
      />
      <UsersPager current={clamped} totalPages={totalPages} />
    </div>
  );
}
