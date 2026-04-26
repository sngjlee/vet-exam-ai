"use client";

import { useEffect, useState } from "react";
import { EXAM_DATE_LABEL, IS_TENTATIVE, daysUntilExam } from "../../lib/examDate";
import type { Question } from "../../lib/questions";

const STORAGE_KEY = "kvle:quiz:lastConfig";

type StoredConfig = { subjects: string[]; count: number };

function readStoredSubjects(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredConfig>;
    if (!Array.isArray(parsed.subjects)) return null;
    if (!parsed.subjects.every((s) => typeof s === "string")) return null;
    return parsed.subjects;
  } catch {
    return null;
  }
}

export default function DDayPlanWidget() {
  const [days, setDays] = useState<number | null>(null);
  const [allCategories, setAllCategories] = useState<string[] | null>(null); // 전체 active 문제의 카테고리 list (중복 포함, intersection용)
  const [selectedSubjects, setSelectedSubjects] = useState<string[] | null>(null);
  const [fetchError, setFetchError] = useState(false);

  // D-day timer
  useEffect(() => {
    setDays(daysUntilExam());
    const id = setInterval(() => setDays(daysUntilExam()), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Pool fetch (once)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/questions")
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json() as Promise<Question[]>;
      })
      .then((data) => {
        if (cancelled) return;
        setAllCategories(data.map((q) => q.category));
      })
      .catch(() => {
        if (!cancelled) setFetchError(true);
      });
    return () => { cancelled = true; };
  }, []);

  // selector lastConfig — mount + storage event
  useEffect(() => {
    setSelectedSubjects(readStoredSubjects());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSelectedSubjects(readStoredSubjects());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // poolSize: subjects 미설정/빈 배열이면 전체, 아니면 intersection
  const poolSize =
    allCategories === null
      ? null
      : !selectedSubjects || selectedSubjects.length === 0
      ? allCategories.length
      : allCategories.filter((c) => selectedSubjects.includes(c)).length;

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderTop: "3px solid var(--wrong)",
        borderRadius: 12,
        padding: 22,
        marginBottom: 22,
        gap: 24,
      }}
    >
      {/* LEFT: D-day */}
      <div>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--wrong)", fontWeight: 700, marginBottom: 6 }}>
          수의사 국가시험
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 800, color: "var(--text)" }}>
            D-{days ?? "···"}
          </span>
          {IS_TENTATIVE && (
            <span style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 600 }}>
              (예상)
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", fontWeight: 600, marginTop: 4 }}>
          {EXAM_DATE_LABEL}
        </div>
      </div>

      {/* RIGHT: pool size only (권장 수는 Task 5에서) */}
      <div>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--text-muted)", fontWeight: 700, marginBottom: 6 }}>
          선택한 풀
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 800, color: "var(--text)" }}>
          {fetchError ? "—" : poolSize === null ? "···" : `${poolSize}문제`}
        </div>
      </div>
    </div>
  );
}
