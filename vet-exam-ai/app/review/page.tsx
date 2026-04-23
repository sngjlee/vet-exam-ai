// app/review/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import QuestionCard from "../../components/QuestionCard";
import LoadingSpinner from "../../components/LoadingSpinner";
import { ChevronRight } from "lucide-react";
import { useReview } from "../../lib/hooks/useReview";
import { useAttempts } from "../../lib/hooks/useAttempts";
import type { WrongAnswerNote } from "../../lib/types";
import type { Question } from "../../lib/questions";

const MAX_REVIEW = 5;
const INTERVALS_DAYS = [1, 3, 7, 14] as const;

// ─── helpers ────────────────────────────────────────────────────────────────

function getDueOffset(note: WrongAnswerNote): number {
  if (!note.nextReviewAt) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reviewDate = new Date(note.nextReviewAt);
  reviewDate.setHours(0, 0, 0, 0);
  return Math.round((reviewDate.getTime() - today.getTime()) / 86_400_000);
}

function getInterval(note: WrongAnswerNote): number {
  const rc = note.reviewCount ?? 0;
  return INTERVALS_DAYS[Math.min(rc, INTERVALS_DAYS.length - 1)];
}

function noteToQuestion(note: WrongAnswerNote): Question {
  return {
    id: note.questionId,
    question: note.question,
    choices: note.choices,
    answer: note.correctAnswer,
    explanation: note.explanation,
    category: note.category,
  };
}

// ─── sub-components ──────────────────────────────────────────────────────────

const SUBJECT_COLORS: Record<string, string> = {
  "약리학":  "#9B6FD4",
  "내과학":  "#1ea7bb",
  "외과학":  "#4A7FA8",
  "생화학":  "#C8895A",
  "병리학":  "#2D9F6B",
};
function subjectColor(cat: string): string {
  return SUBJECT_COLORS[cat] ?? "#4A7FA8";
}

function SubjectChip({ subject }: { subject: string }) {
  const color = subjectColor(subject);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: `${color}18`, border: `1px solid ${color}40`,
      borderRadius: 999, padding: "2px 8px",
      fontSize: 10, fontWeight: 700, color, letterSpacing: "0.04em",
      flexShrink: 0,
    }}>
      {subject}
    </span>
  );
}

function DueBadge({ due, accent }: { due: number; accent: string }) {
  const borderColor =
    due < 0  ? "rgba(192,74,58,0.4)" :
    due === 0 ? "var(--teal-border)" :
                "rgba(74,127,168,0.3)";
  const label =
    due === 0 ? "D" :
    due < 0   ? `−${Math.abs(due)}` :
                `+${due}`;
  return (
    <div style={{
      width: 36, height: 36, flexShrink: 0, borderRadius: 8,
      background: "var(--surface-raised)", display: "grid", placeItems: "center",
      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
      color: accent, border: `1px solid ${borderColor}`,
    }}>
      {label}
    </div>
  );
}

// ─── timeline groups config ──────────────────────────────────────────────────

const GROUPS = [
  {
    key:      "overdue",
    title:    "지연됨",
    subtitle: "하루 이상 넘겼습니다",
    accent:   "var(--wrong)",
    filter:   (d: number) => d < 0,
  },
  {
    key:      "today",
    title:    "오늘",
    subtitle: "지금이 최적 타이밍",
    accent:   "var(--teal)",
    filter:   (d: number) => d === 0,
  },
  {
    key:      "upcoming",
    title:    "예정",
    subtitle: "2~3일 내 복습",
    accent:   "var(--blue)",
    filter:   (d: number) => d > 0,
  },
] as const;

