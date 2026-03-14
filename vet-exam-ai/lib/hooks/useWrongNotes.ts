"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WrongAnswerNote } from "../types";
import { useAuth } from "./useAuth";
import { resolveWrongNotesRepository } from "../wrongNotes/resolver";

export function useWrongNotes() {
  const { user, loading: authLoading } = useAuth();
  const [notes, setNotes] = useState<WrongAnswerNote[]>([]);
  const [loading, setLoading] = useState(true);

  // Re-created only when the auth user changes (sign-in / sign-out).
  const repo = useMemo(() => resolveWrongNotesRepository(user), [user]);

  // Load notes once auth state is resolved.
  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    void repo.getAll().then((all) => {
      setNotes(all);
      setLoading(false);
    });
  }, [repo, authLoading]);

  const addNote = useCallback(
    async (note: WrongAnswerNote) => {
      await repo.upsert(note);
      setNotes((prev) => {
        const exists = prev.some((n) => n.questionId === note.questionId);
        return exists
          ? prev.map((n) => (n.questionId === note.questionId ? note : n))
          : [...prev, note];
      });
    },
    [repo],
  );

  const deleteNote = useCallback(
    async (questionId: string) => {
      await repo.delete(questionId);
      setNotes((prev) => prev.filter((n) => n.questionId !== questionId));
    },
    [repo],
  );

  const clearAll = useCallback(async () => {
    await repo.clearAll();
    setNotes([]);
  }, [repo]);

  return { notes, loading, addNote, deleteNote, clearAll };
}
