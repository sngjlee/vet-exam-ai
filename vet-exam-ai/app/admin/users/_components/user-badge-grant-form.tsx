import { grantBadge } from "../_actions";
import {
  GRANTABLE_BADGES,
  BADGE_TYPE_KO,
} from "../../../../lib/admin/user-labels";

export function UserBadgeGrantForm({
  userId,
  currentBadgeTypes,
}: {
  userId:            string;
  currentBadgeTypes: string[];
}) {
  const available = GRANTABLE_BADGES.filter(
    (b) => !currentBadgeTypes.includes(b),
  );

  if (available.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        부여 가능한 뱃지가 없습니다 (이미 모두 보유).
      </p>
    );
  }

  return (
    <form action={grantBadge} className="flex flex-col gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <label className="text-xs flex flex-col gap-1" style={{ color: "var(--text-muted)" }}>
        뱃지
        <select
          name="badge_type"
          required
          className="text-sm rounded p-2"
          style={{ background: "var(--surface)", border: "1px solid var(--rule)", color: "var(--text)" }}
        >
          {available.map((b) => (
            <option key={b} value={b}>{BADGE_TYPE_KO[b]}</option>
          ))}
        </select>
      </label>
      <textarea
        name="reason"
        maxLength={200}
        rows={2}
        placeholder="부여 사유 (선택, 200자 이내)"
        className="text-sm rounded p-2"
        style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
      />
      <button
        type="submit"
        className="self-start text-sm px-3 py-1.5 rounded"
        style={{ background: "var(--teal)", color: "white", border: 0, cursor: "pointer" }}
      >
        뱃지 부여
      </button>
    </form>
  );
}
