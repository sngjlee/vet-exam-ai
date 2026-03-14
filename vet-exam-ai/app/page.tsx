"use client";

import { useEffect, useState } from "react";
import { generateQuestion, type Question } from "../lib/ai";
import QuestionCard from "../components/QuestionCard";

const TOTAL_QUESTIONS = 5;

export default function Home() {
  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  async function loadQuestion() {
    if (questionCount >= TOTAL_QUESTIONS) {
      setFinished(true);
      return;
    }

    setLoading(true);
    const q = await generateQuestion();
    setQuestion(q);
    setLoading(false);
  }

  function handleAnswer(isCorrect: boolean) {
    if (isCorrect) {
      setScore((prev) => prev + 1);
    }
  }

  function handleNext() {
    const nextCount = questionCount + 1;
    setQuestionCount(nextCount);

    if (nextCount >= TOTAL_QUESTIONS) {
      setFinished(true);
      setQuestion(null);
      return;
    }

    loadQuestion();
  }

  function handleRestart() {
    setScore(0);
    setQuestionCount(0);
    setFinished(false);
    loadQuestion();
  }

  useEffect(() => {
    loadQuestion();
  }, []);

  return (
    <main style={{ padding: 40 }}>
      <h1>Veterinary Exam AI</h1>
      <p>AI-generated veterinary board-style questions</p>

      <div style={{ marginTop: 16 }}>
        <p><strong>Progress:</strong> {questionCount} / {TOTAL_QUESTIONS}</p>
        <p><strong>Score:</strong> {score}</p>
      </div>

      {loading && <p>Loading question...</p>}

      {!loading && !finished && question && (
        <QuestionCard
          question={question}
          onAnswer={handleAnswer}
          onNext={handleNext}
        />
      )}

      {finished && (
        <div style={{ marginTop: 24 }}>
          <h2>Session Complete</h2>
          <p>You answered {score} out of {TOTAL_QUESTIONS} correctly.</p>
          <button onClick={handleRestart}>Restart</button>
        </div>
      )}
    </main>
  );
}