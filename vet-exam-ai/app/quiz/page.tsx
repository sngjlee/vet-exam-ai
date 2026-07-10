"use client";

import Link from "next/link";
import QuestionCard from "../../components/QuestionCard";
import SessionSetup from "../../components/SessionSetup";
import { useAuth } from "../../lib/hooks/useAuth";
import { useDueCountCtx } from "../../lib/context/DueCountContext";
import { useQuestionMeta } from "../../lib/hooks/useQuestionMeta";
import { useQuizSession } from "../../lib/hooks/useQuizSession";
import { QuizSetupView } from "./_components/QuizSetupView";
import type { Database } from "../../lib/supabase/types";
import {
  Sparkles, BookOpen, Clock,
  ArrowRight, CheckCircle2, RotateCcw,
  ListChecks, MessageSquare, ClipboardCheck, Timer, AlertTriangle,
} from "lucide-react";

const TOTAL_QUESTIONS = 5;
const MINI_MOCK_COUNT = 20;
const MINI_MOCK_MINUTES = 25;
const MINI_MOCK_SECONDS = MINI_MOCK_MINUTES * 60;
const MINI_MOCK_HISTORY_KEY = "kvle.miniMock.history.v1";
const MINI_MOCK_HISTORY_LIMIT = 5;

type SessionMode = "practice" | "mini-mock";

type SessionStartPayload = {
  subjects: string[];
  count: number;
  mode?: SessionMode;
};

type SessionWrongAnswer = {
  questionId: string;
  question: string;
  category: string;
  selectedAnswer: string;
  correctAnswer: string;
  explanation: string;
};

type MiniMockHistoryItem = {
  id: string;
  completedAt: string;
  total: number;
  score: number;
  accuracy: number;
  elapsedSeconds: number;
  wrongCount: number;
  unansweredCount: number;
  timeExpired: boolean;
  categories: Record<string, number>;
};

