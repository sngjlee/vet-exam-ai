// app/my-stats/page.tsx
"use client";

import Link from "next/link";
import { useAuth } from "../../lib/hooks/useAuth";
import { useStats } from "../../lib/hooks/useStats";
import { findWeakestCategory } from "../../lib/stats/weakCategory";

export default function MyStatsPage() {
  const { user, loading: authLoading } = useAuth();
  const { stats, loading: statsLoading } = useStats(user?.id ?? null, authLoading);

  if (authLoading || statsLoading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p style={{ color: "var(--text-muted)" }}>로딩 중…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="kvle-card">
          <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
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
          <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
            나의 통계
          </h1>
          <p className="mb-4" style={{ color: "var(--text-muted)" }}>
            아직 풀이 내역이 없습니다. 퀴즈를 시작해 보세요.
          </p>
          <Link href="/" className="kvle-btn-primary text-sm">
            퀴즈 시작
          </Link>
        </div>
      </main>
    );
  }

  const weakest = findWeakestCategory(stats.byCategory);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
            나의 통계
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{user.email}</p>
        </div>
        {weakest && (
          <Link href="/practice/weakest" className="kvle-btn-primary text-sm">
            약점 집중 연습
          </Link>
        )}
      </div>

      {/* Overview */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="총 시도" value={stats.totalAttempts} />
        <StatCard label="총 정답" value={stats.totalCorrect} />
        <StatCard label="정답률" value={`${stats.accuracy}%`} />
        <StatCard label="최근 7일" value={stats.last7DaysAttempts} />
      </section>

      {/* Category breakdown */}
      <section>
        <h2 className="mb-3 text-xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
          과목별 통계
        </h2>
        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--rule)" }}>
                <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-muted)" }}>과목</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--text-muted)" }}>시도</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--text-muted)" }}>정답</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--text-muted)" }}>정답률</th>
              </tr>
            </thead>
            <tbody>
              {stats.byCategory.map((row) => (
                <tr
                  key={row.category}
                  style={{ borderTop: "1px solid var(--rule)" }}
                >
                  <td className="px-4 py-3" style={{ color: "var(--text)" }}>{row.category}</td>
                  <td className="px-4 py-3 text-right kvle-mono" style={{ color: "var(--text-muted)" }}>{row.attempts}</td>
                  <td className="px-4 py-3 text-right kvle-mono" style={{ color: "var(--text-muted)" }}>{row.correct}</td>
                  <td className="px-4 py-3 text-right kvle-mono" style={{ color: "var(--text-muted)" }}>{row.accuracy}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent attempts */}
      <section>
        <h2 className="mb-3 text-xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
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
                <p className="truncate font-medium" style={{ color: "var(--text)" }}>{attempt.question_id}</p>
                <p className="mt-0.5" style={{ color: "var(--text-muted)" }}>{attempt.category}</p>
                <p className="mt-0.5 kvle-mono text-xs" style={{ color: "var(--text-faint)" }}>
                  {new Date(attempt.answered_at).toLocaleString("ko-KR")}
                </p>
              </div>
              <span
                className="shrink-0 rounded px-2 py-0.5 text-xs font-medium kvle-mono"
                style={attempt.is_correct
                  ? { background: "var(--correct-dim)", color: "var(--correct)" }
                  : { background: "var(--wrong-dim)", color: "var(--wrong)" }
                }
              >
                {attempt.is_correct ? "정답" : "오답"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="kvle-card">
      <span className="kvle-label mb-2">{label}</span>
      <p className="mt-1 text-2xl font-bold kvle-mono" style={{ color: "var(--text)" }}>{value}</p>
    </div>
  );
}
