// vet-exam-ai/components/SessionSetup.tsx
"use client";

import { useEffect, useMemo } from "react";
import { Play } from "lucide-react";
import type { Question } from "../lib/questions/types";
import { groupCategories, SUBJECT_GROUPS } from "../lib/subjectGroups";
import { useQuizConfig, VALID_COUNTS } from "../lib/hooks/useQuizConfig";
import SubjectChipGroup from "./SubjectChipGroup";

type Props = {
  questions: Question[];
  categories: string[];
  loading: boolean;
  error: string | null;
  onStart: (config: { subjects: string[]; count: number }) => void;
};

export default function SessionSetup({
  questions,
  categories,
  loading,
  error,
  onStart,
}: Props) {
  const { config, setSubjects, setCount, saveConfig } = useQuizConfig();

  // 데이터에 존재하지 않는 stale subject은 무음으로 정리
  const validSubjects = useMemo(() => {
    const set = new Set(categories);
    return config.subjects.filter((s) => set.has(s));
  }, [config.subjects, categories]);

  const selectedSet = useMemo(() => new Set(validSubjects), [validSubjects]);

  // 그룹별 카테고리 (현재 데이터에 있는 것만)
  const grouped = useMemo(() => groupCategories(categories), [categories]);

  // 활성 풀 사이즈 계산 (selected 기준, 빈 선택 = active 전체)
  const activeQuestions = useMemo(
    () => questions.filter((q) => q.isActive !== false),
    [questions],
  );
  const availablePoolSize = useMemo(() => {
    if (validSubjects.length === 0) return activeQuestions.length;
    return activeQuestions.filter((q) => selectedSet.has(q.category)).length;
  }, [activeQuestions, selectedSet, validSubjects]);

  // 자동 reduce: count > 풀 → 가능한 가장 큰 valid preset 또는 풀 사이즈로
  useEffect(() => {
    if (availablePoolSize === 0) return; // 풀 0이면 시작 자체가 막힘
    if (config.count > availablePoolSize) {
      const reduced =
        [...VALID_COUNTS].reverse().find((n) => n <= availablePoolSize) ??
        availablePoolSize;
      setCount(reduced);
    }
  }, [availablePoolSize, config.count, setCount]);

  function handleToggleSubject(subject: string) {
    const next = new Set(validSubjects);
    if (next.has(subject)) next.delete(subject);
    else next.add(subject);
    setSubjects([...next]);
  }

  function handleToggleGroup(groupSubjectsInData: string[]) {
    const next = new Set(validSubjects);
    const allSelected = groupSubjectsInData.every((s) => next.has(s));
    if (allSelected) {
      groupSubjectsInData.forEach((s) => next.delete(s));
    } else {
      groupSubjectsInData.forEach((s) => next.add(s));
    }
    setSubjects([...next]);
  }

  function handleSelectCount(n: number) {
    if (n > availablePoolSize) return;
    setCount(n);
  }

  function handleStart() {
    if (!canStart) return;
    saveConfig();
    onStart({ subjects: validSubjects, count: config.count });
  }

  const canStart = !loading && !error && availablePoolSize > 0;

  // 풀 < 5 → 어떤 preset도 클릭 불가, count = pool size로 강제
  useEffect(() => {
    if (availablePoolSize > 0 && availablePoolSize < VALID_COUNTS[0] && config.count !== availablePoolSize) {
      setCount(availablePoolSize);
    }
  }, [availablePoolSize, config.count, setCount]);

  return (
    <div>
      {/* ── 과목 chips (그룹별) ── */}
      <div style={{ marginBottom: "1.25rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "0.625rem",
          }}
        >
          <span className="kvle-label">과목 선택</span>
          <span className="text-xs" style={{ color: "var(--text-faint)" }}>
            {validSubjects.length === 0
              ? "비워두면 전체 과목"
              : `${validSubjects.length}개 선택됨`}
          </span>
        </div>
        {SUBJECT_GROUPS.map((group) => (
          <SubjectChipGroup
            key={group.key}
            groupLabel={group.label}
            groupSubjects={grouped[group.key]}
            selected={selectedSet}
            onToggle={handleToggleSubject}
            onToggleGroup={() => handleToggleGroup(grouped[group.key])}
          />
        ))}
      </div>

      {/* ── 문제 수 preset ── */}
      <div style={{ marginBottom: "1rem" }}>
        <span className="kvle-label" style={{ display: "block", marginBottom: "0.5rem" }}>
          문제 수
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {VALID_COUNTS.map((n) => {
            const disabled = n > availablePoolSize;
            const active = config.count === n;
            return (
              <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => handleSelectCount(n)}
                title={disabled ? `최대 ${availablePoolSize}` : undefined}
                style={{
                  background: active
                    ? "rgba(30,167,187,0.15)"
                    : "var(--surface-raised)",
                  border: active
                    ? "1px solid var(--teal)"
                    : "1px solid var(--border)",
                  color: active ? "var(--teal)" : "var(--text-muted)",
                  padding: "0.375rem 0.875rem",
                  borderRadius: "9999px",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.4 : 1,
                  transition: "background 200ms, border-color 200ms, color 200ms",
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── hint ── */}
      <p
        className="text-xs"
        style={{ color: "var(--text-muted)", marginBottom: "1.25rem" }}
      >
        {error
          ? "문제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
          : loading
            ? "로딩 중…"
            : availablePoolSize === 0
              ? "선택한 과목에 출제 가능한 문제가 없습니다."
              : availablePoolSize < VALID_COUNTS[0]
                ? `${availablePoolSize}문제로 시작 — 풀 사이즈가 작아 자동 조정됨`
                : config.count === availablePoolSize && availablePoolSize < VALID_COUNTS[VALID_COUNTS.length - 1]
                  ? `선택 범위 ${availablePoolSize}문제 중 ${config.count}문제 출제`
                  : `선택 범위에 충분한 문제 — ${config.count}문제 출제`}
      </p>

      {/* ── 시작 버튼 ── */}
      <button
        type="button"
        onClick={handleStart}
        disabled={!canStart}
        className="inline-flex items-center gap-3 font-semibold active:scale-[0.98] w-full sm:w-auto justify-center"
        style={{
          background: "var(--teal)",
          color: "#fff",
          borderRadius: "9999px",
          padding: "10px 10px 10px 22px",
          fontSize: "0.875rem",
          border: "none",
          cursor: !canStart ? "not-allowed" : "pointer",
          opacity: !canStart ? 0.5 : 1,
          transition:
            "opacity 300ms cubic-bezier(0.32,0.72,0,1), transform 200ms cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        {loading ? "로딩 중…" : "세션 시작"}
        <span
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Play size={14} className="fill-current" />
        </span>
      </button>
    </div>
  );
}
