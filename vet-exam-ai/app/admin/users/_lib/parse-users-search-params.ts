import type { UserRole } from "../../../../lib/admin/user-labels";
import { ALL_USER_ROLES } from "../../../../lib/admin/user-labels";

export type ActiveFilter = "all" | "active" | "suspended";

export type ParsedUsersSearchParams = {
  q:      string | null;
  role:   UserRole | null;
  active: ActiveFilter;
  page:   number;
};

function pickString(
  raw: { [k: string]: string | string[] | undefined },
  key: string,
): string | null {
  const v = raw[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export function parseUsersSearchParams(
  raw: { [k: string]: string | string[] | undefined },
): ParsedUsersSearchParams {
  const qRaw = pickString(raw, "q");
  const q = qRaw && qRaw.trim().length > 0 ? qRaw.trim() : null;

  const roleRaw = pickString(raw, "role");
  const role = (ALL_USER_ROLES as string[]).includes(roleRaw ?? "")
    ? (roleRaw as UserRole)
    : null;

  const activeRaw = pickString(raw, "active");
  const active: ActiveFilter =
    activeRaw === "active" || activeRaw === "suspended" ? activeRaw : "all";

  const pageRaw = pickString(raw, "page");
  const pageNum = pageRaw ? parseInt(pageRaw, 10) : 1;
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;

  return { q, role, active, page };
}

export function buildUsersSearchString(
  current: ParsedUsersSearchParams,
  override: Partial<ParsedUsersSearchParams> = {},
): string {
  const merged: ParsedUsersSearchParams = { ...current, ...override };
  const params = new URLSearchParams();
  if (merged.q)            params.set("q", merged.q);
  if (merged.role)         params.set("role", merged.role);
  if (merged.active !== "all") params.set("active", merged.active);
  if (merged.page > 1)     params.set("page", String(merged.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}
