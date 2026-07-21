import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AiCommentCandidateItem } from "../_lib/query";

vi.mock("./ai-comment-review-form", () => ({
  AiCommentReviewForm: ({ candidateId }: { readonly candidateId: string }) => createElement("form", null, createElement("input", { type: "hidden", name: "candidate_id", value: candidateId }), createElement("button", null, "승인하고 게시")),
}));

import { AiCommentCard } from "./ai-comment-card";

const ITEM: AiCommentCandidateItem = {
  id: "11111111-1111-4111-8111-111111111111",
  seedAuthorKey: "explain",
  seedNickname: "개념산책",
  commentType: "explanation",
  bodyText: "이 문제는 원인과 결과를 연결해서 보면 정답 근거가 더 명확해집니다.",
  status: "pending",
  model: "gpt-5.6-terra",
  promptVersion: "v1",
  riskFlags: ["style_issue"],
  createdAt: "2026-07-13T06:00:00.000Z",
  question: {
    publicId: "KVLE-101",
    question: "다음 중 가장 적절한 처치는 무엇인가?",
    choices: ["첫 번째 처치", "두 번째 처치", "세 번째 처치"],
    answer: "두 번째 처치",
    explanation: "두 번째 처치가 공식 해설의 근거에 부합한다.",
    category: "임상",
    subject: "내과",
    topic: "소화기",
  },
};

describe("AiCommentCard", () => {
  it("renders the complete review context without a public AI label", () => {
    // Given: a pending candidate with official grounding context
    // When: the administrator card is rendered
    const html = renderToStaticMarkup(createElement(AiCommentCard, { item: ITEM }));
    const uuidOccurrences = html.split(ITEM.id).length - 1;

    // Then: grounding, account, generation metadata, and controls are present
    expect(html).toContain("KVLE-101");
    expect(html).toContain("다음 중 가장 적절한 처치는 무엇인가?");
    expect(html).toContain("두 번째 처치가 공식 해설의 근거에 부합한다.");
    expect(html).toContain("개념산책");
    expect(html).toContain("gpt-5.6-terra");
    expect(html).toContain("승인하고 게시");
    expect(uuidOccurrences).toBe(1);
    expect(html).toContain(`type="hidden" name="candidate_id" value="${ITEM.id}"`);
    expect(html).not.toContain("AI 초안, 운영자 검수");
    expect(html).not.toContain("provider_request");
    expect(html).not.toContain("token_count");
  });
});
