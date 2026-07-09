"use client";

import { useEffect, useState } from "react";
import { createClient } from "../supabase/client";
import type { AttemptRow } from "../supabase/types";

export type CategoryStat = {
  category: string;
  attempts: number;
  correct: number;
  accuracy: number;
};

export type DayBucket = {
  date: string; // KST date, YYYY-MM-DD
  total: number;
  correct: number;
};

export type Stats = {
  totalAttempts: number;
  totalCorrect: number;
  accuracy: number;
  last7DaysAttempts: number;
  byCategory: CategoryStat[];
  recentAttempts: AttemptRow[];
  // Server-side KST daily aggregation. Optional: absent when the stats RPC
  // predates 20260709020000, in which case the dashboard falls back to
  // client-side aggregation of recentAttempts.
  streak?: number;
  weekly?: DayBucket[];
  todayAttempts?: number;
  deltaVsYesterday?: number;
};

function emptyStats(): Stats {
  return {
    totalAttempts: 0,
    totalCorrect: 0,
    accuracy: 0,
    last7DaysAttempts: 0,
    byCategory: [],
    recentAttempts: [],
  };
}

export function useStats(userId: string | null, authLoading: boolean) {
  const [state, setState] = useState<{
    userId: string;
    stats: Stats | null;
  } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) return;

    let cancelled = false;
    const supabase = createClient();

    void supabase
      .rpc("get_my_stats_summary")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to fetch stats summary:", error);
          setState({ userId, stats: null });
          return;
        }

        setState({ userId, stats: (data as Stats | null) ?? emptyStats() });
      });

    return () => {
      cancelled = true;
    };
  }, [userId, authLoading]);

  if (authLoading) return { stats: null, loading: true };
  if (!userId) return { stats: null, loading: false };
  if (state?.userId !== userId) return { stats: null, loading: true };

  return { stats: state.stats, loading: false };
}
