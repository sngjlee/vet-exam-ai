"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WrongAnswerNote } from "../types";
import { useAuth } from "./useAuth";
import { resolveWrongNotesRepository } from "../wrongNotes/resolver";

export function useReview() {
  const { user, loading: authLoading } = useAuth();
  const [dueNotes, setDueNotes] = useState<WrongAnswerNote[]>([]);
  const [loading, setLoading] = useState(true);

  const repo = useMemo(() => resolveWrongNotesRepository(user), [user]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    void repo.getDue().then((notes) => {
      setDueNotes(notes);
      setLoading(false);
    });
  }, [repo, authLoading]);

  const submitReview = useCallback(
    async (
      questionId: string,
      isCorrect: boolean,
      currentReviewCount: number,
    ) => {
      await repo.updateReview(questionId, isCorrect, currentReviewCount);
      // Remove from the in-memory due list so the current session progresses.
      // Incorrect answers get next_review_at = now in the DB and will reappear
      // on the next session load.
      setDueNotes((prev) => prev.filter((n) => n.questionId !== questionId));
    },
    [repo],
  );

  return { dueNotes, loading, authLoading, user, submitReview };
}
