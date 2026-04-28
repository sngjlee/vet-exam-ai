import { resolveReport } from "../_actions";

export function ReportResolveForm({
  commentId,
  currentCommentStatus,
}: {
  commentId: string;
  currentCommentStatus: string;
}) {
  const dismissHint =
    currentCommentStatus === "blinded_by_report" ? " (자동 블라인드 해제)" : "";

  return (
    <form action={resolveReport} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="comment_id" value={commentId} />
      <fieldset className="flex flex-wrap gap-3" style={{ border: 0, padding: 0 }}>
        <legend className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
          처리 결과
        </legend>
        <label className="text-sm flex items-center gap-1.5">
          <input type="radio" name="resolution" value="upheld" required />
          신고 인정 (댓글 제거)
        </label>
        <label className="text-sm flex items-center gap-1.5">
          <input type="radio" name="resolution" value="dismissed" required />
          신고 기각{dismissHint}
        </label>
      </fieldset>
      <textarea
        name="note"
        maxLength={200}
        rows={2}
        placeholder="처리 사유 (선택, 200자 이내) — 신고자에게 함께 전달됩니다"
        className="text-sm rounded p-2"
        style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
      />
      <button
        type="submit"
        className="self-start text-sm px-3 py-1.5 rounded"
        style={{ background: "var(--teal)", color: "white", border: 0, cursor: "pointer" }}
      >
        처리 저장
      </button>
    </form>
  );
}
