import type { Question } from "./types";

export type RecentYearsWindow = 5 | 7 | 10;

export interface QuestionFilterOptions {
  categories?: string[];      // empty/undefined = no filter
  topics?: string[];
  recentYears?: RecentYearsWindow; // 최근 N개년만. undefined = 전체
  onlyWrong?: boolean;        // 사용자 오답만
  skipEasy?: boolean;         // difficulty=easy 제외
  wrongQuestionIds?: Set<string>; // onlyWrong 사용 시 필요
}

/**
 * Returns the largest `year` value across the pool.
 * 모든 question.year가 null이면 null. 'recentYears' 필터의 기준점.
 */
export function getLatestYear(pool: Question[]): number | null {
  let latest: number | null = null;
  for (const q of pool) {
    if (typeof q.year === "number") {
      if (latest === null || q.year > latest) latest = q.year;
    }
  }
  return latest;
}

/**
 * 공용 필터 — 랜덤문제, 해설보기, 전체보기, 추후 모의고사 모두에서 같은 결과를 보장한다.
 *
 * 저작권 가드: round/session은 화면에 노출하지 않는다. year도 직접 표시하지 않으나,
 * "최근 N개년" 토글 같은 상대적 신선도는 허용된다 (절대 출처 비노출).
 */
export function applyQuestionFilters(
  pool: Question[],
  opts: QuestionFilterOptions,
): Question[] {
  const {
    categories,
    topics,
    recentYears,
    onlyWrong,
    skipEasy,
    wrongQuestionIds,
  } = opts;

  const hasCategoryFilter = categories && categories.length > 0;
  const hasTopicFilter = topics && topics.length > 0;
  const latestYear = recentYears ? getLatestYear(pool) : null;
  const yearCutoff =
    recentYears && latestYear !== null ? latestYear - recentYears + 1 : null;

  return pool.filter((q) => {
    if (q.isActive === false) return false;
    if (hasCategoryFilter && !categories!.includes(q.category)) return false;
    if (hasTopicFilter && (!q.topic || !topics!.includes(q.topic))) return false;
    if (yearCutoff !== null) {
      if (typeof q.year !== "number") return false;
      if (q.year < yearCutoff) return false;
    }
    if (skipEasy && q.difficulty === "easy") return false;
    if (onlyWrong) {
      if (!wrongQuestionIds || wrongQuestionIds.size === 0) return false;
      if (!wrongQuestionIds.has(q.id)) return false;
    }
    return true;
  });
}
