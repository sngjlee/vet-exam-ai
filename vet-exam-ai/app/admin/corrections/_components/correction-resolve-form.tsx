import { resolveCorrection } from "../_actions";
import { AdminConfirmSubmitButton } from "../../_components/admin-confirm-submit-button";

export function CorrectionResolveForm({
  correctionId,
}: {
  correctionId: string;
}) {
  return (
    <form action={resolveCorrection} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="correction_id" value={correctionId} />
      <fieldset className="flex flex-wrap gap-3" style={{ border: 0, padding: 0 }}>
        <legend className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
          처리 결과
        </legend>
        <label className="text-sm flex items-center gap-1.5">
          <input type="radio" name="resolution" value="accepted" required />
          정정 수락 (수동 적용)
        </label>
        <label className="text-sm flex items-center gap-1.5">
          <input type="radio" name="resolution" value="rejected" required />
          정정 거절
        </label>
      </fieldset>
      <textarea
        name="note"
        maxLength={200}
        rows={2}
        placeholder="처리 사유 (선택, 200자 이내) — 제안자에게 함께 전달됩니다"
        className="text-sm rounded p-2"
        style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
      />
      <AdminConfirmSubmitButton
        confirmMessage="이 정정 제안 처리 결과를 저장할까요? 제안자 알림과 감사 로그에 반영됩니다."
        className="self-start text-sm px-3 py-1.5 rounded"
        style={{ background: "var(--teal)", color: "white", border: 0, cursor: "pointer" }}
      >
        처리 저장
      </AdminConfirmSubmitButton>
    </form>
  );
}
