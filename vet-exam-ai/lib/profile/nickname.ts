const TEMP_NICKNAME_RE = /^user_[0-9a-f]{8}$/;
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export function isTempNickname(nickname: string): boolean {
  return TEMP_NICKNAME_RE.test(nickname);
}

export type NicknameChangePolicy =
  | { canChange: true; reason: "temp" | "never_changed" | "cooldown_passed" }
  | { canChange: false; nextChangeAt: Date };

/**
 * Decide whether `currentNickname` may be changed now, based on
 * `nickname_changed_at` (NULL means never changed since signup).
 *
 * Rule: free change while still on temp nickname OR never changed.
 * Otherwise enforce 30-day cooldown.
 */
export function canChangeNickname(
  currentNickname: string,
  nicknameChangedAt: string | null,
  now: Date = new Date(),
): NicknameChangePolicy {
  if (isTempNickname(currentNickname)) {
    return { canChange: true, reason: "temp" };
  }
  if (nicknameChangedAt === null) {
    return { canChange: true, reason: "never_changed" };
  }
  const lastChange = new Date(nicknameChangedAt).getTime();
  const elapsed = now.getTime() - lastChange;
  if (elapsed >= COOLDOWN_MS) {
    return { canChange: true, reason: "cooldown_passed" };
  }
  return {
    canChange: false,
    nextChangeAt: new Date(lastChange + COOLDOWN_MS),
  };
}
