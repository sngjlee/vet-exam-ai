import { questions } from "./bank";
import type { Question } from "./types";

export function getCategories(): string[] {
  return [...new Set(questions.map((q) => q.category))];
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
  total: number,
  category?: string
): Question[] {
  const pool = questions.filter((q) => q.isActive !== false);
  const filtered = category
    ? pool.filter((q) => q.category === category)
    : pool;

  const shuffled = shuffleArray(filtered);
  return shuffled.slice(0, total);
}
