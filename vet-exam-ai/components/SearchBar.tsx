"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { MAX_QUERY_LENGTH } from "../lib/search";

interface SearchBarProps {
  initialQuery?: string;
  onSubmit:      (q: string) => void;
  autoFocus?:    boolean;
  placeholder?:  string;
}

export default function SearchBar({
  initialQuery = "",
  onSubmit,
  autoFocus = false,
  placeholder = "키워드로 문제 / 해설 / 선지 검색",
}: SearchBarProps) {
  const [value, setValue] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keep local value in sync when parent updates initialQuery (e.g. URL change).
  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(value);
  }

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          8,
        background:   "var(--surface)",
        border:       "1px solid var(--border)",
        borderRadius: 12,
        padding:      "10px 14px",
      }}
    >
      <Search size={16} style={{ color: "var(--text-faint)", flexShrink: 0 }} aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, MAX_QUERY_LENGTH))}
        placeholder={placeholder}
        aria-label="검색어"
        autoComplete="off"
        spellCheck={false}
        style={{
          flex:       1,
          minWidth:   0,
          background: "transparent",
          border:     "none",
          outline:    "none",
          fontSize:   14,
          color:      "var(--text)",
          minHeight:  44,
        }}
      />
      <button
        type="submit"
        className="kvle-btn-ghost text-sm"
        style={{ minHeight: 36, padding: "8px 14px", fontSize: 13 }}
      >
        검색
      </button>
    </form>
  );
}
