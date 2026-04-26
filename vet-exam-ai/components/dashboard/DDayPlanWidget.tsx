"use client";

import { useEffect, useState } from "react";
import { EXAM_DATE_LABEL, IS_TENTATIVE, daysUntilExam } from "../../lib/examDate";

export default function DDayPlanWidget() {
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    setDays(daysUntilExam());
    const id = setInterval(() => setDays(daysUntilExam()), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

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

      {/* RIGHT: pool / 권장 — Task 4~5에서 채움 */}
      <div />
    </div>
  );
}
