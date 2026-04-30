import { TRIAGE_STATUS_ORDER, type ImageTriageStatus } from "../../../../lib/admin/triage-labels";

export type TriageFilterStatus = "unclassified" | "all" | ImageTriageStatus;

export type ParsedTriageSearchParams = {
  page:     number;
  category?: string;
  round?:    number;
  status:   TriageFilterStatus;
};

const STATUS_VALUES: TriageFilterStatus[] = ["unclassified", "all", ...TRIAGE_STATUS_ORDER];

function int(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function nonEmpty(v: string | undefined, max = 60): string | undefined {
  if (!v) return undefined;
  const trimmed = v.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseTriageSearchParams(
  raw: { [key: string]: string | string[] | undefined },
): ParsedTriageSearchParams {
  const get = (k: string): string | undefined => {
    const v = raw[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const page = Math.max(1, int(get("page")) ?? 1);
  const category = nonEmpty(get("category"));
  const round = int(get("round"));

  const statusRaw = get("status") as TriageFilterStatus | undefined;
  const status: TriageFilterStatus =
    statusRaw && STATUS_VALUES.includes(statusRaw) ? statusRaw : "unclassified";

  return { page, category, round, status };
}

export function buildTriageSearchString(
  current: ParsedTriageSearchParams,
  override: Partial<Record<keyof ParsedTriageSearchParams, string | number | undefined>>,
): string {
  const out = new URLSearchParams();
  const merged: Record<string, string> = {};

  function set(k: string, v: string | number | undefined) {
    if (v === undefined || v === "") return;
    merged[k] = String(v);
  }

  set("page", current.page);
  set("category", current.category);
  set("round", current.round);
  set("status", current.status);

  for (const [k, v] of Object.entries(override)) {
    if (v === undefined || v === null || v === "") {
      delete merged[k];
    } else {
      merged[k] = String(v);
    }
  }

  if (merged.page === "1") delete merged.page;
  if (merged.status === "unclassified") delete merged.status;

  for (const [k, v] of Object.entries(merged)) out.set(k, v);
  const s = out.toString();
  return s ? `?${s}` : "";
}
