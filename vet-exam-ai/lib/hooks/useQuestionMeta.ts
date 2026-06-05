"use client";

import { useEffect, useState } from "react";

export type QuestionMeta = {
  categories: string[];
  countsByCategory: Record<string, number>;
  total: number;
};

type State = {
  meta: QuestionMeta | null;
  loading: boolean;
  error: string | null;
};

export function useQuestionMeta(): State {
  const [state, setState] = useState<State>({
    meta: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/questions?meta=1")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<QuestionMeta>;
      })
      .then((meta) => {
        if (cancelled) return;
        setState({ meta, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ meta: null, loading: false, error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
