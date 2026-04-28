import Link from "next/link";
import type { Database } from "../../../../lib/supabase/types";
import { AUDIT_ACTION_LABEL, TARGET_TYPE_LABEL } from "../_lib/parse-audit-search-params";

type AuditAction = Database["public"]["Enums"]["audit_action"];

export type AuditRow = {
  id: string;
  admin_id: string | null;
  action: AuditAction;
  target_type: string;
  target_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function summarizeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string {
  if (!after) return "—";
  const keys = Object.keys(after);
  if (keys.length === 0) return "—";

  const summarize = (v: unknown): string => {
    if (v === null || v === undefined) return "∅";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return String(v);
    if (typeof v === "string") return v.length > 24 ? `${v.slice(0, 24)}…` : v;
    if (Array.isArray(v)) return `[${v.length}]`;
    return "{…}";
  };

  const parts = keys.slice(0, 2).map((k) => {
    const b = before?.[k];
    const a = after[k];
    return `${k}: ${summarize(b)} → ${summarize(a)}`;
  });
  if (keys.length > 2) parts.push(`…+${keys.length - 2}`);
  return parts.join(", ");
}

export function AuditTable({
  rows,
  adminMap,
  questionMap,
}: {
  rows: AuditRow[];
  adminMap: Record<string, { nickname: string | null }>;
  questionMap: Record<string, { public_id: string | null }>;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg p-10 text-center text-sm"
        style={{
          background: "var(--surface-raised)",
          border: "1px solid var(--rule)",
          color: "var(--text-muted)",
        }}
      >
        감사 로그가 없습니다.
      </div>
    );
  }

  const cell: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 13,
    borderBottom: "1px solid var(--rule)",
    verticalAlign: "top",
  };
  const head: React.CSSProperties = {
    ...cell,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    background: "var(--surface-raised)",
    textAlign: "left",
    whiteSpace: "nowrap",
  };

  return (
    <div
      className="overflow-x-auto rounded-lg"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={head}>시각</th>
            <th style={head}>운영자</th>
            <th style={head}>액션</th>
            <th style={head}>대상</th>
            <th style={head}>변경 요약</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const adminLabel = r.admin_id
              ? adminMap[r.admin_id]?.nickname ?? `(닉네임 없음)`
              : "탈퇴한 운영자";

            const targetLabel = TARGET_TYPE_LABEL[r.target_type] ?? r.target_type;

            let targetCell: React.ReactNode = (
              <span style={{ color: "var(--text-muted)" }}>
                {targetLabel} · <span className="kvle-mono">{r.target_id.slice(0, 8)}…</span>
              </span>
            );
            if (r.target_type === "question") {
              const pub = questionMap[r.target_id]?.public_id;
              targetCell = (
                <Link
                  href={`/admin/questions/${encodeURIComponent(r.target_id)}`}
                  className="kvle-mono"
                  style={{ color: "var(--teal)", textDecoration: "none" }}
                >
                  {pub ?? r.target_id.slice(0, 12) + "…"}
                </Link>
              );
            }

            return (
              <tr key={r.id} style={{ background: "var(--bg)" }}>
                <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                  {formatTimestamp(r.created_at)}
                </td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>
                  {r.admin_id && adminMap[r.admin_id]?.nickname ? (
                    <Link
                      href={`/profile/${encodeURIComponent(adminMap[r.admin_id]!.nickname!)}`}
                      style={{ color: "var(--teal)", textDecoration: "none" }}
                    >
                      {adminLabel}
                    </Link>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>{adminLabel}</span>
                  )}
                </td>
                <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--text)" }}>
                  {AUDIT_ACTION_LABEL[r.action] ?? r.action}
                </td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>{targetCell}</td>
                <td style={{ ...cell, color: "var(--text-muted)" }}>
                  {summarizeDiff(r.before_state, r.after_state)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
