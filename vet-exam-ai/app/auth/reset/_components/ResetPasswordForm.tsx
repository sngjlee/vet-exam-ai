"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "../../../../lib/supabase/client";
import { validateNewPassword, passwordErrorMessage } from "../../../../lib/profile/passwordPolicy";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<"loading" | "valid" | "invalid">("loading");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setSessionState(user ? "valid" : "invalid");
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // current is empty for reset flow — same_as_current check skips when current is falsy
    const policy = validateNewPassword("", next, confirm);
    if (!policy.ok) {
      setError(passwordErrorMessage(policy.error));
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error: e1 } = await supabase.auth.updateUser({ password: next });
    setSubmitting(false);

    if (e1) {
      setError(e1.message ?? "변경에 실패했습니다");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (sessionState === "loading") {
    return <p style={{ color: "var(--text-muted)" }}>확인 중…</p>;
  }

  if (sessionState === "invalid") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ color: "var(--wrong)", fontSize: 14, margin: 0 }}>
          유효하지 않거나 만료된 링크입니다.
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
          비밀번호 찾기를 다시 요청해주세요.
        </p>
        <Link
          href="/auth/login"
          className="kvle-btn-primary"
          style={{ alignSelf: "flex-start", textDecoration: "none", paddingInline: 24 }}
        >
          로그인 페이지로
        </Link>
      </div>
    );
  }

  const inputType = showPw ? "text" : "password";

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
        disabled={submitting}
        className="kvle-btn-primary"
        style={{ paddingInline: 24 }}
      >
        {submitting ? "저장 중…" : "비밀번호 변경"}
      </button>
    </form>
  );
}
