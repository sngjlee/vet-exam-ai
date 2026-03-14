// components/QuestionCard.tsx
"use client";

import { useState } from "react";
import type { Question } from "../lib/questions";

type AnswerPayload = {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
};

type Props = {
  question: Question;
  onNext: () => void;
  onAnswer: (payload: AnswerPayload) => void;
};

export default function QuestionCard({ question, onNext, onAnswer }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const isCorrect = selected === question.answer;

  function handleSubmit() {
    if (!selected) return;

    setSubmitted(true);

    onAnswer({
      questionId: question.id,
      selectedAnswer: selected,
      isCorrect,
    });
  }

  return (
    <div className="rounded-xl border border-neutral-700 p-6">
      <p className="mb-2 text-sm text-neutral-400">
        Category: {question.category}
      </p>

      <h2 className="mb-4 text-xl font-semibold">{question.question}</h2>

      <div className="space-y-3">
        {question.choices.map((choice) => (
          <button
            key={choice}
            onClick={() => setSelected(choice)}
            disabled={submitted}
            className={`block w-full rounded-lg border px-4 py-3 text-left transition ${
              selected === choice
                ? "border-white"
                : "border-neutral-600 hover:border-neutral-400"
            } ${submitted ? "cursor-default" : "cursor-pointer"}`}
          >
            {choice}
          </button>
        ))}
      </div>

      {!submitted && (
        <button
          onClick={handleSubmit}
          className="mt-5 rounded-lg bg-white px-4 py-2 text-black"
        >
          Check Answer
        </button>
      )}

      {submitted && (
        <div className="mt-5 space-y-3">
          <p className="font-semibold">{isCorrect ? "Correct" : "Wrong"}</p>
          <p>Answer: {question.answer}</p>
          <p>Explanation: {question.explanation}</p>

          <button
            onClick={onNext}
            className="rounded-lg bg-white px-4 py-2 text-black"
          >
            Next Question
          </button>
        </div>
      )}
    </div>
  );
}