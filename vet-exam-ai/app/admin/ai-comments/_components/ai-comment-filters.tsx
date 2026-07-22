import Link from "next/link";
import type { AiCommentCandidateSearch } from "../_lib/schemas";
import {
  AI_COMMENT_AUTHOR_LABELS,
  AI_COMMENT_STATUS_LABELS,
} from "../_lib/presentation";

type AiCommentFiltersProps = {
  readonly current: AiCommentCandidateSearch;
};

const inputClassName =
  "min-h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2";

const fieldStyle = {
  background: "var(--bg)",
  borderColor: "var(--rule)",
  color: "var(--text)",
} as const;

export function AiCommentFilters({ current }: AiCommentFiltersProps) {
  return (
    <form
      action="/admin/ai-comments"
      method="get"
      className="mb-5 grid gap-3 rounded-xl border p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4"
      style={{ background: "var(--surface-raised)", borderColor: "var(--rule)" }}
      aria-label="댓글 초안 필터"
    >
      <label className="grid gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
        상태
        <select name="status" defaultValue={current.status} className={inputClassName} style={fieldStyle}>
          {Object.entries(AI_COMMENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
        계정 유형
        <select name="author" defaultValue={current.author} className={inputClassName} style={fieldStyle}>
          {Object.entries(AI_COMMENT_AUTHOR_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
        문제 공개 ID
        <input
          name="publicId"
          defaultValue={current.publicId}
          className={inputClassName}
          style={fieldStyle}
          placeholder="예: KVLE-101"
          maxLength={50}
        />
      </label>

      <label className="grid gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
        카테고리
        <input
          name="category"
          defaultValue={current.category}
          className={inputClassName}
          style={fieldStyle}
          placeholder="예: 내과"
          maxLength={100}
        />
      </label>

      <label className="grid gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
        과목
        <input
          name="subject"
          defaultValue={current.subject}
          className={inputClassName}
          style={fieldStyle}
          placeholder="예: 소화기"
          maxLength={100}
        />
      </label>

      <label className="grid gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
        모델
        <input
          name="model"
          defaultValue={current.model}
          className={inputClassName}
          style={fieldStyle}
          placeholder="예: gpt-5.6-terra"
          maxLength={100}
        />
      </label>

      <div className="flex items-end gap-2 sm:col-span-2">
        <button type="submit" className="kvle-btn-primary flex-1 text-sm sm:flex-none">
          필터 적용
        </button>
        <Link href="/admin/ai-comments" className="kvle-btn-ghost flex-1 text-sm sm:flex-none">
          초기화
        </Link>
      </div>
    </form>
  );
}
