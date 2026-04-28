import { revokeBadge } from "../_actions";
import {
  AUTO_BADGES,
  BADGE_TYPE_KO,
  type BadgeType,
} from "../../../../lib/admin/user-labels";

export function UserBadgeRevokeForm({
  userId,
  badges,
}: {
  userId: string;
  badges: BadgeType[];
}) {
  const revokable = badges.filter((b) => !AUTO_BADGES.includes(b));

  if (revokable.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        회수 가능한 뱃지가 없습니다.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {revokable.map((b) => (
        <li key={b}>
          <form
            action={revokeBadge}
            className="flex items-center gap-2"
          >
            <input type="hidden" name="user_id"    value={userId} />
            <input type="hidden" name="badge_type" value={b} />
            <span className="text-sm">{BADGE_TYPE_KO[b]}</span>
            <button
              type="submit"
              className="text-xs px-2 py-1 rounded"
              style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--rule)", cursor: "pointer" }}
            >
              회수
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
