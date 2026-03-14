"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { resolveWrongNotesRepository } from "../wrongNotes/resolver";

// Returns the number of wrong-note items due for review right now.
// Accepts auth state as params (caller owns useAuth) to avoid a second
// Supabase auth subscription being opened from the same component.
// Re-fetches on every page navigation via usePathname() so the badge
// stays current after quiz sessions, reviews, or retries.
export function useDueCount(user: User | null, authLoading: boolean): number {
  const [count, setCount] = useState(0);
  const pathname = usePathname();
  const repo = useMemo(() => resolveWrongNotesRepository(user), [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setCount(0);
      return;
    }
    void repo.getDue().then((notes) => setCount(notes.length));
  }, [repo, authLoading, user, pathname]); // pathname ensures re-fetch on every navigation

  return count;
}
