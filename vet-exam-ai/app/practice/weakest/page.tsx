// app/practice/weakest/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import QuestionCard from "../../../components/QuestionCard";
import type { Question } from "../../../lib/questions";
import { createSessionQuestions } from "../../../lib/questions";
import { useQuestions } from "../../../lib/hooks/useQuestions";
import type { WrongAnswerNote } from "../../../lib/types";
import { useAuth } from "../../../lib/hooks/useAuth";
import { useStats, type CategoryStat } from "../../../lib/hooks/useStats";
import { useAttempts } from "../../../lib/hooks/useAttempts";
import { useWrongNotes } from "../../../lib/hooks/useWrongNotes";
import { findWeakestCategory } from "../../../lib/stats/weakCategory";

const PRACTICE_COUNT = 5;

export default function PracticeWeakestPage() {
  const { user, loading: authLoading } = useAuth();
  const { stats, loading: statsLoading } = useStats(user?.id ?? null, authLoading);
  const { logAttempt } = useAttempts();
  const { addNote } = useWrongNotes();
  const { questions, loading: questionsLoading } = useQuestions();

  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const [weakest, setWeakest] = useState<CategoryStat | null>(null);
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [started, setStarted] = useState(false);

  const currentQuestion = sessionQuestions[currentIndex];
  const finished = started && currentIndex >= sessionQuestions.length;

  useEffect(() => {
    if (statsLoading || !stats) return;
    setWeakest(findWeakestCategory(stats.byCategory));
  }, [stats, statsLoading]);

  function startPractice() {
    if (!weakest) return;
    const qs = createSessionQuestions(questions, PRACTICE_COUNT, weakest.category);
    sessionIdRef.current = crypto.randomUUID();
    setSessionQuestions(qs);
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

    const note: WrongAnswerNote = {
      questionId: currentQuestion.id,
      question: currentQuestion.question,
      category: currentQuestion.category,
      choices: currentQuestion.choices,
      correctAnswer: currentQuestion.answer,
      selectedAnswer: payload.selectedAnswer,
      explanation: currentQuestion.explanation,
    };
    void addNote(note);
  }

  function handleNext() {
    setCurrentIndex((prev) => prev + 1);
  }

  if (authLoading || statsLoading || questionsLoading) {
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
            약점 집중 연습
          </h1>
          <p className="mb-4" style={{ color: "var(--text-muted)" }}>
            적응형 연습을 사용하려면 로그인하세요.
          </p>
          <Link href="/auth/login" className="kvle-btn-primary text-sm">
            로그인
          </Link>
        </div>
      </main>
    );
  }

  if (!weakest) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="kvle-card">
          <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
            약점 집중 연습
          </h1>
          <p className="mb-4" style={{ color: "var(--text-muted)" }}>
            아직 시도 기록이 부족합니다. 몇 번 더 풀어본 후 다시 오세요.
          </p>
          <Link href="/" className="kvle-btn-primary text-sm">
            퀴즈 시작
          </Link>
        </div>
      </main>
    );
  }

  if (!started) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="kvle-card space-y-4">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
            약점 집중 연습
          </h1>
          <p style={{ color: "var(--text-muted)" }}>현재 가장 취약한 과목:</p>
          <p
            className="text-2xl font-bold"
            style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
          >
            {weakest.category}
          </p>
          <p className="text-sm kvle-mono" style={{ color: "var(--text-faint)" }}>
            {weakest.attempts}회 시도 · {weakest.accuracy}% 정답률 · {weakest.attempts - weakest.correct}개 오답
          </p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            이 과목에서 {PRACTICE_COUNT}문제가 출제됩니다.
          </p>
          <button onClick={startPractice} className="kvle-btn-primary">
            연습 시작
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
            약점 집중 연습
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{weakest.category}</p>
        </div>
        <Link href="/my-stats" className="kvle-btn-ghost text-sm">
          통계로 돌아가기
        </Link>
      </div>

      {!finished && currentQuestion && (
        <>
          <div className="mb-6 flex items-center justify-between text-sm">
            <span className="kvle-mono" style={{ color: "var(--text-muted)" }}>
              진행: {currentIndex + 1} / {sessionQuestions.length}
            </span>
            <span className="kvle-mono" style={{ color: "var(--text-muted)" }}>
              점수: {score}
            </span>
          </div>
          <QuestionCard
            key={currentQuestion.id}
            question={currentQuestion}
            onAnswer={handleAnswer}
            onNext={handleNext}
          />
        </>
      )}

      {finished && (
        <section className="kvle-card fade-in space-y-4">
          <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
            연습 완료!
          </h2>
          <p style={{ color: "var(--text-muted)" }}>
            총 <span className="kvle-mono font-bold" style={{ color: "var(--text)" }}>{sessionQuestions.length}</span>문제 중{" "}
            <span className="kvle-mono font-bold" style={{ color: "var(--gold)" }}>{score}</span>문제를 맞혔습니다.
          </p>
          <div className="flex gap-3">
            <button onClick={startPractice} className="kvle-btn-primary">
              다시 연습
            </button>
            <Link href="/my-stats" className="kvle-btn-ghost">
              통계로 돌아가기
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