type MockExamSessionRow = Database["public"]["Tables"]["mock_exam_sessions"]["Row"];

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const mm = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const ss = String(safeSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function readMiniMockHistory(): MiniMockHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MINI_MOCK_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MINI_MOCK_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeMiniMockHistory(items: MiniMockHistoryItem[]) {
  window.localStorage.setItem(
    MINI_MOCK_HISTORY_KEY,
    JSON.stringify(items.slice(0, MINI_MOCK_HISTORY_LIMIT)),
  );
}

function toMiniMockHistoryItem(row: MockExamSessionRow): MiniMockHistoryItem {
  return {
    id: row.session_id,
    completedAt: row.completed_at,
    total: row.total_count,
    score: row.score,
    accuracy: row.accuracy,
    elapsedSeconds: row.elapsed_seconds,
    wrongCount: row.wrong_count,
    unansweredCount: row.unanswered_count,
    timeExpired: row.time_expired,
    categories: row.categories ?? {},
  };
}

function StudyModeShortcuts() {
  const items = [
    {
      href: "/questions",
      icon: ListChecks,
      label: "해설 먼저 보기",
      meta: "문항을 풀기 전에 해설과 선택지를 같이 봅니다",
      color: "var(--teal)",
    },
    {
      href: "/comments",
      icon: MessageSquare,
      label: "댓글 암기법 보기",
      meta: "암기법, 정정, 질문을 먼저 훑습니다",
      color: "var(--blue)",
    },
  ];

  return (
    <div
      className="fade-in"
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 10,
        marginBottom: "1.5rem",
      }}
    >
      {items.map(({ href, icon: Icon, label, meta, color }) => (
        <Link
          key={href}
          href={href}
          style={{
            minHeight: 78,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: "var(--radius-sm)",
              display: "grid",
              placeItems: "center",
              background: "var(--surface-raised)",
              color,
              flexShrink: 0,
            }}
          >
            <Icon size={17} />
          </span>
          <span style={{ minWidth: 0 }}>
            <strong style={{ display: "block", fontSize: 14, marginBottom: 3 }}>
              {label}
            </strong>
            <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.35 }}>
              {meta}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function MiniMockEntry({
  loading,
  totalCount,
  onStart,
}: {
  loading: boolean;
  totalCount: number;
  onStart: (payload: SessionStartPayload) => void;
}) {
  const availableCount = Math.max(0, totalCount);
  const examCount =
    availableCount > 0 ? Math.min(MINI_MOCK_COUNT, availableCount) : MINI_MOCK_COUNT;
  const canStart = !loading && availableCount > 0;

  return (
    <section
      className="fade-in mini-mock-entry"
      style={{
        position: "relative",
        marginBottom: "1.5rem",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderTop: "3px solid var(--blue)",
        borderRadius: "var(--radius-md)",
        padding: 20,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 16,
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <ClipboardCheck size={16} style={{ color: "var(--blue)" }} />
          <span className="kvle-label" style={{ color: "var(--blue)", fontSize: 12 }}>
            미니 모의고사
          </span>
        </div>
        <h2
          style={{
            color: "var(--text)",
            fontFamily: "var(--font-serif)",
            fontSize: 21,
            fontWeight: 800,
            lineHeight: 1.25,
            margin: "0 0 6px",
          }}
        >
          정답은 끝나고 한 번에 확인하세요
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.55, margin: 0 }}>
          전 과목에서 {examCount}문제를 뽑아 실제 시험처럼 풀고, 결과 화면에서 오답과 해설을 정리합니다.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              borderRadius: "var(--radius-full)",
              padding: "5px 9px",
              background: "var(--surface-raised)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <Timer size={13} />
            제한시간 {MINI_MOCK_MINUTES}분
          </span>
          <span
            style={{
              borderRadius: "var(--radius-full)",
              padding: "5px 9px",
              background: "var(--blue-dim)",
              color: "var(--blue)",
              border: "1px solid rgba(74,127,168,0.28)",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            지연 채점
          </span>
        </div>
      </div>
      <button
        type="button"
        disabled={!canStart}
        onClick={() => onStart({ subjects: [], count: examCount, mode: "mini-mock" })}
        className="active:scale-[0.98]"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          minHeight: 46,
          whiteSpace: "nowrap",
          borderRadius: "var(--radius-full)",
          padding: "10px 18px",
          border: "none",
          background: "var(--blue)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 800,
          cursor: canStart ? "pointer" : "not-allowed",
          opacity: canStart ? 1 : 0.5,
        }}
      >
        시작
        <ArrowRight size={15} />
      </button>
    </section>
  );
}

function MiniMockHistory({ history }: { history: MiniMockHistoryItem[] }) {
  if (history.length === 0) return null;

  return (
    <section
      className="fade-in"
      style={{
        position: "relative",
        marginBottom: "1.5rem",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 18,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <span className="kvle-label" style={{ fontSize: 12 }}>
            최근 미니 모의고사
          </span>
          <h2 style={{ color: "var(--text)", fontSize: 18, fontWeight: 800, margin: "6px 0 0" }}>
            결과 히스토리
          </h2>
        </div>
        <span style={{ color: "var(--text-faint)", fontSize: 12, fontWeight: 800 }}>
          최근 {history.length}회
        </span>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {history.map((item) => {
          const completedAt = new Date(item.completedAt);
          const topCategories = Object.entries(item.categories)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([category, count]) => `${category} ${count}`)
            .join(" · ");
          return (
            <div
              key={item.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: 12,
                alignItems: "center",
                padding: 12,
                borderRadius: "var(--radius-md)",
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <strong style={{ color: "var(--text)", fontSize: 14 }}>
                    {item.score}/{item.total}점 · {item.accuracy}%
                  </strong>
                  {item.timeExpired && (
                    <span style={{ color: "var(--wrong)", fontSize: 11, fontWeight: 800 }}>
                      시간 종료
                    </span>
                  )}
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.4, margin: 0 }}>
                  {completedAt.toLocaleDateString("ko-KR")} · 소요 {formatDuration(item.elapsedSeconds)} · 오답 {item.wrongCount} · 미응답 {item.unansweredCount}
                </p>
                {topCategories && (
                  <p style={{ color: "var(--text-faint)", fontSize: 11, lineHeight: 1.35, margin: "4px 0 0" }}>
                    {topCategories}
                  </p>
                )}
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  color: item.accuracy >= 70 ? "var(--correct)" : "var(--amber)",
                  fontSize: 18,
                  fontWeight: 800,
                }}
              >
                {item.accuracy}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function QuizPage() {
  const { meta, loading: metaLoading, error: metaError } = useQuestionMeta();
  const { user, loading: authLoading } = useAuth();
  const dueCount = useDueCountCtx();
  const {
    started, finished, isMiniMock,
    currentQuestion, currentIndex, sessionQuestions, score, commentCounts,
    remainingSeconds, timerIsUrgent, accuracy, elapsedLabel, unansweredCount,
    timeExpired, sessionWrongAnswers, miniMockHistory,
    sessionLoading, sessionError,
    startSession, handleAnswer, handleNext, handleRestart, quit,
  } = useQuizSession(meta);

  return (
    <main
      style={{
        position: "relative",
        maxWidth: "80rem",
        margin: "0 auto",
        padding: "3rem 1.5rem",
        overflow: "hidden",
      }}
    >

      {/* ━━━━ 배경 gradient orbs — pointer-events-none, no blur (GPU-safe) ━━ */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
      >
        {/* 우상단 teal orb */}
        <div
          style={{
            position: "absolute",
            width: "800px",
            height: "800px",
            top: "-280px",
            right: "-160px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(30,167,187,0.05) 0%, transparent 65%)",
          }}
        />
        {/* 좌하단 slate orb */}
        <div
          style={{
            position: "absolute",
            width: "600px",
            height: "600px",
            bottom: "-80px",
            left: "-150px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(74,127,168,0.04) 0%, transparent 65%)",
          }}
        />
      </div>

      {!started && (
        <QuizSetupView
          meta={meta}
          metaLoading={metaLoading}
          metaError={metaError}
          sessionLoading={sessionLoading}
          sessionError={sessionError}
          user={user}
          authLoading={authLoading}
          dueCount={dueCount}
          miniMockHistory={miniMockHistory}
          onStart={startSession}
        />
      )}

      {/* ━━━━ 활성 세션 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {started && !finished && currentQuestion && (
        <div style={{ position: "relative", maxWidth: "48rem", margin: "0 auto" }}>
          {isMiniMock && remainingSeconds !== null && (
            <section
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                padding: "14px 16px",
                marginBottom: 16,
                borderRadius: "var(--radius-md)",
                background: timerIsUrgent ? "var(--wrong-dim)" : "var(--surface)",
                border: `1px solid ${timerIsUrgent ? "rgba(192,74,58,0.35)" : "var(--border)"}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span
                  style={{
                    width: 34,
                    height: 34,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: "var(--radius-sm)",
                    color: timerIsUrgent ? "var(--wrong)" : "var(--blue)",
                    background: timerIsUrgent ? "rgba(192,74,58,0.12)" : "var(--blue-dim)",
                  }}
                >
                  {timerIsUrgent ? <AlertTriangle size={17} /> : <Timer size={17} />}
                </span>
                <div>
                  <span className="kvle-label" style={{ color: timerIsUrgent ? "var(--wrong)" : "var(--blue)", fontSize: 11 }}>
                    제한 시간
                  </span>
                  <p style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.35, margin: "3px 0 0" }}>
                    시간이 끝나면 현재 답안으로 자동 제출됩니다.
                  </p>
                </div>
              </div>
              <strong
                style={{
                  flexShrink: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: 24,
                  lineHeight: 1,
                  color: timerIsUrgent ? "var(--wrong)" : "var(--text)",
                }}
              >
                {formatDuration(remainingSeconds)}
              </strong>
            </section>
          )}
          <QuestionCard
            key={currentQuestion.id}
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            total={sessionQuestions.length}
            onAnswer={handleAnswer}
            onNext={handleNext}
            onQuit={quit}
            commentCount={commentCounts.get(currentQuestion.id)}
            feedbackMode={isMiniMock ? "deferred" : "instant"}
            sessionLabel={isMiniMock ? "모의고사" : "세션"}
          />
        </div>
      )}

      {/* ━━━━ 결과 화면 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {finished && (
        <section
          className="fade-in"
          style={{ position: "relative", maxWidth: "48rem", margin: "0 auto" }}
        >

          {/* 완료 카드 — Double-Bezel ────────────────────────────────────── */}
          <div
            style={{
              padding: "6px",
              borderRadius: "var(--radius-lg)",
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              marginBottom: "2rem",
            }}
          >
            <div
              style={{
                borderRadius: "var(--radius-lg)",
                padding: "2rem",
                textAlign: "center",
                position: "relative",
                overflow: "hidden",
                background: "var(--surface)",
                borderTop: "3px solid var(--correct)",
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
                    "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(45,159,107,0.08) 0%, transparent 70%)",
                }}
              />
              <div style={{ position: "relative" }}>
                {/* Double-Bezel icon wrapper */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "68px",
                    height: "68px",
                    borderRadius: "50%",
                    marginBottom: "1.25rem",
                    padding: "4px",
                    background: "rgba(45,159,107,0.06)",
                    border: "1px solid rgba(45,159,107,0.15)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      background: "var(--correct-dim)",
                      border: "1px solid rgba(45,159,107,0.25)",
                    }}
                  >
                    <CheckCircle2 size={30} style={{ color: "var(--correct)" }} />
                  </div>
                </div>
                <h2
                  className="text-2xl font-bold tracking-tight"
                  style={{ color: "var(--text)", marginBottom: "0.75rem" }}
                >
                  {isMiniMock ? "미니 모의고사 완료" : "세션 완료"}
                </h2>
                <p className="text-base" style={{ color: "var(--text-muted)" }}>
                  총{" "}
                  <span className="kvle-mono font-bold" style={{ color: "var(--text)" }}>
                    {sessionQuestions.length}
                  </span>
                  문제 중{" "}
                  <span className="kvle-mono font-bold" style={{ color: "var(--teal)" }}>
                    {score}
                  </span>
                  문제 정답
                </p>
                {isMiniMock && timeExpired && (
                  <p style={{ color: "var(--wrong)", fontSize: 13, fontWeight: 800, margin: "12px 0 0" }}>
                    제한 시간이 종료되어 자동 제출되었습니다.
                  </p>
                )}
                {isMiniMock && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 18,
                    }}
                  >
                      <span
                        style={{
                          borderRadius: "var(--radius-full)",
                          padding: "7px 11px",
                          background: "var(--teal-dim)",
                        color: "var(--teal)",
                        border: "1px solid var(--teal-border)",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                      >
                        정답률 {accuracy}%
                      </span>
                    <span
                      style={{
                        borderRadius: "var(--radius-full)",
                        padding: "7px 11px",
                        background: unansweredCount > 0 ? "var(--wrong-dim)" : "var(--correct-dim)",
                        color: unansweredCount > 0 ? "var(--wrong)" : "var(--correct)",
                        border: `1px solid ${unansweredCount > 0 ? "rgba(192,74,58,0.28)" : "rgba(45,159,107,0.25)"}`,
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      미응답 {unansweredCount}문제
                    </span>
                    {elapsedLabel && (
                      <span
                        style={{
                          borderRadius: "var(--radius-full)",
                          padding: "7px 11px",
                          background: "var(--surface-raised)",
                          color: "var(--text-muted)",
                          border: "1px solid var(--border)",
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        소요 {elapsedLabel}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 오답 개념 복습 ──────────────────────────────────────────────── */}
          <div style={{ marginBottom: "2rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "1.5rem",
              }}
            >
              <BookOpen size={18} style={{ color: "var(--blue)" }} />
              <h3
                className="text-lg font-bold tracking-tight"
                style={{ color: "var(--text)" }}
              >
                {isMiniMock ? "모의고사 오답 해설" : "오답 개념 복습"}
              </h3>
            </div>

            {sessionWrongAnswers.length === 0 ? (
              <div
                style={{
                  borderRadius: "0.75rem",
                  padding: "2rem",
                  textAlign: "center",
                  background: "var(--surface)",
                  border: "1px dashed rgba(45,159,107,0.3)",
                }}
              >
                <Sparkles
                  size={24}
                  style={{ color: "var(--teal)", margin: "0 auto 0.75rem" }}
                />
                <p className="font-medium text-sm" style={{ color: "var(--text-muted)" }}>
                  완벽합니다. 틀린 문제가 없습니다.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {sessionWrongAnswers.map((note, idx) => (
                  <div
                    key={note.questionId}
                    style={{
                      borderRadius: "0.75rem",
                      padding: "1.5rem",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderLeft: "3px solid rgba(192,74,58,0.5)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        marginBottom: "1rem",
                      }}
                    >
                      <span className="kvle-badge">{note.category}</span>
                      <span className="kvle-mono text-xs" style={{ color: "var(--text-faint)" }}>
                        #{idx + 1}
                      </span>
                    </div>
                    <p
                      className="text-sm font-medium leading-relaxed"
                      style={{ color: "var(--text)", marginBottom: "1.25rem" }}
                    >
                      {note.question}
                    </p>
                    <div
                      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                      style={{ marginBottom: "0.75rem" }}
                    >
                      <div
                        style={{
                          borderRadius: "0.5rem",
                          padding: "1rem",
                          background: "var(--wrong-dim)",
                          border: "1px solid rgba(192,74,58,0.2)",
                        }}
                      >
                        <span
                          className="kvle-label block"
                          style={{ color: "var(--wrong)", marginBottom: "0.375rem" }}
                        >
                          내 답변
                        </span>
                        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                          {note.selectedAnswer}
                        </p>
                      </div>
                      <div
                        style={{
                          borderRadius: "0.5rem",
                          padding: "1rem",
                          background: "var(--correct-dim)",
                          border: "1px solid rgba(45,159,107,0.2)",
                        }}
                      >
                        <span
                          className="kvle-label block"
                          style={{ color: "var(--correct)", marginBottom: "0.375rem" }}
                        >
                          정답
                        </span>
                        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                          {note.correctAnswer}
                        </p>
                      </div>
                    </div>
                    <div
                      style={{
                        borderRadius: "0.5rem",
                        padding: "1rem",
                        background: "var(--surface-raised)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span
                        className="kvle-label block"
                        style={{ color: "var(--blue)", marginBottom: "0.375rem" }}
                      >
                        해설
                      </span>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                        {note.explanation}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 액션 버튼 ────────────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row gap-3" style={{ paddingTop: "0.5rem" }}>

            {/* Button-in-Button pill — solid gold (primary) */}
            <button
              onClick={handleRestart}
              className="flex-1 inline-flex items-center justify-center gap-3 font-semibold active:scale-[0.98]"
              style={{
                background: "var(--teal)",
                color: "#080D1A",
                borderRadius: "var(--radius-full)",
                padding: "10px 10px 10px 22px",
                fontSize: "0.875rem",
                border: "none",
                cursor: "pointer",
                transition: "opacity 300ms cubic-bezier(0.32,0.72,0,1), transform 200ms cubic-bezier(0.32,0.72,0,1)",
              }}
            >
              {isMiniMock ? "모의고사 다시 풀기" : "새 세션 시작"}
              <span
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <RotateCcw size={14} />
              </span>
            </button>

            {/* Ghost pill — secondary */}
            <Link
              href="/wrong-notes"
              className="flex-1 inline-flex items-center justify-center gap-2 font-semibold active:scale-[0.98]"
              style={{
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-full)",
                padding: "10px 22px",
                fontSize: "0.875rem",
                transition: "color 300ms cubic-bezier(0.32,0.72,0,1), border-color 300ms cubic-bezier(0.32,0.72,0,1), transform 200ms cubic-bezier(0.32,0.72,0,1)",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "var(--text)";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--teal-border)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-muted)";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)";
              }}
            >
              <BookOpen size={15} />
              전체 오답 노트 보기
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
