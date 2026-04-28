"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import type { FilterOptions } from "../../../lib/admin/filter-options";
import {
  buildSearchString,
  type ParsedSearchParams,
  type SortKey,
} from "../questions/_lib/parse-search-params";

export function AdminQuestionsFilters({
  current,
  options,
}: {
  current: ParsedSearchParams;
  options: FilterOptions;
}) {
  const router = useRouter();
  const [qInput, setQInput] = useState(current.q ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQInput(current.q ?? "");
  }, [current.q]);

  function navigate(override: Partial<Record<keyof ParsedSearchParams, string | number | boolean | undefined>>) {
    const next = buildSearchString(current, { ...override, page: 1 });
    router.replace(`/admin/questions${next}`);
  }

  function onQChange(v: string) {
    setQInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      navigate({ q: v.trim() === "" ? undefined : v.trim() });
    }, 300);
  }

  function reset() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQInput("");
    router.replace("/admin/questions");
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--bg)",
    border: "1px solid var(--rule)",
    color: "var(--text)",
    borderRadius: "6px",
    padding: "6px 10px",
    fontSize: "13px",
    minWidth: "120px",
  };

  return (
    <div
      className="rounded-lg p-3 mb-4 flex flex-wrap items-center gap-2"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
    >
      <div className="relative flex-1 min-w-[200px]">
        <Search size={13} style={{ position: "absolute", left: 10, top: 9, color: "var(--text-muted)" }} />
        <input
          type="text"
          value={qInput}
          onChange={(e) => onQChange(e.target.value)}
          placeholder="KVLE-ID 또는 문제 본문 검색"
          aria-label="검색"
          style={{ ...inputStyle, paddingLeft: 28, width: "100%" }}
        />
      </div>

      <select
        value={current.round ?? ""}
        onChange={(e) => navigate({ round: e.target.value || undefined })}
        aria-label="회차"
        style={inputStyle}
      >
        <option value="">회차</option>
        {options.rounds.map((r) => (
          <option key={r} value={r}>{r}회</option>
        ))}
      </select>

      <select
        value={current.year ?? ""}
        onChange={(e) => navigate({ year: e.target.value || undefined })}
        aria-label="연도"
        style={inputStyle}
      >
        <option value="">연도</option>
        {options.years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      <select
        value={current.session ?? ""}
        onChange={(e) => navigate({ session: e.target.value || undefined })}
        aria-label="교시"
        style={inputStyle}
      >
        <option value="">교시</option>
        {options.sessions.map((s) => (
          <option key={s} value={s}>{s}교시</option>
        ))}
      </select>

      <select
        value={current.subject ?? ""}
        onChange={(e) => navigate({ subject: e.target.value || undefined })}
        aria-label="과목"
        style={inputStyle}
      >
        <option value="">과목</option>
        {options.subjects.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <select
        value={current.category ?? ""}
        onChange={(e) => navigate({ category: e.target.value || undefined })}
        aria-label="카테고리"
        style={inputStyle}
      >
        <option value="">카테고리</option>
        {options.categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <select
        value={
          current.is_active === true
            ? "active"
            : current.is_active === false
            ? "inactive"
            : ""
        }
        onChange={(e) => navigate({ is_active: e.target.value || undefined })}
        aria-label="활성 상태"
        style={inputStyle}
      >
        <option value="">활성 상태</option>
        <option value="active">활성</option>
        <option value="inactive">비활성</option>
      </select>

      <select
        value={current.sort}
        onChange={(e) => navigate({ sort: e.target.value as SortKey })}
        aria-label="정렬"
        style={inputStyle}
      >
        <option value="recent">등록일 ↓</option>
        <option value="round">회차 ↑</option>
        <option value="kvle">KVLE-ID ↑</option>
      </select>

      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-1.5 text-xs"
        style={{
          color: "var(--text-muted)",
          background: "transparent",
          border: "1px solid var(--rule)",
          borderRadius: 6,
          padding: "6px 10px",
          cursor: "pointer",
        }}
        aria-label="필터 초기화"
      >
        <X size={13} />
        초기화
      </button>
    </div>
  );
}
