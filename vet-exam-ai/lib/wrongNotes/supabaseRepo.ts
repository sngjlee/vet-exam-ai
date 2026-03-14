import type { SupabaseClient } from "@supabase/supabase-js";
import type { WrongAnswerNote } from "../types";
import type { Database, WrongNoteRow } from "../supabase/types";
import type { WrongNotesRepository } from "./repository";

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
}
