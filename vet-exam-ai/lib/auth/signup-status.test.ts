import { describe, it, expect, vi } from "vitest";

// signup-status.ts imports lib/supabase/server (which pulls in next/headers).
// We only test the pure routing helper here, so stub the server client module
// to keep this a dependency-free unit test.
vi.mock("../supabase/server", () => ({
  createClient: () => {
    throw new Error("not used in this test");
  },
}));

import { pendingRedirectTarget } from "./signup-status";

describe("pendingRedirectTarget", () => {
  it("routes each pending/rejected status to its gate page", () => {
    expect(pendingRedirectTarget("pending_proof")).toBe("/auth/pending-proof");
    expect(pendingRedirectTarget("pending_review")).toBe("/auth/pending-review");
    expect(pendingRedirectTarget("rejected")).toBe("/auth/rejected");
  });

  it("returns null for approved (no redirect)", () => {
    expect(pendingRedirectTarget("approved")).toBeNull();
  });
});
