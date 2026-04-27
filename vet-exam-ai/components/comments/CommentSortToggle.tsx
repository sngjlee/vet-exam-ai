// vet-exam-ai/components/comments/CommentSortToggle.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { SortMode } from "../../lib/comments/voteSchema";

type Props = {
  value: SortMode;
  onChange: (mode: SortMode) => void;
};

const LABEL: Record<SortMode, string> = {
  score: "추천순",
  recent: "최신순",
};

export default function CommentSortToggle({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(mode: SortMode) {
    onChange(mode);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-faint)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          padding: "4px 8px",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {LABEL[value]} <ChevronDown size={12} />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            minWidth: 100,
            zIndex: 10,
            overflow: "hidden",
          }}
        >
          {(Object.keys(LABEL) as SortMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="menuitemradio"
              aria-checked={mode === value}
              onClick={() => pick(mode)}
              style={{
                display: "block",
                width: "100%",
                background: mode === value ? "var(--surface-raised)" : "transparent",
                border: "none",
                padding: "8px 12px",
                textAlign: "left",
                fontSize: 12,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              {LABEL[mode]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
