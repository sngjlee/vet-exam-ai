import Link from "next/link";
import { ChevronDown } from "lucide-react";
import {
  REPORT_REASON_KO,
  REPORT_STATUS_KO,
} from "../../../../lib/admin/report-labels";
import { ReportResolveForm } from "./report-resolve-form";

export type ReportGroupRow = {
  comment_id:   string;
  report_count: number;
  reasons:      string[];
  first_reported_at: string;
};

export type RawReportRow = {
  id:          string;
  comment_id:  string;
  reporter_id: string | null;
  reason:      string;
  description: string | null;
  status:      string;
  created_at:  string;
};

export type CommentLite = {
  id:        string;
  body_html: string;
  body_text: string;
  status:    string;
  user_id:   string;
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

export function ReportsTable({
  groups,
  commentMap,
  rawMap,
  nicknameMap,
}: {
  groups:      ReportGroupRow[];
  commentMap:  Record<string, CommentLite>;
  rawMap:      Record<string, RawReportRow[]>;
  nicknameMap: Record<string, string | null>;
}) {
  if (groups.length === 0) {
    return (
      <div
        className="rounded-lg p-8 text-center text-sm"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)", color: "var(--text-muted)" }}
      >
        처리할 신고가 없습니다
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => {
        const comment = commentMap[g.comment_id];
        if (!comment) return null;          // skip removed/hidden_by_author
        const raws = rawMap[g.comment_id] ?? [];
        const authorNick = nicknameMap[comment.user_id] ?? "탈퇴한 사용자";
        const preview = comment.body_text.slice(0, 40) + (comment.body_text.length > 40 ? "…" : "");
        const reasonChips = Array.from(new Set(g.reasons))
          .map((r) => REPORT_REASON_KO[r as keyof typeof REPORT_REASON_KO] ?? r);
        const isPending = raws.some((r) => r.status === "pending" || r.status === "reviewing");

        return (
          <details
            key={g.comment_id}
            className="rounded-lg"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
          >
            <summary
              className="flex items-center gap-3 px-3 py-2 cursor-pointer text-sm"
              style={{ listStyle: "none" }}
            >
              <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />
              <span className="flex-1 truncate" style={{ color: "var(--text)" }}>{preview}</span>
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                {authorNick}
              </span>
              <span
                className="kvle-mono"
                style={{ color: "var(--text-muted)", fontSize: 11 }}
              >
                {g.report_count}건 · {reasonChips.join(", ")}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                {formatRelative(g.first_reported_at)}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  background: comment.status === "blinded_by_report" ? "var(--teal-dim)" : "transparent",
                  border: "1px solid var(--rule)",
                  color: "var(--text-muted)",
                }}
              >
                {comment.status === "blinded_by_report" ? "자동 블라인드" : "표시 중"}
              </span>
            </summary>

            <div className="px-3 pb-3 pt-1 flex flex-col gap-3" style={{ borderTop: "1px solid var(--rule)" }}>
              <div
                className="rounded p-2 text-sm"
                style={{ background: "var(--bg)", border: "1px solid var(--rule)", maxHeight: 200, overflow: "auto" }}
                dangerouslySetInnerHTML={{ __html: comment.body_html }}
              />

              <Link
                href={`/profile/${encodeURIComponent(authorNick)}`}
                className="text-xs"
                style={{ color: "var(--teal)" }}
              >
                작성자 프로필 →
              </Link>

              <ul className="flex flex-col gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {raws.map((r) => {
                  const reporterNick = r.reporter_id ? (nicknameMap[r.reporter_id] ?? "탈퇴한 사용자") : "익명";
                  const reasonKo = REPORT_REASON_KO[r.reason as keyof typeof REPORT_REASON_KO] ?? r.reason;
                  const statusKo = REPORT_STATUS_KO[r.status as keyof typeof REPORT_STATUS_KO] ?? r.status;
                  return (
                    <li key={r.id} className="flex flex-wrap gap-2">
                      <span style={{ color: "var(--text)" }}>{reporterNick}</span>
                      <span>·</span>
                      <span>{reasonKo}</span>
                      <span>·</span>
                      <span>{statusKo}</span>
                      <span>·</span>
                      <span>{formatRelative(r.created_at)}</span>
                      {r.description && (
                        <span className="block w-full mt-0.5" style={{ color: "var(--text)" }}>
                          "{r.description}"
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {isPending ? (
                <ReportResolveForm
                  commentId={g.comment_id}
                  currentCommentStatus={comment.status}
                />
              ) : (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  이 그룹의 모든 신고는 이미 처리되었습니다.
                </p>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
