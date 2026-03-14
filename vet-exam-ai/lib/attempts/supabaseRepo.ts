import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import type { AttemptPayload } from "./types";

type AttemptInsert = Database["public"]["Tables"]["attempts"]["Insert"];

export class SupabaseAttemptsRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async log(payload: AttemptPayload): Promise<void> {
    const row: AttemptInsert = {
      user_id: this.userId,
      session_id: payload.sessionId,
      question_id: payload.questionId,
      category: payload.category,
      selected_answer: payload.selectedAnswer,
      correct_answer: payload.correctAnswer,
      is_correct: payload.isCorrect,
    };
    const { error } = await this.supabase.from("attempts").insert(row);
    if (error) console.error("attempt insert failed:", error);
  }
}
