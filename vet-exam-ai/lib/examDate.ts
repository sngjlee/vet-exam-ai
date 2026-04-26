// vet-exam-ai/lib/examDate.ts
// 시험일 단일 source of truth. 공고 후 EXAM_DATE / EXAM_DATE_LABEL 갱신,
// IS_TENTATIVE = false 변경으로 (예상) 라벨 제거.

export const EXAM_DATE = new Date("2027-01-15T00:00:00+09:00");
export const EXAM_DATE_LABEL = "2027.01.15";
export const IS_TENTATIVE = true;

export function daysUntilExam(now: number = Date.now()): number {
  return Math.ceil((EXAM_DATE.getTime() - now) / 86_400_000);
}
