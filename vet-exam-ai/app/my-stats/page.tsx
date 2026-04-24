"use client";

import Link from "next/link";
import { useAuth } from "../../lib/hooks/useAuth";
import { useStats } from "../../lib/hooks/useStats";
import { findWeakestCategory } from "../../lib/stats/weakCategory";
import LoadingSpinner from "../../components/LoadingSpinner";
import { CheckCircle2, XCircle, TrendingDown } from "lucide-react";

function getAccuracyTone(accuracy: number) {
  if (accuracy >= 80) return { color: "var(--correct)", dim: "var(--correct-dim)", label: "안정권" };
  if (accuracy >= 60) return { color: "var(--teal)", dim: "var(--teal-dim)", label: "보완 중" };
  if (accuracy >= 40) return { color: "var(--amber)", dim: "var(--amber-dim)", label: "주의" };
  return { color: "var(--wrong)", dim: "var(--wrong-dim)", label: "집중 필요" };
}

export default function MyStatsPage() {
  const { user, loading: authLoading } = useAuth();
  const { stats, loading: statsLoading } = useStats(user?.id ?? null, authLoading);

  if (authLoading || statsLoading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <LoadingSpinner />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="kvle-card">
          <h1
            className="text-2xl font-bold mb-3"
            style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
          >
            나의 통계
          </h1>
          <p className="mb-4" style={{ color: "var(--text-muted)" }}>
            통계를 확인하려면 로그인하세요.
          </p>
          <Link href="/auth/login" className="kvle-btn-primary text-sm">
            로그인
          </Link>
        </div>
      </main>
    );
  }

  if (!stats || stats.totalAttempts === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="kvle-card">
          <h1
            className="text-2xl font-bold mb-3"
            style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
          >
            나의 통계
          </h1>
          <p className="mb-4" style={{ color: "var(--text-muted)" }}>
            아직 풀이 내역이 없습니다. 퀴즈를 시작해 보세요.
          </p>
          <Link href="/dashboard" className="kvle-btn-primary text-sm">
            퀴즈 시작
          </Link>
        </div>
      </main>
    );
  }

  const weakest = findWeakestCategory(stats.byCategory);
  const accuracyTone = getAccuracyTone(stats.accuracy);
  const weakestTone = weakest ? getAccuracyTone(weakest.accuracy) : null;

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="kvle-label mb-3 inline-block" style={{ fontSize: 13 }}>
            학습 분석
          </span>
          <h1
            className="font-bold"
            style={{
              fontFamily: "var(--font-serif)",
              color: "var(--text)",
              fontSize: 34,
              lineHeight: 1.15,
            }}
          >
            나의 통계
          </h1>
          <p className="mt-2" style={{ color: "var(--text-muted)", fontSize: 15 }}>
            {user.email}
          </p>
        </div>
        {weakest && (
          <Link href="/practice/weakest" className="kvle-btn-primary text-sm self-start">
            약점 집중 연습
          </Link>
        )}
      </div>

      {/* Overview — accuracy is visually featured */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="총 시도" value={stats.totalAttempts} featured={false} />
        <StatCard label="총 정답" value={stats.totalCorrect} featured={false} />
        <StatCard
          label="정답률"
          value={`${stats.accuracy}%`}
          featured={true}
          valueColor={accuracyTone.color}
          toneLabel={accuracyTone.label}
        />
        <StatCard label="최근 7일" value={stats.last7DaysAttempts} featured={false} />
      </section>

      {weakest && weakestTone && (
        <section
          className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]"
          style={{
            border: "1px solid var(--border)",
            borderLeft: `3px solid ${weakestTone.color}`,
            borderRadius: 12,
            background: "var(--surface)",
            padding: 22,
          }}
        >
          <div>
            <span
              className="kvle-label mb-2 inline-block"
              style={{ color: weakestTone.color, fontSize: 12 }}
            >
              우선 보완 과목
            </span>
            <h2
              style={{
                fontFamily: "var(--font-serif)",
                color: "var(--text)",
                fontSize: 22,
                fontWeight: 800,
                margin: 0,
              }}
            >
              {weakest.category}
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "8px 0 0" }}>
              정답률 {weakest.accuracy}% · {weakestTone.label}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                flex: 1,
                height: 10,
                borderRadius: 999,
                background: "var(--surface-raised)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${weakest.accuracy}%`,
                  height: "100%",
                  background: weakestTone.color,
                  borderRadius: 999,
                }}
              />
            </div>
            <span
              className="kvle-mono"
              style={{ color: weakestTone.color, fontSize: 22, fontWeight: 800 }}
            >
              {weakest.accuracy}%
            </span>
          </div>
        </section>
      )}

      {/* Category breakdown with progress bars */}
      <section>
        <h2
          className="mb-4 font-bold"
          style={{ fontFamily: "var(--font-serif)", color: "var(--text)", fontSize: 24 }}
        >
          과목별 통계
        </h2>
        <div
          className="overflow-hidden rounded-xl"
          style={{ border: "1px solid var(--border)" }}
        >
          <table className="w-full" style={{ fontSize: 15 }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--rule)",
                  background: "var(--surface-raised)",
                }}
              >
                <th
                  className="px-5 py-4 text-left font-bold"
                  style={{ color: "var(--text-muted)" }}
                >
                  과목
                </th>
                <th
                  className="px-5 py-4 text-right font-bold"
                  style={{ color: "var(--text-muted)" }}
                >
                  시도
                </th>
                <th
                  className="px-5 py-4 text-right font-bold"
                  style={{ color: "var(--text-muted)" }}
                >
                  정답
                </th>
                <th
                  className="px-5 py-4 text-left font-bold pl-6"
                  style={{ color: "var(--text-muted)" }}
                >
                  정답률
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.byCategory.map((row) => {
                const isWeakest = weakest?.category === row.category;
                const rowTone = getAccuracyTone(row.accuracy);
                const accuracyColor = rowTone.color;

                return (
                  <tr
                    key={row.category}
                    style={{
                      borderTop: "1px solid var(--rule)",
                      background: isWeakest ? "rgba(192,74,58,0.04)" : "transparent",
                      transition: "background 150ms",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = isWeakest
                        ? "rgba(192,74,58,0.08)"
                        : "var(--surface-raised)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = isWeakest
                        ? "rgba(192,74,58,0.04)"
                        : "transparent";
                    }}
                  >
                    <td className="px-5 py-4" style={{ color: "var(--text)", fontWeight: 700 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {isWeakest && (
                          <TrendingDown
                            size={13}
                            style={{ color: "var(--wrong)", flexShrink: 0 }}
                          />
                        )}
                        {row.category}
                      </div>
                    </td>
                    <td
                      className="px-5 py-4 text-right kvle-mono"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {row.attempts}
                    </td>
                    <td
                      className="px-5 py-4 text-right kvle-mono"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {row.correct}
                    </td>
                    <td className="px-5 py-4 pl-6">
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <div
                          style={{
                            flex: 1,
                            height: "5px",
                            borderRadius: "9999px",
                            background: "var(--surface-raised)",
                            overflow: "hidden",
                            minWidth: "60px",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${row.accuracy}%`,
                              background: accuracyColor,
                              borderRadius: "9999px",
                            }}
                          />
                        </div>
                        <span
                          className="kvle-mono text-xs font-semibold"
                          style={{
                            color: accuracyColor,
                            minWidth: "4.5ch",
                            textAlign: "right",
                            fontSize: 13,
                          }}
                        >
                          {row.accuracy}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent attempts — fixed: no UUID, show answer comparison */}
      <section>
        <h2
          className="mb-4 font-bold"
          style={{ fontFamily: "var(--font-serif)", color: "var(--text)", fontSize: 24 }}
        >
          최근 시도
        </h2>
        <div className="space-y-2">
          {stats.recentAttempts.map((attempt) => (
            <div
              key={attempt.id}
              className="flex items-start justify-between rounded-lg px-4 py-3 text-sm"
              style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
            >
              <div className="min-w-0 flex-1 pr-4">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  <span className="kvle-badge">{attempt.category}</span>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  정답:{" "}
                  <span style={{ color: "var(--correct)" }}>{attempt.correct_answer}</span>
                  {!attempt.is_correct && (
                    <>
                      {"  ·  "}선택:{" "}
                      <span style={{ color: "var(--wrong)" }}>{attempt.selected_answer}</span>
                    </>
                  )}
                </p>
                <p
                  className="mt-0.5 kvle-mono text-xs"
                  style={{ color: "var(--text-faint)" }}
                >
                  {new Date(attempt.answered_at).toLocaleString("ko-KR")}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium kvle-mono flex items-center gap-1"
                style={
                  attempt.is_correct
                    ? { background: "var(--correct-dim)", color: "var(--correct)" }
                    : { background: "var(--wrong-dim)", color: "var(--wrong)" }
                }
              >
                {attempt.is_correct ? (
                  <>
                    <CheckCircle2 size={10} />
                    정답
                  </>
                ) : (
                  <>
                    <XCircle size={10} />
                    오답
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  featured,
  valueColor,
  toneLabel,
}: {
  label: string;
  value: string | number;
  featured: boolean;
  valueColor?: string;
  toneLabel?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderTop: featured ? "3px solid var(--teal)" : "3px solid var(--border)",
        borderRadius: "12px",
        padding: "1.35rem",
      }}
    >
      <span
        className="kvle-label mb-2"
        style={{ color: featured ? "var(--teal)" : undefined, fontSize: 12 }}
      >
        {label}
      </span>
      <p
        className="mt-2 font-bold kvle-mono"
        style={{ color: valueColor ?? (featured ? "var(--teal)" : "var(--text)"), fontSize: 28, lineHeight: 1 }}
      >
        {value}
      </p>
      {toneLabel && (
        <p style={{ color: valueColor, fontSize: 12, fontWeight: 800, marginTop: 8 }}>
          {toneLabel}
        </p>
      )}
    </div>
  );
}
