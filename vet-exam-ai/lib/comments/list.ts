import type { CommentType } from "./schema";

export type CommentsSortMode = "recent" | "popular";

export const COMMENTS_PAGE_SIZE = 20;

export type CommentPreview = {
  id: string;
  questionId: string;
  userId: string | null;
  type: CommentType;
  bodyText: string;
  voteScore: number;
  replyCount: number;
  createdAt: string;
  questionPublicId: string | null;
  questionPreview: string;
  category: string;
  topic: string | null;
  authorNickname: string | null;
};

export type CommentsTypeCounts = Record<CommentType, number>;

export type CommentsListResponse = {
  comments: CommentPreview[];
  total: number;
  allCount: number;
  typeCounts: CommentsTypeCounts;
  page: number;
  pageSize: number;
  totalPages: number;
  sort: CommentsSortMode;
  type: CommentType | null;
  q: string;
};

export const COMMENT_TYPE_META: Record<CommentType, { label: string; color: string; bg: string }> = {
  memorization: { label: "암기법", color: "#B45309", bg: "#FEF3C7" },
  correction: { label: "정정", color: "#9F1239", bg: "#FFE4E6" },
  explanation: { label: "추가 설명", color: "#075985", bg: "#E0F2FE" },
  question: { label: "질문", color: "#5B21B6", bg: "#EDE9FE" },
  discussion: { label: "토론", color: "#334155", bg: "#E2E8F0" },
};

export const COMMENT_TYPE_FILTERS: Array<{ value: CommentType; label: string }> = [
  { value: "memorization", label: "암기법" },
  { value: "correction", label: "정정" },
  { value: "explanation", label: "추가 설명" },
  { value: "question", label: "질문" },
  { value: "discussion", label: "토론" },
];

export function emptyCommentsTypeCounts(): CommentsTypeCounts {
  return {
    memorization: 0,
    correction: 0,
    explanation: 0,
    question: 0,
    discussion: 0,
  };
}

export function isCommentType(value: string | null | undefined): value is CommentType {
  return Boolean(value && value in COMMENT_TYPE_META);
}

export function parseCommentsPage(value: string | null | undefined): number {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function normalizeCommentsQuery(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, 80);
}

export function buildCommentsHref({
  type,
  sort,
  q,
  page,
}: {
  type: CommentType | null;
  sort: CommentsSortMode;
  q: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (sort === "popular") params.set("sort", sort);
  if (q) params.set("q", q);
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/comments?${query}` : "/comments";
}

export function buildCommentsApiPath({
  type,
  sort,
  q,
  page,
}: {
  type: CommentType | null;
  sort: CommentsSortMode;
  q: string;
  page: number;
}) {
  const href = buildCommentsHref({ type, sort, q, page });
  return href.replace("/comments", "/api/comments");
}
