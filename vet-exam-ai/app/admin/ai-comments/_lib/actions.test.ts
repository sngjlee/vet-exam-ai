import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin/guards", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { reviewAiCommentCandidateAction } from "../_actions";

const CANDIDATE_ID = "7c8284af-c2ec-4f14-a130-13af12655d07";

function reviewForm(resolution: string, note = ""): FormData {
  const data = new FormData();
  data.set("candidate_id", CANDIDATE_ID);
  data.set("resolution", resolution);
  data.set("note", note);
  return data;
}

type FakeClientOptions = {
  readonly candidateState?: "pending" | "missing";
  readonly candidateError?: { readonly code: string; readonly message: string } | null;
  readonly rpcError?: { readonly code: string; readonly message: string } | null;
};

function fakeClient(options: FakeClientOptions = {}) {
  const candidate = options.candidateState === "missing"
    ? null
    : {
        id: CANDIDATE_ID,
        question_public_id: "KVLE-0012",
        body_text: "안전한 **초안**",
        status: "pending",
      };
  const maybeSingle = vi.fn().mockResolvedValue({
    data: candidate,
    error: options.candidateError ?? null,
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn().mockResolvedValue({ data: null, error: options.rpcError ?? null });
  return { from, rpc };
}

describe("reviewAiCommentCandidateAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin" }, profile: { role: "admin" } });
  });

  it("authenticates before touching the database", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("unauthorized"));
    await expect(reviewAiCommentCandidateAction(reviewForm("approve"))).rejects.toThrow("unauthorized");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each([
    ["bad-id", "approve", ""],
    [CANDIDATE_ID, "publish", ""],
    [CANDIDATE_ID, "reject", "x".repeat(501)],
  ])("rejects malformed form data", async (id, resolution, note) => {
    const data = reviewForm(resolution, note);
    data.set("candidate_id", id);
    await expect(reviewAiCommentCandidateAction(data)).resolves.toEqual({ ok: false, code: "invalid_input" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("sends no caller-controlled HTML to the atomic approval RPC", async () => {
    const client = fakeClient();
    mocks.createClient.mockResolvedValue(client);

    await expect(reviewAiCommentCandidateAction(reviewForm("approve", "  checked  "))).resolves.toEqual({ ok: true });

    expect(client.rpc).toHaveBeenCalledWith("review_ai_comment_candidate", {
      p_candidate_id: CANDIDATE_ID,
      p_resolution: "approve",
      p_note: "checked",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/ai-comments");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/questions/KVLE-0012");
  });

  it("rejects through the same HTML-free RPC", async () => {
    const client = fakeClient();
    mocks.createClient.mockResolvedValue(client);

    await expect(reviewAiCommentCandidateAction(reviewForm("reject"))).resolves.toEqual({ ok: true });
    expect(client.rpc).toHaveBeenCalledWith("review_ai_comment_candidate", {
      p_candidate_id: CANDIDATE_ID,
      p_resolution: "reject",
      p_note: null,
    });
  });

  it.each([
    [{ candidateState: "missing" as const }, "not_found"],
    [{ candidateError: { code: "42501", message: "private permission detail" } }, "permission_denied"],
  ])("maps candidate lookup failures to safe codes", async (options, expectedCode) => {
    const client = fakeClient(options);
    mocks.createClient.mockResolvedValue(client);

    const result = await reviewAiCommentCandidateAction(reviewForm("approve"));
    expect(result).toEqual({ ok: false, code: expectedCode });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("maps a repeated review RPC conflict without leaking detail", async () => {
    const client = fakeClient({ rpcError: { code: "55000", message: "private database detail" } });
    mocks.createClient.mockResolvedValue(client);

    const result = await reviewAiCommentCandidateAction(reviewForm("approve"));
    expect(result).toEqual({ ok: false, code: "conflict" });
    expect(JSON.stringify(result)).not.toContain("private database detail");
  });
});
