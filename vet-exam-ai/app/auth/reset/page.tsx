import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Zap } from "lucide-react";
import ResetPasswordForm from "./_components/ResetPasswordForm";

export const metadata = { title: "비밀번호 재설정 — KVLE" };

export default function ResetPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400, marginBottom: "1.5rem" }}>
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium"
          style={{ color: "var(--text-muted)", textDecoration: "none" }}
        >
          <ArrowLeft size={14} />
          로그인으로
        </Link>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 400,
          padding: 6,
          borderRadius: "var(--radius-lg)",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div
          style={{
            borderRadius: "var(--radius-lg)",
            padding: "2rem",
            background: "var(--surface)",
            borderTop: "3px solid var(--teal)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.75rem" }}>
            <div
              style={{
                display: "inline-flex",
                padding: 4,
                borderRadius: "var(--radius-md)",
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
              KVLE
            </span>
          </div>

          <h1
            className="text-2xl font-bold tracking-tight mb-1"
            style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
          >
            새 비밀번호 설정
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            새로 사용할 비밀번호를 입력해주세요.
          </p>

          <Suspense fallback={<p style={{ color: "var(--text-muted)" }}>확인 중…</p>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
