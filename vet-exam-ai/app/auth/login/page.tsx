"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
      } else {
        router.push("/");
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(error.message);
      } else if (data.session) {
        router.push("/");
        router.refresh();
      } else {
        setMessage("계정이 생성되었습니다. 이메일로 전송된 인증 링크를 확인해 주세요.");
      }
    }

    setLoading(false);
  }

  function toggleMode() {
    setMode((prev) => (prev === "signin" ? "signup" : "signin"));
    setMessage(null);
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          ← 돌아가기
        </Link>
      </div>

      <div className="kvle-card">
        <h1
          className="mb-6 text-2xl font-bold"
          style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
        >
          {mode === "signin" ? "로그인" : "회원가입"}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="kvle-label mb-2">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="kvle-input"
            />
          </div>

          <div>
            <label className="kvle-label mb-2">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="kvle-input"
            />
          </div>

          {message && (
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
              }}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="kvle-btn-primary w-full"
          >
            {loading ? "처리 중…" : mode === "signin" ? "로그인" : "회원가입"}
          </button>
        </form>

        <button
          onClick={toggleMode}
          className="mt-4 text-sm w-full text-center"
          style={{ color: "var(--text-muted)" }}
        >
          {mode === "signin"
            ? "계정이 없으신가요? 회원가입"
            : "이미 계정이 있으신가요? 로그인"}
        </button>
      </div>
    </main>
  );
}
