import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit, RATE_LIMITS } from "./index";
import type { Database } from "../supabase/types";

type RpcReturn = { data: unknown; error: unknown };

function fakeClient(
  ret: RpcReturn,
  capture?: { args?: Record<string, unknown> },
): SupabaseClient<Database> {
  return {
    rpc(_fn: string, args: Record<string, unknown>) {
      if (capture) capture.args = args;
      return Promise.resolve(ret);
    },
  } as unknown as SupabaseClient<Database>;
}

describe("checkRateLimit", () => {
  it("allows when the RPC reports under the limit", async () => {
    const client = fakeClient({
      data: [{ allowed: true, current_count: 1, retry_after_seconds: 0 }],
      error: null,
    });
    const res = await checkRateLimit(RATE_LIMITS.commentVote, "user-1", client);
    expect(res).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("blocks and surfaces retry-after when over the limit", async () => {
    const client = fakeClient({
      data: [{ allowed: false, current_count: 61, retry_after_seconds: 42 }],
      error: null,
    });
    const res = await checkRateLimit(RATE_LIMITS.commentVote, "user-1", client);
    expect(res).toEqual({ allowed: false, retryAfterSeconds: 42 });
  });

  it("fails open on RPC error", async () => {
    const client = fakeClient({ data: null, error: { message: "boom" } });
    const res = await checkRateLimit(RATE_LIMITS.boardPost, "user-1", client);
    expect(res.allowed).toBe(true);
  });

  it("fails open on empty data", async () => {
    const client = fakeClient({ data: [], error: null });
    const res = await checkRateLimit(RATE_LIMITS.boardPost, "user-1", client);
    expect(res.allowed).toBe(true);
  });

  it("passes bucket / identifier / config through to the RPC", async () => {
    const capture: { args?: Record<string, unknown> } = {};
    const client = fakeClient(
      { data: [{ allowed: true, current_count: 1, retry_after_seconds: 0 }], error: null },
      capture,
    );
    await checkRateLimit(RATE_LIMITS.signupApplication, "user-9", client);
    expect(capture.args).toEqual({
      p_bucket: "signup_application",
      p_identifier: "user-9",
      p_max: 5,
      p_window_seconds: 3600,
    });
  });
});
