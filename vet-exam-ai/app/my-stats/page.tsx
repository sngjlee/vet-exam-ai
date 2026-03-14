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
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-neutral-400">Loading...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-xl border border-neutral-700 p-6">
          <h1 className="text-2xl font-semibold">My Stats</h1>
          <p className="mt-3 text-neutral-400">
            Sign in to see your quiz statistics.
          </p>
          <Link
            href="/auth/login"
            className="mt-4 inline-block rounded-lg border border-neutral-600 px-4 py-2 hover:border-neutral-400"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  if (!stats || stats.totalAttempts === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-xl border border-neutral-700 p-6">
          <h1 className="text-2xl font-semibold">My Stats</h1>
          <p className="mt-3 text-neutral-400">
            No attempts yet. Start a quiz session to see your stats here.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-white px-4 py-2 text-black"
          >
            Start Quiz
          </Link>
        </div>
      </main>
    );
  }

  const weakest = findWeakestCategory(stats.byCategory);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Stats</h1>
          <p className="mt-1 text-neutral-400">{user.email}</p>
        </div>
        {weakest && (
          <Link
            href="/practice/weakest"
            className="rounded-lg bg-white px-4 py-2 text-sm text-black"
          >
            Practice Weakest
          </Link>
        )}
      </div>

      {/* Overview */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Attempts" value={stats.totalAttempts} />
        <StatCard label="Total Correct" value={stats.totalCorrect} />
        <StatCard label="Accuracy" value={`${stats.accuracy}%`} />
        <StatCard label="Last 7 Days" value={stats.last7DaysAttempts} />
      </section>

      {/* Category breakdown */}
      <section>
        <h2 className="mb-3 text-xl font-semibold">By Category</h2>
        <div className="overflow-hidden rounded-xl border border-neutral-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-700 text-left text-neutral-400">
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 text-right font-medium">Attempts</th>
                <th className="px-4 py-2 text-right font-medium">Correct</th>
                <th className="px-4 py-2 text-right font-medium">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {stats.byCategory.map((row) => (
                <tr
                  key={row.category}
                  className="border-b border-neutral-800 last:border-0"
                >
                  <td className="px-4 py-2">{row.category}</td>
                  <td className="px-4 py-2 text-right">{row.attempts}</td>
                  <td className="px-4 py-2 text-right">{row.correct}</td>
                  <td className="px-4 py-2 text-right">{row.accuracy}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent attempts */}
      <section>
        <h2 className="mb-3 text-xl font-semibold">Recent Attempts</h2>
        <div className="space-y-2">
          {stats.recentAttempts.map((attempt) => (
            <div
              key={attempt.id}
              className="flex items-start justify-between rounded-lg border border-neutral-700 px-4 py-3 text-sm"
            >
              <div className="min-w-0 flex-1 pr-4">
                <p className="truncate font-medium">{attempt.question_id}</p>
                <p className="mt-0.5 text-neutral-400">{attempt.category}</p>
                <p className="mt-0.5 text-neutral-500">
                  {new Date(attempt.answered_at).toLocaleString()}
                </p>
              </div>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                  attempt.is_correct
                    ? "bg-green-900/40 text-green-400"
                    : "bg-red-900/40 text-red-400"
                }`}
              >
                {attempt.is_correct ? "Correct" : "Wrong"}
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
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-neutral-700 p-4">
      <p className="text-sm text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
