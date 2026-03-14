"use client";

import { useCallback, useEffect, useState } from "react";
import type { WrongAnswerNote } from "../types";
import type { Database, WrongNoteRow } from "../supabase/types";

type WrongNoteInsert = Database["public"]["Tables"]["wrong_notes"]["Insert"];
import { WRONG_NOTES_KEY } from "../storage";
import { useAuth } from "./useAuth";
import { createClient } from "../supabase/client";

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

export function useWrongNotes() {
  const { user, loading: authLoading } = useAuth();
  const [notes, setNotes] = useState<WrongAnswerNote[]>([]);
  const [loading, setLoading] = useState(true);

  // Load notes once auth state is resolved.
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      const supabase = createClient();
      supabase
        .from("wrong_notes")
        .select("*")
        .eq("user_id", user.id)
        .order("saved_at", { ascending: false })
        .then(({ data }) => {
          setNotes(data ? (data as WrongNoteRow[]).map(rowToNote) : []);
          setLoading(false);
        });
    } else {
      const saved = localStorage.getItem(WRONG_NOTES_KEY);
      if (saved) {
        try {
          setNotes(JSON.parse(saved));
        } catch {
          // ignore corrupt data
        }
      }
      setLoading(false);
    }
  }, [user, authLoading]);

  const addNote = useCallback(
    async (note: WrongAnswerNote) => {
      if (user) {
        const supabase = createClient();
        const row: WrongNoteInsert = {
          user_id: user.id,
          question_id: note.questionId,
          question_text: note.question,
          category: note.category,
          choices: note.choices,
          correct_answer: note.correctAnswer,
          selected_answer: note.selectedAnswer,
          explanation: note.explanation,
          saved_at: new Date().toISOString(),
        };
        const { error } = await supabase
          .from("wrong_notes")
          .upsert(row, { onConflict: "user_id,question_id" });
        if (error) console.error("wrong_notes upsert failed:", error);
      } else {
        setNotes((prev) => {
          const exists = prev.some((n) => n.questionId === note.questionId);
          const updated = exists
            ? prev.map((n) => (n.questionId === note.questionId ? note : n))
            : [...prev, note];
          localStorage.setItem(WRONG_NOTES_KEY, JSON.stringify(updated));
          return updated;
        });
        return;
      }

      setNotes((prev) => {
        const exists = prev.some((n) => n.questionId === note.questionId);
        return exists
          ? prev.map((n) => (n.questionId === note.questionId ? note : n))
          : [...prev, note];
      });
    },
    [user]
  );

  const deleteNote = useCallback(
    async (questionId: string) => {
      if (user) {
        const supabase = createClient();
        await supabase
          .from("wrong_notes")
          .delete()
          .eq("user_id", user.id)
          .eq("question_id", questionId);
      }
      setNotes((prev) => {
        const updated = prev.filter((n) => n.questionId !== questionId);
        if (!user) localStorage.setItem(WRONG_NOTES_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    [user]
  );

  const clearAll = useCallback(async () => {
    if (user) {
      const supabase = createClient();
      await supabase.from("wrong_notes").delete().eq("user_id", user.id);
    } else {
      localStorage.setItem(WRONG_NOTES_KEY, JSON.stringify([]));
    }
    setNotes([]);
  }, [user]);

  return { notes, loading, addNote, deleteNote, clearAll };
}
