import Link from "next/link";
import SessionSetup from "../../../components/SessionSetup";
import { StudyModeShortcuts } from "./StudyModeShortcuts";
import { MiniMockEntry } from "./MiniMockEntry";
import { MiniMockHistory } from "./MiniMockHistory";
import type { MiniMockHistoryItem, SessionStartPayload } from "./quiz-history";
import type { QuestionMeta } from "../../../lib/hooks/useQuestionMeta";
import type { User } from "@supabase/supabase-js";
import { Sparkles, Clock, ArrowRight, CheckCircle2 } from "lucide-react";

type Props = {
  meta: QuestionMeta | null;
  metaLoading: boolean;
  metaError: string | null;
  sessionLoading: boolean;
  sessionError: string | null;
  user: User | null;
  authLoading: boolean;
  dueCount: number;
  miniMockHistory: MiniMockHistoryItem[];
  onStart: (payload?: SessionStartPayload) => void;
};

export function QuizSetupView({
  meta, metaLoading, metaError, sessionLoading, sessionError,
  user, authLoading, dueCount, miniMockHistory, onStart,
}: Props) {
  return (
    <>
      {/* ━━━━ 대시보드 헤더 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        className="fade-in"
        style={{ position: "relative", marginBottom: "2.5rem", animationDelay: "0ms" }}
      >
        <span className="kvle-label mb-3 inline-block">퀴즈 세션</span>
        <h1
          className="text-3xl md:text-4xl font-bold tracking-tight"
          style={{ color: "var(--text)" }}
        >
          KVLE로{" "}
          <span style={{ color: "var(--teal)" }}>체계적으로 준비하세요</span>
        </h1>
      </div>

      {/* ━━━━ 로그인 대시보드 카드 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <StudyModeShortcuts />
      <MiniMockEntry
        loading={metaLoading || sessionLoading}
        totalCount={meta?.total ?? 0}
        onStart={onStart}
      />
      <MiniMockHistory history={miniMockHistory} />

      {!authLoading && user && (
        <div
          style={{ position: "relative", marginBottom: "2.5rem" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-5"
        >

          {/* ── 세션 시작 카드 — Double-Bezel ─────────────────────────────── */}
          <div
            className="fade-in md:col-span-2"
            style={{
              padding: "6px",
              borderRadius: "var(--radius-lg)",
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              animationDelay: "60ms",
            }}
          >
            <div
              style={{
                borderRadius: "var(--radius-lg)",
                padding: "1.5rem",
                position: "relative",
                overflow: "hidden",
                height: "100%",
                background: "var(--surface)",
                boxShadow: "inset 0 1px 0 rgba(28,45,64,0.04)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* inset glow */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background:
                    "radial-gradient(ellipse 80% 60% at 100% 0%, rgba(30,167,187,0.07) 0%, transparent 60%)",
                }}
              />
              <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                    <Sparkles size={15} style={{ color: "var(--teal)" }} />
                    <span className="kvle-label">스마트 학습</span>
                  </div>
                  <h2
                    className="text-lg font-bold tracking-tight"
                    style={{ color: "var(--text)", marginBottom: "0.375rem" }}
                  >
                    오늘의 학습을 시작하세요
                  </h2>
                  <p
                    className="text-sm"
                    style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}
                  >
                    과목과 문제 수를 골라 KVLE 유형 문제를 풀어보세요.
                  </p>
                </div>
                <SessionSetup
                  categories={meta?.categories ?? []}
                  countsByCategory={meta?.countsByCategory ?? {}}
                  totalCount={meta?.total ?? 0}
                  loading={metaLoading || sessionLoading}
                  error={
                    metaError || sessionError
                      ? "문제를 불러오지 못했습니다"
                      : null
                  }
                  onStart={onStart}
                />
              </div>
            </div>
          </div>

          {/* ── 복습 큐 카드 — Double-Bezel ───────────────────────────────── */}
          <div
            className="fade-in"
            style={{
              padding: "6px",
              borderRadius: "var(--radius-lg)",
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              animationDelay: "120ms",
            }}
          >
            <div
              style={{
                borderRadius: "var(--radius-lg)",
                padding: "1.5rem",
                position: "relative",
                overflow: "hidden",
                height: "100%",
                background: "var(--surface)",
                borderTop: dueCount > 0 ? "3px solid var(--blue)" : "3px solid var(--border)",
                boxShadow: "inset 0 1px 0 rgba(28,45,64,0.04)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background:
                    "radial-gradient(ellipse 80% 60% at 100% 100%, rgba(74,127,168,0.06) 0%, transparent 60%)",
                }}
              />
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                  <Clock size={15} style={{ color: "var(--blue)" }} />
                  <span className="kvle-label" style={{ color: "var(--blue)" }}>오늘의 복습</span>
                </div>
                {dueCount > 0 ? (
                  <div>
                    <div
                      className="text-5xl font-black kvle-mono tracking-tight"
                      style={{ color: "var(--text)", marginBottom: "0.25rem" }}
                    >
                      {dueCount}
                    </div>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                      개 문제 복습 대기중
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      padding: "1.5rem 0",
                    }}
                  >
                    <CheckCircle2 size={36} style={{ color: "var(--text-faint)", marginBottom: "0.75rem" }} />
                    <p className="font-medium text-sm" style={{ color: "var(--text-muted)" }}>
                      오늘 복습 완료
                    </p>
                  </div>
                )}
              </div>
              {dueCount > 0 && (
                /* Button-in-Button pill — blue accent */
                <Link
                  href="/review"
                  className="active:scale-[0.98]"
                  style={{
                    position: "relative",
                    marginTop: "1.5rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderRadius: "var(--radius-full)",
                    paddingLeft: "1rem",
                    paddingRight: "0.375rem",
                    paddingTop: "0.5rem",
                    paddingBottom: "0.5rem",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    background: "var(--blue-dim)",
                    color: "var(--blue)",
                    border: "1px solid rgba(74,127,168,0.25)",
                    transition: "background 300ms cubic-bezier(0.32,0.72,0,1)",
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background = "rgba(74,127,168,0.18)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background = "var(--blue-dim)";
                  }}
                >
                  복습 시작
                  <span
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      background: "rgba(74,127,168,0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <ArrowRight size={13} style={{ color: "var(--blue)" }} />
                  </span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ━━━━ 비회원 카드 — Double-Bezel ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {(!user || authLoading) && (
        <div
          className="fade-in"
          style={{
            marginBottom: "2.5rem",
            padding: "6px",
            borderRadius: "var(--radius-lg)",
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            animationDelay: "60ms",
          }}
        >
          <div
            className="grid grid-cols-1 gap-6"
            style={{
              borderRadius: "var(--radius-lg)",
              padding: "1.5rem",
              position: "relative",
              overflow: "hidden",
              background: "var(--surface)",
              boxShadow: "inset 0 1px 0 rgba(28,45,64,0.04)",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background:
                  "radial-gradient(ellipse 60% 80% at 0% 50%, rgba(30,167,187,0.05) 0%, transparent 60%)",
              }}
            />
            <div style={{ position: "relative" }}>
              <h2
                className="text-base font-bold tracking-tight"
                style={{ color: "var(--text)", marginBottom: "0.375rem" }}
              >
                비회원으로 연습하기
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                문제를 풀어볼 수 있지만, 학습 기록 저장과 간격 반복 학습은 로그인이 필요합니다.
              </p>
            </div>
            <SessionSetup
              categories={meta?.categories ?? []}
              countsByCategory={meta?.countsByCategory ?? {}}
              totalCount={meta?.total ?? 0}
              loading={metaLoading || sessionLoading}
              error={
                metaError || sessionError
                  ? "문제를 불러오지 못했습니다"
                  : null
              }
              onStart={onStart}
            />
          </div>
        </div>
      )}
    </>
  );
}
