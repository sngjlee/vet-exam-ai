"use client";

import { useState } from "react";
import type { Question } from "../lib/ai";

type Props = {
  question: Question;
  onNext: () => void;
  onAnswer: (isCorrect: boolean) => void;
};

export default function QuestionCard({ question, onNext, onAnswer }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const isCorrect = selected === question.answer;

  function handleSubmit() {
    if (!selected) return;
    setSubmitted(true);
    onAnswer(isCorrect);
  }

  return (
    <div style={{ marginTop: 24, maxWidth: 700 }}>
      <p><strong>Category:</strong> {question.category}</p>
      <h2>{question.question}</h2>

      <div style={{ marginTop: 16 }}>
        {question.choices.map((choice, index) => (
          <button
            key={index}
            onClick={() => setSelected(choice)}
            disabled={submitted}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              marginBottom: 10,
              padding: "12px 14px",
              border: selected === choice ? "2px solid white" : "1px solid gray",
              borderRadius: 8,
              background: "transparent",
              color: "white",
              cursor: submitted ? "default" : "pointer",
            }}
          >
            {choice}
          </button>
        ))}
      </div>

      {!submitted && (
        <button onClick={handleSubmit} style={{ marginTop: 12 }}>
          Check Answer
        </button>
      )}

      {submitted && (
        <div style={{ marginTop: 20 }}>
          <p><strong>{isCorrect ? "Correct" : "Wrong"}</strong></p>
          <p><strong>Answer:</strong> {question.answer}</p>
          <p><strong>Explanation:</strong> {question.explanation}</p>

          <button onClick={onNext} style={{ marginTop: 12 }}>
            Next Question
          </button>
        </div>
      )}
    </div>
  );
}