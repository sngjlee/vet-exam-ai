export type {
  MatchedIn,
  SearchHit,
  SearchSuggestion,
  SearchResponse,
} from "./types";
export {
  SEARCH_PAGE_SIZE,
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
} from "./types";
export {
  decodeQueryParam,
  normalizeQuery,
  parseKvleId,
  type NormalizedQuery,
} from "./parseQuery";
export { sanitizeHeadline } from "./sanitize";
export {
  readRecentSearches,
  pushRecentSearch,
  clearRecentSearches,
} from "./recent";
