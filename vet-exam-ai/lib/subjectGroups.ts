// vet-exam-ai/lib/subjectGroups.ts

export type SubjectGroupKey = 'basic' | 'preventive' | 'clinical' | 'law';

export type SubjectGroup = {
  key: SubjectGroupKey;
  label: string;
  subjects: string[]; // 이 그룹에 속하는 카테고리 풀네임 list
};

// Source of truth: pipeline/extract.py SUBJECTS 테이블 (session 1~4)
export const SUBJECT_GROUPS: SubjectGroup[] = [
  {
    key: 'basic',
    label: '기초',
    subjects: ['해부학', '조직학', '생리학', '생화학', '약리학', '독성학'],
  },
  {
    key: 'preventive',
    label: '예방',
    subjects: [
      '미생물학',
      '전염병학',
      '병리학',
      '공중보건학',
      '조류질병학',
      '수생생물의학',
      '기생충학',
      '실험동물학',
    ],
  },
  {
    key: 'clinical',
    label: '임상',
    subjects: ['내과학', '임상병리학', '외과학', '영상진단의학', '산과학'],
  },
  {
    key: 'law',
    label: '법규',
    subjects: ['수의법규'],
  },
];

/**
 * 현재 데이터에 존재하는 categories 중에서 각 그룹에 속하는 것들만 모아 반환.
 * SUBJECT_GROUPS의 subjects는 "정의" — categories는 "데이터에 실제로 있는 것".
 * 둘의 교집합만 그룹별로 반환한다.
 */
export function groupCategories(
  categories: string[],
): Record<SubjectGroupKey, string[]> {
  const set = new Set(categories);
  const result = {} as Record<SubjectGroupKey, string[]>;
  for (const group of SUBJECT_GROUPS) {
    result[group.key] = group.subjects.filter((s) => set.has(s));
  }
  return result;
}

/**
 * 단일 카테고리가 어느 그룹에 속하는지. 어느 그룹에도 없으면 undefined.
 */
export function getCategoryGroup(category: string): SubjectGroup | undefined {
  return SUBJECT_GROUPS.find((g) => g.subjects.includes(category));
}
