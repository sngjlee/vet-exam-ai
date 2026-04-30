// Pure URL/input parsing helpers. No I/O.

import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH } from "./types";

const KVLE_RE = /^KVLE-\d+$/i;

// Decode a query-string value. Returns "" for nullish input or malformed escape
// sequences (decodeURIComponent throws on lone surrogates / bad %xx) — guards
// the trap from question_detail_decode_done.md (Next 16 useParams non-ASCII).
export function decodeQueryParam(raw: string | null | undefined): string {
  if (raw == null) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

// Trim + clip overlong queries. Returns the cleaned form and a flag whether
// the input is searchable (length >= MIN_QUERY_LENGTH after trim).
export interface NormalizedQuery {
  q:           string;
  searchable:  boolean;
  truncated:   boolean;
}

export function normalizeQuery(raw: string): NormalizedQuery {
  const trimmed = raw.trim();
  const truncated = trimmed.length > MAX_QUERY_LENGTH;
  const q = truncated ? trimmed.slice(0, MAX_QUERY_LENGTH) : trimmed;
  return {
    q,
    searchable: q.length >= MIN_QUERY_LENGTH,
    truncated,
  };
}

// Detect KVLE-NNNN exact-match shortcut. Caller routes to /questions/<id>.
// Returns the canonical uppercase form or null.
export function parseKvleId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!KVLE_RE.test(trimmed)) return null;
  return trimmed.toUpperCase();
}
