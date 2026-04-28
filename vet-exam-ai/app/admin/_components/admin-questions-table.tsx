import Link from "next/link";

export type AdminQuestionRow = {
  id: string;
  public_id: string;
  round: number | null;
  session: number | null;
  year: number | null;
  subject: string | null;
  category: string;
  question: string;
  answer: string;
  choices: string[];
  is_active: boolean;
  created_at: string;
};

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

function formatRoundSession(round: number | null, session: number | null): string {
  if (round == null && session == null) return "—";
  const r = round == null ? "" : `${round}회`;
  const s = session == null ? "" : `${session}교시`;
  return [r, s].filter(Boolean).join(" · ");
}

function answerNumber(answer: string, choices: string[]): string {
  const idx = choices.findIndex((c) => c === answer);
  if (idx < 0) return truncate(answer, 30);
  return `${idx + 1}. ${truncate(answer, 28)}`;
}

function formatKoreanDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AdminQuestionsTable({ rows }: { rows: AdminQuestionRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg p-10 text-center text-sm"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)", color: "var(--text-muted)" }}
      >
        조건에 맞는 문제가 없습니다.{" "}
        <Link href="/admin/questions" style={{ color: "var(--teal)", textDecoration: "underline" }}>
          필터 초기화
        </Link>
      </div>
    );
  }

  const cell: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: "13px",
    borderBottom: "1px solid var(--rule)",
    verticalAlign: "top",
  };

  const head: React.CSSProperties = {
    ...cell,
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    background: "var(--surface-raised)",
    borderBottom: "1px solid var(--rule)",
    textAlign: "left",
    whiteSpace: "nowrap",
  };

  return (
    <div
      className="overflow-x-auto rounded-lg"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={head}>KVLE-ID</th>
            <th style={head}>회차/교시</th>
            <th style={head}>과목</th>
            <th style={head}>카테고리</th>
            <th style={head}>문제</th>
            <th style={head}>정답</th>
            <th style={head}>활성</th>
            <th style={head}>등록일</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ background: "var(--bg)" }}>
              <td style={{ ...cell, whiteSpace: "nowrap" }}>
                <Link
                  href={`/admin/questions/${encodeURIComponent(r.id)}`}
                  className="kvle-mono"
                  style={{ color: "var(--teal)", textDecoration: "none" }}
                >
                  {r.public_id}
                </Link>
              </td>
              <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                {formatRoundSession(r.round, r.session)}
              </td>
              <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                {r.subject ?? "—"}
              </td>
              <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                {r.category}
              </td>
              <td style={{ ...cell, color: "var(--text)" }}>{truncate(r.question, 80)}</td>
              <td style={{ ...cell, color: "var(--text-muted)" }}>
                {answerNumber(r.answer, r.choices)}
              </td>
              <td style={{ ...cell, whiteSpace: "nowrap" }}>
                <span
                  className="inline-block rounded-full text-[10px] font-medium"
                  style={{
                    padding: "2px 8px",
                    background: r.is_active ? "var(--teal-dim)" : "var(--surface-raised)",
                    color: r.is_active ? "var(--teal)" : "var(--text-muted)",
                    border: r.is_active ? "none" : "1px solid var(--rule)",
                  }}
                >
                  {r.is_active ? "활성" : "비활성"}
                </span>
              </td>
              <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                {formatKoreanDate(r.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
