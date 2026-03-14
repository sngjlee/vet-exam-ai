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
  /** Returns notes whose next_review_at is now or in the past. */
  getDue(): Promise<WrongAnswerNote[]>;
  /**
   * Update review metadata after a review attempt.
   * @param currentReviewCount - the review_count value BEFORE this review
   * Correct: increments review_count and schedules next interval.
   * Incorrect: resets review_count to 0 and sets next_review_at to now.
   */
  updateReview(
    questionId: string,
    isCorrect: boolean,
    currentReviewCount: number,
  ): Promise<void>;
}
