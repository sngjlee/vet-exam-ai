// app/retry-wrong/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QuestionCard from "../../components/QuestionCard";
import type { Question } from "../../lib/questions";
import { RETRY_SESSION_KEY } from "../../lib/storage";
import { useWrongNotes } from "../../lib/hooks/useWrongNotes";

export default function RetryWrongPage() {
  const { deleteNote } = useWrongNotes();
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const currentQuestion = sessionQuestions[currentIndex];
  const finished = loaded && currentIndex >= sessionQuestions.length;

  useEffect(() => {
    const saved = localStorage.getItem(RETRY_SESSION_KEY);

    if (saved) {
      try {
        const parsed: Question[] = JSON.parse(saved);
        setSessionQuestions(parsed);
      } catch (error) {
        console.error("Failed to parse retry session:", error);
      }
    }

    setLoaded(true);
  }, []);

  function handleAnswer(payload: {
    questionId: string;
    selectedAnswer: string;
    isCorrect: boolean;
  }) {
    if (payload.isCorrect) {
      setScore((prev) => prev + 1);
      void deleteNote(payload.questionId);
    }
  }

  function handleNext() {
    setCurrentIndex((prev) => prev + 1);
  }

  if (!loaded) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p>Loading...</p>
      </main>
    );
  }

  if (sessionQuestions.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-xl border border-neutral-700 p-6">
          <h1 className="text-2xl font-semibold">Retry Wrong Answers</h1>
          <p className="mt-3 text-neutral-400">
            There are no retry questions available.
          </p>
          <Link
            href="/wrong-notes"
            className="mt-4 inline-block rounded-lg border border-neutral-600 px-4 py-2"
          >
            Back to Wrong Notes
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Retry Wrong Answers</h1>
          <p className="mt-2 text-neutral-400">
            Re-attempt previously incorrect questions
          </p>
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
            question={currentQuestion}
            onAnswer={handleAnswer}
            onNext={handleNext}
          />
        </>
      )}

      {finished && (
        <section className="rounded-xl border border-neutral-700 p-6">
          <h2 className="text-2xl font-semibold">Retry Complete</h2>
          <p className="mt-2">
            You answered {score} out of {sessionQuestions.length} correctly.
          </p>

          <div className="mt-4 flex gap-3">
            <Link
              href="/wrong-notes"
              className="rounded-lg border border-neutral-600 px-4 py-2"
            >
              Back to Wrong Notes
            </Link>

            <Link
              href="/"
              className="rounded-lg bg-white px-4 py-2 text-black"
            >
              Back Home
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}