import { describe, expect, it } from "vitest";
import {
  AI_COMMENT_REVIEW_ERROR_LABELS,
  authorLabel,
  commentTypeLabel,
  buildAiCommentSearchHref,
  riskLabel,
} from "./presentation";
import { parseAiCommentCandidateSearch } from "./schemas";

describe("AI comment review presentation", () => {
  it("preserves active filters while changing pages", () => {
    // Given: an administrator has narrowed the queue
    const current = parseAiCommentCandidateSearch({
      status: "rejected",
      author: "wrong",
      category: "내과",
      publicId: "KVLE-101",
      page: "2",
    });

    // When: the administrator moves to the next page
    const href = buildAiCommentSearchHref(current, { page: 3 });

    // Then: navigation keeps every active filter
    expect(href).toContain("status=rejected");
    expect(href).toContain("author=wrong");
    expect(href).toContain("category=%EB%82%B4%EA%B3%BC");
    expect(href).toContain("publicId=KVLE-101");
    expect(href).toContain("page=3");
  });

  it("uses safe operator-facing copy for review failures", () => {
    // Given: a database conflict and an unknown risk flag
    // When: presentation labels are resolved
    const conflict = AI_COMMENT_REVIEW_ERROR_LABELS.conflict;
    const unknownRisk = riskLabel("future_flag");

    // Then: no provider detail is surfaced and unknown flags remain inspectable
    expect(conflict).toBe("다른 관리자가 먼저 처리한 초안입니다.");
    expect(unknownRisk).toBe("future_flag");
  });
  it("shows operator fallbacks for unassigned generating metadata", () => {
    // Given: a candidate that has not received model output yet
    // When: nullable metadata labels are resolved
    const author = authorLabel(null);
    const commentType = commentTypeLabel(null);

    // Then: the card can show actionable placeholders instead of crashing
    expect(author).toBe("계정 유형 확인 필요");
    expect(commentType).toBe("유형 확인 필요");
  });
});
