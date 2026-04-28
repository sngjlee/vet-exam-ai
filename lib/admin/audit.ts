import { createClient } from "../supabase/server";
import type { Database } from "../supabase/types";

type AuditAction = Database["public"]["Enums"]["audit_action"];

export async function logAdminAction(args: {
  action: AuditAction;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  note?: string | null;
}): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_admin_action", {
    p_action:      args.action,
    p_target_type: args.targetType,
    p_target_id:   args.targetId,
    p_before:      args.before ?? null,
    p_after:       args.after ?? null,
    p_note:        args.note ?? null,
  });
  if (error) {
    console.error("[audit] log_admin_action failed", error);
    return null;
  }
  return (data as string) ?? null;
}

export function diffJson<T extends Record<string, unknown>>(
  before: T,
  after: T,
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  const keys = new Set<keyof T>([
    ...(Object.keys(before) as (keyof T)[]),
    ...(Object.keys(after) as (keyof T)[]),
  ]);
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k];
      a[k] = after[k];
    }
  }
  return { before: b, after: a };
}
