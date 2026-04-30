// Fixed dropdown options for the questions/search filter UI.
// Order = DB distribution (most → least). 임상병리학·조직학은 raw 재유입 대기 슬롯이라 끝.
// 운영 시 schema.sql + seed 기준으로 주기적 동기화 권장.
//
// Single source of truth — both /questions and /search read from here.
export const FIXED_CATEGORIES = [
  "내과학",
  "외과학",
  "산과학",
  "해부학",
  "병리학",
  "생리학",
  "공중보건학",
  "수의법규",
  "전염병학",
  "약리학",
  "미생물학",
  "생화학",
  "영상진단의학",
  "독성학",
  "기생충학",
  "조류질병학",
  "실험동물학",
  "수생생물의학",
  "임상병리학",
  "조직학",
] as const;

export type FixedCategory = (typeof FIXED_CATEGORIES)[number];

export function isFixedCategory(value: string): value is FixedCategory {
  return (FIXED_CATEGORIES as readonly string[]).includes(value);
}
