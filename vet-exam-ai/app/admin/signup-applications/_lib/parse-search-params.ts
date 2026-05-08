import type { Database } from "../../../../lib/supabase/types";

export type SignupStatus = Database["public"]["Enums"]["signup_status"];

export type SignupAppsSearchParams = {
  status: SignupStatus;
  page:   number;
};

const VALID_STATUS: SignupStatus[] = [
  "pending_review",
  "pending_proof",
  "approved",
  "rejected",
];

export function parseSignupAppsSearchParams(
  raw: Record<string, string | string[] | undefined> | undefined,
): SignupAppsSearchParams {
  const statusRaw = single(raw?.status);
  const status = (VALID_STATUS as string[]).includes(statusRaw ?? "")
    ? (statusRaw as SignupStatus)
    : "pending_review";

  const pageRaw = Number(single(raw?.page) ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  return { status, page };
}

function single(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
