"use client";

import { useEffect, useState } from "react";
import type { Question } from "../questions/types";

export type ServerQuestionFilter = {
  recentYears?: number; // 5 | 7 | 10
  category?: string;     // exact category name
};

type State = {
  questions: Question[];
  loading: boolean;
  error: string | null;
};

const empty: State = { questions: [], loading: false, error: null };

export function useFilteredQuestions(
  filter: ServerQuestionFilter | null
): State {
  const [state, setState] = useState<State>(empty);
  const key = filter ? buildKey(filter) : null;

  useEffect(() => {
    if (!filter || !key) {
      setState(empty);
      return;
    }
    let cancelled = false;
    setState({ questions: [], loading: true, error: null });
    const params = new URLSearchParams();
    if (filter.recentYears) {
      params.set("recent_years", String(filter.recentYears));
    }
    if (filter.category) {
      params.set("category", filter.category);
    }
    fetch(`/api/questions?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Question[]>;
      })
      .then((data) => {
        if (cancelled) return;
        setState({ questions: data, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ questions: [], loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

function buildKey(filter: ServerQuestionFilter): string {
  return `${filter.recentYears ?? ""}|${filter.category ?? ""}`;
}
