import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type RoundRow = {
  round:          number | null;
  total_count:    number | null;
  active_count:   number | null;
  category_count: number | null;
  latest_year:    number | null;
};

async function loadRounds(): Promise<{ rows: RoundRow[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_rounds_with_stats");
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as RoundRow[], error: null };
}

export default async function AdminExamsPage() {
  const { rows, error } = await loadRounds();

  const totalQuestions   = rows.reduce((s, r) => s + (r.total_count  ?? 0), 0);
  const totalActive      = rows.reduce((s, r) => s + (r.active_count ?? 0), 0);
  const activeRatio = totalQuestions > 0
    ? Math.round((totalActive / totalQuestions) * 1000) / 10
    : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          시험 회차
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          회차별 문제 수/활성 비율/카테고리 집계. 행을 클릭하면 해당 회차 문제 목록으로 이동합니다.
        </p>
      </header>

      {error && (
        <div
          className="mb-4 rounded-lg px-3 py-2.5 text-sm"
          style={{
            background: "var(--wrong-dim)",
            border: "1px solid rgba(192,74,58,0.3)",
            color: "var(--wrong)",
          }}
        >
          데이터 로드 실패: {error}
        </div>
      )}

      <section className="mb-6 grid grid-cols-3 gap-3">
        <SummaryCard label="총 회차"     value={rows.length.toLocaleString("ko-KR")} />
        <SummaryCard label="총 문제"     value={totalQuestions.toLocaleString("ko-KR")} />
        <SummaryCard label="활성 비율"   value={`${activeRatio}%`} />
      </section>

      <div
        className="overflow-hidden rounded-lg"
        style={{ border: "1px solid var(--rule)", background: "var(--surface-raised)" }}
      >
        <table className="w-full text-sm" style={{ color: "var(--text)" }}>
          <thead>
            <tr
              className="text-xs"
              style={{
                background: "var(--surface)",
                color: "var(--text-muted)",
                borderBottom: "1px solid var(--rule)",
              }}
            >
              <Th>회차</Th>
              <Th className="text-right">총 문제</Th>
              <Th className="text-right">활성</Th>
              <Th className="text-right">카테고리</Th>
              <Th className="text-right">최근 연도</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !error && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  표시할 회차 데이터가 없습니다.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const total  = r.total_count  ?? 0;
              const active = r.active_count ?? 0;
              const ratio  = total > 0 ? Math.round((active / total) * 1000) / 10 : 0;
              return (
                <tr
                  key={r.round ?? "null"}
                  style={{ borderTop: "1px solid var(--rule)" }}
                >
                  <Td>
                    <Link
                      href={`/admin/questions?round=${r.round ?? ""}`}
                      className="font-medium hover:underline"
                      style={{ color: "var(--text)" }}
                    >
                      {r.round != null ? `${r.round}회` : "—"}
                    </Link>
                  </Td>
                  <Td className="text-right kvle-mono">{total.toLocaleString("ko-KR")}</Td>
                  <Td className="text-right kvle-mono">
                    <span>{active.toLocaleString("ko-KR")}</span>
                    <span className="ml-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      ({ratio}%)
                    </span>
                  </Td>
                  <Td className="text-right kvle-mono">
                    {(r.category_count ?? 0).toLocaleString("ko-KR")}
                  </Td>
                  <Td className="text-right kvle-mono" style={{ color: "var(--text-muted)" }}>
                    {r.latest_year ?? "—"}
                  </Td>
                  <Td className="text-right">
                    <Link
                      href={`/admin/questions?round=${r.round ?? ""}`}
                      className="inline-flex items-center gap-1 text-xs"
                      style={{ color: "var(--teal)" }}
                    >
                      문제 목록
                      <ArrowRight size={12} />
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
    >
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div
        className="mt-1 text-xl font-semibold kvle-mono"
        style={{ color: "var(--text)" }}
      >
        {value}
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2 text-left font-medium ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className={`px-3 py-2.5 ${className ?? ""}`}
      style={style}
    >
      {children}
    </td>
  );
}
