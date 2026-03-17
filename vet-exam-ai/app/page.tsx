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
  // One UUID per quiz session; refreshed each time startSession() is called.
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const currentQuestion = sessionQuestions[currentIndex];
  const finished = started && currentIndex >= sessionQuestions.length;

  function startSession() {
    const categoryFilter =
      selectedCategory === "All" ? undefined : selectedCategory;

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

    const newWrongNote: WrongAnswerNote = {
      questionId: currentQuestion.id,
      question: currentQuestion.question,
      category: currentQuestion.category,
      choices: currentQuestion.choices,
      correctAnswer: currentQuestion.answer,
      selectedAnswer: payload.selectedAnswer,
      explanation: currentQuestion.explanation,
    };

    void addNote(newWrongNote);
  }

  function handleNext() {
    setCurrentIndex((prev) => prev + 1);
  }

  function handleRestart() {
    startSession();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <h1 className="mb-2 text-3xl font-bold">Veterinary Exam AI</h1>
        <p className="text-neutral-400">
          Veterinary board-style question practice
        </p>
      </div>

      {!started && !authLoading && user && (
        <section className="mb-4 flex items-center justify-between rounded-xl border border-neutral-700 px-5 py-4">
          <div>
            <p className="text-sm font-medium">Due for review</p>
            {dueCount > 0 ? (
              <p className="text-2xl font-bold">{dueCount}</p>
            ) : (
              <p className="text-sm text-neutral-400">No reviews due today</p>
            )}
          </div>
          {dueCount > 0 && (
            <Link
              href="/review"
              className="rounded-lg bg-white px-4 py-2 text-sm text-black"
            >
              Start Review
            </Link>
          )}
        </section>
      )}

      {!started && (
        <section className="rounded-xl border border-neutral-700 p-6">
          <h2 className="mb-4 text-xl font-semibold">Start New Session</h2>

          <label className="mb-2 block text-sm font-medium">
            Select subject
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="mb-4 w-full rounded-lg border border-neutral-600 bg-transparent px-3 py-2"
          >
            <option value="All">All</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <button
            onClick={startSession}
            disabled={questionsLoading}
            className="rounded-lg bg-white px-4 py-2 text-black disabled:opacity-50"
          >
            {questionsLoading ? "Loading questions…" : "Start Session"}
          </button>
        </section>
      )}

      {started && !finished && currentQuestion && (
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
        <section className="space-y-6 rounded-xl border border-neutral-700 p-6">
          <div>
            <h2 className="text-2xl font-semibold">Session Complete</h2>
            <p className="mt-2">
              You answered {score} out of {sessionQuestions.length} correctly.
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-xl font-semibold">Wrong Answer Notes</h3>

            {wrongNotes.length === 0 ? (
              <p>No wrong answers saved yet.</p>
            ) : (
              <div className="space-y-4">
                {wrongNotes.map((note) => (
                  <div
                    key={note.questionId}
                    className="rounded-lg border border-neutral-700 p-4"
                  >
                    <p className="mb-1 text-sm text-neutral-400">
                      {note.category}
                    </p>
                    <p className="mb-2 font-medium">{note.question}</p>
                    <p>My answer: {note.selectedAnswer}</p>
                    <p>Correct answer: {note.correctAnswer}</p>
                    <p className="mt-2 text-neutral-300">
                      Explanation: {note.explanation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRestart}
              className="rounded-lg bg-white px-4 py-2 text-black"
            >
              Restart
            </button>

            <Link
              href="/wrong-notes"
              className="rounded-lg border border-neutral-600 px-4 py-2"
            >
              View Wrong Notes
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}