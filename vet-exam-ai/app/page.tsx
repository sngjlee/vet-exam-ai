"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import QuestionCard from "../components/QuestionCard";
import { createSessionQuestions, type Question } from "../lib/questions";
import type { WrongAnswerNote } from "../lib/types";
import { useWrongNotes } from "../lib/hooks/useWrongNotes";
import { useAttempts } from "../lib/hooks/useAttempts";
import { useAuth } from "../lib/hooks/useAuth";
import { useDueCountCtx } from "../lib/context/DueCountContext";
import { useQuestions } from "../lib/hooks/useQuestions";
import { Play, Sparkles, BookOpen, Clock, Target, ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";

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
    const pool = categoryFilter ? questions.filter((q) => q.category === categoryFilter) : questions;
    const total = Math.min(TOTAL_QUESTIONS, pool.length);
    const newSession = createSessionQuestions(questions, total, categoryFilter);
    sessionIdRef.current = crypto.randomUUID();
    setSessionQuestions(newSession);
    setCurrentIndex(0);
    setScore(0);
    setStarted(true);
  }

  function handleAnswer(payload: { questionId: string; selectedAnswer: string; isCorrect: boolean }) {
    if (!currentQuestion) return;
    void logAttempt({
      sessionId: sessionIdRef.current,
      questionId: currentQuestion.id,
      category: currentQuestion.category,
      selectedAnswer: payload.selectedAnswer,
      correctAnswer: currentQuestion.answer,
      isCorrect: payload.isCorrect,
    });
    if (payload.isCorrect) { setScore((prev) => prev + 1); return; }
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
    <main className="mx-auto max-w-5xl px-6 py-12">
      {/* Hero */}
      {!started && (
        <div className="mb-10 text-center md:text-left">
          <h1
            className="mb-3 text-4xl md:text-5xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
          >
            수의국시,{" "}
            <span style={{ color: "var(--gold)" }}>체계적으로 준비하세요</span>
          </h1>
          <p className="text-lg max-w-2xl" style={{ color: "var(--text-muted)" }}>
            스마트 반복 학습과 데이터 기반 약점 분석으로 합격을 완성합니다.
          </p>
        </div>
      )}

      {/* Logged-in dashboard cards */}
      {!started && !authLoading && user && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {/* Start session card */}
          <div className="md:col-span-2 kvle-card relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -mr-16 -mt-16 opacity-20" style={{ background: "var(--gold)" }}></div>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles size={16} style={{ color: "var(--gold)" }} />
                  <span className="kvle-label">스마트 학습</span>
                </div>
                <h2 className="text-xl font-bold mb-2" style={{ color: "var(--text)" }}>
                  오늘의 학습을 시작하세요
                </h2>
                <p className="mb-6 text-sm" style={{ color: "var(--text-muted)" }}>
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
                <button
                  onClick={startSession}
                  disabled={questionsLoading}
                  className="kvle-btn-primary w-full sm:w-auto flex-shrink-0"
                >
                  <Play size={16} className="fill-current" />
                  {questionsLoading ? "로딩 중…" : "세션 시작"}
                </button>
              </div>
            </div>
          </div>

          {/* Review queue card */}
          <div className="kvle-card flex flex-col justify-between relative overflow-hidden">
            <div className="absolute bottom-0 right-0 w-32 h-32 rounded-full blur-2xl -mr-8 -mb-8 opacity-20" style={{ background: "var(--blue)" }}></div>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clock size={16} style={{ color: "var(--blue)" }} />
                <span className="kvle-label" style={{ color: "var(--blue)" }}>오늘의 복습</span>
              </div>
              {dueCount > 0 ? (
                <div>
                  <div className="text-5xl font-black kvle-mono mb-1" style={{ color: "var(--text)" }}>
                    {dueCount}
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>개 문제 복습 대기중</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-6">
                  <CheckCircle2 size={40} className="mb-3" style={{ color: "var(--text-faint)" }} />
                  <p className="font-medium" style={{ color: "var(--text-muted)" }}>오늘 복습 완료!</p>
                </div>
              )}
            </div>
            {dueCount > 0 && (
              <Link
                href="/review"
                className="mt-6 flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold transition-colors text-sm"
                style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "1px solid rgba(91,141,184,0.25)" }}
              >
                복습 시작
                <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Guest card */}
      {!started && (!user || authLoading) && (
        <section className="kvle-card mb-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-xl font-bold mb-2" style={{ color: "var(--text)" }}>
                비회원으로 연습하기
              </h2>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                문제를 풀어볼 수 있지만, 학습 기록 저장과 간격 반복 학습은 로그인이 필요합니다.
              </p>
            </div>
            <button
              onClick={startSession}
              disabled={questionsLoading}
              className="kvle-btn-primary flex-shrink-0"
            >
              <Play size={16} className="fill-current" />
              {questionsLoading ? "로딩 중…" : "바로 시작"}
            </button>
          </div>
        </section>
      )}

      {/* Active session */}
      {started && !finished && currentQuestion && (
        <div className="max-w-3xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full font-bold kvle-mono"
                style={{ background: "var(--surface-raised)", color: "var(--text)" }}
              >
                {currentIndex + 1}
              </div>
              <span style={{ color: "var(--text-muted)" }}>/ {sessionQuestions.length} 문제</span>
            </div>
            <div
              className="flex items-center gap-2 rounded-full px-4 py-2"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
            >
              <Target size={14} style={{ color: "var(--gold)" }} />
              <span className="font-semibold kvle-mono text-sm" style={{ color: "var(--text)" }}>
                {score} / {sessionQuestions.length} 정답
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full rounded-full h-1 mb-8 overflow-hidden" style={{ background: "var(--surface-raised)" }}>
            <div
              className="h-1 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(currentIndex / sessionQuestions.length) * 100}%`, background: "var(--gold)" }}
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

      {/* Results */}
      {finished && (
        <section className="max-w-3xl mx-auto fade-in space-y-8">
          <div className="kvle-card text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 50% 0%, var(--gold-dim), transparent 70%)" }}></div>
            <div className="relative z-10">
              <div
                className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
                style={{ background: "var(--correct-dim)", border: "2px solid rgba(45,159,107,0.3)" }}
              >
                <CheckCircle2 size={40} style={{ color: "var(--correct)" }} />
              </div>
              <h2 className="text-3xl font-bold mb-3" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
                세션 완료!
              </h2>
              <p className="text-lg" style={{ color: "var(--text-muted)" }}>
                총 <span className="kvle-mono font-bold" style={{ color: "var(--text)" }}>{sessionQuestions.length}</span>문제 중{" "}
                <span className="kvle-mono font-bold" style={{ color: "var(--gold)" }}>{score}</span>문제를 맞혔습니다.
              </p>
            </div>
          </div>

          {/* Concept review */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <BookOpen size={20} style={{ color: "var(--blue)" }} />
              <h3 className="text-xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
                오답 개념 복습
              </h3>
            </div>

            {wrongNotes.length === 0 ? (
              <div className="kvle-card text-center" style={{ borderStyle: "dashed" }}>
                <Sparkles size={28} className="mx-auto mb-3" style={{ color: "var(--gold)" }} />
                <p style={{ color: "var(--text-muted)" }}>완벽합니다! 틀린 문제가 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {wrongNotes.map((note, idx) => (
                  <div
                    key={note.questionId}
                    className="relative rounded-xl p-6 overflow-hidden"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderLeft: "4px solid rgba(192,74,58,0.5)",
                    }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <span className="kvle-badge">{note.category}</span>
                      <span className="kvle-mono text-xs" style={{ color: "var(--text-faint)" }}>#{idx + 1}</span>
                    </div>
                    <p className="mb-6 font-medium leading-relaxed" style={{ color: "var(--text)" }}>
                      {note.question}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="rounded-xl p-4" style={{ background: "var(--wrong-dim)", border: "1px solid rgba(192,74,58,0.2)" }}>
                        <span className="kvle-label mb-1" style={{ color: "var(--wrong)" }}>내 답변</span>
                        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{note.selectedAnswer}</p>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: "var(--correct-dim)", border: "1px solid rgba(45,159,107,0.2)" }}>
                        <span className="kvle-label mb-1" style={{ color: "var(--correct)" }}>정답</span>
                        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{note.correctAnswer}</p>
                      </div>
                    </div>
                    <div className="rounded-xl p-4" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
                      <span className="kvle-label mb-2" style={{ color: "var(--blue)" }}>해설</span>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{note.explanation}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button onClick={handleRestart} className="kvle-btn-primary flex-1">
              <RotateCcw size={16} />
              새 세션 시작
            </button>
            <Link href="/wrong-notes" className="kvle-btn-ghost flex-1 flex items-center justify-center gap-2">
              <BookOpen size={16} />
              전체 오답 노트 보기
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
