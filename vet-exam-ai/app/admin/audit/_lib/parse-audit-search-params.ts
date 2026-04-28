import type { Database } from "../../../../lib/supabase/types";

type AuditAction = Database["public"]["Enums"]["audit_action"];

export const ALL_AUDIT_ACTIONS: ReadonlyArray<AuditAction> = [
  "comment_remove",
  "comment_unblind",
  "user_suspend",
  "user_unsuspend",
  "badge_grant",
  "badge_revoke",
  "correction_accept",
  "correction_reject",
  "report_uphold",
  "report_dismiss",
  "role_change",
  "question_update",
];

export const ALL_TARGET_TYPES: ReadonlyArray<string> = [
  "question",
  "comment",
  "user",
  "correction",
  "report",
  "badge",
];

export type ParsedAuditSearchParams = {
  page: number;
  action?: AuditAction;
  target_type?: string;
  admin?: string; // nickname fuzzy
};

const ADMIN_RE = /^[\p{L}\p{N}\s\-]+$/u;

function int(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function nonEmpty(v: string | undefined, max = 50): string | undefined {
  if (!v) return undefined;
  const trimmed = v.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseAuditSearchParams(
  raw: { [key: string]: string | string[] | undefined },
): ParsedAuditSearchParams {
  const get = (k: string): string | undefined => {
    const v = raw[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const pageRaw = int(get("page")) ?? 1;
  const page = Math.max(1, pageRaw);

  const actionRaw = get("action");
  const action: AuditAction | undefined =
    actionRaw && (ALL_AUDIT_ACTIONS as readonly string[]).includes(actionRaw)
      ? (actionRaw as AuditAction)
      : undefined;

  const ttRaw = get("target_type");
  const target_type: string | undefined =
    ttRaw && ALL_TARGET_TYPES.includes(ttRaw) ? ttRaw : undefined;

  const adminRaw = nonEmpty(get("admin"));
  const admin = adminRaw && ADMIN_RE.test(adminRaw) ? adminRaw : undefined;

  return { page, action, target_type, admin };
}

export function buildAuditSearchString(
  current: ParsedAuditSearchParams,
  override: Partial<Record<keyof ParsedAuditSearchParams, string | number | undefined>>,
): string {
  const merged: Record<string, string> = {};

  function set(k: string, v: string | number | undefined) {
    if (v === undefined || v === "") return;
    merged[k] = String(v);
  }

  set("page", current.page);
  set("action", current.action);
  set("target_type", current.target_type);
  set("admin", current.admin);

  for (const [k, v] of Object.entries(override)) {
    if (v === undefined || v === null || v === "") {
      delete merged[k];
    } else {
      merged[k] = String(v);
    }
  }

  if (merged.page === "1") delete merged.page;

  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) out.set(k, v);
  const s = out.toString();
  return s ? `?${s}` : "";
}

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  comment_remove:    "댓글 삭제",
  comment_unblind:   "댓글 블라인드 해제",
  user_suspend:      "회원 정지",
  user_unsuspend:    "회원 정지 해제",
  badge_grant:       "뱃지 부여",
  badge_revoke:      "뱃지 회수",
  correction_accept: "정정 채택",
  correction_reject: "정정 반려",
  report_uphold:     "신고 승인",
  report_dismiss:    "신고 기각",
  role_change:       "역할 변경",
  question_update:   "문제 수정",
};

export const TARGET_TYPE_LABEL: Record<string, string> = {
  question:    "문제",
  comment:     "댓글",
  user:        "회원",
  correction:  "정정",
  report:      "신고",
  badge:       "뱃지",
};
