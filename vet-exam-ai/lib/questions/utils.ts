import type { Question } from "./types";

export function getCategories(pool: Question[]): string[] {
  return [...new Set(pool.map((q) => q.category))];
}

export function shuffleArray<T>(array: T[]): T[] {
  const copied = [...array];
  for (let i = copied.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

/**
 * Active 풀에서 categoryFilters에 해당하는 questions만 골라 무작위 N개 반환.
 * categoryFilters undefined 또는 빈 배열이면 active 전체에서 추출.
 */
export function createSessionQuestions(
  pool: Question[],
  total: number,
  categoryFilters?: string[],
): Question[] {
  const active = pool.filter((q) => q.isActive !== false);
  const hasFilter = categoryFilters && categoryFilters.length > 0;
  const filtered = hasFilter
    ? active.filter((q) => categoryFilters!.includes(q.category))
    : active;

  const shuffled = shuffleArray(filtered);
  return shuffled.slice(0, total);
}
