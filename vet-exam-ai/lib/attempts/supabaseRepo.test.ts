import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseAttemptsRepository } from "./supabaseRepo";
import type { AttemptPayload } from "./types";
import type { Database } from "../supabase/types";

// Minimal fake Supabase client that captures the row passed to insert().
function fakeClient(captured: { row?: Record<string, unknown> }) {
  return {
    from() {
      return {
        insert(row: Record<string, unknown>) {
          captured.row = row;
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
}

describe("SupabaseAttemptsRepository.log", () => {
  const payload: AttemptPayload = {
    sessionId: "sess-1",
    questionId: "KVLE-0001",
    category: "내과학",
    selectedAnswer: "A",
    correctAnswer: "B",
    isCorrect: false,
  };

  it("maps the payload to an attempts row keyed by question_public_id (B1)", async () => {
    const captured: { row?: Record<string, unknown> } = {};
    const repo = new SupabaseAttemptsRepository(fakeClient(captured), "user-123");

    await repo.log(payload);

    expect(captured.row).toEqual({
      user_id: "user-123",
      session_id: "sess-1",
      question_public_id: "KVLE-0001",
      category: "내과학",
      selected_answer: "A",
      correct_answer: "B",
      is_correct: false,
    });
  });

  it("never writes the legacy internal question_id column", async () => {
    const captured: { row?: Record<string, unknown> } = {};
    const repo = new SupabaseAttemptsRepository(fakeClient(captured), "user-123");

    await repo.log(payload);

    expect(captured.row).not.toHaveProperty("question_id");
  });
});
