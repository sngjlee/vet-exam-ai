import { describe, it, expect } from "vitest";
import { formatDuration, toMiniMockHistoryItem } from "./quiz-history";
import type { Database } from "../../../lib/supabase/types";

type Row = Database["public"]["Tables"]["mock_exam_sessions"]["Row"];

describe("formatDuration", () => {
  it("formats seconds as mm:ss zero-padded", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(600)).toBe("10:00");
  });
  it("clamps negatives to 00:00", () => {
    expect(formatDuration(-5)).toBe("00:00");
  });
});

describe("toMiniMockHistoryItem", () => {
  it("maps a row and defaults null categories to {}", () => {
    const row = {
      session_id: "s1",
      completed_at: "2026-07-10T00:00:00.000Z",
      total_count: 20,
      score: 15,
      accuracy: 75,
      elapsed_seconds: 300,
      wrong_count: 5,
      unanswered_count: 0,
      time_expired: false,
      categories: null,
    } as unknown as Row;
    const item = toMiniMockHistoryItem(row);
    expect(item.id).toBe("s1");
    expect(item.total).toBe(20);
    expect(item.categories).toEqual({});
  });
});