// ─── page ────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const { dueNotes, allNotes, loading, authLoading, user, submitReview, refreshDue } =
    useReview();
  const { logAttempt } = useAttempts();
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const [sessionNotes, setSessionNotes] = useState<WrongAnswerNote[]>([]);
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [started, setStarted] = useState(false);

  const currentQuestion = sessionQuestions[currentIndex];
  const currentNote = sessionNotes[currentIndex];
  const finished = started && currentIndex >= sessionQuestions.length;

  useEffect(() => {
    if (finished) refreshDue();
  }, [finished, refreshDue]);

  function startSession() {
    const notes = dueNotes.slice(0, MAX_REVIEW);
    sessionIdRef.current = crypto.randomUUID();
    setSessionNotes(notes);
    setSessionQuestions(notes.map(noteToQuestion));
    setCurrentIndex(0);
    setScore(0);
    setStarted(true);
  }

  function handleAnswer(payload: {
    questionId: string;
    selectedAnswer: string;
    isCorrect: boolean;
  }) {
    if (!currentNote || !currentQuestion) return;
    void logAttempt({
      sessionId: sessionIdRef.current,
      questionId: currentQuestion.id,
      category: currentQuestion.category,
      selectedAnswer: payload.selectedAnswer,
      correctAnswer: currentQuestion.answer,
      isCorrect: payload.isCorrect,
    });
    void submitReview(currentNote.questionId, payload.isCorrect, currentNote.reviewCount ?? 0);
    if (payload.isCorrect) setScore((prev) => prev + 1);
  }

  function handleNext() {
    setCurrentIndex((prev) => prev + 1);
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <LoadingSpinner />
      </main>
    );
  }

  // ── Unauthenticated ────────────────────────────────────────────────────────
  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="kvle-card">
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.75rem", color: "var(--text)" }}>
            복습 큐
          </h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
            간격 반복 복습을 사용하려면 로그인하세요.
          </p>
          <Link href="/auth/login" className="kvle-btn-primary text-sm">
            로그인
          </Link>
        </div>
      </main>
    );
  }

  // ── Queue view (not yet started) ───────────────────────────────────────────
  if (!started) {
    const queueItems = allNotes.map((note) => ({
      ...note,
      due:      getDueOffset(note),
      interval: getInterval(note),
    }));
    const actionableCount = dueNotes.length;

    return (
      <main style={{ maxWidth: 920, margin: "0 auto", padding: "28px 24px 64px", width: "100%" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <span className="kvle-label">복습 큐</span>
          <h1 style={{
            fontFamily: "var(--font-serif)",
            fontSize: "clamp(22px, 4vw, 28px)",
            fontWeight: 800,
            margin: "8px 0 4px",
            letterSpacing: "-0.01em",
            color: "var(--text)",
          }}>
            오늘 복습할{" "}
            <span style={{ color: "var(--teal)" }}>{actionableCount}문제</span>
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
            간격 반복 알고리즘이 선정한 복습 타이밍입니다. 잊기 직전에 다시 풀어 장기 기억으로 굳힙니다.
          </p>
        </div>

        {/* Empty state */}
        {queueItems.length === 0 && (
          <div className="kvle-card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
            <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
              아직 복습할 문제가 없습니다. 퀴즈를 풀어 오답 노트를 채워보세요.
            </p>
            <Link href="/quiz" className="kvle-btn-primary" style={{ display: "inline-flex" }}>
              퀴즈 시작
            </Link>
          </div>
        )}

        {/* Timeline groups */}
        {GROUPS.map((group) => {
          const items = queueItems.filter((q) => group.filter(q.due));
          if (!items.length) return null;
          return (
            <div key={group.key} style={{ marginBottom: 22 }}>
              {/* Group header */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: 999,
                    background: group.accent, display: "inline-block",
                  }} />
                  <span style={{
                    fontFamily: "var(--font-serif)", fontWeight: 700,
                    fontSize: 15, color: "var(--text)",
                  }}>
                    {group.title}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                    · {items.length}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{group.subtitle}</span>
              </div>

              {/* Card list */}
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                overflow: "hidden",
              }}>
                {items.map((q, i) => (
                  <div
                    key={q.questionId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "16px 20px",
                      borderBottom: i < items.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <DueBadge due={q.due} accent={group.accent} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                        <SubjectChip subject={q.category} />
                        <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
                          간격 {q.interval}일 · ease 2.5
                        </span>
                      </div>
                      <div style={{
                        fontSize: 13, color: "var(--text)", fontWeight: 500, lineHeight: 1.4,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {q.question}
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Start button */}
        {actionableCount > 0 && (
          <button
            onClick={startSession}
            style={{
              background: "var(--teal)", color: "#061218", border: "none",
              padding: "14px 22px", borderRadius: 999, fontSize: 14, fontWeight: 700,
              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 12,
              marginTop: 8, boxShadow: "0 8px 20px rgba(30,167,187,0.2)",
            }}
          >
            복습 시작 ({Math.min(actionableCount, MAX_REVIEW)}문제)
            <span style={{
              width: 28, height: 28, borderRadius: 999,
              background: "rgba(0,0,0,0.18)", display: "grid", placeItems: "center",
            }}>
              <ChevronRight size={14} />
            </span>
          </button>
        )}
      </main>
    );
  }

  // ── In-session + finished ──────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {!finished && currentQuestion && (
        <QuestionCard
          key={currentQuestion.id}
          question={currentQuestion}
          questionNumber={currentIndex + 1}
          total={sessionQuestions.length}
          onAnswer={handleAnswer}
          onNext={handleNext}
          onQuit={() => setStarted(false)}
        />
      )}

      {finished && (
        <section className="kvle-card space-y-6 fade-in">
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", fontWeight: 800, color: "var(--text)" }}>
            복습 완료!
          </h2>

          <div className="flex gap-6 text-sm">
            <div>
              <span className="kvle-label mb-1">복습한 문제</span>
              <p className="text-xl font-bold kvle-mono" style={{ color: "var(--text)" }}>
                {sessionQuestions.length}
              </p>
            </div>
            <div>
              <span className="kvle-label mb-1" style={{ color: "var(--correct)" }}>정답</span>
              <p className="text-xl font-bold kvle-mono" style={{ color: "var(--correct)" }}>{score}</p>
            </div>
            <div>
              <span className="kvle-label mb-1" style={{ color: "var(--wrong)" }}>오답</span>
              <p className="text-xl font-bold kvle-mono" style={{ color: "var(--wrong)" }}>
                {sessionQuestions.length - score}
              </p>
            </div>
          </div>

          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            {score === sessionQuestions.length
              ? "모든 복습 항목이 일정에 반영되었습니다."
              : "일부 항목이 즉시 복습 대상이 됩니다."}
          </p>

          <div className="flex gap-3">
            {dueNotes.length > 0 && (
              <button onClick={startSession} className="kvle-btn-primary">
                다시 복습 ({dueNotes.length})
              </button>
            )}
            <Link href="/dashboard" className="kvle-btn-ghost">
              홈으로
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
