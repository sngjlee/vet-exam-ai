// app/review/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
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
  const { dueNotes, loading, authLoading, user, submitReview, refreshDue } = useReview();
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
            복습 큐
          </h1>
          <p className="mb-4" style={{ color: "var(--text-muted)" }}>
            간격 반복 복습을 사용하려면 로그인하세요.
          </p>
          <Link href="/auth/login" className="kvle-btn-primary text-sm">
            로그인
          </Link>
        </div>
      </main>
    );
  }

  if (!started && dueNotes.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="kvle-card">
          <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
            복습 큐
          </h1>
          <p className="mb-4" style={{ color: "var(--text-muted)" }}>
            지금 복습할 항목이 없습니다. 나중에 다시 확인하세요.
          </p>
          <Link href="/wrong-notes" className="kvle-btn-ghost text-sm">
            오답 노트
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
            복습 큐
          </h1>
          <p style={{ color: "var(--text-muted)" }}>
            {dueNotes.length}개 문제 복습 대기중
          </p>
          <p className="text-sm" style={{ color: "var(--text-faint)" }}>
            한 번에 최대 {MAX_REVIEW}문제씩 복습합니다.
          </p>
          <button onClick={startSession} className="kvle-btn-primary">
            복습 시작
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
            복습 큐
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>간격 반복 복습</p>
        </div>
        <Link href="/wrong-notes" className="kvle-btn-ghost text-sm">
          돌아가기
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
        <section className="kvle-card space-y-6 fade-in">
          <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
            복습 완료!
          </h2>

          <div className="flex gap-6 text-sm">
            <div>
              <span className="kvle-label mb-1">복습한 문제</span>
              <p className="text-xl font-bold kvle-mono" style={{ color: "var(--text)" }}>{sessionQuestions.length}</p>
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

          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
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
            <Link href="/" className="kvle-btn-ghost">
              홈으로
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
