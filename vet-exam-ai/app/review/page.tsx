// app/review/page.tsx
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import QuestionCard from "../../components/QuestionCard";
import type { Question } from "../../lib/questions";
import type { WrongAnswerNote } from "../../lib/types";
import { useReview } from "../../lib/hooks/useReview";
import { useAttempts } from "../../lib/hooks/useAttempts";

const MAX_REVIEW = 5;

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

export default function ReviewPage() {
  const { dueNotes, loading, authLoading, user, submitReview } = useReview();
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

    void submitReview(
      currentNote.questionId,
      payload.isCorrect,
      currentNote.reviewCount ?? 0,
    );

    if (payload.isCorrect) {
      setScore((prev) => prev + 1);
    }
  }

  function handleNext() {
    setCurrentIndex((prev) => prev + 1);
  }

  if (authLoading || loading) {
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
          <h1 className="text-2xl font-semibold">Review Queue</h1>
          <p className="mt-3 text-neutral-400">
            Sign in to use spaced-repetition review.
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

  if (!started && dueNotes.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-xl border border-neutral-700 p-6">
          <h1 className="text-2xl font-semibold">Review Queue</h1>
          <p className="mt-3 text-neutral-400">
            No reviews due right now. Check back later!
          </p>
          <Link
            href="/wrong-notes"
            className="mt-4 inline-block rounded-lg border border-neutral-600 px-4 py-2 hover:border-neutral-400"
          >
            Wrong Notes
          </Link>
        </div>
      </main>
    );
  }

  if (!started) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="space-y-4 rounded-xl border border-neutral-700 p-6">
          <h1 className="text-2xl font-semibold">Review Queue</h1>
          <p className="text-neutral-400">
            {dueNotes.length} item{dueNotes.length !== 1 ? "s" : ""} due for
            review.
          </p>
          <p className="text-sm text-neutral-500">
            You&apos;ll review up to {MAX_REVIEW} at a time.
          </p>
          <button
            onClick={startSession}
            className="rounded-lg bg-white px-4 py-2 text-black"
          >
            Start Review
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Review Queue</h1>
          <p className="mt-2 text-neutral-400">Spaced-repetition review</p>
        </div>
        <Link
          href="/wrong-notes"
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
          <h2 className="text-2xl font-semibold">Review Complete</h2>
          <p className="mt-2">
            You answered {score} out of {sessionQuestions.length} correctly.
          </p>
          <div className="mt-4 flex gap-3">
            <Link
              href="/wrong-notes"
              className="rounded-lg border border-neutral-600 px-4 py-2 hover:border-neutral-400"
            >
              Wrong Notes
            </Link>
            <Link href="/" className="rounded-lg bg-white px-4 py-2 text-black">
              Back Home
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
