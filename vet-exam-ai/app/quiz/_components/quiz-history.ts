import type { Database } from "../../../lib/supabase/types";

export const TOTAL_QUESTIONS = 5;
export const MINI_MOCK_COUNT = 20;
export const MINI_MOCK_MINUTES = 25;
export const MINI_MOCK_SECONDS = MINI_MOCK_MINUTES * 60;
export const MINI_MOCK_HISTORY_KEY = "kvle.miniMock.history.v1";
export const MINI_MOCK_HISTORY_LIMIT = 5;

export type SessionMode = "practice" | "mini-mock";

export type SessionStartPayload = {
  subjects: string[];
  count: number;
  mode?: SessionMode;
};

export type SessionWrongAnswer = {
  questionId: string;
  question: string;
  category: string;
  selectedAnswer: string;
  correctAnswer: string;
  explanation: string;
};

export type MiniMockHistoryItem = {
  id: string;
  completedAt: string;
  total: number;
  score: number;
  accuracy: number;
  elapsedSeconds: number;
  wrongCount: number;
  unansweredCount: number;
  timeExpired: boolean;
  categories: Record<string, number>;
};

export type MockExamSessionRow = Database["public"]["Tables"]["mock_exam_sessions"]["Row"];

export function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const mm = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const ss = String(safeSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function readMiniMockHistory(): MiniMockHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MINI_MOCK_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MINI_MOCK_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export function writeMiniMockHistory(items: MiniMockHistoryItem[]) {
  window.localStorage.setItem(
    MINI_MOCK_HISTORY_KEY,
    JSON.stringify(items.slice(0, MINI_MOCK_HISTORY_LIMIT)),
  );
}

export function toMiniMockHistoryItem(row: MockExamSessionRow): MiniMockHistoryItem {
  return {
    id: row.session_id,
    completedAt: row.completed_at,
    total: row.total_count,
    score: row.score,
    accuracy: row.accuracy,
    elapsedSeconds: row.elapsed_seconds,
    wrongCount: row.wrong_count,
    unansweredCount: row.unanswered_count,
    timeExpired: row.time_expired,
    categories: row.categories ?? {},
  };
}
