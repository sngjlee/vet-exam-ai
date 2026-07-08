import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import type { AttemptPayload } from "./types";
import { captureOperationalError, classifySupabaseFailure, logError } from "../utils/logging";

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
      // B1: payload.questionId is now the KVLE public id; store in question_public_id.
      question_public_id: payload.questionId,
      category: payload.category,
      selected_answer: payload.selectedAnswer,
      correct_answer: payload.correctAnswer,
      is_correct: payload.isCorrect,
    };
    const { error } = await this.supabase.from("attempts").insert(row);
    if (error) {
      // Core study-loop write. A silent failure here loses the user's answer
      // with no trace — especially risky during the B1 question_public_id
      // migration, where a column mismatch would fail every insert. Surface it
      // to Sentry (in addition to the console) so the loss is observable.
      logError("attempt insert failed:", error);
      captureOperationalError(error, {
        area: "supabase",
        operation: "attempts.insert",
        failureKind: classifySupabaseFailure(error),
        context: {
          session_id: payload.sessionId,
          question_public_id: payload.questionId,
          category: payload.category,
        },
      });
    }
  }
}
