"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/hooks/useAuth";
import { useStats, type CategoryStat } from "../../lib/hooks/useStats";
import { useReview } from "../../lib/hooks/useReview";
import { useDueCountCtx } from "../../lib/context/DueCountContext";
import { findWeakestCategory } from "../../lib/stats/weakCategory";
import LoadingSpinner from "../../components/LoadingSpinner";
import DDayPlanWidget from "../../components/dashboard/DDayPlanWidget";
import type { AttemptRow } from "../../lib/supabase/types";
import type { WrongAnswerNote } from "../../lib/types";

const SUBJECT_COLORS = ["#1ea7bb", "#4A7FA8", "#C8895A", "#2D9F6B", "#9B6FD4"];
const WEEK_DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const FALLBACK_CATEGORIES: CategoryStat[] = [
  { category: "약리학",  attempts: 52, correct: 32, accuracy: 62 },
  { category: "내과학",  attempts: 68, correct: 54, accuracy: 79 },
  { category: "외과학",  attempts: 41, correct: 33, accuracy: 80 },
  { category: "생화학",  attempts: 89, correct: 68, accuracy: 76 },
  { category: "병리학",  attempts: 62, correct: 44, accuracy: 71 },
];

function getAccuracyTone(accuracy: number) {
  if (accuracy >= 80) return { color: "var(--correct)", dim: "var(--correct-dim)", label: "안정권" };
  if (accuracy >= 60) return { color: "var(--teal)", dim: "var(--teal-dim)", label: "보완 중" };
  if (accuracy >= 40) return { color: "var(--amber)", dim: "var(--amber-dim)", label: "주의" };
  return { color: "var(--wrong)", dim: "var(--wrong-dim)", label: "집중 필요" };
}

