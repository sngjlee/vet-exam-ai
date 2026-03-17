"use client";

import { useEffect, useMemo, useState } from "react";
import type { Question } from "../questions/types";
import { getCategories } from "../questions/utils";

export function useQuestions() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/questions")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load questions (HTTP ${res.status})`);
        return res.json() as Promise<Question[]>;
      })
      .then((data) => {
        setQuestions(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const categories = useMemo(() => getCategories(questions), [questions]);

  return { questions, categories, loading, error };
}
