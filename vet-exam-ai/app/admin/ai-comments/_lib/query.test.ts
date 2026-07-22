import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("../../../../lib/admin/guards", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("../../../../lib/supabase/server", () => ({ createClient: mocks.createClient }));

import {
  loadAiCommentCandidates,
  serializeAiCommentCandidate,
} from "./query";
import { parseAiCommentCandidateSearch } from "./schemas";

const CANDIDATE_ID = "7c8284af-c2ec-4f14-a130-13af12655d07";
const PRIVATE_VALUES = [
  "private-user-id",
  "private-input-hash",
  "private-provider-id",
  "private-client-id",
  "private-error",
] as const;

function fullCandidate() {
  return {
    id: CANDIDATE_ID,
    question_public_id: "KVLE-0012",
    seed_author_key: "memory" as const,
    seed_user_id: "private-user-id",
    comment_type: "memorization" as const,
    body_text: "핵심은 원인과 결과를 함께 외우는 것입니다.",
    status: "pending" as const,
    model: "gpt-5.6-terra",
    prompt_version: "v1",
    input_hash: "private-input-hash",
    openai_request_id: "private-provider-id",
    client_request_id: "private-client-id",
    risk_flags: ["needs_attention", 4],
    input_tokens: 123,
    output_tokens: 45,
    reasoning_tokens: 67,
    failure_code: "private-error",
    reviewed_by: null,
    reviewed_at: null,
    published_comment_id: null,
    created_at: "2026-07-13T00:00:00.000Z",
    updated_at: "2026-07-13T00:00:00.000Z",
  };
}

const question = {
  public_id: "KVLE-0012",
  question: "가장 알맞은 것은?",
  choices: ["1", "2"],
  answer: "1",
  explanation: "공식 해설",
  category: "소동물",
  subject: "내과",
  topic: "순환기",
};

describe("AI comment candidate query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin" } });
  });

  it("authenticates before creating a database client", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("unauthorized"));
    await expect(loadAiCommentCandidates(parseAiCommentCandidateSearch({}))).rejects.toThrow("unauthorized");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("applies stable filters and pagination while returning a safe projection", async () => {
    const candidateEq = vi.fn();
    const candidateOrder = vi.fn();
    const candidateQuery = {
      eq: candidateEq,
      in: vi.fn(),
      order: candidateOrder,
      range: vi.fn().mockResolvedValue({ data: [{ ...fullCandidate(), questions: question }], count: 40, error: null }),
    };
    candidateEq.mockReturnValue(candidateQuery);
    candidateQuery.in.mockReturnValue(candidateQuery);
    candidateOrder.mockReturnValue(candidateQuery);

    const questionsLookup = {
      in: vi.fn().mockResolvedValue({ data: [question], error: null }),
    };
    const profilesLookup = {
      in: vi.fn().mockResolvedValue({
        data: [{ user_id: "private-user-id", nickname: "복습하는수달" }],
        error: null,
      }),
    };
    const from = vi.fn((table: string) => {
      if (table === "ai_comment_candidates") {
        return { select: vi.fn(() => candidateQuery) };
      }
      if (table === "questions") {
        return { select: vi.fn(() => questionsLookup) };
      }
      return { select: vi.fn(() => profilesLookup) };
    });
    mocks.createClient.mockResolvedValue({ from });

    const page = await loadAiCommentCandidates(parseAiCommentCandidateSearch({
      status: "pending",
      model: "gpt-5.6-terra",
      author: "memory",
      publicId: "KVLE-0012",
      page: "2",
    }));

    expect(candidateEq.mock.calls.slice(0, 4)).toEqual([
      ["status", "pending"],
      ["model", "gpt-5.6-terra"],
      ["seed_author_key", "memory"],
      ["question_public_id", "KVLE-0012"],
    ]);
    expect(candidateOrder.mock.calls).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(candidateQuery.range).toHaveBeenCalledWith(20, 39);
    expect(page.items[0]).toMatchObject({ id: CANDIDATE_ID, seedNickname: "복습하는수달" });
    expect(JSON.stringify(page)).not.toContain("private-user-id");
  });

  it("filters thousands of related questions in the database without an ID list", async () => {
    // Given: more matching questions than a PostgREST URL can safely materialize
    const candidateEq = vi.fn();
    const candidateIn = vi.fn();
    const candidateQuery = {
      eq: candidateEq,
      in: candidateIn,
      order: vi.fn(),
      range: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
    };
    candidateEq.mockReturnValue(candidateQuery);
    candidateIn.mockReturnValue(candidateQuery);
    candidateQuery.order.mockReturnValue(candidateQuery);

    const questionFilter = {
      eq: vi.fn(),
      then: (resolve: (value: object) => void) => resolve({
        data: Array.from({ length: 3_201 }, (_, index) => ({ public_id: `KVLE-${index}` })),
        error: null,
      }),
    };
    questionFilter.eq.mockReturnValue(questionFilter);
    const from = vi.fn((table: string) => {
      if (table === "ai_comment_candidates") return { select: vi.fn(() => candidateQuery) };
      if (table === "questions") return { select: vi.fn(() => questionFilter) };
      return { select: vi.fn() };
    });
    mocks.createClient.mockResolvedValue({ from });

    // When: an administrator filters the queue by question taxonomy
    await loadAiCommentCandidates(parseAiCommentCandidateSearch({ subject: "내과" }));

    // Then: the relation filter stays in Postgres instead of becoming a 3,201-ID URL
    expect(candidateIn).not.toHaveBeenCalled();
    expect(candidateEq).toHaveBeenCalledWith("questions.subject", "내과");
  });

  it("refetches the last valid page when the requested page exceeds the count", async () => {
    // Given: 41 candidates and a stale page=999 URL
    const candidateEq = vi.fn();
    const candidateOrder = vi.fn();
    const candidateRange = vi.fn()
      .mockResolvedValueOnce({ data: [], count: 41, error: null })
      .mockResolvedValueOnce({
        data: [{ ...fullCandidate(), questions: question }],
        count: 41,
        error: null,
      });
    const candidateQuery = { eq: candidateEq, order: candidateOrder, range: candidateRange };
    candidateEq.mockReturnValue(candidateQuery);
    candidateOrder.mockReturnValue(candidateQuery);
    const profilesLookup = {
      in: vi.fn().mockResolvedValue({
        data: [{ user_id: "private-user-id", nickname: "복습하는수달" }],
        error: null,
      }),
    };
    const questionsLookup = {
      in: vi.fn().mockResolvedValue({ data: [question], error: null }),
    };
    const from = vi.fn((table: string) => {
      if (table === "ai_comment_candidates") return { select: vi.fn(() => candidateQuery) };
      if (table === "questions") return { select: vi.fn(() => questionsLookup) };
      return { select: vi.fn(() => profilesLookup) };
    });
    mocks.createClient.mockResolvedValue({ from });

    // When: the administrator opens the stale page
    const page = await loadAiCommentCandidates(parseAiCommentCandidateSearch({ page: "999" }));

    // Then: the final valid page is returned using stable page bounds
    expect(candidateRange).toHaveBeenNthCalledWith(1, 19_960, 19_979);
    expect(candidateRange).toHaveBeenNthCalledWith(2, 40, 59);
    expect(page.page).toBe(3);
    expect(page.items).toHaveLength(1);
  });
  it.each(["generating", "failed"] as const)("keeps %s candidates when author and comment type are not assigned yet", async (status) => {
    // Given: a valid generating row before model output assigns author and type
    const candidateEq = vi.fn();
    const candidateOrder = vi.fn();
    const candidateQuery = {
      eq: candidateEq,
      order: candidateOrder,
      range: vi.fn().mockResolvedValue({
        data: [{
          ...fullCandidate(),
          seed_author_key: null,
          seed_user_id: null,
          comment_type: null,
          status,
          questions: question,
        }],
        count: 1,
        error: null,
      }),
    };
    candidateEq.mockReturnValue(candidateQuery);
    candidateOrder.mockReturnValue(candidateQuery);
    const pendingCountQuery = {
      eq: vi.fn().mockResolvedValue({ data: null, count: 0, error: null }),
    };
    const from = vi.fn((table: string) => ({
      select: vi.fn((projection: string) =>
        table === "ai_comment_candidates" && projection === "id"
          ? pendingCountQuery
          : candidateQuery),
    }));
    mocks.createClient.mockResolvedValue({ from });

    // When: the administrator loads the generating queue
    const page = await loadAiCommentCandidates(parseAiCommentCandidateSearch({ status }));

    // Then: the valid partial row remains visible for operational diagnosis
    expect(page.items[0]).toMatchObject({
      seedAuthorKey: null,
      commentType: null,
      status,
    });
  });
});

describe("serializeAiCommentCandidate", () => {
  it("returns review fields without private provider metadata", () => {
    const serialized = serializeAiCommentCandidate({
      candidate: fullCandidate(),
      question,
      nickname: "복습하는수달",
    });

    expect(serialized).toMatchObject({
      id: CANDIDATE_ID,
      seedNickname: "복습하는수달",
      riskFlags: ["needs_attention"],
      question: { publicId: "KVLE-0012", subject: "내과" },
    });
    const json = JSON.stringify(serialized);
    for (const secret of PRIVATE_VALUES) expect(json).not.toContain(secret);
    for (const privateKey of ["input_tokens", "reasoning_tokens", "seed_user_id"]) {
      expect(json).not.toContain(privateKey);
    }
  });
});
