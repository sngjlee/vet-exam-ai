export type QuestionQualityIssue =
  | "missing_content"
  | "answer_mismatch"
  | "duplicate_choices"
  | "missing_metadata"
  | "round_year_mismatch"
  | "image_pending";

export type QuestionQualityFilter = "all" | "needs_review" | QuestionQualityIssue;

export const QUESTION_QUALITY_FILTERS: Array<{
  value: QuestionQualityFilter;
  label: string;
}> = [
  { value: "all", label: "품질 전체" },
  { value: "needs_review", label: "검수 필요" },
  { value: "missing_content", label: "본문/해설 누락" },
  { value: "answer_mismatch", label: "정답 불일치" },
  { value: "duplicate_choices", label: "중복 선지" },
  { value: "missing_metadata", label: "메타 누락" },
  { value: "round_year_mismatch", label: "회차-연도 불일치" },
  { value: "image_pending", label: "이미지 대기" },
];

export const QUESTION_QUALITY_LABELS: Record<QuestionQualityIssue, string> = {
  missing_content: "내용 누락",
  answer_mismatch: "정답 불일치",
  duplicate_choices: "중복 선지",
  missing_metadata: "메타 누락",
  round_year_mismatch: "회차/연도",
  image_pending: "이미지 대기",
};

export type QuestionQualityFields = {
  question: string | null;
  choices: string[] | null;
  answer: string | null;
  explanation: string | null;
  category: string | null;
  subject: string | null;
  year: number | null;
  session: number | null;
  round: number | null;
  tags: string[] | null;
  is_active: boolean | null;
};

function blank(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}

function normalized(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function getQuestionQualityIssues(q: QuestionQualityFields): QuestionQualityIssue[] {
  const issues: QuestionQualityIssue[] = [];
  const choices = Array.isArray(q.choices) ? q.choices : [];
  const normalizedChoices = choices.map(normalized).filter((choice) => choice.length > 0);
  const answer = normalized(q.answer ?? "");

  if (
    blank(q.question) ||
    blank(q.answer) ||
    blank(q.explanation) ||
    choices.length < 2 ||
    normalizedChoices.length !== choices.length
  ) {
    issues.push("missing_content");
  }

  if (answer.length > 0 && !normalizedChoices.includes(answer)) {
    issues.push("answer_mismatch");
  }

  if (new Set(normalizedChoices).size !== normalizedChoices.length) {
    issues.push("duplicate_choices");
  }

  if (blank(q.category) || blank(q.subject) || q.round == null || q.session == null || q.year == null) {
    issues.push("missing_metadata");
  }

  if (q.round != null && q.year != null && q.year !== q.round + 1956) {
    issues.push("round_year_mismatch");
  }

  if (q.tags?.includes("has_image") && q.is_active === false) {
    issues.push("image_pending");
  }

  return issues;
}

export function matchesQuestionQualityFilter(
  issues: QuestionQualityIssue[],
  filter: QuestionQualityFilter | undefined,
): boolean {
  if (!filter || filter === "all") return true;
  if (filter === "needs_review") return issues.length > 0;
  return issues.includes(filter);
}
