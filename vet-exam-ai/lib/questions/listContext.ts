// Lightweight session-storage cache that lets /questions/[id] know which list
// the user came from, so prev/next buttons can navigate without losing the
// active filter on the list page.
//
// Direct-link visits (no context) result in prev/next being unavailable —
// that's intentional. The user explicitly entered through /questions to get
// navigation.

const STORAGE_KEY = "questions:list-context:v1";
const TTL_MS = 1000 * 60 * 30; // 30 min — guards against weeks-stale state.

export interface QuestionsListContext {
  ids: string[];
  savedAt: number;
}

export function saveQuestionsListContext(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: QuestionsListContext = { ids, savedAt: Date.now() };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage may be unavailable (privacy mode). Failure is benign:
    // prev/next simply won't render on the next detail page.
  }
}

export function readQuestionsListContext(): QuestionsListContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuestionsListContext;
    if (!Array.isArray(parsed.ids) || typeof parsed.savedAt !== "number") {
      return null;
    }
    if (Date.now() - parsed.savedAt > TTL_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearQuestionsListContext(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
