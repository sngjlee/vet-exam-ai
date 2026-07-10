import { ClipboardCheck, Timer, ArrowRight } from "lucide-react";
import { MINI_MOCK_COUNT, MINI_MOCK_MINUTES } from "./quiz-history";
import type { SessionStartPayload } from "./quiz-history";

export function MiniMockEntry({
  loading,
  totalCount,
  onStart,
}: {
  loading: boolean;
  totalCount: number;
  onStart: (payload: SessionStartPayload) => void;
}) {
  const availableCount = Math.max(0, totalCount);
  const examCount =
    availableCount > 0 ? Math.min(MINI_MOCK_COUNT, availableCount) : MINI_MOCK_COUNT;
  const canStart = !loading && availableCount > 0;

  return (
    <section
      className="fade-in mini-mock-entry"
      style={{
        position: "relative",
        marginBottom: "1.5rem",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderTop: "3px solid var(--blue)",
        borderRadius: "var(--radius-md)",
        padding: 20,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 16,
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <ClipboardCheck size={16} style={{ color: "var(--blue)" }} />
          <span className="kvle-label" style={{ color: "var(--blue)", fontSize: 12 }}>
            미니 모의고사
          </span>
        </div>
        <h2
          style={{
            color: "var(--text)",
            fontFamily: "var(--font-serif)",
            fontSize: 21,
            fontWeight: 800,
            lineHeight: 1.25,
            margin: "0 0 6px",
          }}
        >
          정답은 끝나고 한 번에 확인하세요
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.55, margin: 0 }}>
          전 과목에서 {examCount}문제를 뽑아 실제 시험처럼 풀고, 결과 화면에서 오답과 해설을 정리합니다.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              borderRadius: "var(--radius-full)",
              padding: "5px 9px",
              background: "var(--surface-raised)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <Timer size={13} />
            제한시간 {MINI_MOCK_MINUTES}분
          </span>
          <span
            style={{
              borderRadius: "var(--radius-full)",
              padding: "5px 9px",
              background: "var(--blue-dim)",
              color: "var(--blue)",
              border: "1px solid rgba(74,127,168,0.28)",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            지연 채점
          </span>
        </div>
      </div>
      <button
        type="button"
        disabled={!canStart}
        onClick={() => onStart({ subjects: [], count: examCount, mode: "mini-mock" })}
        className="active:scale-[0.98]"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          minHeight: 46,
          whiteSpace: "nowrap",
          borderRadius: "var(--radius-full)",
          padding: "10px 18px",
          border: "none",
          background: "var(--blue)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 800,
          cursor: canStart ? "pointer" : "not-allowed",
          opacity: canStart ? 1 : 0.5,
        }}
      >
        시작
        <ArrowRight size={15} />
      </button>
    </section>
  );
}
