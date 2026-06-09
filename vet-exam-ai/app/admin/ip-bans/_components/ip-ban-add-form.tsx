import { addIpBan } from "../_actions";
import { AdminConfirmSubmitButton } from "../../_components/admin-confirm-submit-button";

export function IpBanAddForm() {
  return (
    <form
      action={addIpBan}
      className="rounded-lg p-4 mb-4"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
    >
      <h3 className="mb-3 text-sm font-medium" style={{ color: "var(--text-muted)" }}>
        IP 차단 추가
      </h3>
      <div className="flex flex-col gap-2">
        <label className="text-xs flex flex-col gap-1" style={{ color: "var(--text-muted)" }}>
          IP 또는 대역 (예: 1.2.3.4 또는 1.2.3.0/24)
          <input
            name="cidr"
            type="text"
            required
            placeholder="1.2.3.4"
            autoComplete="off"
            spellCheck={false}
            className="kvle-mono text-sm rounded p-2"
            style={{ background: "var(--surface)", border: "1px solid var(--rule)", color: "var(--text)" }}
          />
        </label>
        <label className="text-xs flex flex-col gap-1" style={{ color: "var(--text-muted)" }}>
          사유 *
          <textarea
            name="reason"
            required
            maxLength={500}
            rows={2}
            placeholder="예: 반복 도배 / 다중 계정 의심"
            className="text-sm rounded p-2"
            style={{ background: "var(--surface)", border: "1px solid var(--rule)", color: "var(--text)" }}
          />
        </label>
        <AdminConfirmSubmitButton
          confirmMessage="이 IP 또는 대역을 차단할까요? 범위를 잘못 입력하면 정상 사용자가 로그인하지 못할 수 있습니다."
          className="self-start text-sm px-3 py-1.5 rounded"
          style={{ background: "var(--wrong)", color: "white", border: 0, cursor: "pointer" }}
        >
          차단 추가
        </AdminConfirmSubmitButton>
      </div>
      <p className="mt-3 text-xs" style={{ color: "var(--text-faint)" }}>
        주의: 본인이 현재 접속 중인 IP를 차단하면 즉시 로그인 경로에서 격리됩니다.
      </p>
    </form>
  );
}
