import QuestionCard from "../../../components/QuestionCard";
import { formatDuration } from "./quiz-history";
import type { Question } from "../../../lib/questions";
import { Timer, AlertTriangle } from "lucide-react";

type Props = {
  isMiniMock: boolean;
  remainingSeconds: number | null;
  timerIsUrgent: boolean;
  currentQuestion: Question;
  currentIndex: number;
  total: number;
  commentCount: number | undefined;
  onAnswer: (p: { questionId: string; selectedAnswer: string; isCorrect: boolean }) => void;
  onNext: () => void;
  onQuit: () => void;
};

export function QuizActiveView({
  isMiniMock, remainingSeconds, timerIsUrgent, currentQuestion,
  currentIndex, total, commentCount, onAnswer, onNext, onQuit,
}: Props) {
  return (
    <div style={{ position: "relative", maxWidth: "48rem", margin: "0 auto" }}>
      {isMiniMock && remainingSeconds !== null && (
        <section
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            padding: "14px 16px",
            marginBottom: 16,
            borderRadius: "var(--radius-md)",
            background: timerIsUrgent ? "var(--wrong-dim)" : "var(--surface)",
            border: `1px solid ${timerIsUrgent ? "rgba(192,74,58,0.35)" : "var(--border)"}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span
              style={{
                width: 34,
                height: 34,
                display: "grid",
                placeItems: "center",
                borderRadius: "var(--radius-sm)",
                color: timerIsUrgent ? "var(--wrong)" : "var(--blue)",
                background: timerIsUrgent ? "rgba(192,74,58,0.12)" : "var(--blue-dim)",
              }}
            >
              {timerIsUrgent ? <AlertTriangle size={17} /> : <Timer size={17} />}
            </span>
            <div>
              <span className="kvle-label" style={{ color: timerIsUrgent ? "var(--wrong)" : "var(--blue)", fontSize: 11 }}>
                제한 시간
              </span>
              <p style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.35, margin: "3px 0 0" }}>
                시간이 끝나면 현재 답안으로 자동 제출됩니다.
              </p>
            </div>
          </div>
          <strong
            style={{
              flexShrink: 0,
              fontFamily: "var(--font-mono)",
              fontSize: 24,
              lineHeight: 1,
              color: timerIsUrgent ? "var(--wrong)" : "var(--text)",
            }}
          >
            {formatDuration(remainingSeconds)}
          </strong>
        </section>
      )}
      <QuestionCard
        key={currentQuestion.id}
        question={currentQuestion}
        questionNumber={currentIndex + 1}
        total={total}
        onAnswer={onAnswer}
        onNext={onNext}
        onQuit={onQuit}
        commentCount={commentCount}
        feedbackMode={isMiniMock ? "deferred" : "instant"}
        sessionLabel={isMiniMock ? "모의고사" : "세션"}
      />
    </div>
  );
}
