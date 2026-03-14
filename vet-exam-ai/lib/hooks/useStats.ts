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

export type Stats = {
  totalAttempts: number;
  totalCorrect: number;
  accuracy: number;
  last7DaysAttempts: number;
  byCategory: CategoryStat[];
  recentAttempts: AttemptRow[];
};

export function useStats(userId: string | null, authLoading: boolean) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!userId) {
      setStats(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    void supabase
      .from("attempts")
      .select("*")
      .eq("user_id", userId)
      .order("answered_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to fetch attempts:", error);
          setLoading(false);
          return;
        }

        const rows: AttemptRow[] = data ?? [];
        const sevenDaysAgo = new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString();

        const totalAttempts = rows.length;
        const totalCorrect = rows.filter((r) => r.is_correct).length;
        const accuracy =
          totalAttempts > 0
            ? Math.round((totalCorrect / totalAttempts) * 100)
            : 0;
        const last7DaysAttempts = rows.filter(
          (r) => r.answered_at >= sevenDaysAgo,
        ).length;

        const categoryMap = new Map<
          string,
          { attempts: number; correct: number }
        >();
        for (const row of rows) {
          const existing = categoryMap.get(row.category) ?? {
            attempts: 0,
            correct: 0,
          };
          categoryMap.set(row.category, {
            attempts: existing.attempts + 1,
            correct: existing.correct + (row.is_correct ? 1 : 0),
          });
        }

        const byCategory: CategoryStat[] = Array.from(categoryMap.entries())
          .map(([category, { attempts, correct }]) => ({
            category,
            attempts,
            correct,
            accuracy: Math.round((correct / attempts) * 100),
          }))
          .sort((a, b) => b.attempts - a.attempts);

        setStats({
          totalAttempts,
          totalCorrect,
          accuracy,
          last7DaysAttempts,
          byCategory,
          recentAttempts: rows.slice(0, 20),
        });
        setLoading(false);
      });
  }, [userId, authLoading]);

  return { stats, loading };
}
