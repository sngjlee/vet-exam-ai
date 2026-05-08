// Pure validation — no I/O, no side effects.
// Used client-side (form pre-check) and server-side (defense in depth).

export type PasswordValidationError =
  | "empty"
  | "too_short"
  | "mismatch_confirm"
  | "same_as_current";

export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; error: PasswordValidationError };

const MIN_LENGTH = 6;

export function validateNewPassword(
  current: string,
  next: string,
  confirm: string,
): PasswordValidationResult {
  if (!next || !confirm) return { ok: false, error: "empty" };
  if (next.length < MIN_LENGTH) return { ok: false, error: "too_short" };
  if (next !== confirm) return { ok: false, error: "mismatch_confirm" };
  if (current && next === current) return { ok: false, error: "same_as_current" };
  return { ok: true };
}

export function passwordErrorMessage(error: PasswordValidationError): string {
  switch (error) {
    case "empty":
      return "비밀번호를 입력해주세요";
    case "too_short":
      return "비밀번호는 6자 이상이어야 합니다";
    case "mismatch_confirm":
      return "비밀번호가 일치하지 않습니다";
    case "same_as_current":
      return "기존 비밀번호와 다른 비밀번호를 입력하세요";
  }
}
