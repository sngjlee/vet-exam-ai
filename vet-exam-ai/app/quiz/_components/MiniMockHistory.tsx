import { formatDuration } from "./quiz-history";
import type { MiniMockHistoryItem } from "./quiz-history";

export function MiniMockHistory({ history }: { history: MiniMockHistoryItem[] }) {
  if (history.length === 0) return null;

  return (
    <section
      className="fade-in"
      style={{
        position: "relative",
        marginBottom: "1.5rem",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 18,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <span className="kvle-label" style={{ fontSize: 12 }}>
            최근 미니 모의고사
          </span>
          <h2 style={{ color: "var(--text)", fontSize: 18, fontWeight: 800, margin: "6px 0 0" }}>
            결과 히스토리
          </h2>
        </div>
        <span style={{ color: "var(--text-faint)", fontSize: 12, fontWeight: 800 }}>
          최근 {history.length}회
        </span>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {history.map((item) => {
          const completedAt = new Date(item.completedAt);
          const topCategories = Object.entries(item.categories)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([category, count]) => `${category} ${count}`)
            .join(" · ");
          return (
            <div
              key={item.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: 12,
                alignItems: "center",
                padding: 12,
                borderRadius: "var(--radius-md)",
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <strong style={{ color: "var(--text)", fontSize: 14 }}>
                    {item.score}/{item.total}점 · {item.accuracy}%
                  </strong>
                  {item.timeExpired && (
                    <span style={{ color: "var(--wrong)", fontSize: 11, fontWeight: 800 }}>
                      시간 종료
                    </span>
                  )}
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.4, margin: 0 }}>
                  {completedAt.toLocaleDateString("ko-KR")} · 소요 {formatDuration(item.elapsedSeconds)} · 오답 {item.wrongCount} · 미응답 {item.unansweredCount}
                </p>
                {topCategories && (
                  <p style={{ color: "var(--text-faint)", fontSize: 11, lineHeight: 1.35, margin: "4px 0 0" }}>
                    {topCategories}
                  </p>
                )}
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  color: item.accuracy >= 70 ? "var(--correct)" : "var(--amber)",
                  fontSize: 18,
                  fontWeight: 800,
                }}
              >
                {item.accuracy}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
