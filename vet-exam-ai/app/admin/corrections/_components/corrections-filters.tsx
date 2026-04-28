"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  ALL_CORRECTION_STATUSES,
  CORRECTION_STATUS_KO,
} from "../../../../lib/admin/correction-labels";
import {
  buildCorrectionsSearchString,
  type ParsedCorrectionsSearchParams,
} from "../_lib/parse-corrections-search-params";

export function CorrectionsFilters({
  current,
}: {
  current: ParsedCorrectionsSearchParams;
}) {
  const router = useRouter();

  function navigate(
    override: Partial<Record<keyof ParsedCorrectionsSearchParams, string | number | undefined>>,
  ) {
    const next = buildCorrectionsSearchString(current, { ...override, page: 1 });
    router.replace(`/admin/corrections${next}`);
  }

  function reset() {
    router.replace("/admin/corrections");
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
        {ALL_CORRECTION_STATUSES.map((s) => (
          <option key={s} value={s}>{CORRECTION_STATUS_KO[s]}</option>
        ))}
        <option value="all">전체</option>
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
