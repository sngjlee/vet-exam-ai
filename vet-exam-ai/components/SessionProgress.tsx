// components/SessionProgress.tsx
"use client";

import { Target } from "lucide-react";

type Props = {
  current: number;   // 0-based index of current question
  total: number;
  score: number;
};

export default function SessionProgress({ current, total, score }: Props) {
  const percent = total > 0 ? (current / total) * 100 : 0;

  return (
    <div style={{ marginBottom: "2rem" }}>
      {/* Counter row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            className="font-bold kvle-mono text-sm"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "2.25rem",
              height: "2.25rem",
              borderRadius: "0.5rem",
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          >
            {current + 1}
          </div>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            / {total} 문제
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            borderRadius: "0.5rem",
            padding: "0.5rem 0.75rem",
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
          }}
        >
          <Target size={13} style={{ color: "var(--teal)" }} />
          <span className="font-semibold kvle-mono text-sm" style={{ color: "var(--text)" }}>
            {score}
            <span style={{ color: "var(--text-faint)" }}> / {total}</span>
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: "100%",
          borderRadius: "9999px",
          height: "3px",
          overflow: "hidden",
          background: "var(--surface-raised)",
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: "9999px",
            width: `${percent}%`,
            background: "var(--teal)",
            transition: "width 500ms cubic-bezier(0.32,0.72,0,1)",
            willChange: "width",
          }}
        />
      </div>
    </div>
  );
}
