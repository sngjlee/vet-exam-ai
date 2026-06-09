"use client";

import { useState, useTransition } from "react";
import { approveSignupAction } from "../_actions";

export function ApproveForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm("이 가입 신청을 승인할까요? 사용자가 즉시 커뮤니티 쓰기 권한을 사용할 수 있습니다.")) {
      return;
    }
    startTransition(async () => {
      const r = await approveSignupAction(userId, note.trim() || null);
      if (!r.ok) setError(r.error);
      else { onDone(); }
    });
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className="kvle-label">메모 (선택)</label>
      <input
        className="kvle-input"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="감사 로그에 남는 운영자 메모"
      />
      {error && <div style={{ color: "var(--wrong)", fontSize: 12 }}>{error}</div>}
      <button type="submit" disabled={pending} className="kvle-btn-primary">
        {pending ? "처리 중…" : "승인"}
      </button>
    </form>
  );
}
