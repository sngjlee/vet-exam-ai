// app/practice/weakest/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import QuestionCard from "../../../components/QuestionCard";
import type { Question } from "../../../lib/questions";
import { createSessionQuestions } from "../../../lib/questions";
import type { WrongAnswerNote } from "../../../lib/types";
import { useAuth } from "../../../lib/hooks/useAuth";
import { useStats, type CategoryStat } from "../../../lib/hooks/useStats";
import { useAttempts } from "../../../lib/hooks/useAttempts";
import { useWrongNotes } from "../../../lib/hooks/useWrongNotes";
import { findWeakestCategory } from "../../../lib/stats/weakCategory";

const PRACTICE_COUNT = 5;

export default function PracticeWeakestPage() {
  const { user, loading: authLoading } = useAuth();
  const { stats, loading: statsLoading } = useStats(
    user?.id ?? null,
    authLoading,
  );
  const { logAttempt } = useAttempts();
  const { addNote } = useWrongNotes();

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
    const qs = createSessionQuestions(PRACTICE_COUNT, weakest.category);
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
          <h1 className="text-2xl font-semibold">Adaptive Practice</h1>
          <p className="mt-3 text-neutral-400">
            Sign in to use adaptive practice.
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

  if (!weakest) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-xl border border-neutral-700 p-6">
          <h1 className="text-2xl font-semibold">Adaptive Practice</h1>
          <p className="mt-3 text-neutral-400">
            Not enough attempt history yet. Complete a few quiz sessions first,
            then come back.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-white px-4 py-2 text-black"
          >
            Start a Quiz
          </Link>
        </div>
      </main>
    );
  }

  if (!started) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="space-y-4 rounded-xl border border-neutral-700 p-6">
          <h1 className="text-2xl font-semibold">Adaptive Practice</h1>
          <p className="text-neutral-400">Your weakest category right now:</p>
          <p className="text-xl font-bold">{weakest.category}</p>
          <p className="text-sm text-neutral-500">
            {weakest.attempts} attempts &middot; {weakest.accuracy}% accuracy
            &middot; {weakest.attempts - weakest.correct} wrong
          </p>
          <p className="text-sm text-neutral-400">
            You&apos;ll get {PRACTICE_COUNT} questions from this category.
          </p>
          <button
            onClick={startPractice}
            className="rounded-lg bg-white px-4 py-2 text-black"
          >
            Start Practice
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Adaptive Practice</h1>
          <p className="mt-2 text-neutral-400">{weakest.category}</p>
        </div>
        <Link
          href="/my-stats"
          className="rounded-lg border border-neutral-600 px-4 py-2 hover:border-neutral-400"
        >
          Back
        </Link>
      </div>

      {!finished && currentQuestion && (
        <>
          <div className="mb-6 flex items-center justify-between text-sm text-neutral-300">
            <span>
              Progress: {currentIndex + 1} / {sessionQuestions.length}
            </span>
            <span>Score: {score}</span>
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
        <section className="rounded-xl border border-neutral-700 p-6">
          <h2 className="text-2xl font-semibold">Practice Complete</h2>
          <p className="mt-2">
            You answered {score} out of {sessionQuestions.length} correctly.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              onClick={startPractice}
              className="rounded-lg border border-neutral-600 px-4 py-2 hover:border-neutral-400"
            >
              Practice Again
            </button>
            <Link
              href="/my-stats"
              className="rounded-lg bg-white px-4 py-2 text-black"
            >
              Back to My Stats
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
