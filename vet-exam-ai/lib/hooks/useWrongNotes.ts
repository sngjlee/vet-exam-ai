"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WrongAnswerNote } from "../types";
import { useAuth } from "./useAuth";
import { resolveWrongNotesRepository } from "../wrongNotes/resolver";
import { migrateGuestNotes } from "../wrongNotes/migrateGuestNotes";

export function useWrongNotes() {
  const { user, loading: authLoading } = useAuth();
  const [notes, setNotes] = useState<WrongAnswerNote[]>([]);
  const [loading, setLoading] = useState(true);

  // Re-created only when the auth user changes (sign-in / sign-out).
  const repo = useMemo(() => resolveWrongNotesRepository(user), [user]);

  // Load notes once auth state is resolved.
  // On sign-in, migrate any guest localStorage notes first so they appear
  // immediately in the same session rather than requiring a page refresh.
  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    void (async () => {
      if (user) {
        await migrateGuestNotes(user.id);
      }
      const all = await repo.getAll();
      setNotes(all);
      setLoading(false);
    })();
  }, [repo, authLoading]); // repo already changes when user changes

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
