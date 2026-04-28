import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { CORRECTION_STATUS_KO } from "../../../../lib/admin/correction-labels";
import { CorrectionResolveForm } from "./correction-resolve-form";

export type CorrectionRow = {
  id:                 string;
  question_id:        string;
  proposed_by:        string | null;
  proposed_change:    Record<string, unknown>;
  status:             string;
  resolved_by:        string | null;
  resolved_at:        string | null;
  resolution_note:    string | null;
  created_at:         string;
};

export type QuestionLite = {
  id:        string;
  public_id: string | null;
  question:  string;
  answer:    string;
  category:  string | null;
  subject:   string | null;
};

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

function shortJson(v: unknown, max = 80): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (s == null) return "null";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export function CorrectionsTable({
  rows,
  questionMap,
  nicknameMap,
}: {
  rows:        CorrectionRow[];
  questionMap: Record<string, QuestionLite>;
  nicknameMap: Record<string, string | null>;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg p-8 text-center text-sm"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)", color: "var(--text-muted)" }}
      >
        처리할 정정 제안이 없습니다
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => {
        const q = questionMap[row.question_id];
        const proposerNick = row.proposed_by ? (nicknameMap[row.proposed_by] ?? "탈퇴한 사용자") : "탈퇴한 사용자";
        const resolverNick = row.resolved_by ? (nicknameMap[row.resolved_by] ?? null) : null;
        const kvle = q?.public_id ?? row.question_id;

        const changeKeys = Object.keys(row.proposed_change ?? {});
        const summary =
          changeKeys.length === 0
            ? "(빈 제안)"
            : changeKeys.slice(0, 2).join(", ") + (changeKeys.length > 2 ? ` …+${changeKeys.length - 2}` : "");

        const isPending = row.status === "proposed" || row.status === "reviewing";
        const isAccepted = row.status === "accepted";

        return (
          <details
            key={row.id}
            className="rounded-lg"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
          >
            <summary
              className="flex items-center gap-3 px-3 py-2 cursor-pointer text-sm"
              style={{ listStyle: "none" }}
            >
              <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />
              <span className="kvle-mono" style={{ color: "var(--text)" }}>{kvle}</span>
              <span className="flex-1 truncate" style={{ color: "var(--text-muted)" }}>
                {summary}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                {proposerNick}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                {formatRelative(row.created_at)}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{ border: "1px solid var(--rule)", color: "var(--text-muted)" }}
              >
                {CORRECTION_STATUS_KO[row.status as keyof typeof CORRECTION_STATUS_KO] ?? row.status}
              </span>
            </summary>

            <div
              className="px-3 pb-3 pt-1 flex flex-col gap-3"
              style={{ borderTop: "1px solid var(--rule)" }}
            >
              {q && (
                <div className="text-sm" style={{ color: "var(--text)" }}>
                  <div className="line-clamp-3">{q.question}</div>
                  <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    현재 정답: {q.answer}{q.category ? ` · ${q.category}` : ""}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  제안된 변경
                </div>
                <ul className="flex flex-col gap-0.5 text-xs kvle-mono" style={{ color: "var(--text-muted)" }}>
                  {changeKeys.length === 0 && <li>(없음)</li>}
                  {changeKeys.map((k) => {
                    const before = q ? (q as unknown as Record<string, unknown>)[k] : undefined;
                    const after  = (row.proposed_change as Record<string, unknown>)[k];
                    return (
                      <li key={k} className="flex flex-wrap gap-1">
                        <span style={{ color: "var(--text)" }}>{k}:</span>
                        <span>{shortJson(before)}</span>
                        <span>→</span>
                        <span style={{ color: "var(--text)" }}>{shortJson(after)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {isPending && <CorrectionResolveForm correctionId={row.id} />}

              {!isPending && (
                <div
                  className="rounded p-2 text-xs"
                  style={{ background: "var(--bg)", border: "1px solid var(--rule)", color: "var(--text-muted)" }}
                >
                  <div>
                    {resolverNick ?? "운영자"} · {row.resolved_at ? formatRelative(row.resolved_at) : "—"} ·{" "}
                    {CORRECTION_STATUS_KO[row.status as keyof typeof CORRECTION_STATUS_KO] ?? row.status}
                  </div>
                  {row.resolution_note && (
                    <div className="mt-1" style={{ color: "var(--text)" }}>"{row.resolution_note}"</div>
                  )}
                  {isAccepted && (
                    <div className="mt-2">
                      <Link
                        href={`/admin/questions/${encodeURIComponent(row.question_id)}/edit`}
                        style={{ color: "var(--teal)" }}
                      >
                        수정하러 가기 →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
