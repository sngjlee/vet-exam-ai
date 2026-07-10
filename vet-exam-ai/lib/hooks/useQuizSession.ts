"use client";

import { useEffect, useRef, useState } from "react";
import type { Question } from "../questions";
import { useWrongNotes } from "./useWrongNotes";
import { useAttempts } from "./useAttempts";
import { useAuth } from "./useAuth";
import { createClient } from "../supabase/client";
import type { QuestionMeta } from "./useQuestionMeta";
import {
  TOTAL_QUESTIONS,
  MINI_MOCK_COUNT,
  MINI_MOCK_SECONDS,
  MINI_MOCK_HISTORY_LIMIT,
  readMiniMockHistory,
  writeMiniMockHistory,
  toMiniMockHistoryItem,
  formatDuration,
} from "../../app/quiz/_components/quiz-history";
import type {
  SessionMode,
  SessionStartPayload,
  SessionWrongAnswer,
  MiniMockHistoryItem,
} from "../../app/quiz/_components/quiz-history";

export function useQuizSession(meta: QuestionMeta | null) {
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [started, setStarted] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map());
  const [sessionMode, setSessionMode] = useState<SessionMode>("practice");
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [sessionEndedAt, setSessionEndedAt] = useState<number | null>(null);
  const [sessionWrongAnswers, setSessionWrongAnswers] = useState<SessionWrongAnswer[]>([]);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [timeExpired, setTimeExpired] = useState(false);
  const [miniMockHistory, setMiniMockHistory] = useState<MiniMockHistoryItem[]>([]);
  const { addNote } = useWrongNotes();
  const { logAttempt } = useAttempts();
  const { user } = useAuth();
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const savedMiniMockResultRef = useRef<string | null>(null);

  const currentQuestion = sessionQuestions[currentIndex];
  const finished = started && currentIndex >= sessionQuestions.length;
  const isMiniMock = sessionMode === "mini-mock";
  const accuracy =
    sessionQuestions.length > 0 ? Math.round((score / sessionQuestions.length) * 100) : 0;
  const elapsedSeconds =
    sessionStartedAt && sessionEndedAt
      ? Math.max(0, Math.round((sessionEndedAt - sessionStartedAt) / 1000))
      : null;
  const elapsedLabel = elapsedSeconds !== null ? formatDuration(elapsedSeconds) : null;
  const miniMockEndsAt = isMiniMock && sessionStartedAt ? sessionStartedAt + MINI_MOCK_SECONDS * 1000 : null;
  const remainingSeconds =
    miniMockEndsAt && !finished
      ? Math.max(0, Math.ceil((miniMockEndsAt - clockNow) / 1000))
      : null;
  const answeredCount = score + sessionWrongAnswers.length;
  const unansweredCount = Math.max(0, sessionQuestions.length - answeredCount);
  const timerIsUrgent = remainingSeconds !== null && remainingSeconds <= 60;

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      const localHistory = readMiniMockHistory();
      if (!user) {
        setMiniMockHistory(localHistory);
        return;
      }

      const supabase = createClient();
      const { data, error } = await supabase
        .from("mock_exam_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("completed_at", { ascending: false })
        .limit(MINI_MOCK_HISTORY_LIMIT);

      if (cancelled) return;
      if (error) {
        setMiniMockHistory(localHistory);
        return;
      }

      const remoteHistory = (data ?? []).map(toMiniMockHistoryItem);
      setMiniMockHistory(remoteHistory.length > 0 ? remoteHistory : localHistory);
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!started || finished || !isMiniMock || !sessionStartedAt) return;

    const id = window.setInterval(() => {
      const now = Date.now();
      setClockNow(now);
      if (now >= sessionStartedAt + MINI_MOCK_SECONDS * 1000) {
        setTimeExpired(true);
        setSessionEndedAt(sessionStartedAt + MINI_MOCK_SECONDS * 1000);
        setCurrentIndex(sessionQuestions.length);
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [finished, isMiniMock, sessionQuestions.length, sessionStartedAt, started]);

  async function startSession(payload?: SessionStartPayload) {
    const subjects = payload?.subjects ?? [];
    const count = payload?.count ?? TOTAL_QUESTIONS;
    const mode = payload?.mode ?? "practice";

    setSessionLoading(true);
    setSessionError(null);

    const params = new URLSearchParams({
      session: "1",
      count: String(count),
    });
    if (mode === "mini-mock") {
      params.set("balanced", "1");
    }
    if (subjects.length > 0) {
      params.set("categories", subjects.join(","));
    }

    let newSession: Question[];
    try {
      const res = await fetch(`/api/questions?${params.toString()}`);
      if (!res.ok) {
        setSessionError("failed");
        setSessionLoading(false);
        return;
      }
      newSession = (await res.json()) as Question[];
    } catch {
      // Network failure or malformed JSON — surface the error and clear the
      // spinner instead of leaving the session stuck loading.
      setSessionError("failed");
      setSessionLoading(false);
      return;
    }
    setSessionLoading(false);
    if (newSession.length === 0) return;

    sessionIdRef.current = crypto.randomUUID();
    setSessionQuestions(newSession);
    setCurrentIndex(0);
    setScore(0);
    setSessionMode(mode);
    const now = Date.now();
    setSessionStartedAt(now);
    setClockNow(now);
    setSessionEndedAt(null);
    setTimeExpired(false);
    setSessionWrongAnswers([]);
    savedMiniMockResultRef.current = null;
    setStarted(true);

    // 세션 시작 시 댓글 수 batch fetch (1회). 실패 시 빈 Map → undefined commentCount → 카운트 미표시.
    const ids = newSession.map((q) => q.id).join(",");
    fetch(`/api/comments/counts?ids=${encodeURIComponent(ids)}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, number>) => setCommentCounts(new Map(Object.entries(data))))
      .catch(() => setCommentCounts(new Map()));
  }

  function handleAnswer(payload: {
    questionId: string;
    selectedAnswer: string;
    isCorrect: boolean;
  }) {
    if (!currentQuestion) return;
    void logAttempt({
      sessionId: sessionIdRef.current,
      questionId: currentQuestion.id,
      category: currentQuestion.category,
      selectedAnswer: payload.selectedAnswer,
      correctAnswer: currentQuestion.answer,
      isCorrect: payload.isCorrect,
    });
    if (payload.isCorrect) {
      setScore((prev) => prev + 1);
      return;
    }
    setSessionWrongAnswers((prev) => [
      ...prev,
      {
        questionId: currentQuestion.id,
        question: currentQuestion.question,
        category: currentQuestion.category,
        selectedAnswer: payload.selectedAnswer,
        correctAnswer: currentQuestion.answer,
        explanation: currentQuestion.explanation,
      },
    ]);
    void addNote({
      questionId: currentQuestion.id,
      question: currentQuestion.question,
      category: currentQuestion.category,
      choices: currentQuestion.choices,
      correctAnswer: currentQuestion.answer,
      selectedAnswer: payload.selectedAnswer,
      explanation: currentQuestion.explanation,
    });
  }

  function handleNext() {
    setCurrentIndex((prev) => {
      const next = prev + 1;
      if (next >= sessionQuestions.length) {
        setSessionEndedAt(Date.now());
      }
      return next;
    });
  }
  function handleRestart() {
    if (isMiniMock) {
      startSession({ subjects: [], count: Math.min(MINI_MOCK_COUNT, meta?.total ?? MINI_MOCK_COUNT), mode: "mini-mock" });
      return;
    }
    startSession();
  }

  useEffect(() => {
    if (!finished || !isMiniMock || !sessionEndedAt || !sessionStartedAt) return;
    if (savedMiniMockResultRef.current === sessionIdRef.current) return;

    const categories = sessionQuestions.reduce<Record<string, number>>((acc, question) => {
      acc[question.category] = (acc[question.category] ?? 0) + 1;
      return acc;
    }, {});
    const result: MiniMockHistoryItem = {
      id: sessionIdRef.current,
      completedAt: new Date(sessionEndedAt).toISOString(),
      total: sessionQuestions.length,
      score,
      accuracy,
      elapsedSeconds: Math.max(0, Math.round((sessionEndedAt - sessionStartedAt) / 1000)),
      wrongCount: sessionWrongAnswers.length,
      unansweredCount,
      timeExpired,
      categories,
    };
    const nextHistory = [result, ...readMiniMockHistory()]
      .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
      .slice(0, MINI_MOCK_HISTORY_LIMIT);
    writeMiniMockHistory(nextHistory);
    setMiniMockHistory(nextHistory);
    savedMiniMockResultRef.current = sessionIdRef.current;

    if (user) {
      const supabase = createClient();
      void supabase
        .from("mock_exam_sessions")
        .insert({
          user_id: user.id,
          session_id: result.id,
          total_count: result.total,
          score: result.score,
          accuracy: result.accuracy,
          elapsed_seconds: result.elapsedSeconds,
          wrong_count: result.wrongCount,
          unanswered_count: result.unansweredCount,
          time_expired: result.timeExpired,
          categories: result.categories,
          completed_at: result.completedAt,
        })
        .then(({ error }) => {
          if (!error) return;
          // Keep local history as the fallback; duplicate inserts can happen on
          // unusual remounts and are harmless because session_id is unique.
        });
    }
  }, [
    accuracy,
    finished,
    isMiniMock,
    score,
    sessionEndedAt,
    sessionQuestions,
    sessionStartedAt,
    sessionWrongAnswers.length,
    timeExpired,
    unansweredCount,
    user,
  ]);

  const quit = () => setStarted(false);

  return {
    started, finished, isMiniMock,
    currentQuestion, currentIndex, sessionQuestions, score, commentCounts,
    remainingSeconds, timerIsUrgent, accuracy, elapsedLabel, unansweredCount,
    timeExpired, sessionWrongAnswers, miniMockHistory,
    sessionLoading, sessionError,
    startSession, handleAnswer, handleNext, handleRestart, quit,
  };
}
