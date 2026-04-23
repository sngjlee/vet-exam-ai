"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/hooks/useAuth";
import { useStats, type CategoryStat } from "../../lib/hooks/useStats";
import { useDueCountCtx } from "../../lib/context/DueCountContext";
import { findWeakestCategory } from "../../lib/stats/weakCategory";
import LoadingSpinner from "../../components/LoadingSpinner";
import type { AttemptRow } from "../../lib/supabase/types";

const FORGETTING_CURVE = Array.from({ length: 15 }, (_, i) =>
  Math.round(100 * Math.pow(0.5, i / 7))
);

const SUBJECT_COLORS = ["#1ea7bb", "#4A7FA8", "#C8895A", "#2D9F6B", "#9B6FD4"];
const WEEK_DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const FALLBACK_CATEGORIES: CategoryStat[] = [
  { category: "약리학",  attempts: 52, correct: 32, accuracy: 62 },
  { category: "내과학",  attempts: 68, correct: 54, accuracy: 79 },
  { category: "외과학",  attempts: 41, correct: 33, accuracy: 80 },
  { category: "생화학",  attempts: 89, correct: 68, accuracy: 76 },
  { category: "병리학",  attempts: 62, correct: 44, accuracy: 71 },
];

function MemoryCurve() {
  const pad = { t: 24, r: 32, b: 28, l: 38 };
  const W = 560, H = 180;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const days = 14;
  const x = (d: number) => pad.l + (d / days) * innerW;
  const y = (r: number) => pad.t + (1 - r / 100) * innerH;

  const nakedPath = FORGETTING_CURVE
    .map((r, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(r)}`)
    .join(" ");

  const reviews = [0, 1, 3, 7];
  const segments: [number, number][][] = [];
  for (let i = 0; i < reviews.length; i++) {
    const start = reviews[i];
    const end = reviews[i + 1] ?? 14;
    const span = end - start;
    const pts: [number, number][] = [];
    for (let t = 0; t <= span; t += 0.5) {
      const half = 1 + i * 2.5;
      const r = 100 * Math.pow(0.5, t / half) * 0.4 + 60 * (i / 3);
      pts.push([start + t, Math.min(100, Math.max(20, r))]);
    }
    segments.push(pts);
  }
  const srsPath = segments
    .map((seg) =>
      seg.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p[0])} ${y(p[1])}`).join(" ")
    )
    .join(" ");

  const yGridTicks = [100, 75, 50, 25];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      <defs>
        <linearGradient id="srsFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--teal)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--teal)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {yGridTicks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)}
            stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          <text x={pad.l - 8} y={y(t) + 3} textAnchor="end" fontSize={9}
            fill="var(--text-faint)" fontFamily="var(--font-mono)">{t}</text>
        </g>
      ))}
      {[0, 1, 3, 7, 14].map((d) => (
        <text key={d} x={x(d)} y={H - 10} textAnchor="middle" fontSize={9.5}
          fill="var(--text-faint)" fontFamily="var(--font-mono)">D+{d}</text>
      ))}

      <path d={nakedPath} fill="none" stroke="var(--wrong)"
        strokeWidth={1.3} strokeDasharray="3 3" opacity={0.55} />

      {segments.map((seg, i) => {
        const segPath = seg
          .map((p, j) => `${j === 0 ? "M" : "L"} ${x(p[0])} ${y(p[1])}`)
          .join(" ");
        const last = seg[seg.length - 1];
        const first = seg[0];
        const fillD = `${segPath} L ${x(last[0])} ${y(0)} L ${x(first[0])} ${y(0)} Z`;
        return <path key={i} d={fillD} fill="url(#srsFill)" />;
      })}

      <path d={srsPath} fill="none" stroke="var(--teal)"
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {[1, 3, 7].map((d) => (
        <g key={d}>
          <line x1={x(d)} x2={x(d)} y1={pad.t} y2={H - pad.b}
            stroke="var(--teal)" strokeWidth={1} strokeDasharray="2 3" opacity={0.4} />
          <circle cx={x(d)} cy={y(100)} r={5}
            fill="var(--bg)" stroke="var(--teal)" strokeWidth={2} />
          <circle cx={x(d)} cy={y(100)} r={2} fill="var(--teal)" />
        </g>
      ))}

      <g transform={`translate(${pad.l + 2}, ${pad.t - 8})`}>
        <circle cx={4} cy={0} r={3} fill="var(--teal)" />
        <text x={12} y={3} fontSize={10} fill="var(--text-muted)"
          fontFamily="var(--font-sans)" fontWeight={500}>복습 후 기억</text>
        <line x1={100} x2={114} y1={0} y2={0}
          stroke="var(--wrong)" strokeDasharray="3 3" opacity={0.6} />
        <text x={120} y={3} fontSize={10} fill="var(--text-muted)"
          fontFamily="var(--font-sans)" fontWeight={500}>그냥 두면</text>
      </g>
    </svg>
  );
}

