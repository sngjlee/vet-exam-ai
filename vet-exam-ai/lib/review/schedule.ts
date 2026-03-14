// Spaced-repetition interval schedule.
//
// Rule:
//   correct review n-th time → interval = INTERVALS[min(n, last)] days
//   incorrect review         → reset review_count to 0, due immediately
//
// Pass `reviewCount` (the value BEFORE this review) to get the next due date.
// Example: first correct answer → reviewCount=0 → +1 day.

const INTERVALS_DAYS = [1, 3, 7, 14] as const;

export function computeNextReviewAt(reviewCount: number): Date {
  const idx = Math.min(reviewCount, INTERVALS_DAYS.length - 1);
  const days = INTERVALS_DAYS[idx];
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next;
}
