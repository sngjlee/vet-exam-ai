import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildReportsSearchString,
  type ParsedReportsSearchParams,
} from "../_lib/parse-reports-search-params";

export function ReportsPager({
  current,
  totalPages,
}: {
  current: ParsedReportsSearchParams;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const prev = Math.max(1, current.page - 1);
  const next = Math.min(totalPages, current.page + 1);

  const linkStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 12px",
    border: "1px solid var(--rule)",
    borderRadius: 6,
    fontSize: 13,
    color: "var(--text)",
    textDecoration: "none",
    background: "var(--bg)",
  };

  const disabledStyle: React.CSSProperties = {
    ...linkStyle,
    opacity: 0.4,
    pointerEvents: "none",
    cursor: "not-allowed",
  };

  const prevHref = `/admin/reports${buildReportsSearchString(current, { page: prev })}`;
  const nextHref = `/admin/reports${buildReportsSearchString(current, { page: next })}`;

  return (
    <nav
      className="mt-4 flex items-center justify-between"
      aria-label="페이지 네비게이션"
    >
      <Link
        href={prevHref}
        aria-label="이전 페이지"
        style={current.page <= 1 ? disabledStyle : linkStyle}
      >
        <ChevronLeft size={14} />
        이전
      </Link>

      <span className="text-xs kvle-mono" style={{ color: "var(--text-muted)" }}>
        {current.page} / {totalPages}
      </span>

      <Link
        href={nextHref}
        aria-label="다음 페이지"
        style={current.page >= totalPages ? disabledStyle : linkStyle}
      >
        다음
        <ChevronRight size={14} />
      </Link>
    </nav>
  );
}
