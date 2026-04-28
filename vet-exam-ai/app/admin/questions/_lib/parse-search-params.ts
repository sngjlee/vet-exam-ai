export type SortKey = "recent" | "round" | "kvle";

export type ParsedSearchParams = {
  page: number;
  sort: SortKey;
  round?: number;
  year?: number;
  session?: number;
  subject?: string;
  category?: string;
  is_active?: boolean;
  q?: string;
};

const SORT_KEYS = new Set<SortKey>(["recent", "round", "kvle"]);

const Q_RE = /^[\p{L}\p{N}\s\-]+$/u;

function int(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function nonEmpty(v: string | undefined, max = 100): string | undefined {
  if (!v) return undefined;
  const trimmed = v.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseAdminQuestionsSearchParams(
  raw: { [key: string]: string | string[] | undefined }
): ParsedSearchParams {
  const get = (k: string): string | undefined => {
    const v = raw[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const pageRaw = int(get("page")) ?? 1;
  const page = Math.max(1, pageRaw);

  const sortRaw = get("sort") as SortKey | undefined;
  const sort: SortKey = sortRaw && SORT_KEYS.has(sortRaw) ? sortRaw : "recent";

  const round = int(get("round"));
  const year = int(get("year"));
  const session = int(get("session"));
  const subject = nonEmpty(get("subject"));
  const category = nonEmpty(get("category"));

  const isActiveRaw = get("is_active");
  let is_active: boolean | undefined;
  if (isActiveRaw === "active") is_active = true;
  else if (isActiveRaw === "inactive") is_active = false;

  const qRaw = nonEmpty(get("q"));
  const q = qRaw && Q_RE.test(qRaw) ? qRaw : undefined;

  return { page, sort, round, year, session, subject, category, is_active, q };
}

export function buildSearchString(
  current: ParsedSearchParams,
  override: Partial<Record<keyof ParsedSearchParams, string | number | boolean | undefined>>
): string {
  const out = new URLSearchParams();
  const merged: Record<string, string> = {};

  function set(k: string, v: string | number | boolean | undefined) {
    if (v === undefined || v === "" ) return;
    merged[k] = String(v);
  }

  set("page", current.page);
  set("sort", current.sort);
  set("round", current.round);
  set("year", current.year);
  set("session", current.session);
  set("subject", current.subject);
  set("category", current.category);
  if (current.is_active === true) merged.is_active = "active";
  else if (current.is_active === false) merged.is_active = "inactive";
  set("q", current.q);

  for (const [k, v] of Object.entries(override)) {
    if (v === undefined || v === null || v === "") {
      delete merged[k];
    } else if (k === "is_active") {
      merged[k] = v === true ? "active" : v === false ? "inactive" : String(v);
    } else {
      merged[k] = String(v);
    }
  }

  if (merged.page === "1") delete merged.page;
  if (merged.sort === "recent") delete merged.sort;

  for (const [k, v] of Object.entries(merged)) out.set(k, v);
  const s = out.toString();
  return s ? `?${s}` : "";
}
