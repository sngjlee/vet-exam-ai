"use client";

import { useAuth } from "../../lib/hooks/useAuth";
import { useDueCountCtx } from "../../lib/context/DueCountContext";
import { useQuestionMeta } from "../../lib/hooks/useQuestionMeta";
import { useQuizSession } from "../../lib/hooks/useQuizSession";
import { QuizSetupView } from "./_components/QuizSetupView";
import { QuizActiveView } from "./_components/QuizActiveView";
import { QuizResultsView } from "./_components/QuizResultsView";

export default function QuizPage() {
  const { meta, loading: metaLoading, error: metaError } = useQuestionMeta();
  const { user, loading: authLoading } = useAuth();
  const dueCount = useDueCountCtx();
  const {
    started, finished, isMiniMock,
    currentQuestion, currentIndex, sessionQuestions, score, commentCounts,
    remainingSeconds, timerIsUrgent, accuracy, elapsedLabel, unansweredCount,
    timeExpired, sessionWrongAnswers, miniMockHistory,
    sessionLoading, sessionError,
    startSession, handleAnswer, handleNext, handleRestart, quit,
  } = useQuizSession(meta);

  return (
    <main
      style={{
        position: "relative",
        maxWidth: "80rem",
        margin: "0 auto",
        padding: "3rem 1.5rem",
        overflow: "hidden",
      }}
    >

      {/* ━━━━ 배경 gradient orbs — pointer-events-none, no blur (GPU-safe) ━━ */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
      >
        {/* 우상단 teal orb */}
        <div
          style={{
            position: "absolute",
            width: "800px",
            height: "800px",
            top: "-280px",
            right: "-160px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(30,167,187,0.05) 0%, transparent 65%)",
          }}
        />
        {/* 좌하단 slate orb */}
        <div
          style={{
            position: "absolute",
            width: "600px",
            height: "600px",
            bottom: "-80px",
            left: "-150px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(74,127,168,0.04) 0%, transparent 65%)",
          }}
        />
      </div>

      {!started && (
        <QuizSetupView
          meta={meta}
          metaLoading={metaLoading}
          metaError={metaError}
          sessionLoading={sessionLoading}
          sessionError={sessionError}
          user={user}
          authLoading={authLoading}
          dueCount={dueCount}
          miniMockHistory={miniMockHistory}
          onStart={startSession}
        />
      )}

      {/* ━━━━ 활성 세션 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {started && !finished && currentQuestion && (
        <QuizActiveView
          isMiniMock={isMiniMock}
          remainingSeconds={remainingSeconds}
          timerIsUrgent={timerIsUrgent}
          currentQuestion={currentQuestion}
          currentIndex={currentIndex}
          total={sessionQuestions.length}
          commentCount={commentCounts.get(currentQuestion.id)}
          onAnswer={handleAnswer}
          onNext={handleNext}
          onQuit={quit}
        />
      )}

      {/* ━━━━ 결과 화면 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {finished && (
        <QuizResultsView
          isMiniMock={isMiniMock}
          sessionQuestions={sessionQuestions}
          score={score}
          accuracy={accuracy}
          unansweredCount={unansweredCount}
          elapsedLabel={elapsedLabel}
          timeExpired={timeExpired}
          sessionWrongAnswers={sessionWrongAnswers}
          onRestart={handleRestart}
        />
      )}
    </main>
  );
}
