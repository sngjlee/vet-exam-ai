// app/retry-wrong/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import QuestionCard from "../../components/QuestionCard";
import type { Question } from "../../lib/questions";
import { RETRY_SESSION_KEY } from "../../lib/storage";
import { useWrongNotes } from "../../lib/hooks/useWrongNotes";
import { useAttempts } from "../../lib/hooks/useAttempts";
import LoadingSpinner from "../../components/LoadingSpinner";

export default function RetryWrongPage() {
  const { addNote, deleteNote } = useWrongNotes();
  const { logAttempt } = useAttempts();
  const sessionIdRef = useRef<string>(crypto.randomUUID());
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
      void deleteNote(payload.questionId);
    } else {
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
  }

  function handleNext() {
    setCurrentIndex((prev) => prev + 1);
  }

  if (!loaded) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <LoadingSpinner />
      </main>
    );
  }

  if (sessionQuestions.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="kvle-card">
          <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
            오답 재풀이
          </h1>
          <p className="mb-4" style={{ color: "var(--text-muted)" }}>
            재풀이할 문제가 없습니다.
          </p>
          <Link href="/wrong-notes" className="kvle-btn-ghost text-sm">
            오답 노트로
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
            오답 재풀이
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            이전에 틀린 문제를 다시 풀어보세요
          </p>
        </div>
        <Link href="/wrong-notes" className="kvle-btn-ghost text-sm">
          돌아가기
        </Link>
      </div>

      {!finished && currentQuestion && (
        <QuestionCard
          question={currentQuestion}
          questionNumber={currentIndex + 1}
          total={sessionQuestions.length}
          onAnswer={handleAnswer}
          onNext={handleNext}
        />
      )}

      {finished && (
        <section className="kvle-card fade-in space-y-4">
          <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
            재풀이 완료!
          </h2>
          <p style={{ color: "var(--text-muted)" }}>
            총 <span className="kvle-mono font-bold" style={{ color: "var(--text)" }}>{sessionQuestions.length}</span>문제 중{" "}
            <span className="kvle-mono font-bold" style={{ color: "var(--teal)" }}>{score}</span>문제를 맞혔습니다.
          </p>
          <div className="flex gap-3">
            <Link href="/wrong-notes" className="kvle-btn-ghost">
              오답 노트로
            </Link>
            <Link href="/dashboard" className="kvle-btn-primary">
              홈으로
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
