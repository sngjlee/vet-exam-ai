import { describe, expect, it } from "vitest";
import {
  parseAiCommentCandidateSearch,
  parseAiCommentReviewInput,
} from "./schemas";

const CANDIDATE_ID = "7c8284af-c2ec-4f14-a130-13af12655d07";

describe("parseAiCommentReviewInput", () => {
  it("accepts approve and reject only", () => {
    expect(parseAiCommentReviewInput({ candidateId: CANDIDATE_ID, resolution: "approve" })).toEqual({
      candidateId: CANDIDATE_ID,
      resolution: "approve",
      note: null,
    });
    expect(parseAiCommentReviewInput({
      candidateId: CANDIDATE_ID,
      resolution: "reject",
      note: "  inaccurate  ",
    })).toEqual({ candidateId: CANDIDATE_ID, resolution: "reject", note: "inaccurate" });
  });

  it.each([
    { candidateId: "not-a-uuid", resolution: "approve" },
    { candidateId: CANDIDATE_ID, resolution: "publish" },
    { candidateId: CANDIDATE_ID, resolution: "reject", note: "x".repeat(501) },
  ])("rejects malformed review input", (input) => {
    expect(() => parseAiCommentReviewInput(input)).toThrow();
  });
});

describe("parseAiCommentCandidateSearch", () => {
  it("normalizes bounded filters and pagination", () => {
    expect(parseAiCommentCandidateSearch({
      status: "pending",
      model: " gpt-5.6-terra ",
      subject: " 내과 ",
      category: " 소동물 ",
      author: "memory",
      publicId: " KVLE-0012 ",
      page: "2",
    })).toEqual({
      status: "pending",
      model: "gpt-5.6-terra",
      subject: "내과",
      category: "소동물",
      author: "memory",
      publicId: "KVLE-0012",
      page: 2,
    });
  });

  it("uses safe defaults for malformed search params", () => {
    expect(parseAiCommentCandidateSearch({ status: "secret", page: "-3" })).toEqual({
      status: "pending",
      model: "",
      subject: "",
      category: "",
      author: "all",
      publicId: "",
      page: 1,
    });
  });
});
