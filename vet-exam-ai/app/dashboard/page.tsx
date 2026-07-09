"use client";

import { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, CirclePlay, HelpCircle, MessageSquare, RotateCcw, X } from "lucide-react";
import { useAuth } from "../../lib/hooks/useAuth";
import { useStats, type CategoryStat, type DayBucket } from "../../lib/hooks/useStats";
import { useReview } from "../../lib/hooks/useReview";
import { useDueCountCtx } from "../../lib/context/DueCountContext";
import { findWeakestCategory } from "../../lib/stats/weakCategory";
import LoadingSpinner from "../../components/LoadingSpinner";
import DDayPlanWidget from "../../components/dashboard/DDayPlanWidget";
import { AnnouncementBannerClient } from "../../components/dashboard/AnnouncementBannerClient";
import { createClient } from "../../lib/supabase/client";
import type { WrongAnswerNote } from "../../lib/types";

const SUBJECT_COLORS = ["#1ea7bb", "#4A7FA8", "#C8895A", "#2D9F6B", "#9B6FD4"];
const WEEK_DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const ONBOARDING_BANNER_KEY = "kvle.dashboard.onboarding.dismissed.v1";

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
  const [now] = useState(() => Date.now());
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
      borderRadius: "var(--radius-lg)",
      padding: "var(--space-6)",
      marginBottom: "var(--space-5)",
      boxShadow: "var(--shadow-sm)",
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
              borderRadius: "var(--radius-full)",
              background: "var(--surface-raised)",
            }} />
            <div style={{
              position: "absolute",
              left: 12,
              width: `calc((100% - 24px) * ${activeStage / 4})`,
              top: 36,
              height: 3,
              borderRadius: "var(--radius-full)",
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
                      borderRadius: "var(--radius-full)",
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
          borderRadius: "var(--radius-md)",
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
      borderRadius: "var(--radius-md)",
      padding: "var(--space-4)",
      boxShadow: "var(--shadow-sm)",
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
                  width: 7, height: 7, borderRadius: "var(--radius-full)",
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
              borderRadius: "var(--radius-full)", overflow: "hidden", position: "relative" }}>
              <div style={{ height: "100%", width: `${s.accuracy}%`,
                background: color, borderRadius: "var(--radius-full)" }} />
              <div style={{ position: "absolute", left: "70%", top: -2,
                bottom: -2, width: 1, background: "rgba(255,255,255,0.12)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekChart({ weekly }: { weekly: DayBucket[] }) {
  const weekData = weekly.map((bucket) => {
    // Parse the KST date via local Y/M/D parts so the weekday label is stable
    // regardless of the viewer's timezone.
    const [y, m, d] = bucket.date.split("-").map(Number);
    return {
      d: WEEK_DAYS[new Date(y, m - 1, d).getDay()],
      v: bucket.total,
      r: bucket.total > 0 ? bucket.correct / bucket.total : 0,
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

function AnnouncementBannerWrapper() {
  const [post, setPost] = useState<{ id: string; title: string; is_pinned: boolean } | null>(null);

  useEffect(() => {
    const fetchAnnouncement = async () => {
      try {
        const supabase = createClient();
        const { data: posts } = await supabase
          .from("board_posts")
          .select("id,title,is_pinned,created_at")
          .eq("kind", "announcement")
          .eq("visibility", "visible")
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1);

        if (posts && posts.length > 0) {
          setPost(posts[0]);
        }
      } catch {
        // ignore fetch errors
      }
    };

    fetchAnnouncement();
  }, []);

  if (!post) return null;

  return (
    <AnnouncementBannerClient
      postId={post.id}
      title={post.title}
      isPinned={post.is_pinned}
    />
  );
}

function FirstLoginGuideBanner({ userId }: { userId: string }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const storageKey = `${ONBOARDING_BANNER_KEY}:${userId}`;
    setIsVisible(window.localStorage.getItem(storageKey) !== "true");
  }, [userId]);

  const markSeen = () => {
    window.localStorage.setItem(`${ONBOARDING_BANNER_KEY}:${userId}`, "true");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--teal-border)",
        borderLeft: "3px solid var(--teal)",
        borderRadius: "var(--radius-md)",
        padding: "16px 16px 16px 18px",
        marginBottom: 16,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 14,
        alignItems: "start",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span
            style={{
              width: 28,
              height: 28,
              display: "grid",
              placeItems: "center",
              borderRadius: "var(--radius-sm)",
              color: "var(--teal)",
              background: "var(--teal-dim)",
            }}
          >
            <HelpCircle size={16} />
          </span>
          <strong style={{ color: "var(--text)", fontSize: 15 }}>
            처음 오셨다면 3분만 길을 잡고 시작하세요
          </strong>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.55, margin: 0 }}>
          해설보기, 오답노트, 댓글 노하우 순서로 보면 메뉴를 전부 익히지 않아도 바로 학습을 시작할 수 있습니다.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <Link
            href="/guide"
            onClick={markSeen}
            className="kvle-btn-primary"
            style={{ minHeight: 34, padding: "7px 12px", fontSize: 12, textDecoration: "none" }}
          >
            가이드 보기
          </Link>
          <button
            type="button"
            onClick={markSeen}
            className="kvle-btn-ghost"
            style={{ minHeight: 34, padding: "7px 12px", fontSize: 12 }}
          >
            오늘은 바로 시작
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={markSeen}
        aria-label="처음 이용 안내 닫기"
        style={{
          width: 34,
          height: 34,
          display: "grid",
          placeItems: "center",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: "var(--surface-raised)",
          color: "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        <X size={16} />
      </button>
    </section>
  );
}

function StudyFirstPanel({
  dueCount,
  weakestName,
}: {
  dueCount: number;
  weakestName: string;
}) {
  const actions = [
    {
      href: "/questions",
      icon: BookOpen,
      label: "해설부터 공부하기",
      meta: "기출 문항, 공식 해설, 댓글 노하우",
      tone: "var(--teal)",
      background: "var(--teal-dim)",
      border: "var(--teal-border)",
    },
    {
      href: "/comments",
      icon: MessageSquare,
      label: "댓글 노하우 보기",
      meta: "암기법과 정정 제안을 모아보기",
      tone: "var(--blue)",
      background: "var(--blue-dim)",
      border: "rgba(74,127,168,0.28)",
    },
    {
      href: dueCount > 0 ? "/review" : "/wrong-notes",
      icon: RotateCcw,
      label: dueCount > 0 ? `오답 복습 ${dueCount}문제` : "오답노트 보기",
      meta: "틀린 문제는 다시 만나는 흐름으로",
      tone: "var(--amber)",
      background: "var(--amber-dim)",
      border: "rgba(200,137,90,0.28)",
    },
    {
      href: "/quiz",
      icon: CirclePlay,
      label: "문제풀기는 가볍게",
      meta: `${weakestName} 포함, 필요한 만큼만`,
      tone: "var(--text-muted)",
      background: "var(--surface-raised)",
      border: "var(--border)",
    },
  ];

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-5)",
        marginBottom: "var(--space-5)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span className="kvle-label" style={{ fontSize: 12 }}>
            오늘의 학습 입구
          </span>
          <Link
            href="/guide"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              minHeight: 34,
              padding: "6px 10px",
              borderRadius: "var(--radius-full)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              background: "var(--surface-raised)",
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            <HelpCircle size={14} />
            처음 이용 가이드
          </Link>
        </div>
        <h1
          style={{
            color: "var(--text)",
            fontFamily: "var(--font-serif)",
            fontSize: 26,
            fontWeight: 800,
            lineHeight: 1.22,
            margin: "8px 0 6px",
          }}
        >
          먼저 해설을 보고, 댓글로 외우는 법을 잡으세요
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.55, margin: 0 }}>
          문제 자체보다 해설과 수험생 노하우를 앞에 둡니다.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        {actions.map(({ href, icon: Icon, label, meta, tone, background, border }) => (
          <Link
            key={href + label}
            href={href}
            style={{
              minHeight: 108,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 12,
              padding: 16,
              borderRadius: "var(--radius-md)",
              border: `1px solid ${border}`,
              background,
              color: "var(--text)",
              textDecoration: "none",
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                display: "grid",
                placeItems: "center",
                borderRadius: "var(--radius-sm)",
                background: "rgba(255,255,255,0.05)",
                color: tone,
              }}
            >
              <Icon size={17} />
            </span>
            <span>
              <strong style={{ display: "block", fontSize: 14, marginBottom: 4 }}>
                {label}
              </strong>
              <span style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.35 }}>
                {meta}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TodayStarterChecklist({
  dueCount,
  todayAttemptCount,
  weakestName,
  hasWrongNotes,
}: {
  dueCount: number;
  todayAttemptCount: number;
  weakestName: string;
  hasWrongNotes: boolean;
}) {
  const dailyTarget = 5;
  const tasks = [
    {
      href: dueCount > 0 ? "/review" : "/wrong-notes",
      icon: RotateCcw,
      title: dueCount > 0 ? `복습 ${dueCount}문제 처리` : "복습 대기 확인",
      detail: dueCount > 0 ? "오늘 밀리기 전에 먼저 처리" : hasWrongNotes ? "다음 복습 예약을 기다리는 중" : "오답이 쌓이면 자동으로 올라옵니다",
      status: dueCount > 0 ? `${dueCount}개 남음` : "완료",
      done: dueCount === 0,
      tone: dueCount > 0 ? "var(--amber)" : "var(--correct)",
    },
    {
      href: "/quiz",
      icon: CirclePlay,
      title: "오늘 5문제 풀기",
      detail: "짧게 풀고 오답만 복습 흐름에 넣기",
      status: `${Math.min(todayAttemptCount, dailyTarget)}/${dailyTarget}`,
      done: todayAttemptCount >= dailyTarget,
      tone: todayAttemptCount >= dailyTarget ? "var(--correct)" : "var(--teal)",
    },
    {
      href: "/practice/weakest",
      icon: BookOpen,
      title: `${weakestName} 집중 점검`,
      detail: "통계가 쌓일수록 추천 과목이 정교해집니다",
      status: "추천",
      done: false,
      tone: "var(--blue)",
    },
    {
      href: "/comments",
      icon: MessageSquare,
      title: "댓글 노하우 1개 읽기",
      detail: "암기법과 정정 제안을 먼저 훑어보기",
      status: "추천",
      done: false,
      tone: "var(--teal)",
    },
  ];

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-5)",
        marginBottom: "var(--space-5)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <span className="kvle-label" style={{ fontSize: 12 }}>
            오늘 처음 할 일
          </span>
          <h2 style={{ color: "var(--text)", fontSize: 18, fontWeight: 800, margin: "6px 0 0" }}>
            복습, 풀이, 약점 확인만 작게 끝내기
          </h2>
        </div>
        <span style={{ color: "var(--text-faint)", fontSize: 12, fontWeight: 800 }}>
          자동 확인 {tasks.filter((task) => task.done).length}/2
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        {tasks.map(({ href, icon: Icon, title, detail, status, done, tone }) => (
          <Link
            key={title}
            href={href}
            style={{
              minHeight: 116,
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
              gap: 10,
              padding: 14,
              borderRadius: "var(--radius-md)",
              border: `1px solid ${done ? "rgba(45,159,107,0.3)" : "var(--border)"}`,
              background: done ? "rgba(45,159,107,0.08)" : "var(--surface-raised)",
              color: "var(--text)",
              textDecoration: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "var(--radius-sm)",
                  color: tone,
                  background: done ? "rgba(45,159,107,0.13)" : "var(--surface)",
                }}
              >
                {done ? <CheckCircle2 size={17} /> : <Icon size={16} />}
              </span>
              <span style={{ color: tone, fontSize: 11, fontWeight: 800 }}>
                {status}
              </span>
            </div>
            <div>
              <strong style={{ display: "block", fontSize: 14, lineHeight: 1.35, marginBottom: 5 }}>
                {title}
              </strong>
              <span style={{ display: "block", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.45 }}>
                {detail}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { stats, loading: statsLoading } = useStats(user?.id ?? null, authLoading);
  const { allNotes } = useReview();
  const dueCount = useDueCountCtx();
  const [today] = useState(() => new Date());

  const weakest = useMemo(
    () => (stats ? findWeakestCategory(stats.byCategory) : null),
    [stats]
  );

  const { delta, streak, byCategory, weekly, todayAttemptCount } = useMemo(() => {
    if (!stats) {
      return {
        delta: 0,
        streak: 0,
        byCategory: FALLBACK_CATEGORIES,
        weekly: [] as DayBucket[],
        todayAttemptCount: 0,
      };
    }

    const byCategory =
      stats.byCategory.length > 0 ? stats.byCategory : FALLBACK_CATEGORIES;

    // Prefer server-computed KST aggregates — correct over the full history.
    if (stats.weekly && stats.streak != null) {
      return {
        delta: stats.deltaVsYesterday ?? 0,
        streak: stats.streak,
        byCategory,
        weekly: stats.weekly,
        todayAttemptCount: stats.todayAttempts ?? 0,
      };
    }

    // Fallback: legacy client-side aggregation of the recentAttempts sample,
    // used only when the stats RPC predates 20260709020000. This under-counts
    // once daily attempts exceed the 20-row sample — hence the server move.
    const attempts = stats.recentAttempts;
    const todayStr = today.toDateString();
    const yestStr = new Date(today.getTime() - 86400000).toDateString();
    const todayTotal = attempts.filter(
      (a) => new Date(a.answered_at).toDateString() === todayStr
    ).length;
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
    let d = new Date(today);
    while (activeDays.has(d.toDateString())) {
      streakCount++;
      d = new Date(d.getTime() - 86400000);
    }

    const weekly: DayBucket[] = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(today);
      day.setDate(day.getDate() - (6 - i));
      const dayStr = day.toDateString();
      const dayAttempts = attempts.filter(
        (a) => new Date(a.answered_at).toDateString() === dayStr
      );
      const correct = dayAttempts.filter((a) => a.is_correct).length;
      const yyyy = day.getFullYear();
      const mm = String(day.getMonth() + 1).padStart(2, "0");
      const dd = String(day.getDate()).padStart(2, "0");
      return { date: `${yyyy}-${mm}-${dd}`, total: dayAttempts.length, correct };
    });

    return {
      delta: todayCount - yestCount,
      streak: streakCount,
      byCategory,
      weekly,
      todayAttemptCount: todayTotal,
    };
  }, [stats, today]);

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
  // New users have no per-category data (weakest === null). Don't fabricate a
  // "weakest subject" from fallback numbers — gate the factual displays below.
  const hasWeakest = weakest != null;
  const weakestName = weakest?.category ?? "약점 과목";
  const weakestAcc = weakest?.accuracy ?? 0;
  const accuracyTone = getAccuracyTone(accuracy);
  const weakestTone = getAccuracyTone(weakestAcc);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 64px" }}>
      <DDayPlanWidget />
      <AnnouncementBannerWrapper />
      <FirstLoginGuideBanner userId={user.id} />
      <StudyFirstPanel dueCount={dueCount} weakestName={weakestName} />
      <TodayStarterChecklist
        dueCount={dueCount}
        todayAttemptCount={todayAttemptCount}
        weakestName={weakestName}
        hasWrongNotes={allNotes.length > 0}
      />
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
          value={hasWeakest ? weakestName : "—"}
          hint={hasWeakest ? `정답률 ${weakestAcc}% · ${weakestTone.label}` : "문제를 풀면 분석돼요"}
          valueColor={hasWeakest ? weakestTone.color : undefined}
        />
      </div>

      <ReviewStatusCard dueCount={dueCount} allNotes={allNotes} />

      {/* ── 2-col: subject bars + CTAs ── */}
      <div className="dashboard-2col" style={{ marginBottom: 22 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", padding: "var(--space-6)", boxShadow: "var(--shadow-sm)" }}>
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
            color: "#061218", borderRadius: "var(--radius-md)", padding: "16px 18px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: 14, textDecoration: "none",
            boxShadow: "var(--shadow-teal)",
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
            borderRadius: "var(--radius-md)", padding: "14px 16px", color: "var(--text)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: 14, textDecoration: "none",
          }}>
            <div>
              <span className="kvle-label" style={{ color: hasWeakest ? weakestTone.color : "var(--text-muted)", marginBottom: 4, fontSize: 12 }}>
                약점 집중
              </span>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 15,
                fontWeight: 800, marginTop: 4, color: hasWeakest ? weakestTone.color : "var(--text)" }}>
                {weakestName} 집중 연습
              </div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>
                {hasWeakest ? `정답률 ${weakestAcc}% · 가장 약한 과목` : "기록이 쌓이면 추천돼요"}
              </div>
            </div>
          </Link>

          <Link href="/quiz" style={{
            background: "transparent", border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)", padding: "14px 16px", color: "var(--text-muted)",
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
        borderRadius: "var(--radius-lg)", padding: "var(--space-6)", boxShadow: "var(--shadow-sm)" }}>
        <span className="kvle-label" style={{ marginBottom: 4, fontSize: 13 }}>최근 7일</span>
        <WeekChart weekly={weekly} />
      </div>
    </main>
  );
}
