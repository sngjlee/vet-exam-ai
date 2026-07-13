import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { createAdminClient } from "../supabase/admin";
import { logError } from "../utils/logging";

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export type RateLimitConfig = {
  bucket: string;
  max: number;
  windowSeconds: number;
};

// Named limiters. Tuned for low-frequency, user-triggered actions — generous
// enough for real use, tight enough to blunt scripted abuse.
export const RATE_LIMITS = {
  signupApplication: { bucket: "signup_application", max: 5, windowSeconds: 3600 },
  commentReport:     { bucket: "comment_report",     max: 20, windowSeconds: 3600 },
  commentVote:       { bucket: "comment_vote",       max: 60, windowSeconds: 60 },
  boardPost:         { bucket: "board_post",         max: 5,  windowSeconds: 300 },
} as const satisfies Record<string, RateLimitConfig>;

/**
 * Fixed-window rate limit backed by the check_rate_limit Postgres RPC.
 *
 * The RPC is service-role-only (see 20260713030000): it is invoked through the
 * admin client so a client can never call it directly to poison another user's
 * counter or reset its own window. The caller passes `identifier` (always the
 * authenticated user's own id), never a value taken from the request body.
 *
 * Fails OPEN: if the limiter itself errors (RPC missing during a deploy gap,
 * transient DB error, admin env unset), we allow the request rather than block
 * legitimate users. Rate limiting is defense-in-depth, not the primary authz gate.
 *
 * `clientOverride` exists only for tests to inject a fake Supabase client.
 */
export async function checkRateLimit(
  config: RateLimitConfig,
  identifier: string,
  clientOverride?: SupabaseClient<Database>,
): Promise<RateLimitResult> {
  try {
    const supabase = clientOverride ?? createAdminClient();
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_bucket: config.bucket,
      p_identifier: identifier,
      p_max: config.max,
      p_window_seconds: config.windowSeconds,
    });
    if (error || !data || data.length === 0) {
      if (error) logError("[rateLimit] rpc failed (fail-open)", error);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const row = data[0];
    if (!row) return { allowed: true, retryAfterSeconds: 0 };
    return {
      allowed: row.allowed,
      retryAfterSeconds: row.retry_after_seconds,
    };
  } catch (e) {
    logError("[rateLimit] unexpected error (fail-open)", e);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
