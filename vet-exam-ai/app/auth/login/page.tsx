"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, ArrowLeft, Zap } from "lucide-react";
import { createClient } from "../../../lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage({ text: error.message, type: "error" });
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage({ text: error.message, type: "error" });
      } else if (data.session) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setMessage({
          text: "계정이 생성되었습니다. 이메일로 전송된 인증 링크를 확인해 주세요.",
          type: "success",
        });
      }
    }
    setLoading(false);
  }

  function toggleMode() {
    setMode((prev) => (prev === "signin" ? "signup" : "signin"));
    setMessage(null);
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background orbs */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            width: "600px",
            height: "600px",
            top: "-200px",
            right: "-150px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(30,167,187,0.05) 0%, transparent 65%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "500px",
            height: "500px",
            bottom: "-150px",
            left: "-150px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(74,127,168,0.04) 0%, transparent 65%)",
          }}
        />
      </div>

      {/* Back link */}
      <div style={{ position: "relative", width: "100%", maxWidth: "400px", marginBottom: "1.5rem" }}>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium"
          style={{ color: "var(--text-muted)", transition: "color 200ms" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
        >
          <ArrowLeft size={14} />
          돌아가기
        </Link>
      </div>

      {/* Card */}
      <div
        className="fade-in"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "400px",
          padding: "6px",
          borderRadius: "22px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div
          style={{
            borderRadius: "16px",
            padding: "2rem",
            background: "var(--surface)",
            borderTop: "3px solid var(--teal)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Inset glow */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(30,167,187,0.06) 0%, transparent 70%)",
            }}
          />

          <div style={{ position: "relative" }}>
            {/* Brand */}
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.75rem" }}
            >
              <div
                style={{
                  display: "inline-flex",
                  padding: "4px",
                  borderRadius: "10px",
                  background: "var(--teal-dim)",
                  border: "1px solid var(--teal-border)",
                }}
              >
                <Zap size={14} style={{ color: "var(--teal)" }} />
              </div>
              <span
                className="font-bold text-lg tracking-tight"
                style={{ fontFamily: "var(--font-serif)", color: "var(--teal)" }}
              >
                Vexa
              </span>
            </div>

            {/* Title */}
            <h1
              className="text-2xl font-bold tracking-tight mb-1"
              style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
            >
              {mode === "signin" ? "로그인" : "회원가입"}
            </h1>
            <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
              {mode === "signin"
                ? "학습 기록과 복습 큐에 접근하려면 로그인하세요."
                : "무료로 시작하세요. 카드 정보가 필요 없습니다."}
            </p>

            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div>
                <label className="kvle-label mb-2">이메일</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="kvle-input"
                />
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "0.5rem",
                  }}
                >
                  <label className="kvle-label">비밀번호</label>
                  <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                    6자 이상
                  </span>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    className="kvle-input"
                    style={{ paddingRight: "2.75rem" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    style={{
                      position: "absolute",
                      right: "0.75rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-faint)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px",
                      lineHeight: 0,
                    }}
                    aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {message && (
                <div
                  className="rounded-lg px-3 py-2.5 text-sm"
                  style={
                    message.type === "error"
                      ? {
                          background: "var(--wrong-dim)",
                          border: "1px solid rgba(192,74,58,0.3)",
                          color: "var(--wrong)",
                        }
                      : {
                          background: "var(--correct-dim)",
                          border: "1px solid rgba(45,159,107,0.3)",
                          color: "var(--correct)",
                        }
                  }
                >
                  {message.text}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="kvle-btn-primary w-full"
                style={{ marginTop: "0.25rem" }}
              >
                {loading ? "처리 중…" : mode === "signin" ? "로그인" : "회원가입"}
              </button>
            </form>

            <button
              onClick={toggleMode}
              className="mt-4 text-sm w-full text-center"
              style={{
                color: "var(--text-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
                transition: "color 200ms",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
              }}
            >
              {mode === "signin"
                ? "계정이 없으신가요? 회원가입"
                : "이미 계정이 있으신가요? 로그인"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
