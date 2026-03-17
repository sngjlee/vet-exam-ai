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

export function createSessionQuestions(
  pool: Question[],
  total: number,
  category?: string,
): Question[] {
  const active = pool.filter((q) => q.isActive !== false);
  const filtered = category
    ? active.filter((q) => q.category === category)
    : active;

  const shuffled = shuffleArray(filtered);
  return shuffled.slice(0, total);
}
