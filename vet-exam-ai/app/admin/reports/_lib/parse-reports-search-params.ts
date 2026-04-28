import type { Database } from "../../../../lib/supabase/types";
import {
  ALL_REPORT_REASONS,
  ALL_REPORT_STATUSES,
} from "../../../../lib/admin/report-labels";

type ReportStatus = Database["public"]["Enums"]["report_status"];
type ReportReason = Database["public"]["Enums"]["report_reason"];

export type ParsedReportsSearchParams = {
  page:   number;
  status: ReportStatus | "all";
  reason: ReportReason | "all";
};

const VALID_STATUSES: ReadonlyArray<ReportStatus | "all"> = [
  ...ALL_REPORT_STATUSES,
  "all",
];
const VALID_REASONS: ReadonlyArray<ReportReason | "all"> = [
  ...ALL_REPORT_REASONS,
  "all",
];

function pickOne(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function parseReportsSearchParams(
  raw: { [k: string]: string | string[] | undefined },
): ParsedReportsSearchParams {
  const status = pickOne(raw.status) as ReportStatus | "all";
  const reason = pickOne(raw.reason) as ReportReason | "all";
  const pageRaw = parseInt(pickOne(raw.page), 10);
  return {
    page:   Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    status: VALID_STATUSES.includes(status) ? status : "pending",
    reason: VALID_REASONS.includes(reason)  ? reason : "all",
  };
}

export function buildReportsSearchString(
  current: ParsedReportsSearchParams,
  override: Partial<Record<keyof ParsedReportsSearchParams, string | number | undefined>>,
): string {
  const merged: Record<string, string> = {};

  function set(k: string, v: string | number | undefined) {
    if (v === undefined || v === "") return;
    merged[k] = String(v);
  }

  set("page",   current.page);
  set("status", current.status);
  set("reason", current.reason);

  for (const [k, v] of Object.entries(override)) {
    if (v === undefined || v === null || v === "") {
      delete merged[k];
    } else {
      merged[k] = String(v);
    }
  }

  if (merged.page   === "1")       delete merged.page;
  if (merged.status === "pending") delete merged.status;
  if (merged.reason === "all")     delete merged.reason;

  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) out.set(k, v);
  const s = out.toString();
  return s ? `?${s}` : "";
}