function StatCard({
  label, value, unit, accent, hint,
}: {
  label: string;
  value: string | number;
  unit?: string;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderTop: accent ? "2px solid var(--teal)" : "1px solid var(--border)",
      borderRadius: 10,
      padding: "14px 16px",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
        color: "var(--text-faint)", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700,
          color: accent ? "var(--teal)" : "var(--text)", lineHeight: 1,
        }}>{value}</span>
        {unit && (
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{unit}</span>
        )}
      </div>
      {hint && (
        <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 6 }}>{hint}</div>
      )}
    </div>
  );
}

function SubjectBars({ byCategory }: { byCategory: CategoryStat[] }) {
  const top5 = byCategory.slice(0, 5);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {top5.map((s, idx) => {
        const weak = s.accuracy < 70;
        const color = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
        return (
          <div key={s.category}>
            <div style={{ display: "flex", alignItems: "baseline",
              justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: 999,
                  background: color, display: "inline-block", flexShrink: 0,
                }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                  {s.category}
                </span>
                {weak && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: "var(--wrong)",
                    letterSpacing: "0.1em", padding: "2px 6px", borderRadius: 4,
                    background: "var(--wrong-dim)",
                  }}>약점</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6,
                fontFamily: "var(--font-mono)" }}>
                <span style={{ fontSize: 13, fontWeight: 700,
                  color: weak ? "var(--wrong)" : "var(--text)" }}>{s.accuracy}%</span>
                <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                  {s.correct}/{s.attempts}
                </span>
              </div>
            </div>
            <div style={{ height: 6, background: "var(--surface-raised)",
              borderRadius: 999, overflow: "hidden", position: "relative" }}>
              <div style={{ height: "100%", width: `${s.accuracy}%`,
                background: color, borderRadius: 999 }} />
              <div style={{ position: "absolute", left: "70%", top: -2,
                bottom: -2, width: 1, background: "rgba(255,255,255,0.12)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekChart({ recentAttempts }: { recentAttempts: AttemptRow[] }) {
  const today = new Date();
  const weekData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toDateString();
    const dayAttempts = recentAttempts.filter(
      (a) => new Date(a.answered_at).toDateString() === dateStr
    );
    const correct = dayAttempts.filter((a) => a.is_correct).length;
    return {
      d: WEEK_DAYS[d.getDay()],
      v: dayAttempts.length,
      r: dayAttempts.length > 0 ? correct / dayAttempts.length : 0,
    };
  });
  const maxV = Math.max(...weekData.map((d) => d.v), 1);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
      gap: 10, marginTop: 14 }}>
      {weekData.map((day, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column",
          alignItems: "center", gap: 8 }}>
          <div style={{ height: 80, width: "100%", display: "flex",
            alignItems: "flex-end", justifyContent: "center" }}>
            <div style={{
              width: "60%",
              height: `${(day.v / maxV) * 100}%`,
              minHeight: day.v > 0 ? 4 : 0,
              background: "var(--teal)",
              opacity: 0.25 + day.r * 0.6,
              borderRadius: "4px 4px 0 0",
            }} />
          </div>
          <div style={{ fontSize: 10, color: "var(--text-faint)", fontWeight: 600 }}>
            {day.d}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11,
            color: "var(--text-muted)", fontWeight: 600 }}>{day.v}</div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { stats, loading: statsLoading } = useStats(user?.id ?? null, authLoading);
  const dueCount = useDueCountCtx();

  const weakest = useMemo(
    () => (stats ? findWeakestCategory(stats.byCategory) : null),
    [stats]
  );

  const { delta, streak, byCategory, recentAttempts } = useMemo(() => {
    if (!stats) {
      return {
        delta: 0,
        streak: 0,
        byCategory: FALLBACK_CATEGORIES,
        recentAttempts: [] as AttemptRow[],
      };
    }
    const attempts = stats.recentAttempts;
    const todayStr = new Date().toDateString();
    const yestStr = new Date(Date.now() - 86400000).toDateString();
    const todayCount = attempts.filter(
      (a) => new Date(a.answered_at).toDateString() === todayStr && a.is_correct
    ).length;
    const yestCount = attempts.filter(
      (a) => new Date(a.answered_at).toDateString() === yestStr && a.is_correct
    ).length;

    const activeDays = new Set(
      attempts.map((a) => new Date(a.answered_at).toDateString())
    );
    let streakCount = 0;
    let d = new Date();
    while (activeDays.has(d.toDateString())) {
      streakCount++;
      d = new Date(d.getTime() - 86400000);
    }

    return {
      delta: todayCount - yestCount,
      streak: streakCount,
      byCategory: stats.byCategory.length > 0 ? stats.byCategory : FALLBACK_CATEGORIES,
      recentAttempts: attempts,
    };
  }, [stats]);

  if (authLoading || statsLoading) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
        <LoadingSpinner />
      </main>
    );
  }

  if (!user) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
        <div className="kvle-card" style={{ textAlign: "center", padding: "48px 32px" }}>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 700,
            marginBottom: 12, color: "var(--text)" }}>
            학습을 시작하려면 로그인하세요
          </h1>
          <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>
            통계, 복습 일정, 약점 분석이 제공됩니다.
          </p>
          <Link href="/auth/login" className="kvle-btn-primary">로그인</Link>
        </div>
      </main>
    );
  }

  const totalAttempts = stats?.totalAttempts ?? 0;
  const accuracy = stats?.accuracy ?? 0;
  const weakestName = weakest?.category ?? "약리학";
  const weakestAcc = weakest?.accuracy ?? 62;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 64px" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <span className="kvle-label" style={{ marginBottom: 8 }}>오늘의 학습</span>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: "clamp(22px, 4vw, 30px)",
          fontWeight: 800, margin: "8px 0 4px",
          letterSpacing: "-0.02em", color: "var(--text)", lineHeight: 1.15,
        }}>
          {delta > 0 ? (
            <>어제보다 <span style={{ color: "var(--teal)" }}>{delta}문제</span> 더 맞혔습니다</>
          ) : (
            <>오늘도 꾸준히 학습 중입니다</>
          )}
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
          {dueCount}개 문제가 복습을 기다립니다 · 연속 {streak}일째 학습 중
        </p>
      </div>

      {/* ── Stat strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 10, marginBottom: 22 }}>
        <StatCard label="총 시도" value={totalAttempts} />
        <StatCard label="정답률" value={accuracy} unit="%" accent />
        <StatCard label="복습 대기" value={dueCount} />
        <StatCard label="최약 과목" value={weakestName} hint={`정답률 ${weakestAcc}%`} />
      </div>

      {/* ── Memory curve hero ── */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderTop: "3px solid var(--teal)", borderRadius: 12,
        padding: 24, marginBottom: 22,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
          <div>
            <span className="kvle-label" style={{ marginBottom: 6 }}>망각 곡선 · 14일</span>
            <h2 style={{
              fontFamily: "var(--font-serif)",
              fontSize: "clamp(15px, 2.5vw, 20px)",
              fontWeight: 700, margin: "6px 0 2px", color: "var(--text)",
            }}>
              KVLE는 잊기 직전에 문제를 다시 보여드립니다
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, maxWidth: 420 }}>
              D+1, D+3, D+7 세 번의 복습으로 기억 유지율이 84%까지 상승합니다.
            </p>
          </div>
          <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.12em" }}>
              현재 유지율
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "var(--teal)", lineHeight: 1 }}>
              84<span style={{ fontSize: 14 }}>%</span>
            </div>
          </div>
        </div>
        <MemoryCurve />
      </div>

      {/* ── 2-col: subject bars + CTAs ── */}
      <div className="dashboard-2col" style={{ marginBottom: 22 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "baseline", marginBottom: 16 }}>
            <div>
              <span className="kvle-label" style={{ marginBottom: 6 }}>과목별 숙련도</span>
              <h3 style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700,
                margin: "6px 0 0", color: "var(--text)" }}>현재 정답률</h3>
            </div>
            <span style={{ fontSize: 10, color: "var(--text-faint)",
              fontFamily: "var(--font-mono)" }}>목표 70% ─</span>
          </div>
          <SubjectBars byCategory={byCategory} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Link href="/review" style={{
            background: "linear-gradient(135deg, var(--teal) 0%, #188ba0 100%)",
            color: "#061218", borderRadius: 12, padding: "16px 18px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: 14, textDecoration: "none",
            boxShadow: "0 8px 20px rgba(30,167,187,0.18), inset 0 1px 0 rgba(255,255,255,0.2)",
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em",
                opacity: 0.75 }}>지금 할 것</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 17,
                fontWeight: 800, marginTop: 4, lineHeight: 1.2 }}>
                복습 {dueCount}문제 →
              </div>
              <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>
                약 {Math.max(1, Math.ceil(dueCount * 1.2))}분 소요
              </div>
            </div>
          </Link>

          <Link href="/practice/weakest" style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 12, padding: "14px 16px", color: "var(--text)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: 14, textDecoration: "none",
          }}>
            <div>
              <span className="kvle-label" style={{ color: "var(--wrong)", marginBottom: 4 }}>
                약점 집중
              </span>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 15,
                fontWeight: 700, marginTop: 4 }}>
                {weakestName} 집중 연습
              </div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>
                정답률 {weakestAcc}% · 가장 약한 과목
              </div>
            </div>
          </Link>

          <Link href="/quiz" style={{
            background: "transparent", border: "1px solid var(--border)",
            borderRadius: 12, padding: "14px 16px", color: "var(--text-muted)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: 14, textDecoration: "none",
          }}>
            <div>
              <span className="kvle-label" style={{ color: "var(--text-faint)", marginBottom: 4 }}>
                랜덤 세션
              </span>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4,
                color: "var(--text)" }}>새 문제 30개</div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>
                전 과목 · 약 20분
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* ── Week at a glance ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, padding: 22 }}>
        <span className="kvle-label" style={{ marginBottom: 4 }}>최근 7일</span>
        <WeekChart recentAttempts={recentAttempts} />
      </div>
    </main>
  );
}
