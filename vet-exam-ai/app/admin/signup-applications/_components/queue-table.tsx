"use client";

import { useState } from "react";
import type { Database } from "../../../../lib/supabase/types";
import { ApplicationDetailDrawer } from "./application-detail-drawer";
import { STATUS_LABEL, shortDate } from "../_lib/format-application";

type Row = {
  user_id:            string;
  email:              string | null;
  nickname:           string | null;
  status:             Database["public"]["Enums"]["signup_status"];
  university:         string;
  target_round:       number;
  real_name:          string | null;
  student_number:     string | null;
  free_note:          string | null;
  proof_kind:         Database["public"]["Enums"]["signup_proof_kind"];
  proof_storage_path: string | null;
  proof_text:         string | null;
  submitted_at:       string;
  rejection_count:    number;
};

export function QueueTable({ rows }: { rows: Row[] }) {
  const [selected, setSelected] = useState<Row | null>(null);

  if (rows.length === 0) {
    return <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 13 }}>비어 있어요.</div>;
  }

  return (
    <>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th style={th}>닉네임</th>
            <th style={th}>이메일</th>
            <th style={th}>대학</th>
            <th style={th}>회차</th>
            <th style={th}>증빙</th>
            <th style={th}>제출</th>
            <th style={th}>상태</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id} style={{ borderBottom: "1px solid var(--border-faint)" }}>
              <td style={td}>{r.nickname ?? "—"}</td>
              <td style={td}>{r.email ?? "—"}</td>
              <td style={td}>{r.university}</td>
              <td style={td}>{r.target_round}</td>
              <td style={td}>{r.proof_kind === "image" ? "이미지" : "텍스트"}</td>
              <td style={td}>{shortDate(r.submitted_at)}</td>
              <td style={td}>{STATUS_LABEL[r.status]}{r.rejection_count > 0 ? ` (×${r.rejection_count})` : ""}</td>
              <td style={td}>
                <button type="button" onClick={() => setSelected(r)} className="kvle-btn-secondary">
                  상세
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ApplicationDetailDrawer row={selected} onClose={() => setSelected(null)} />
    </>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 6px", fontWeight: 600, color: "var(--text-muted)" };
const td: React.CSSProperties = { padding: "8px 6px", verticalAlign: "middle" };
