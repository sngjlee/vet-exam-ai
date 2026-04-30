"use client";

import { useEffect, useState } from "react";
import {
  SEARCH_PAGE_SIZE,
  type SearchResponse,
} from "../search";

type State = {
  data:    SearchResponse | null;
  loading: boolean;
  error:   string | null;
};

const empty: State = { data: null, loading: false, error: null };

export interface UseSearchInput {
  q:           string;     // already-normalized, length >= 2 expected
  category:    string | null;
  recentYears: number | null;
  page:        number;
}

export function useSearch(input: UseSearchInput | null): State {
  const [state, setState] = useState<State>(empty);
  const key = input ? buildKey(input) : null;

  useEffect(() => {
    if (!input || !key) {
      setState(empty);
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const params = new URLSearchParams();
    params.set("q", input.q);
    if (input.category) params.set("category", input.category);
    if (input.recentYears) params.set("recent_years", String(input.recentYears));
    if (input.page > 0) params.set("page", String(input.page));

    fetch(`/api/search?${params.toString()}`)
      .then((res) => {
        if (!res.ok && res.status !== 500) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SearchResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setState({ data, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ data: null, loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

export { SEARCH_PAGE_SIZE };

function buildKey(input: UseSearchInput): string {
  return [
    input.q,
    input.category ?? "",
    input.recentYears ?? "",
    input.page,
  ].join("|");
}
