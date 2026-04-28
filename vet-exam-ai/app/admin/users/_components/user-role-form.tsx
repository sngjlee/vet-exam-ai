import { setRole } from "../_actions";
import {
  ALL_USER_ROLES,
  USER_ROLE_KO,
  type UserRole,
} from "../../../../lib/admin/user-labels";

export function UserRoleForm({
  userId,
  currentRole,
  isSelf,
}: {
  userId:      string;
  currentRole: UserRole;
  isSelf:      boolean;
}) {
  if (isSelf) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        본인 역할은 변경할 수 없습니다.
      </p>
    );
  }

  return (
    <form action={setRole} className="flex flex-col gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <fieldset className="flex flex-wrap gap-3" style={{ border: 0, padding: 0 }}>
        <legend className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
          새 역할
        </legend>
        {ALL_USER_ROLES.map((r) => (
          <label key={r} className="text-sm flex items-center gap-1.5">
            <input
              type="radio"
              name="new_role"
              value={r}
              defaultChecked={r === currentRole}
              required
            />
            {USER_ROLE_KO[r]}
          </label>
        ))}
      </fieldset>
      <textarea
        name="note"
        maxLength={200}
        rows={2}
        placeholder="변경 사유 (선택, 200자 이내)"
        className="text-sm rounded p-2"
        style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
      />
      <button
        type="submit"
        className="self-start text-sm px-3 py-1.5 rounded"
        style={{ background: "var(--teal)", color: "white", border: 0, cursor: "pointer" }}
      >
        역할 변경
      </button>
    </form>
  );
}
