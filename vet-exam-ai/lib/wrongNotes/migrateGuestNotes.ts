// Migrates guest wrong notes from localStorage into the signed-in user's
// Supabase wrong_notes table.
//
// Uses a single batch upsert so the operation is atomic from the app's
// perspective. The DB-level unique constraint (user_id, question_id) makes
// repeated calls idempotent — running this twice for the same user is safe.
//
// On success  → localStorage entry is cleared.
// On failure  → localStorage entry is left untouched; the user keeps their notes.

import type { WrongAnswerNote } from "../types";
import type { Database } from "../supabase/types";
import { WRONG_NOTES_KEY } from "../storage";
import { createClient } from "../supabase/client";

type WrongNoteInsert = Database["public"]["Tables"]["wrong_notes"]["Insert"];

function readGuestNotes(): WrongAnswerNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WRONG_NOTES_KEY);
    return raw ? (JSON.parse(raw) as WrongAnswerNote[]) : [];
  } catch {
    return [];
  }
}

function clearGuestNotes(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(WRONG_NOTES_KEY);
  }
}

export async function migrateGuestNotes(userId: string): Promise<void> {
  const guestNotes = readGuestNotes();
  if (guestNotes.length === 0) return; // nothing to migrate

  const supabase = createClient();

  const rows: WrongNoteInsert[] = guestNotes.map((note) => ({
    user_id: userId,
    question_id: note.questionId,
    question_text: note.question,
    category: note.category,
    choices: note.choices,
    correct_answer: note.correctAnswer,
    selected_answer: note.selectedAnswer,
    explanation: note.explanation,
  }));

  const { error } = await supabase
    .from("wrong_notes")
    .upsert(rows, { onConflict: "user_id,question_id" });

  if (error) {
    console.error(
      "Guest wrong notes migration failed — localStorage kept:",
      error.message,
      error.code,
    );
    return; // leave localStorage intact so the user doesn't lose notes
  }

  clearGuestNotes();
}
