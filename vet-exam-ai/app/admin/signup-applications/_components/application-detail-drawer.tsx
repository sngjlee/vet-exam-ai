"use client";

import { useEffect, useState } from "react";
import type { Database } from "../../../../lib/supabase/types";
import { getProofImageUrlAction } from "../_actions";
import { ApproveForm } from "./approve-form";
import { RejectForm } from "./reject-form";
import { shortDate } from "../_lib/format-application";

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

export function ApplicationDetailDrawer({
  row,
  onClose,
}: {
  row: Row | null;
  onClose: () => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setImageUrl(null);
    if (row?.proof_kind === "image" && row.proof_storage_path) {
      getProofImageUrlAction(row.proof_storage_path).then((r) => {
        if (!cancelled) setImageUrl(r.url);
      });
    }
    return () => { cancelled = true; };
  }, [row?.proof_storage_path, row?.proof_kind]);

  if (!row) return null;

  return (
    <div
      role="dialog"
      style={{
        position: "fixed",
        top: 0, right: 0, bottom: 0,
        width: "min(560px, 100vw)",
        background: "var(--surface)",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
        padding: 20,
        overflowY: "auto",
        zIndex: 60,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-serif)" }}>
          {row.nickname ?? "(닉네임 없음)"}
        </h2>
        <button type="button" onClick={onClose} className="kvle-btn-secondary">닫기</button>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 8, fontSize: 13, marginBottom: 16 }}>
        <dt style={{ color: "var(--text-muted)" }}>이메일</dt>
        <dd>{row.email ?? "—"}</dd>
        <dt style={{ color: "var(--text-muted)" }}>대학</dt>
        <dd>{row.university}</dd>
        <dt style={{ color: "var(--text-muted)" }}>목표 회차</dt>
        <dd>{row.target_round}회</dd>
        <dt style={{ color: "var(--text-muted)" }}>제출</dt>
        <dd>{shortDate(row.submitted_at)}</dd>
        <dt style={{ color: "var(--text-muted)" }}>실명</dt>
        <dd>{row.real_name ?? "—"}</dd>
        <dt style={{ color: "var(--text-muted)" }}>학번</dt>
        <dd>{row.student_number ?? "—"}</dd>
        <dt style={{ color: "var(--text-muted)" }}>거부 횟수</dt>
        <dd>{row.rejection_count}</dd>
      </dl>

      {row.free_note && (
        <div style={{ background: "var(--surface-raised)", padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>자유 메모</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{row.free_note}</div>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>증빙</div>
        {row.proof_kind === "image" ? (
          imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="증빙 이미지" style={{ width: "100%", borderRadius: 8 }} />
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>이미지 로딩 중…</div>
          )
        ) : (
          <div style={{ background: "var(--surface-raised)", padding: 12, borderRadius: 8, fontSize: 13, whiteSpace: "pre-wrap" }}>
            {row.proof_text ?? "—"}
          </div>
        )}
      </div>

      {row.status === "pending_review" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ApproveForm userId={row.user_id} onDone={onClose} />
          <RejectForm  userId={row.user_id} onDone={onClose} />
        </div>
      )}

      {row.status === "approved" && (
        <div style={{ fontSize: 12, color: "var(--correct)", marginTop: 8 }}>이미 승인된 신청입니다.</div>
      )}
      {row.status === "rejected" && (
        <div style={{ fontSize: 12, color: "var(--wrong)", marginTop: 8 }}>거부된 신청입니다.</div>
      )}
    </div>
  );
}
