import type { CommentType } from "./schema";

export const POPULAR_MEMORIZATION_THRESHOLD = 10;

export function isPopularMemorization(type: CommentType, score: number) {
  return type === "memorization" && score >= POPULAR_MEMORIZATION_THRESHOLD;
}
