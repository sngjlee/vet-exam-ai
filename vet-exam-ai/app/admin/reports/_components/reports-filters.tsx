"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  ALL_REPORT_REASONS,
  ALL_REPORT_STATUSES,
  REPORT_REASON_KO,
  REPORT_STATUS_KO,
} from "../../../../lib/admin/report-labels";
import {
  buildReportsSearchString,
  type ParsedReportsSearchParams,
} from "../_lib/parse-reports-search-params";

export function ReportsFilters({
  current,
}: {
  current: ParsedReportsSearchParams;
}) {
  const router = useRouter();

  function navigate(
    override: Partial<Record<keyof ParsedReportsSearchParams, string | number | undefined>>,
  ) {
    const next = buildReportsSearchString(current, { ...override, page: 1 });
    router.replace(`/admin/reports${next}`);
  }

  function reset() {
    router.replace("/admin/reports");
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--bg)",
    border: "1px solid var(--rule)",
    color: "var(--text)",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13,
    minWidth: 120,
  };

  return (
    <div
      className="rounded-lg p-3 mb-4 flex flex-wrap items-center gap-2"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
    >
      <select
        value={current.status}
        onChange={(e) => navigate({ status: e.target.value })}
        aria-label="처리 상태"
        style={inputStyle}
      >
        {ALL_REPORT_STATUSES.map((s) => (
          <option key={s} value={s}>{REPORT_STATUS_KO[s]}</option>
        ))}
        <option value="all">전체</option>
      </select>

      <select
        value={current.reason}
        onChange={(e) => navigate({ reason: e.target.value })}
        aria-label="신고 사유"
        style={inputStyle}
      >
        <option value="all">전체 사유</option>
        {ALL_REPORT_REASONS.map((r) => (
          <option key={r} value={r}>{REPORT_REASON_KO[r]}</option>
        ))}
      </select>

      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-1.5 text-xs"
        style={{
          color: "var(--text-muted)",
          background: "transparent",
          border: "1px solid var(--rule)",
          borderRadius: 6,
          padding: "6px 10px",
          cursor: "pointer",
        }}
        aria-label="필터 초기화"
      >
        <X size={13} />
        초기화
      </button>
    </div>
  );
}
