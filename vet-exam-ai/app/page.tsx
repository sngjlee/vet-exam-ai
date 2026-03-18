"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import QuestionCard from "../components/QuestionCard";
import { createSessionQuestions, type Question } from "../lib/questions";
import { useWrongNotes } from "../lib/hooks/useWrongNotes";
import { useAttempts } from "../lib/hooks/useAttempts";
import { useAuth } from "../lib/hooks/useAuth";
import { useDueCountCtx } from "../lib/context/DueCountContext";
import { useQuestions } from "../lib/hooks/useQuestions";
import {
  Play, Sparkles, BookOpen, Clock, Target,
  ArrowRight, CheckCircle2, RotateCcw,
} from "lucide-react";

const TOTAL_QUESTIONS = 5;

export default function Home() {
  const { questions, categories, loading: questionsLoading } = useQuestions();
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [started, setStarted] = useState(false);
  const { notes: wrongNotes, addNote } = useWrongNotes();
  const { logAttempt } = useAttempts();
  const { user, loading: authLoading } = useAuth();
  const dueCount = useDueCountCtx();
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const currentQuestion = sessionQuestions[currentIndex];
  const finished = started && currentIndex >= sessionQuestions.length;

  function startSession() {
    const categoryFilter = selectedCategory === "All" ? undefined : selectedCategory;
    const pool = categoryFilter
      ? questions.filter((q) => q.category === categoryFilter)
      : questions;
    const total = Math.min(TOTAL_QUESTIONS, pool.length);
    const newSession = createSessionQuestions(questions, total, categoryFilter);
    sessionIdRef.current = crypto.randomUUID();
    setSessionQuestions(newSession);
    setCurrentIndex(0);
    setScore(0);
    setStarted(true);
  }

  function handleAnswer(payload: {
    questionId: string;
    selectedAnswer: string;
    isCorrect: boolean;
  }) {
    if (!currentQuestion) return;
    void logAttempt({
      sessionId: sessionIdRef.current,
      questionId: currentQuestion.id,
      category: currentQuestion.category,
      selectedAnswer: payload.selectedAnswer,
      correctAnswer: currentQuestion.answer,
      isCorrect: payload.isCorrect,
    });
    if (payload.isCorrect) {
      setScore((prev) => prev + 1);
      return;
    }
    void addNote({
      questionId: currentQuestion.id,
      question: currentQuestion.question,
      category: currentQuestion.category,
      choices: currentQuestion.choices,
      correctAnswer: currentQuestion.answer,
      selectedAnswer: payload.selectedAnswer,
      explanation: currentQuestion.explanation,
    });
  }

  function handleNext() { setCurrentIndex((prev) => prev + 1); }
  function handleRestart() { startSession(); }

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

      {/* ━━━━ 대시보드 헤더 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {!started && (
        <div
          className="fade-in"
          style={{ position: "relative", marginBottom: "2.5rem", animationDelay: "0ms" }}
        >
          <span className="kvle-label mb-3 inline-block">학습 대시보드</span>
          <h1
            className="text-3xl md:text-4xl font-bold tracking-tight"
            style={{ color: "var(--text)" }}
          >
            Vexa로{" "}
            <span style={{ color: "var(--teal)" }}>체계적으로 준비하세요</span>
          </h1>
        </div>
      )}

      {/* ━━━━ 로그인 대시보드 카드 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {!started && !authLoading && user && (
        <div
          style={{ position: "relative", marginBottom: "2.5rem" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-5"
        >

          {/* ── 세션 시작 카드 — Double-Bezel ─────────────────────────────── */}
          <div
            className="fade-in md:col-span-2"
            style={{
              padding: "6px",
              borderRadius: "22px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
              animationDelay: "60ms",
            }}
          >
            <div
              style={{
                borderRadius: "16px",
                padding: "1.5rem",
                position: "relative",
                overflow: "hidden",
                height: "100%",
                background: "var(--surface)",
                borderTop: "3px solid var(--teal)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
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
                    과목을 선택하고 KVLE 유형 문제를 풀어보세요.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                  <div className="w-full sm:flex-1">
                    <label className="kvle-label mb-2">과목 선택</label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="kvle-input"
                    >
                      <option value="All">전체 과목 (혼합)</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  {/* Button-in-Button pill — solid gold (primary) */}
                  <button
                    onClick={startSession}
                    disabled={questionsLoading}
                    className="flex-shrink-0 inline-flex items-center gap-3 font-semibold active:scale-[0.98] w-full sm:w-auto justify-center"
                    style={{
                      background: "var(--teal)",
                      color: "#fff",
                      borderRadius: "9999px",
                      padding: "10px 10px 10px 22px",
                      fontSize: "0.875rem",
                      border: "none",
                      cursor: questionsLoading ? "not-allowed" : "pointer",
                      opacity: questionsLoading ? 0.5 : 1,
                      transition: "opacity 300ms cubic-bezier(0.32,0.72,0,1), transform 200ms cubic-bezier(0.32,0.72,0,1)",
                    }}
                  >
                    {questionsLoading ? "로딩 중…" : "세션 시작"}
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
                      <Play size={14} className="fill-current" />
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── 복습 큐 카드 — Double-Bezel ───────────────────────────────── */}
          <div
            className="fade-in"
            style={{
              padding: "6px",
              borderRadius: "22px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
              animationDelay: "120ms",
            }}
          >
            <div
              style={{
                borderRadius: "16px",
                padding: "1.5rem",
                position: "relative",
                overflow: "hidden",
                height: "100%",
                background: "var(--surface)",
                borderTop: dueCount > 0 ? "3px solid var(--blue)" : "3px solid rgba(255,255,255,0.06)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
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
                    borderRadius: "9999px",
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
      {!started && (!user || authLoading) && (
        <div
          className="fade-in"
          style={{
            marginBottom: "2.5rem",
            padding: "6px",
            borderRadius: "22px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            animationDelay: "60ms",
          }}
        >
          <div
            className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6 items-center"
            style={{
              borderRadius: "16px",
              padding: "1.5rem",
              position: "relative",
              overflow: "hidden",
              background: "var(--surface)",
              borderTop: "3px solid var(--teal)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
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
            {/* Button-in-Button pill — solid gold (primary) */}
            <button
              onClick={startSession}
              disabled={questionsLoading}
              className="inline-flex items-center gap-3 font-semibold active:scale-[0.98] flex-shrink-0"
              style={{
                background: "var(--teal)",
                color: "#fff",
                borderRadius: "9999px",
                padding: "10px 10px 10px 22px",
                fontSize: "0.875rem",
                border: "none",
                cursor: questionsLoading ? "not-allowed" : "pointer",
                opacity: questionsLoading ? 0.5 : 1,
                transition: "opacity 300ms cubic-bezier(0.32,0.72,0,1), transform 200ms cubic-bezier(0.32,0.72,0,1)",
              }}
            >
              {questionsLoading ? "로딩 중…" : "바로 시작"}
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
                <Play size={14} className="fill-current" />
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ━━━━ 활성 세션 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {started && !finished && currentQuestion && (
        <div style={{ position: "relative", maxWidth: "48rem", margin: "0 auto" }}>
          {/* 진행 헤더 */}
          <div
            style={{
              marginBottom: "1.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div
                className="font-bold kvle-mono text-sm"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "2.25rem",
                  height: "2.25rem",
                  borderRadius: "0.5rem",
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              >
                {currentIndex + 1}
              </div>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                / {sessionQuestions.length} 문제
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                borderRadius: "0.5rem",
                padding: "0.5rem 0.75rem",
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
              }}
            >
              <Target size={13} style={{ color: "var(--teal)" }} />
              <span className="font-semibold kvle-mono text-sm" style={{ color: "var(--text)" }}>
                {score}
                <span style={{ color: "var(--text-faint)" }}> / {sessionQuestions.length}</span>
              </span>
            </div>
          </div>

          {/* 진행 바 */}
          <div
            style={{
              width: "100%",
              borderRadius: "9999px",
              height: "3px",
              marginBottom: "2rem",
              overflow: "hidden",
              background: "var(--surface-raised)",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: "9999px",
                width: `${(currentIndex / sessionQuestions.length) * 100}%`,
                background: "var(--teal)",
                transition: "width 500ms cubic-bezier(0.32,0.72,0,1)",
              }}
            />
          </div>

          <QuestionCard
            key={currentQuestion.id}
            question={currentQuestion}
            onAnswer={handleAnswer}
            onNext={handleNext}
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
              borderRadius: "22px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
              marginBottom: "2rem",
            }}
          >
            <div
              style={{
                borderRadius: "16px",
                padding: "2rem",
                textAlign: "center",
                position: "relative",
                overflow: "hidden",
                background: "var(--surface)",
                borderTop: "3px solid var(--correct)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
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
                  세션 완료
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
                오답 개념 복습
              </h3>
            </div>

            {wrongNotes.length === 0 ? (
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
                {wrongNotes.map((note, idx) => (
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
                color: "#fff",
                borderRadius: "9999px",
                padding: "10px 10px 10px 22px",
                fontSize: "0.875rem",
                border: "none",
                cursor: "pointer",
                transition: "opacity 300ms cubic-bezier(0.32,0.72,0,1), transform 200ms cubic-bezier(0.32,0.72,0,1)",
              }}
            >
              새 세션 시작
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
                borderRadius: "9999px",
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
