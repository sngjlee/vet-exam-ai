// DTOs shared between /api/search, useSearch hook, and /search page.

export type MatchedIn =
  | "question"
  | "explanation"
  | "choices"
  | "community_notes"
  | "comments";

export interface SearchHit {
  id: string;
  publicId: string;
  question: string;
  category: string;
  matchedIn: MatchedIn;
  headline: string;
  commentId?: string;
  commentType?: "memorization" | "correction" | "explanation" | "question" | "discussion";
}

export interface SearchSuggestion {
  suggestion: string;
  similarity: number;
}

export interface SearchResponse {
  items: SearchHit[];
  total: number;
  page: number;
  pageSize: number;
  suggestions: SearchSuggestion[];
  redirect: string | null;
  error: null | "too_short" | "internal";
}

export const SEARCH_PAGE_SIZE = 30;
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 200;
