import { issuePasswordResetLink } from "../_actions";

export function UserPasswordResetForm({
  userId,
  isSelf,
}: {
  userId: string;
  isSelf: boolean;
}) {
  if (isSelf) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        본인 비밀번호는 이 화면에서 재설정할 수 없습니다.
      </p>
    );
  }

  return (
    <form action={issuePasswordResetLink} className="flex flex-col gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        1회용 재설정 링크를 발급합니다. 발급된 링크는 admin 화면에 1회만 표시되며,
        사용자에게 직접 전달해 주세요.
      </p>
      <textarea
        name="note"
        maxLength={200}
        rows={2}
        placeholder="발급 사유 (선택, 200자 이내) — 예: 본인 분실 신고"
        className="text-sm rounded p-2"
        style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
      />
      <button
        type="submit"
        className="self-start text-sm px-3 py-1.5 rounded"
        style={{
          background: "var(--teal)",
          color:      "white",
          border:     0,
          cursor:     "pointer",
        }}
      >
        재설정 링크 생성
      </button>
    </form>
  );
}
