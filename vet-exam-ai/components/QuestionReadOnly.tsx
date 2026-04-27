"use client";

import { CheckCircle2, HelpCircle } from "lucide-react";
import type { Question } from "../lib/questions";

const SUBJECT_COLORS: Record<string, string> = {
  "약리학": "#9B6FD4",
  "내과학": "#1ea7bb",
  "외과학": "#4A7FA8",
  "생화학": "#C8895A",
  "병리학": "#2D9F6B",
};

function SubjectChip({ subject }: { subject: string }) {
  const color = SUBJECT_COLORS[subject] ?? "#4A7FA8";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: `${color}18`,
        border: `1px solid ${color}40`,
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 700,
        color,
        letterSpacing: "0.04em",
        flexShrink: 0,
      }}
    >
      {subject}
    </span>
  );
}

type Props = {
  question: Question;
};

export default function QuestionReadOnly({ question }: Props) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: "4px solid var(--teal)",
        borderRadius: 14,
        padding: "28px 32px",
      }}
    >
      {/* Meta row */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 18 }}>
        <SubjectChip subject={question.category} />
        <span
          style={{
            fontSize: 10,
            color: "var(--text-faint)",
            fontWeight: 600,
            letterSpacing: "0.1em",
            fontFamily: "var(--font-mono)",
          }}
        >
          {question.id}
        </span>
      </div>

      {/* Question stem */}
      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1.5,
          color: "var(--text)",
          margin: "0 0 24px",
        }}
      >
        {question.question}
      </h2>

      {/* Choices — read-only, correct answer pre-revealed */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {question.choices.map((choice, idx) => {
          const isCorrect = choice === question.answer;
          const letter = String.fromCharCode(65 + idx);
          return (
            <div
              key={choice}
              style={{
                background: isCorrect ? "var(--correct-dim)" : "var(--bg)",
                border: `1px solid ${isCorrect ? "rgba(45,159,107,0.5)" : "var(--border)"}`,
                color: isCorrect ? "var(--text)" : "var(--text-muted)",
                opacity: isCorrect ? 1 : 0.85,
                borderRadius: 12,
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  background: isCorrect ? "var(--correct)" : "var(--surface-raised)",
                  color: isCorrect ? "#fff" : "var(--text-muted)",
                  width: 28,
                  height: 28,
                  flexShrink: 0,
                  borderRadius: 8,
                  display: "grid",
                  placeItems: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {letter}
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{choice}</span>
              {isCorrect && (
                <CheckCircle2 size={18} style={{ color: "var(--correct)", flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Explanation */}
      <div
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          padding: "14px 16px",
          borderRadius: 10,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <HelpCircle
            size={16}
            style={{ color: "var(--blue)", marginTop: 2, flexShrink: 0 }}
          />
          <div>
            <span className="kvle-label" style={{ color: "var(--blue)" }}>
              해설
            </span>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                lineHeight: 1.7,
                margin: "6px 0 0",
              }}
            >
              {question.explanation}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