function formatRelativeDue(date: Date | null) {
  if (!date) return "대기 중인 복습 없음";
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "지금 복습 가능";

  const minutes = Math.ceil(diff / 60000);
  if (minutes < 60) return `${minutes}분 뒤`;

  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours}시간 뒤`;

  return `${Math.ceil(hours / 24)}일 뒤`;
}

function ReviewStatusCard({
  dueCount,
  allNotes,
}: {
  dueCount: number;
  allNotes: WrongAnswerNote[];
}) {
  const now = Date.now();
  const futureNotes = allNotes
    .filter((note) => note.nextReviewAt && new Date(note.nextReviewAt).getTime() > now)
    .sort((a, b) =>
      new Date(a.nextReviewAt ?? 0).getTime() - new Date(b.nextReviewAt ?? 0).getTime()
    );
  const nextDueAt = futureNotes[0]?.nextReviewAt ? new Date(futureNotes[0].nextReviewAt) : null;
  const reviewedCount = allNotes.filter((note) => (note.reviewCount ?? 0) > 0).length;
  const averageStage =
    allNotes.length > 0
      ? allNotes.reduce((sum, note) => sum + Math.min(note.reviewCount ?? 0, 4), 0) / allNotes.length
      : 0;
  const activeStage = dueCount > 0 ? 0 : Math.min(4, Math.round(averageStage));
  const completion = allNotes.length > 0 ? Math.round((reviewedCount / allNotes.length) * 100) : 0;
  const stages = ["저장", "D+1", "D+3", "D+7", "D+14"];

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderTop: "3px solid var(--teal)",
      borderRadius: 12,
      padding: 26,
      marginBottom: 22,
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.45fr) minmax(220px, 0.55fr)",
        gap: 24,
        alignItems: "center",
      }} className="dashboard-review-grid">
        <div>
          <span className="kvle-label" style={{ marginBottom: 10, fontSize: 13 }}>오늘 복습 위치</span>
          <h2 style={{
            fontFamily: "var(--font-serif)",
            fontSize: 24,
            fontWeight: 800,
            margin: "0 0 8px",
            color: "var(--text)",
            lineHeight: 1.22,
          }}>
            {dueCount > 0
              ? `${dueCount}문제가 지금 복습 지점에 와 있습니다`
              : allNotes.length > 0
                ? "지금은 다음 복습을 기다리는 중입니다"
                : "오답이 쌓이면 복습 위치가 표시됩니다"}
          </h2>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 22px", lineHeight: 1.55 }}>
            오답 노트 {allNotes.length}개 중 {reviewedCount}개가 1회 이상 복습되었습니다.
            {allNotes.length > 0 && ` 전체 복습 진행률은 ${completion}%입니다.`}
          </p>

          <div style={{ position: "relative", padding: "22px 4px 2px" }}>
            <div style={{
              position: "absolute",
              left: 12,
              right: 12,
              top: 36,
              height: 3,
              borderRadius: 999,
              background: "var(--surface-raised)",
            }} />
            <div style={{
              position: "absolute",
              left: 12,
              width: `calc((100% - 24px) * ${activeStage / 4})`,
              top: 36,
              height: 3,
              borderRadius: 999,
              background: "var(--teal)",
            }} />
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 0,
              position: "relative",
            }}>
              {stages.map((stage, index) => {
                const active = index <= activeStage;
                const current = index === activeStage;
                return (
                  <div key={stage} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
                    <div style={{
                      width: current ? 22 : 16,
                      height: current ? 22 : 16,
                      borderRadius: 999,
                      border: `2px solid ${active ? "var(--teal)" : "var(--border)"}`,
                      background: current ? "var(--teal)" : "var(--surface)",
                      boxShadow: current ? "0 0 0 5px var(--teal-dim)" : "none",
                    }} />
                    <span style={{
                      fontSize: 12,
                      fontWeight: current ? 800 : 700,
                      color: active ? "var(--text)" : "var(--text-faint)",
                      fontFamily: "var(--font-mono)",
                    }}>
                      {stage}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 18,
          background: "var(--surface-raised)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-faint)", marginBottom: 10 }}>
            다음 액션
          </div>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 30,
            fontWeight: 800,
            color: dueCount > 0 ? "var(--teal)" : "var(--text)",
            lineHeight: 1,
          }}>
            {dueCount > 0 ? dueCount : futureNotes.length}
          </div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.45 }}>
            {dueCount > 0 ? "지금 풀 복습 문제" : "예약된 복습 문제"}
          </div>
          <div style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px solid var(--border)",
            fontSize: 13,
            color: "var(--text)",
            fontWeight: 700,
          }}>
            {formatRelativeDue(nextDueAt)}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label, value, unit, accent, hint, valueColor, toneLabel,
}: {
  label: string;
  value: string | number;
  unit?: string;
  accent?: boolean;
  hint?: string;
  valueColor?: string;
  toneLabel?: string;
}) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderTop: accent ? "2px solid var(--teal)" : "1px solid var(--border)",
      borderRadius: 10,
      padding: "18px 18px",
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0,
        color: "var(--text-faint)", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 800,
          color: valueColor ?? (accent ? "var(--teal)" : "var(--text)"), lineHeight: 1,
        }}>{value}</span>
        {unit && (
          <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 700 }}>{unit}</span>
        )}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 8 }}>{hint}</div>
      )}
      {toneLabel && (
        <div style={{ fontSize: 12, color: valueColor ?? "var(--teal)", marginTop: 8, fontWeight: 800 }}>
          {toneLabel}
        </div>
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
  const { allNotes } = useReview();
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
  const accuracyTone = getAccuracyTone(accuracy);
  const weakestTone = getAccuracyTone(weakestAcc);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 64px" }}>
      <DDayPlanWidget />
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <span className="kvle-label" style={{ marginBottom: 10, fontSize: 13 }}>오늘의 학습</span>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 34,
          fontWeight: 800, margin: "8px 0 4px",
          letterSpacing: 0, color: "var(--text)", lineHeight: 1.15,
        }}>
          {delta > 0 ? (
            <>어제보다 <span style={{ color: "var(--teal)" }}>{delta}문제</span> 더 맞혔습니다</>
          ) : (
            <>오늘도 꾸준히 학습 중입니다</>
          )}
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 15, margin: 0 }}>
          {dueCount}개 문제가 복습을 기다립니다 · 연속 {streak}일째 학습 중
        </p>
      </div>

      {/* ── Stat strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 10, marginBottom: 22 }}>
        <StatCard label="총 시도" value={totalAttempts} />
        <StatCard
          label="정답률"
          value={accuracy}
          unit="%"
          accent
          valueColor={accuracyTone.color}
          toneLabel={accuracyTone.label}
        />
        <StatCard label="복습 대기" value={dueCount} />
        <StatCard
          label="최약 과목"
          value={weakestName}
          hint={`정답률 ${weakestAcc}% · ${weakestTone.label}`}
          valueColor={weakestTone.color}
        />
      </div>

      <ReviewStatusCard dueCount={dueCount} allNotes={allNotes} />

      {/* ── 2-col: subject bars + CTAs ── */}
      <div className="dashboard-2col" style={{ marginBottom: 22 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "baseline", marginBottom: 16 }}>
            <div>
              <span className="kvle-label" style={{ marginBottom: 8, fontSize: 13 }}>과목별 숙련도</span>
              <h3 style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 800,
                margin: "6px 0 0", color: "var(--text)" }}>현재 정답률</h3>
            </div>
            <span style={{ fontSize: 12, color: "var(--text-faint)",
              fontFamily: "var(--font-mono)" }}>목표 70% ─</span>
          </div>
          {stats && stats.byCategory.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 8 }}>
              아직 풀이 내역이 없습니다. 퀴즈를 시작해 보세요.
            </p>
          ) : (
            <SubjectBars byCategory={byCategory} />
          )}
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
              <span className="kvle-label" style={{ color: weakestTone.color, marginBottom: 4, fontSize: 12 }}>
                약점 집중
              </span>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 15,
                fontWeight: 800, marginTop: 4, color: weakestTone.color }}>
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
                color: "var(--text)" }}>랜덤 5문제</div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>
                전 과목 · 약 5분
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* ── Week at a glance ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, padding: 22 }}>
        <span className="kvle-label" style={{ marginBottom: 4, fontSize: 13 }}>최근 7일</span>
        <WeekChart recentAttempts={recentAttempts} />
      </div>
    </main>
  );
}
