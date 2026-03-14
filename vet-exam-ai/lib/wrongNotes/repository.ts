// Shared repository interface for wrong-note persistence.
// Both the localStorage and Supabase implementations conform to this shape
// so the hook never needs to know which backend it is talking to.

import type { WrongAnswerNote } from "../types";

export interface WrongNotesRepository {
  getAll(): Promise<WrongAnswerNote[]>;
  /** Insert or update a note (idempotent on questionId). */
  upsert(note: WrongAnswerNote): Promise<void>;
  delete(questionId: string): Promise<void>;
  clearAll(): Promise<void>;
}
