import type { Database } from "../../../../lib/supabase/types";
import { ALL_CORRECTION_STATUSES } from "../../../../lib/admin/correction-labels";

type CorrectionStatus = Database["public"]["Enums"]["correction_status"];

export type ParsedCorrectionsSearchParams = {
  page:   number;
  status: CorrectionStatus | "all";
};

const VALID_STATUSES: ReadonlyArray<CorrectionStatus | "all"> = [
  ...ALL_CORRECTION_STATUSES,
  "all",
];

function pickOne(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function parseCorrectionsSearchParams(
  raw: { [k: string]: string | string[] | undefined },
): ParsedCorrectionsSearchParams {
  const status = pickOne(raw.status) as CorrectionStatus | "all";
  const pageRaw = parseInt(pickOne(raw.page), 10);
  return {
    page:   Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    status: VALID_STATUSES.includes(status) ? status : "proposed",
  };
}

export function buildCorrectionsSearchString(
  current: ParsedCorrectionsSearchParams,
  override: Partial<Record<keyof ParsedCorrectionsSearchParams, string | number | undefined>>,
): string {
  const merged: Record<string, string> = {};

  function set(k: string, v: string | number | undefined) {
    if (v === undefined || v === "") return;
    merged[k] = String(v);
  }

  set("page",   current.page);
  set("status", current.status);

  for (const [k, v] of Object.entries(override)) {
    if (v === undefined || v === null || v === "") {
      delete merged[k];
    } else {
      merged[k] = String(v);
    }
  }

  if (merged.page   === "1")        delete merged.page;
  if (merged.status === "proposed") delete merged.status;

  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) out.set(k, v);
  const s = out.toString();
  return s ? `?${s}` : "";
}
