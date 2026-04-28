// components/QuestionCard.tsx
"use client";

import { useEffect, useState } from "react";
import type { Question } from "../lib/questions";
import { formatPublicId } from "../lib/questions";
import { CheckCircle2, XCircle, ArrowRight, HelpCircle, Clock } from "lucide-react";
import CommentThread from "./comments/CommentThread";

type AnswerPayload = {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
};

type Props = {
  question: Question;
  questionNumber: number;
  total: number;
  onNext: () => void;
  onAnswer: (payload: AnswerPayload) => void;
  onQuit?: () => void;
  commentCount?: number;
};

// ── Subject chip ────────────────────────────────────────────────────────────
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

// ── Main component ──────────────────────────────────────────────────────────
export default function QuestionCard({
  question,
  questionNumber,
  total,
  onNext,
  onAnswer,
  onQuit,
  commentCount,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState<"official" | "community">("official");

  // Per-question elapsed timer (decorative, resets when component remounts)
  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const isCorrect = selected === question.answer;
  const progress = (questionNumber / total) * 100;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

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
    const dimmed = submitted && !isCorrectChoice && !isSelected;

    if (!submitted) {
      if (isSelected)
        return { background: "var(--teal-dim)", border: "1px solid var(--teal-border)", color: "var(--text)" };
      return { background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)" };
    }
    if (showCorrect)
      return { background: "var(--correct-dim)", border: "1px solid rgba(45,159,107,0.5)", color: "var(--text)" };
    if (isWrongSelection)
      return { background: "var(--wrong-dim)", border: "1px solid rgba(192,74,58,0.5)", color: "var(--text)" };
    if (dimmed)
      return { background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)", opacity: 0.4 };
    return { background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)" };
  }

  function getBadgeStyle(choice: string): React.CSSProperties {
    const isSelected = selected === choice;
    const isCorrectChoice = choice === question.answer;
    const isWrongSelection = submitted && isSelected && !isCorrectChoice;
    const showCorrect = submitted && isCorrectChoice;

    if (showCorrect) return { background: "var(--correct)", color: "#fff" };
    if (isWrongSelection) return { background: "var(--wrong)", color: "#fff" };
    if (isSelected && !submitted) return { background: "var(--teal)", color: "#061218" };
    return { background: "var(--surface-raised)", color: "var(--text-muted)" };
  }

  return (
    <div>
      {/* ── Progress header ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          gap: 16,
        }}
      >
        <button
          onClick={onQuit}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
            padding: "6px 12px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            visibility: onQuit ? "visible" : "hidden",
          }}
        >
          ← 세션 종료
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            <span style={{ color: "var(--teal)", fontWeight: 700 }}>{questionNumber}</span>
            {" / "}
            {total}
          </span>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10,
              color: "var(--text-faint)",
            }}
          >
            <Clock size={11} />
            {mm}:{ss}
          </div>
        </div>
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <div
        style={{
          height: 3,
          background: "var(--surface-raised)",
          borderRadius: 999,
          marginBottom: 24,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: "var(--teal)",
            borderRadius: 999,
            transition: "width 300ms cubic-bezier(0.32,0.72,0,1)",
          }}
        />
      </div>

      {/* ── Card ─────────────────────────────────────────────────────────── */}
      <div
        className="fade-in"
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
            {formatPublicId(question)}
          </span>
        </div>

        {/* Question */}
        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1.5,
            color: "var(--text)",
            margin: "0 0 28px",
          }}
        >
          {question.question}
        </h2>

        {/* Choices */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {question.choices.map((choice, idx) => {
            const isCorrectChoice = choice === question.answer;
            const isWrongSelection = submitted && selected === choice && !isCorrectChoice;
            const showCorrect = submitted && isCorrectChoice;
            const letter = String.fromCharCode(65 + idx);

            return (
              <button
                key={choice}
                onClick={() => !submitted && setSelected(choice)}
                disabled={submitted}
                style={{
                  ...getChoiceStyle(choice),
                  borderRadius: 12,
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  cursor: submitted ? "default" : "pointer",
                  width: "100%",
                  textAlign: "left",
                  transition: "all 150ms",
                }}
              >
                <div
                  style={{
                    ...getBadgeStyle(choice),
                    width: 30,
                    height: 30,
                    flexShrink: 0,
                    borderRadius: 8,
                    display: "grid",
                    placeItems: "center",
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {letter}
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{choice}</span>
                {showCorrect && (
                  <CheckCircle2 size={18} style={{ color: "var(--correct)", flexShrink: 0 }} />
                )}
                {isWrongSelection && (
                  <XCircle size={18} style={{ color: "var(--wrong)", flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Action area */}
        <div style={{ marginTop: 24 }}>
          {!submitted ? (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={handleSubmit}
                disabled={selected === null}
                style={{
                  background: "var(--teal)",
                  color: "#061218",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: selected === null ? "not-allowed" : "pointer",
                  opacity: selected === null ? 0.4 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "opacity 150ms",
                }}
              >
                정답 확인 <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <div className="fade-in">
              {/* Feedback panel */}
              <div
                style={{
                  padding: "16px 18px",
                  borderRadius: 12,
                  marginBottom: 18,
                  background: isCorrect ? "var(--correct-dim)" : "var(--wrong-dim)",
                  border: `1px solid ${isCorrect ? "rgba(45,159,107,0.3)" : "rgba(192,74,58,0.3)"}`,
                }}
              >
                {/* Feedback header */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  {isCorrect ? (
                    <CheckCircle2 size={18} style={{ color: "var(--correct)" }} />
                  ) : (
                    <XCircle size={18} style={{ color: "var(--wrong)" }} />
                  )}
                  <span
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontWeight: 800,
                      fontSize: 16,
                      color: isCorrect ? "var(--correct)" : "var(--wrong)",
                    }}
                  >
                    {isCorrect ? "정답입니다" : "오답"}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-faint)",
                    }}
                  >
                    SRS: +{isCorrect ? "2.5" : "0"}일 · 다음 복습 {isCorrect ? "3일 후" : "1일 후"}
                  </span>
                </div>

                {/* Tab header */}
                <div
                  role="tablist"
                  aria-label="해설 / 커뮤니티 탭"
                  style={{
                    display: "flex",
                    gap: 4,
                    borderBottom: "1px solid var(--border)",
                    marginBottom: 12,
                  }}
                >
                  <button
                    role="tab"
                    aria-selected={activeTab === "official"}
                    onClick={() => setActiveTab("official")}
                    style={{
                      background: "transparent",
                      border: "none",
                      borderBottom: activeTab === "official" ? "2px solid var(--text)" : "2px solid transparent",
                      padding: "8px 12px",
                      fontSize: 13,
                      fontWeight: activeTab === "official" ? 700 : 500,
                      color: activeTab === "official" ? "var(--text)" : "var(--text-faint)",
                      cursor: "pointer",
                      marginBottom: -1,
                    }}
                  >
                    공식 해설
                  </button>
                  <button
                    role="tab"
                    aria-selected={activeTab === "community"}
                    onClick={() => setActiveTab("community")}
                    style={{
                      background: "transparent",
                      border: "none",
                      borderBottom: activeTab === "community" ? "2px solid var(--text)" : "2px solid transparent",
                      padding: "8px 12px",
                      fontSize: 13,
                      fontWeight: activeTab === "community" ? 700 : 500,
                      color: activeTab === "community" ? "var(--text)" : "var(--text-faint)",
                      cursor: "pointer",
                      marginBottom: -1,
                    }}
                  >
                    커뮤니티 토론
                    {commentCount !== undefined && ` (${commentCount})`}
                    {commentCount !== undefined && commentCount >= 5 && (
                      <span aria-hidden="true" style={{ marginLeft: 4, color: "var(--teal)" }}>
                        •
                      </span>
                    )}
                  </button>
                </div>

                {/* Tab panel */}
                {activeTab === "official" ? (
                  <div
                    role="tabpanel"
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
                ) : (
                  <div role="tabpanel">
                    <CommentThread questionId={question.id} />
                  </div>
                )}
              </div>

              {/* Action row */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                {!isCorrect ? (
                  <button
                    style={{
                      background: "transparent",
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      padding: "10px 16px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "default",
                    }}
                  >
                    오답 노트에 저장됨
                  </button>
                ) : (
                  <div />
                )}
                <button
                  onClick={onNext}
                  style={{
                    background: "var(--teal)",
                    color: "#061218",
                    border: "none",
                    padding: "10px 18px 10px 22px",
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  다음 문제 <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
