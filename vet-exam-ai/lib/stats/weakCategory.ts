import type { CategoryStat } from "../hooks/useStats";

/**
 * Minimum attempts before a category is considered in the ranking.
 * Categories below this threshold are only used as a fallback when
 * no category meets the minimum.
 */
export const MIN_ATTEMPTS = 3;

/**
 * Returns the weakest CategoryStat from a per-category stats array.
 *
 * Rule:
 *  1. Consider only categories with >= MIN_ATTEMPTS attempts.
 *     If none qualify, fall back to all categories (at least 1 attempt).
 *  2. Rank by lowest accuracy (ascending).
 *  3. Tie-break: most wrong answers wins (more wrong = weaker).
 *
 * Returns null when byCategory is empty.
 */
export function findWeakestCategory(
  byCategory: CategoryStat[],
): CategoryStat | null {
  if (byCategory.length === 0) return null;

  const eligible = byCategory.filter((c) => c.attempts >= MIN_ATTEMPTS);
  const pool = eligible.length > 0 ? eligible : byCategory;

  return pool.reduce((weakest, current) => {
    if (current.accuracy < weakest.accuracy) return current;
    if (current.accuracy === weakest.accuracy) {
      const currentWrong = current.attempts - current.correct;
      const weakestWrong = weakest.attempts - weakest.correct;
      return currentWrong > weakestWrong ? current : weakest;
    }
    return weakest;
  });
}
