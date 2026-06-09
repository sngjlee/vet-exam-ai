"use client";

import { useState } from "react";
import { deleteAccount } from "../_actions";

type DeleteError =
  | "auth_required"
  | "email_mismatch"
  | "wrong_current_password"
  | "delete_failed";

const ERROR_COPY: Record<DeleteError, string> = {
  auth_required: "로그인이 필요합니다.",
  email_mismatch: "이메일이 현재 계정과 일치하지 않습니다.",
  wrong_current_password: "현재 비밀번호가 일치하지 않습니다.",
  delete_failed: "계정 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.",
};

export default function AccountDeletionForm({ email }: { email: string }) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    confirmed &&
    confirmEmail.trim().toLowerCase() === email.toLowerCase() &&
    password.length > 0 &&
    !submitting;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    const result = await deleteAccount(password, confirmEmail);
    setSubmitting(false);

    if (!result.ok) {
      setError(ERROR_COPY[result.error]);
      return;
    }

    window.location.assign("/auth/login");
  }

  return (
    <section
      style={{
        padding: 20,
        borderRadius: 12,
        background: "var(--surface)",
        border: "1px solid rgba(192,74,58,0.35)",
        marginTop: 20,
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 20,
          fontWeight: 700,
          marginTop: 0,
          marginBottom: 4,
          color: "var(--wrong)",
        }}
      >
        계정 삭제
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        계정 식별 정보와 학습 데이터는 삭제되고, 커뮤니티 글은 작성자 정보가 분리된 상태로 보존될 수 있습니다.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label className="kvle-label mb-2">현재 이메일</label>
          <input
            type="email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder={email}
            required
            autoComplete="email"
            className="kvle-input"
          />
        </div>

        <div>
          <label className="kvle-label mb-2">현재 비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="kvle-input"
          />
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            color: "var(--text-muted)",
            fontSize: 13,
            lineHeight: 1.5,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          삭제 후 계정과 학습 데이터 복구가 어렵다는 점을 확인했습니다.
        </label>

        {error && (
          <div
            role="alert"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: "var(--wrong-dim)",
              color: "var(--wrong)",
              border: "1px solid rgba(192,74,58,0.3)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="kvle-btn-danger"
          style={{ alignSelf: "flex-start", paddingInline: 24 }}
        >
          {submitting ? "삭제 중..." : "계정 삭제"}
        </button>
      </form>
    </section>
  );
}
