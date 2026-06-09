import { setActive } from "../_actions";
import { AdminConfirmSubmitButton } from "../../_components/admin-confirm-submit-button";

export function UserActiveForm({
  userId,
  isActive,
  isSelf,
}: {
  userId:   string;
  isActive: boolean;
  isSelf:   boolean;
}) {
  if (isSelf) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        본인 계정은 정지할 수 없습니다.
      </p>
    );
  }

  const targetActive = !isActive;
  const buttonLabel  = targetActive ? "정지 해제" : "정지";
  const placeholder  = targetActive
    ? "해제 사유 (선택, 200자 이내)"
    : "정지 사유 (선택, 200자 이내) — 신고 ID 등";

  return (
    <form action={setActive} className="flex flex-col gap-2">
      <input type="hidden" name="user_id"    value={userId} />
      <input type="hidden" name="new_active" value={String(targetActive)} />
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        현재 상태: {isActive ? "정상" : "정지"}
      </p>
      <textarea
        name="note"
        maxLength={200}
        rows={2}
        placeholder={placeholder}
        className="text-sm rounded p-2"
        style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
      />
      <AdminConfirmSubmitButton
        confirmMessage={
          targetActive
            ? "이 회원의 정지를 해제할까요? 즉시 쓰기 권한을 다시 사용할 수 있습니다."
            : "이 회원을 정지할까요? 로그인 상태와 커뮤니티 이용에 즉시 영향이 생깁니다."
        }
        className="self-start text-sm px-3 py-1.5 rounded"
        style={{
          background: targetActive ? "var(--teal)" : "var(--danger, #c0392b)",
          color:      "white",
          border:     0,
          cursor:     "pointer",
        }}
      >
        {buttonLabel}
      </AdminConfirmSubmitButton>
    </form>
  );
}
