"use client";

import { useState, useTransition } from "react";
import { rejectSignupAction } from "../_actions";

export function RejectForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError("거부 사유는 3자 이상 입력해 주세요.");
      return;
    }
    if (!window.confirm("이 가입 신청을 거부할까요? 거부 사유가 사용자에게 안내됩니다.")) {
      return;
    }
    startTransition(async () => {
      const r = await rejectSignupAction(userId, reason);
      if (!r.ok) setError(r.error);
      else { onDone(); }
    });
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className="kvle-label">거부 사유 *</label>
      <textarea
        className="kvle-input"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        maxLength={500}
        required
        placeholder="유저에게 알림으로 전달됩니다."
      />
      {error && <div style={{ color: "var(--wrong)", fontSize: 12 }}>{error}</div>}
      <button type="submit" disabled={pending} className="kvle-btn-secondary" style={{ background: "var(--wrong-dim)", color: "var(--wrong)" }}>
        {pending ? "처리 중…" : "거부"}
      </button>
    </form>
  );
}
