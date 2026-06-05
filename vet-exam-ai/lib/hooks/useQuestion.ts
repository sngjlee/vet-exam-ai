"use client";

import { useEffect, useState } from "react";
import type { Question } from "../questions";

type State = {
  question: Question | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
};

export function useQuestion(questionId: string): State {
  const [state, setState] = useState<{
    questionId: string;
    question: Question | null;
    error: string | null;
    notFound: boolean;
  } | null>(null);

  useEffect(() => {
    if (!questionId) return;

    let cancelled = false;

    fetch(`/api/questions?id=${encodeURIComponent(questionId)}`)
      .then((res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Question>;
      })
      .then((question) => {
        if (cancelled) return;
        setState({
          questionId,
          question,
          error: null,
          notFound: question === null,
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({
          questionId,
          question: null,
          error: err.message,
          notFound: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [questionId]);

  if (!questionId) {
    return { question: null, loading: false, error: null, notFound: true };
  }
  if (state?.questionId !== questionId) {
    return { question: null, loading: true, error: null, notFound: false };
  }
  return {
    question: state.question,
    loading: false,
    error: state.error,
    notFound: state.notFound,
  };
}
