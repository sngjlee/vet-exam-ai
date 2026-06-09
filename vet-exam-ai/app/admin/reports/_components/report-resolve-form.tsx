import { resolveReport } from "../_actions";
import { AdminConfirmSubmitButton } from "../../_components/admin-confirm-submit-button";

export function ReportResolveForm({
  commentId,
  currentCommentStatus,
}: {
  commentId: string;
  currentCommentStatus: string;
}) {
  const dismissHint =
    currentCommentStatus === "blinded_by_report" ? " (임시 비공개 해제)" : "";

  return (
    <form action={resolveReport} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="comment_id" value={commentId} />
      <fieldset className="flex flex-wrap gap-3" style={{ border: 0, padding: 0 }}>
        <legend className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
          처리 결과
        </legend>
        <label className="text-sm flex items-center gap-1.5">
          <input type="radio" name="resolution" value="upheld" required />
          신고 인정 (운영자 삭제)
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
      <AdminConfirmSubmitButton
        confirmMessage="이 신고 처리 결과를 저장할까요? 댓글 공개 상태와 신고자 알림에 반영됩니다."
        className="self-start text-sm px-3 py-1.5 rounded"
        style={{ background: "var(--teal)", color: "white", border: 0, cursor: "pointer" }}
      >
        처리 저장
      </AdminConfirmSubmitButton>
    </form>
  );
}
