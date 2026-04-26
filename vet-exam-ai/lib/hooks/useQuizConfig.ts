// vet-exam-ai/lib/hooks/useQuizConfig.ts
"use client";

import { useCallback, useEffect, useState } from "react";

export type QuizConfig = {
  subjects: string[];
  count: number;
};

export const STORAGE_KEY = "kvle:quiz:lastConfig";
export const VALID_COUNTS = [5, 10, 20, 30, 50] as const;
export const DEFAULT_CONFIG: QuizConfig = { subjects: [], count: 5 };

function isValidStored(parsed: unknown): parsed is QuizConfig {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.subjects)) return false;
  if (!p.subjects.every((s): s is string => typeof s === "string")) return false;
  if (typeof p.count !== "number") return false;
  if (!(VALID_COUNTS as readonly number[]).includes(p.count)) return false;
  return true;
}

export function useQuizConfig() {
  const [config, setConfig] = useState<QuizConfig>(DEFAULT_CONFIG);

  // 마운트 시 localStorage에서 1회 read (SSR 안전)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (isValidStored(parsed)) {
        setConfig({ subjects: parsed.subjects, count: parsed.count });
      }
    } catch {
      // JSON 손상 / 접근 불가 — DEFAULT_CONFIG 유지
    }
  }, []);

  const setSubjects = useCallback(
    (subjects: string[]) => setConfig((prev) => ({ ...prev, subjects })),
    [],
  );
  const setCount = useCallback(
    (count: number) => setConfig((prev) => ({ ...prev, count })),
    [],
  );

  /** 세션 시작 직전 호출. config를 localStorage에 저장. 실패는 무음. */
  const saveConfig = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...config, savedAt: new Date().toISOString() }),
      );
    } catch {
      // quota exceeded / private mode — silent
    }
  }, [config]);

  return { config, setSubjects, setCount, saveConfig };
}
