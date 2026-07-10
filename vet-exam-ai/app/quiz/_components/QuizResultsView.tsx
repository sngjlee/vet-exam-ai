import Link from "next/link";
import type { Question } from "../../../lib/questions";
import type { SessionWrongAnswer } from "./quiz-history";
import { BookOpen, Sparkles, CheckCircle2, RotateCcw } from "lucide-react";

type Props = {
  isMiniMock: boolean;
  sessionQuestions: Question[];
  score: number;
  accuracy: number;
  unansweredCount: number;
  elapsedLabel: string | null;
  timeExpired: boolean;
  sessionWrongAnswers: SessionWrongAnswer[];
  onRestart: () => void;
};

export function QuizResultsView({
  isMiniMock, sessionQuestions, score, accuracy, unansweredCount,
  elapsedLabel, timeExpired, sessionWrongAnswers, onRestart,
}: Props) {
  return (
    <section
      className="fade-in"
      style={{ position: "relative", maxWidth: "48rem", margin: "0 auto" }}
    >

      {/* 완료 카드 — Double-Bezel ────────────────────────────────────── */}
      <div
        style={{
          padding: "6px",
          borderRadius: "var(--radius-lg)",
          background: "var(--surface-raised)",
          border: "1px solid var(--border)",
          marginBottom: "2rem",
        }}
      >
        <div
          style={{
            borderRadius: "var(--radius-lg)",
            padding: "2rem",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
            background: "var(--surface)",
            borderTop: "3px solid var(--correct)",
            boxShadow: "inset 0 1px 0 rgba(28,45,64,0.04)",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(45,159,107,0.08) 0%, transparent 70%)",
            }}
          />
          <div style={{ position: "relative" }}>
            {/* Double-Bezel icon wrapper */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "68px",
                height: "68px",
                borderRadius: "50%",
                marginBottom: "1.25rem",
                padding: "4px",
                background: "rgba(45,159,107,0.06)",
                border: "1px solid rgba(45,159,107,0.15)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  background: "var(--correct-dim)",
                  border: "1px solid rgba(45,159,107,0.25)",
                }}
              >
                <CheckCircle2 size={30} style={{ color: "var(--correct)" }} />
              </div>
            </div>
            <h2
              className="text-2xl font-bold tracking-tight"
              style={{ color: "var(--text)", marginBottom: "0.75rem" }}
            >
              {isMiniMock ? "미니 모의고사 완료" : "세션 완료"}
            </h2>
            <p className="text-base" style={{ color: "var(--text-muted)" }}>
              총{" "}
              <span className="kvle-mono font-bold" style={{ color: "var(--text)" }}>
                {sessionQuestions.length}
              </span>
              문제 중{" "}
              <span className="kvle-mono font-bold" style={{ color: "var(--teal)" }}>
                {score}
              </span>
              문제 정답
            </p>
            {isMiniMock && timeExpired && (
              <p style={{ color: "var(--wrong)", fontSize: 13, fontWeight: 800, margin: "12px 0 0" }}>
                제한 시간이 종료되어 자동 제출되었습니다.
              </p>
            )}
            {isMiniMock && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 18,
                }}
              >
                  <span
                    style={{
                      borderRadius: "var(--radius-full)",
                      padding: "7px 11px",
                      background: "var(--teal-dim)",
                    color: "var(--teal)",
                    border: "1px solid var(--teal-border)",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                  >
                    정답률 {accuracy}%
                  </span>
                <span
                  style={{
                    borderRadius: "var(--radius-full)",
                    padding: "7px 11px",
                    background: unansweredCount > 0 ? "var(--wrong-dim)" : "var(--correct-dim)",
                    color: unansweredCount > 0 ? "var(--wrong)" : "var(--correct)",
                    border: `1px solid ${unansweredCount > 0 ? "rgba(192,74,58,0.28)" : "rgba(45,159,107,0.25)"}`,
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  미응답 {unansweredCount}문제
                </span>
                {elapsedLabel && (
                  <span
                    style={{
                      borderRadius: "var(--radius-full)",
                      padding: "7px 11px",
                      background: "var(--surface-raised)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border)",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    소요 {elapsedLabel}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 오답 개념 복습 ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: "2rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "1.5rem",
          }}
        >
          <BookOpen size={18} style={{ color: "var(--blue)" }} />
          <h3
            className="text-lg font-bold tracking-tight"
            style={{ color: "var(--text)" }}
          >
            {isMiniMock ? "모의고사 오답 해설" : "오답 개념 복습"}
          </h3>
        </div>

        {sessionWrongAnswers.length === 0 ? (
          <div
            style={{
              borderRadius: "0.75rem",
              padding: "2rem",
              textAlign: "center",
              background: "var(--surface)",
              border: "1px dashed rgba(45,159,107,0.3)",
            }}
          >
            <Sparkles
              size={24}
              style={{ color: "var(--teal)", margin: "0 auto 0.75rem" }}
            />
            <p className="font-medium text-sm" style={{ color: "var(--text-muted)" }}>
              완벽합니다. 틀린 문제가 없습니다.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {sessionWrongAnswers.map((note, idx) => (
              <div
                key={note.questionId}
                style={{
                  borderRadius: "0.75rem",
                  padding: "1.5rem",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderLeft: "3px solid rgba(192,74,58,0.5)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    marginBottom: "1rem",
                  }}
                >
                  <span className="kvle-badge">{note.category}</span>
                  <span className="kvle-mono text-xs" style={{ color: "var(--text-faint)" }}>
                    #{idx + 1}
                  </span>
                </div>
                <p
                  className="text-sm font-medium leading-relaxed"
                  style={{ color: "var(--text)", marginBottom: "1.25rem" }}
                >
                  {note.question}
                </p>
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                  style={{ marginBottom: "0.75rem" }}
                >
                  <div
                    style={{
                      borderRadius: "0.5rem",
                      padding: "1rem",
                      background: "var(--wrong-dim)",
                      border: "1px solid rgba(192,74,58,0.2)",
                    }}
                  >
                    <span
                      className="kvle-label block"
                      style={{ color: "var(--wrong)", marginBottom: "0.375rem" }}
                    >
                      내 답변
                    </span>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                      {note.selectedAnswer}
                    </p>
                  </div>
                  <div
                    style={{
                      borderRadius: "0.5rem",
                      padding: "1rem",
                      background: "var(--correct-dim)",
                      border: "1px solid rgba(45,159,107,0.2)",
                    }}
                  >
                    <span
                      className="kvle-label block"
                      style={{ color: "var(--correct)", marginBottom: "0.375rem" }}
                    >
                      정답
                    </span>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                      {note.correctAnswer}
                    </p>
                  </div>
                </div>
                <div
                  style={{
                    borderRadius: "0.5rem",
                    padding: "1rem",
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span
                    className="kvle-label block"
                    style={{ color: "var(--blue)", marginBottom: "0.375rem" }}
                  >
                    해설
                  </span>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {note.explanation}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 액션 버튼 ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3" style={{ paddingTop: "0.5rem" }}>

        {/* Button-in-Button pill — solid gold (primary) */}
        <button
          onClick={onRestart}
          className="flex-1 inline-flex items-center justify-center gap-3 font-semibold active:scale-[0.98]"
          style={{
            background: "var(--teal)",
            color: "#080D1A",
            borderRadius: "var(--radius-full)",
            padding: "10px 10px 10px 22px",
            fontSize: "0.875rem",
            border: "none",
            cursor: "pointer",
            transition: "opacity 300ms cubic-bezier(0.32,0.72,0,1), transform 200ms cubic-bezier(0.32,0.72,0,1)",
          }}
        >
          {isMiniMock ? "모의고사 다시 풀기" : "새 세션 시작"}
          <span
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              background: "rgba(0,0,0,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <RotateCcw size={14} />
          </span>
        </button>

        {/* Ghost pill — secondary */}
        <Link
          href="/wrong-notes"
          className="flex-1 inline-flex items-center justify-center gap-2 font-semibold active:scale-[0.98]"
          style={{
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-full)",
            padding: "10px 22px",
            fontSize: "0.875rem",
            transition: "color 300ms cubic-bezier(0.32,0.72,0,1), border-color 300ms cubic-bezier(0.32,0.72,0,1), transform 200ms cubic-bezier(0.32,0.72,0,1)",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--text)";
            (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--teal-border)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-muted)";
            (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)";
          }}
        >
          <BookOpen size={15} />
          전체 오답 노트 보기
        </Link>
      </div>
    </section>
  );
}
