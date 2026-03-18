"use client";

import { useState } from "react";
import type { Question } from "../lib/questions";
import { CheckCircle2, XCircle, ArrowRight, HelpCircle } from "lucide-react";

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
    onAnswer({ questionId: question.id, selectedAnswer: selected, isCorrect });
  }

  function getChoiceStyle(choice: string): React.CSSProperties {
    const isSelected = selected === choice;
    const isCorrectChoice = choice === question.answer;
    const isWrongSelection = submitted && isSelected && !isCorrectChoice;
    const showCorrect = submitted && isCorrectChoice;

    if (!submitted) {
      if (isSelected) {
        return {
          background: "var(--teal-dim)",
          border: "1px solid var(--teal-border)",
          color: "var(--text)",
        };
      }
      return {
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--text-muted)",
      };
    }

    if (showCorrect) {
      return {
        background: "var(--correct-dim)",
        border: "1px solid rgba(45,159,107,0.5)",
        color: "var(--text)",
      };
    }
    if (isWrongSelection) {
      return {
        background: "var(--wrong-dim)",
        border: "1px solid rgba(192,74,58,0.5)",
        color: "var(--text)",
      };
    }
    // Unchosen after reveal
    return {
      background: "var(--surface)",
      border: "1px solid var(--border)",
      color: "var(--text-muted)",
      opacity: "0.4",
    };
  }

  function getBadgeStyle(choice: string): React.CSSProperties {
    const isSelected = selected === choice;
    const isCorrectChoice = choice === question.answer;
    const isWrongSelection = submitted && isSelected && !isCorrectChoice;
    const showCorrect = submitted && isCorrectChoice;

    if (showCorrect) return { background: "var(--correct)", color: "#fff" };
    if (isWrongSelection) return { background: "var(--wrong)", color: "#fff" };
    if (isSelected && !submitted) return { background: "var(--teal)", color: "#fff" };
    return { background: "var(--surface-raised)", color: "var(--text-muted)" };
  }

  return (
    <div
      className="fade-in relative overflow-hidden"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: "4px solid var(--teal)",
        borderRadius: "12px",
        padding: "2rem",
      }}
    >
      {/* Category badge */}
      <span className="kvle-badge mb-6 inline-block">{question.category}</span>

      {/* Question text */}
      <h2
        className="mb-8 text-xl leading-relaxed font-semibold"
        style={{ color: "var(--text)" }}
      >
        {question.question}
      </h2>

      {/* Answer choices */}
      <div className="space-y-3">
        {question.choices.map((choice, index) => {
          const isCorrectChoice = choice === question.answer;
          const isWrongSelection = submitted && selected === choice && !isCorrectChoice;
          const showCorrect = submitted && isCorrectChoice;

          return (
            <button
              key={choice}
              onClick={() => !submitted && setSelected(choice)}
              disabled={submitted}
              className="w-full flex items-center justify-between rounded-xl p-4 text-left transition-all duration-200"
              style={{
                ...getChoiceStyle(choice),
                cursor: submitted ? "default" : "pointer",
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold kvle-mono transition-colors"
                  style={getBadgeStyle(choice)}
                >
                  {String.fromCharCode(65 + index)}
                </div>
                <span className="font-medium text-sm">{choice}</span>
              </div>
              {submitted && showCorrect && (
                <CheckCircle2 size={20} style={{ color: "var(--correct)", flexShrink: 0 }} />
              )}
              {submitted && isWrongSelection && (
                <XCircle size={20} style={{ color: "var(--wrong)", flexShrink: 0 }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Action area */}
      <div className="mt-8">
        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={!selected}
            className="kvle-btn-primary w-full sm:w-auto active:scale-[0.98] transition-all duration-200"
          >
            정답 확인
            <ArrowRight size={18} />
          </button>
        ) : (
          <div className="fade-in">
            {/* Feedback panel */}
            <div
              className="mb-6 rounded-xl p-5"
              style={{
                background: isCorrect ? "var(--correct-dim)" : "var(--wrong-dim)",
                border: `1px solid ${isCorrect ? "rgba(45,159,107,0.3)" : "rgba(192,74,58,0.3)"}`,
              }}
            >
              <div className="flex items-center gap-2 mb-4">
                {isCorrect ? (
                  <>
                    <CheckCircle2 size={22} style={{ color: "var(--correct)" }} />
                    <span className="text-lg font-bold" style={{ color: "var(--correct)" }}>
                      정답!
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle size={22} style={{ color: "var(--wrong)" }} />
                    <span className="text-lg font-bold" style={{ color: "var(--wrong)" }}>
                      오답
                    </span>
                  </>
                )}
              </div>

              {/* Explanation */}
              <div
                className="rounded-lg p-4"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex items-start gap-2">
                  <HelpCircle size={16} style={{ color: "var(--blue)", flexShrink: 0, marginTop: "2px" }} />
                  <div>
                    <span className="kvle-label mb-1">해설</span>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      {question.explanation}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={onNext}
              className="kvle-btn-primary w-full sm:w-auto active:scale-[0.98]"
            >
              다음 문제
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
