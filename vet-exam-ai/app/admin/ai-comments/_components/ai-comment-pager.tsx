import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AiCommentCandidateSearch } from "../_lib/schemas";
import { buildAiCommentSearchHref } from "../_lib/presentation";

type AiCommentPagerProps = {
  readonly current: AiCommentCandidateSearch;
  readonly totalPages: number;
};

const linkClassName = "kvle-btn-ghost min-w-28 text-sm";

export function AiCommentPager({ current, totalPages }: AiCommentPagerProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className="mt-5 flex items-center justify-between gap-3" aria-label="댓글 초안 페이지">
      {current.page > 1 ? (
        <Link
          href={buildAiCommentSearchHref(current, { page: current.page - 1 })}
          className={linkClassName}
        >
          <ChevronLeft size={16} aria-hidden />
          이전
        </Link>
      ) : (
        <span className={linkClassName} aria-disabled="true" style={{ opacity: 0.45 }}>
          <ChevronLeft size={16} aria-hidden />
          이전
        </span>
      )}

      <span className="kvle-mono text-xs" style={{ color: "var(--text-muted)" }}>
        {current.page} / {totalPages}
      </span>

      {current.page < totalPages ? (
        <Link
          href={buildAiCommentSearchHref(current, { page: current.page + 1 })}
          className={linkClassName}
        >
          다음
          <ChevronRight size={16} aria-hidden />
        </Link>
      ) : (
        <span className={linkClassName} aria-disabled="true" style={{ opacity: 0.45 }}>
          다음
          <ChevronRight size={16} aria-hidden />
        </span>
      )}
    </nav>
  );
}
