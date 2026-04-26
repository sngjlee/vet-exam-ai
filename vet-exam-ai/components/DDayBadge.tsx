"use client";

import { useEffect, useState } from "react";
import { EXAM_DATE_LABEL, IS_TENTATIVE, daysUntilExam } from "../lib/examDate";

export default function DDayBadge() {
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    setDays(daysUntilExam());
    const id = setInterval(() => setDays(daysUntilExam()), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "10px",
      padding: "8px 14px", borderRadius: "10px",
      background: "rgba(192,74,58,0.08)",
      border: "1px solid rgba(192,74,58,0.25)",
      fontFamily: "var(--font-mono)",
      marginBottom: "14px",
    }}>
      <span style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--wrong)", fontWeight: 700 }}>
        수의사 국가시험
      </span>
      <span aria-hidden="true" style={{ color: "var(--border)" }}>·</span>
      <span style={{ fontSize: "14px", color: "var(--text)", fontWeight: 800 }}>
        D-{days ?? "···"}
      </span>
      {IS_TENTATIVE && (
        <span style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 600 }}>
          (예상)
        </span>
      )}
      <span aria-hidden="true" style={{ color: "var(--border)" }}>·</span>
      <span style={{ fontSize: "11px", color: "var(--text-faint)", fontWeight: 600 }}>
        {EXAM_DATE_LABEL}
      </span>
    </div>
  );
}
