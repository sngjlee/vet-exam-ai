"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { validateNewPassword, passwordErrorMessage } from "../../../lib/profile/passwordPolicy";
import { changePassword } from "../_actions";

export default function PasswordChangeForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const policy = validateNewPassword(current, next, confirm);
    if (!policy.ok) {
      setError(passwordErrorMessage(policy.error));
      return;
    }

    setSubmitting(true);
    const result = await changePassword(current, next, confirm);
    setSubmitting(false);

    if (!result.ok) {
      const msg =
        result.error === "wrong_current_password"
          ? "현재 비밀번호가 일치하지 않습니다"
          : result.error === "auth_required"
          ? "로그인이 필요합니다"
          : result.error === "invalid_input"
          ? "입력값을 확인해주세요"
          : "변경에 실패했습니다. 잠시 후 다시 시도해주세요";
      setError(msg);
      return;
    }

    setCurrent("");
    setNext("");
    setConfirm("");
    setSuccess(true);
  }

  const inputType = showPw ? "text" : "password";

  return (
    <section
      style={{
        padding: 20,
        borderRadius: "var(--radius-md)",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        marginTop: 20,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 20,
          fontWeight: 700,
          marginTop: 0,
          marginBottom: 4,
          color: "var(--text)",
        }}
      >
        비밀번호 변경
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        보안을 위해 현재 비밀번호를 다시 입력해주세요.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label className="kvle-label mb-2">현재 비밀번호</label>
          <input
            type={inputType}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
            className="kvle-input"
          />
        </div>

        <div>
          <label className="kvle-label mb-2">새 비밀번호 (6자 이상)</label>
          <input
            type={inputType}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="kvle-input"
          />
        </div>

        <div>
          <label className="kvle-label mb-2">새 비밀번호 확인</label>
          <input
            type={inputType}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="kvle-input"
          />
        </div>

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
          {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
          비밀번호 표시
        </label>

        {error && (
          <div
            role="alert"
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              background: "var(--wrong-dim)",
              color: "var(--wrong)",
              border: "1px solid rgba(192,74,58,0.3)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              background: "var(--correct-dim)",
              color: "var(--correct)",
              border: "1px solid rgba(45,159,107,0.3)",
              fontSize: 13,
            }}
          >
            비밀번호가 변경되었습니다.
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="kvle-btn-primary"
          style={{ alignSelf: "flex-start", paddingInline: 24 }}
        >
          {submitting ? "변경 중…" : "비밀번호 변경"}
        </button>
      </form>
    </section>
  );
}
