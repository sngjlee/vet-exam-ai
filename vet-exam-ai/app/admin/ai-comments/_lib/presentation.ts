import type { AiCommentCandidateSearch } from "./schemas";

export const AI_COMMENT_STATUS_LABELS = {
  all: "전체 상태",
  generating: "생성 중",
  pending: "검수 대기",
  published: "승인됨",
  rejected: "거절됨",
  failed: "생성 실패",
} as const;

export const AI_COMMENT_AUTHOR_LABELS: Readonly<Record<string, string>> = {
  all: "전체 계정 유형",
  memory: "암기 포인트",
  explain: "개념 설명",
  wrong: "오답 관점",
  correction: "정정 제안",
} as const;

export const AI_COMMENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  memorization: "암기",
  explanation: "해설",
  correction: "정정",
} as const;

export const AI_COMMENT_RISK_LABELS: Readonly<Record<string, string>> = {
  answer_conflict: "정답 충돌 가능성",
  explanation_conflict: "해설 충돌 가능성",
  unsupported_claim: "근거 부족 가능성",
  medical_safety: "안전성 확인 필요",
  style_issue: "문체 확인 필요",
};

export const AI_COMMENT_REVIEW_ERROR_LABELS = {
  invalid_input: "입력값을 확인해 주세요.",
  not_found: "이미 처리되었거나 찾을 수 없는 초안입니다.",
  conflict: "다른 관리자가 먼저 처리한 초안입니다.",
  permission_denied: "이 작업을 수행할 권한이 없습니다.",
  invalid_candidate: "승인할 수 없는 초안입니다.",
  review_failed: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

type SearchOverride = Partial<AiCommentCandidateSearch>;

export function buildAiCommentSearchHref(
  current: AiCommentCandidateSearch,
  override: SearchOverride,
): string {
  const next = { ...current, ...override };
  const params = new URLSearchParams();
  if (next.status !== "pending") params.set("status", next.status);
  if (next.author !== "all") params.set("author", next.author);
  if (next.publicId) params.set("publicId", next.publicId);
  if (next.category) params.set("category", next.category);
  if (next.subject) params.set("subject", next.subject);
  if (next.model) params.set("model", next.model);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/admin/ai-comments?${query}` : "/admin/ai-comments";
}


export function authorLabel(value: string | null): string {
  if (!value) return "계정 유형 확인 필요";
  return AI_COMMENT_AUTHOR_LABELS[value] ?? value;
}

export function commentTypeLabel(value: string | null): string {
  if (!value) return "유형 확인 필요";
  return AI_COMMENT_TYPE_LABELS[value] ?? value;
}
export function formatAiCommentGeneratedAt(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function riskLabel(flag: string): string {
  return AI_COMMENT_RISK_LABELS[flag] ?? flag;
}
