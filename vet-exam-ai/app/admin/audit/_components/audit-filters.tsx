"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import {
  ALL_AUDIT_ACTIONS,
  ALL_TARGET_TYPES,
  AUDIT_ACTION_LABEL,
  TARGET_TYPE_LABEL,
  buildAuditSearchString,
  type ParsedAuditSearchParams,
} from "../_lib/parse-audit-search-params";

export function AuditFilters({
  current,
}: {
  current: ParsedAuditSearchParams;
}) {
  const router = useRouter();
  const [adminInput, setAdminInput] = useState(current.admin ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAdminInput(current.admin ?? "");
  }, [current.admin]);

  function navigate(
    override: Partial<Record<keyof ParsedAuditSearchParams, string | number | undefined>>,
  ) {
    const next = buildAuditSearchString(current, { ...override, page: 1 });
    router.replace(`/admin/audit${next}`);
  }

  function onAdminChange(v: string) {
    setAdminInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      navigate({ admin: v.trim() === "" ? undefined : v.trim() });
    }, 300);
  }

  function reset() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAdminInput("");
    router.replace("/admin/audit");
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
      <div className="relative flex-1 min-w-[200px]">
        <Search
          size={13}
          style={{ position: "absolute", left: 10, top: 9, color: "var(--text-muted)" }}
        />
        <input
          type="text"
          value={adminInput}
          onChange={(e) => onAdminChange(e.target.value)}
          placeholder="운영자 닉네임 검색"
          aria-label="운영자 검색"
          style={{ ...inputStyle, paddingLeft: 28, width: "100%" }}
        />
      </div>

      <select
        value={current.action ?? ""}
        onChange={(e) => navigate({ action: e.target.value || undefined })}
        aria-label="액션"
        style={inputStyle}
      >
        <option value="">전체 액션</option>
        {ALL_AUDIT_ACTIONS.map((a) => (
          <option key={a} value={a}>{AUDIT_ACTION_LABEL[a]}</option>
        ))}
      </select>

      <select
        value={current.target_type ?? ""}
        onChange={(e) => navigate({ target_type: e.target.value || undefined })}
        aria-label="대상"
        style={inputStyle}
      >
        <option value="">전체 대상</option>
        {ALL_TARGET_TYPES.map((t) => (
          <option key={t} value={t}>{TARGET_TYPE_LABEL[t] ?? t}</option>
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
