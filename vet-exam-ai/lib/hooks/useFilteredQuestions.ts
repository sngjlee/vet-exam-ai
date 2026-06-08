"use client";

import { useEffect, useState } from "react";
import type { QuestionSummary } from "../questions/types";

export type ServerQuestionFilter = {
  recentYears?: number; // 5 | 7 | 10
  category?: string;     // exact category name
};

type State = {
  questions: QuestionSummary[];
  loading: boolean;
  error: string | null;
};

const empty: State = { questions: [], loading: false, error: null };
const memoryCache = new Map<string, QuestionSummary[]>();
const STORAGE_PREFIX = "kvle:questions-summary:";
const STORAGE_TTL_MS = 10 * 60 * 1000;

export function useFilteredQuestions(
  filter: ServerQuestionFilter | null,
): State {
  const [state, setState] = useState<State>(empty);
  const key = filter ? buildKey(filter) : null;

  useEffect(() => {
    if (!filter || !key) {
      const id = window.setTimeout(() => setState(empty), 0);
      return () => window.clearTimeout(id);
    }

    const cached = readCached(key);
    const initialStateId = window.setTimeout(() => {
      setState({ questions: cached ?? [], loading: !cached, error: null });
    }, 0);
    let cancelled = false;
    const controller = new AbortController();

    const params = new URLSearchParams();
    params.set("summary", "1");
    if (filter.recentYears) {
      params.set("recent_years", String(filter.recentYears));
    }
    if (filter.category) {
      params.set("category", filter.category);
    }

    fetch(`/api/questions?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<QuestionSummary[]>;
      })
      .then((data) => {
        if (cancelled) return;
        writeCached(key, data);
        setState({ questions: data, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (cancelled || err.name === "AbortError") return;
        setState({ questions: cached ?? [], loading: false, error: err.message });
      });

    return () => {
      cancelled = true;
      window.clearTimeout(initialStateId);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

function readCached(key: string): QuestionSummary[] | null {
  const memory = memoryCache.get(key);
  if (memory) return memory;
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; questions: QuestionSummary[] };
    if (Date.now() - parsed.savedAt > STORAGE_TTL_MS) {
      window.sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      return null;
    }
    memoryCache.set(key, parsed.questions);
    return parsed.questions;
  } catch {
    return null;
  }
}

function writeCached(key: string, questions: QuestionSummary[]) {
  memoryCache.set(key, questions);
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(
      `${STORAGE_PREFIX}${key}`,
      JSON.stringify({ savedAt: Date.now(), questions }),
    );
  } catch {
    // Storage can be unavailable; memory cache still helps within this tab.
  }
}

function buildKey(filter: ServerQuestionFilter): string {
  return `${filter.recentYears ?? ""}|${filter.category ?? ""}`;
}
