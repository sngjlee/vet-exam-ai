import { describe, expect, it } from "vitest";

import { validateAiCommentOutput } from "./schema";

const validOutput = {
  eligible: true,
  author_key: "memory",
  comment_type: "memorization",
  body_text: "핵심은 병변의 위치와 진행 순서를 함께 묶어서 기억하는 것입니다.",
  grounded: true,
  risk_flags: [],
  reason: "공식 해설의 핵심을 짧은 암기 포인트로 정리했습니다.",
};

describe("validateAiCommentOutput", () => {
  it.each([
    ["memory", "memorization"],
    ["explain", "explanation"],
    ["wrong", "explanation"],
    ["correction", "correction"],
  ])("accepts the %s voice with %s comments", (authorKey, commentType) => {
    expect(validateAiCommentOutput({ ...validOutput, author_key: authorKey, comment_type: commentType }).kind).toBe("candidate");
  });

  it("rejects a voice and comment-type mismatch", () => {
    expect(validateAiCommentOutput({ ...validOutput, comment_type: "correction" })).toEqual({ kind: "failure", code: "invalid_mapping" });
  });

  it.each([
    ["too_short", "너무 짧아요"],
    ["too_long", "가".repeat(501)],
    ["url", "공식 해설은 https://example.com 에서 확인하면 정확하게 이해할 수 있습니다."],
    ["html", "<strong>핵심 병변</strong>을 먼저 확인하면 정답을 고를 수 있습니다."],
    ["no_korean", "This explanation contains no Korean characters at all."],
  ])("rejects invalid body text: %s", (_caseName, bodyText) => {
    expect(validateAiCommentOutput({ ...validOutput, body_text: bodyText })).toEqual({ kind: "failure", code: "invalid_body" });
  });

  it("rejects ungrounded output", () => {
    expect(validateAiCommentOutput({ ...validOutput, grounded: false })).toEqual({ kind: "failure", code: "ungrounded" });
  });

  it("rejects every blocking risk flag", () => {
    expect(validateAiCommentOutput({ ...validOutput, risk_flags: ["answer_conflict"] })).toEqual({ kind: "failure", code: "blocking_risk" });
  });

  it("rejects ineligible output before producing a candidate", () => {
    expect(validateAiCommentOutput({ ...validOutput, eligible: false })).toEqual({ kind: "failure", code: "ineligible" });
  });
});
