import type { SupabaseClient } from "@supabase/supabase-js";
import type { WrongAnswerNote } from "../types";
import type { Database, WrongNoteRow } from "../supabase/types";
import type { WrongNotesRepository } from "./repository";
import { computeNextReviewAt } from "../review/schedule";
import { logError } from "../utils/logging";

type WrongNoteInsert = Database["public"]["Tables"]["wrong_notes"]["Insert"];

// PostgREST caps a single response (supabase max_rows = 1000), so every
// unbounded list must page or it silently truncates. See memory quiz_selector.
const PAGE_SIZE = 1000;

function rowToNote(row: WrongNoteRow): WrongAnswerNote {
  return {
    // B1: prefer the KVLE public id; fall back to legacy internal id for un-backfilled rows.
    questionId: row.question_public_id ?? row.question_id ?? "",
    question: row.question_text,
    category: row.category,
    choices: row.choices,
    correctAnswer: row.correct_answer,
    selectedAnswer: row.selected_answer,
    explanation: row.explanation,
    reviewCount: row.review_count,
    lastReviewedAt: row.last_reviewed_at,
    nextReviewAt: row.next_review_at,
  };
}

export class SupabaseWrongNotesRepository implements WrongNotesRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async getAll(): Promise<WrongAnswerNote[]> {
    return this.fetchAllPaged("all");
  }

  async upsert(note: WrongAnswerNote): Promise<void> {
    const now = new Date().toISOString();
    const row: WrongNoteInsert = {
      user_id: this.userId,
      // B1: note.questionId is now the KVLE public id.
      question_public_id: note.questionId,
      question_text: note.question,
      category: note.category,
      choices: note.choices,
      correct_answer: note.correctAnswer,
      selected_answer: note.selectedAnswer,
      explanation: note.explanation,
      saved_at: now,
      // Always reset review schedule when a question is answered wrong outside /review.
      // On INSERT (new note): sets initial state.
      // On UPDATE (re-wrong existing note): makes it due immediately again.
      // last_reviewed_at is intentionally omitted so it is never touched here.
      review_count: 0,
      next_review_at: now,
    };
    const { error } = await this.supabase
      .from("wrong_notes")
      .upsert(row, { onConflict: "user_id,question_public_id" });
    if (error) logError("wrong_notes upsert failed:", error);
  }

  async delete(questionId: string): Promise<void> {
    const { error } = await this.supabase
      .from("wrong_notes")
      .delete()
      .eq("user_id", this.userId)
      .eq("question_public_id", questionId);
    if (error) logError("wrong_notes delete failed:", error);
  }

  async clearAll(): Promise<void> {
    const { error } = await this.supabase
      .from("wrong_notes")
      .delete()
      .eq("user_id", this.userId);
    if (error) logError("wrong_notes clearAll failed:", error);
  }

  async getDue(): Promise<WrongAnswerNote[]> {
    return this.fetchAllPaged("due");
  }

  // Pages through every matching row — a single select would silently stop at
  // PAGE_SIZE (PostgREST max_rows), dropping notes for users past 1000.
  private async fetchAllPaged(scope: "all" | "due"): Promise<WrongAnswerNote[]> {
    const nowIso = new Date().toISOString();
    const rows: WrongNoteRow[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const base = this.supabase
        .from("wrong_notes")
        .select("*")
        .eq("user_id", this.userId);
      // Secondary order on the per-user unique key keeps page boundaries stable.
      const query =
        scope === "due"
          ? base
              .lte("next_review_at", nowIso)
              .order("next_review_at", { ascending: true })
              .order("question_public_id", { ascending: true })
          : base
              .order("saved_at", { ascending: false })
              .order("question_public_id", { ascending: true });

      const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) {
        logError(`wrong_notes ${scope === "due" ? "getDue" : "getAll"} failed:`, error);
        return [];
      }

      const page = (data as WrongNoteRow[]) ?? [];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    return rows.map(rowToNote);
  }

  async updateReview(
    questionId: string,
    isCorrect: boolean,
    currentReviewCount: number,
  ): Promise<void> {
    const now = new Date().toISOString();
    const newReviewCount = isCorrect ? currentReviewCount + 1 : 0;
    const nextReviewAt = isCorrect
      ? computeNextReviewAt(currentReviewCount).toISOString()
      : now;

    const { error } = await this.supabase
      .from("wrong_notes")
      .update({
        review_count: newReviewCount,
        last_reviewed_at: now,
        next_review_at: nextReviewAt,
      })
      .eq("user_id", this.userId)
      .eq("question_public_id", questionId);

    if (error) logError("wrong_notes updateReview failed:", error);
  }
}
