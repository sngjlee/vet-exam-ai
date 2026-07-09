import { NextResponse } from "next/server";

/**
 * Stable, reusable API error codes. Values are the machine codes clients may
 * switch on; they are NOT user-facing copy. Domain-specific one-off codes
 * (upload family: too_large, invalid_mime, ...) are passed to jsonError as raw
 * strings and need no entry here.
 */
export const ApiError = {
  AuthRequired: "auth_required",
  Forbidden: "forbidden",
  NotFound: "not_found",
  Gone: "gone",
  InvalidJson: "invalid_json",
  MissingParam: "missing_param",
  ValidationFailed: "validation_failed",
  Conflict: "conflict",
  RateLimited: "rate_limited",
  Internal: "internal_error",
} as const;

export type ApiErrorCode = (typeof ApiError)[keyof typeof ApiError];

/**
 * Single path for API error responses. Body is always `{ error: code, ...extra }`.
 * `code` accepts the catalog union or a raw domain string. `extra` is for
 * additive, non-sensitive fields only (zod `issues`, an offending `detail` URL) —
 * never the raw DB `error.message`.
 */
export function jsonError(
  code: ApiErrorCode | string,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: code, ...(extra ?? {}) }, { status });
}
