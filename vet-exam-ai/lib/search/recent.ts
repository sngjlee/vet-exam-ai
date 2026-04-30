// Stores the user's last 5 searches in sessionStorage so the empty
// /search landing can show clickable history. 30-min TTL to match the
// rest of the kvle:* sessionStorage family (questions list-context, filter).

const STORAGE_KEY = "kvle:search-recent:v1";
const TTL_MS = 30 * 60 * 1000;
const MAX_ITEMS = 5;

interface RecentPayload {
  items:   string[];
  savedAt: number;
}

export function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentPayload;
    if (!Array.isArray(parsed.items) || typeof parsed.savedAt !== "number") {
      return [];
    }
    if (Date.now() - parsed.savedAt > TTL_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return [];
    }
    return parsed.items.slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function pushRecentSearch(q: string): void {
  if (typeof window === "undefined") return;
  const trimmed = q.trim();
  if (!trimmed) return;
  try {
    const current = readRecentSearches().filter((x) => x !== trimmed);
    const next = [trimmed, ...current].slice(0, MAX_ITEMS);
    const payload: RecentPayload = { items: next, savedAt: Date.now() };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* sessionStorage unavailable — benign */
  }
}

export function clearRecentSearches(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
