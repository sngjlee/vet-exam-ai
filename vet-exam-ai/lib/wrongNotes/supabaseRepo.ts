import type { SupabaseClient } from "@supabase/supabase-js";
import type { WrongAnswerNote } from "../types";
import type { Database, WrongNoteRow } from "../supabase/types";
import type { WrongNotesRepository } from "./repository";
import { computeNextReviewAt } from "../review/schedule";

type WrongNoteInsert = Database["public"]["Tables"]["wrong_notes"]["Insert"];

function rowToNote(row: WrongNoteRow): WrongAnswerNote {
  return {
    questionId: row.question_id,
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
    const { data, error } = await this.supabase
      .from("wrong_notes")
      .select("*")
      .eq("user_id", this.userId)
      .order("saved_at", { ascending: false });

    if (error) {
      console.error("wrong_notes getAll failed:", error);
      return [];
    }
    return (data as WrongNoteRow[]).map(rowToNote);
  }

  async upsert(note: WrongAnswerNote): Promise<void> {
    const row: WrongNoteInsert = {
      user_id: this.userId,
      question_id: note.questionId,
      question_text: note.question,
      category: note.category,
      choices: note.choices,
      correct_answer: note.correctAnswer,
      selected_answer: note.selectedAnswer,
      explanation: note.explanation,
      saved_at: new Date().toISOString(),
    };
    const { error } = await this.supabase
      .from("wrong_notes")
      .upsert(row, { onConflict: "user_id,question_id" });
    if (error) console.error("wrong_notes upsert failed:", error);
  }

  async delete(questionId: string): Promise<void> {
    const { error } = await this.supabase
      .from("wrong_notes")
      .delete()
      .eq("user_id", this.userId)
      .eq("question_id", questionId);
    if (error) console.error("wrong_notes delete failed:", error);
  }

  async clearAll(): Promise<void> {
    const { error } = await this.supabase
      .from("wrong_notes")
      .delete()
      .eq("user_id", this.userId);
    if (error) console.error("wrong_notes clearAll failed:", error);
  }

  async getDue(): Promise<WrongAnswerNote[]> {
    const { data, error } = await this.supabase
      .from("wrong_notes")
      .select("*")
      .eq("user_id", this.userId)
      .lte("next_review_at", new Date().toISOString())
      .order("next_review_at", { ascending: true });

    if (error) {
      console.error("wrong_notes getDue failed:", error);
      return [];
    }
    return (data as WrongNoteRow[]).map(rowToNote);
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
      .eq("question_id", questionId);

    if (error) console.error("wrong_notes updateReview failed:", error);
  }
}
