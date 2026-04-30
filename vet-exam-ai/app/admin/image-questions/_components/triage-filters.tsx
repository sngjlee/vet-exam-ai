"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  TRIAGE_STATUS_LABEL,
  TRIAGE_STATUS_ORDER,
} from "../../../../lib/admin/triage-labels";
import {
  buildTriageSearchString,
  parseTriageSearchParams,
  type TriageFilterStatus,
} from "../_lib/parse-search-params";

export function TriageFilters({
  categories,
  rounds,
}: {
  categories: string[];
  rounds: number[];
}) {
  const pathname = usePathname();
  const router   = useRouter();
  const sp       = useSearchParams();
  const [pending, startTransition] = useTransition();

  const raw: Record<string, string> = {};
  sp.forEach((v, k) => { raw[k] = v; });
  const current = parseTriageSearchParams(raw);

  function navigate(override: Parameters<typeof buildTriageSearchString>[1]) {
    const next = buildTriageSearchString({ ...current, page: 1 }, override);
    startTransition(() => {
      router.push(`${pathname}${next}`);
    });
  }

  const labelStyle: React.CSSProperties = {
    display:    "block",
    fontSize:   11,
    color:      "var(--text-muted)",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };
  const selectStyle: React.CSSProperties = {
    width:        "100%",
    padding:      "6px 8px",
    fontSize:     13,
    borderRadius: 4,
    border:       "1px solid var(--rule)",
    background:   "var(--surface)",
    color:        "var(--text)",
  };

  return (
    <aside
      className="rounded-lg p-3"
      style={{
        background: "var(--surface-raised)",
        border:     "1px solid var(--rule)",
        opacity:    pending ? 0.6 : 1,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>분류 상태</label>
        <select
          value={current.status}
          onChange={(e) => navigate({ status: e.target.value as TriageFilterStatus })}
          style={selectStyle}
        >
          <option value="unclassified">미분류만</option>
          <option value="all">전체</option>
          {TRIAGE_STATUS_ORDER.filter((s) => s !== "pending").map((s) => (
            <option key={s} value={s}>
              {TRIAGE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>카테고리</label>
        <select
          value={current.category ?? ""}
          onChange={(e) => navigate({ category: e.target.value || undefined })}
          style={selectStyle}
        >
          <option value="">전체</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>회차</label>
        <select
          value={current.round ?? ""}
          onChange={(e) => navigate({ round: e.target.value || undefined })}
          style={selectStyle}
        >
          <option value="">전체</option>
          {rounds.map((r) => (
            <option key={r} value={r}>{r}회</option>
          ))}
        </select>
      </div>
    </aside>
  );
}
