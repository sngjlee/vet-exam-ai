import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CommentItem, { type CommentItemData } from "../../components/comments/CommentItem";
import type { CommentsListResponse } from "./list";
import { toPublicCommentPreview } from "./publicProjection";

const PRIVATE_PROVENANCE = {
  ai_comment_candidate_id: "candidate-private-123",
  ai_assisted: "ai-assisted-private",
  origin: "ai-origin-private",
  model: "provider-model-private",
  prompt_version: "prompt-private-v1",
  openai_request_id: "provider-request-private",
  client_request_id: "client-request-private",
  reviewed_by: "reviewer-private",
  reviewed_at: "reviewed-time-private",
  published_comment_id: "published-link-private",
  risk_flags: "risk-private",
} as const;

const PRIVATE_KEYS = Object.keys(PRIVATE_PROVENANCE);
const PRIVATE_VALUES = Object.values(PRIVATE_PROVENANCE);

function expectPrivateProvenanceAbsent(serialized: string): void {
  for (const key of PRIVATE_KEYS) expect(serialized).not.toContain(key);
  for (const value of PRIVATE_VALUES) expect(serialized).not.toContain(value);
}

describe("public comment projection", () => {
  it("drops private candidate provenance from the public list response", () => {
    const rowWithPrivateProvenance = {
      id: "comment-public-123",
      question_public_id: "KVLE-2026-001",
      user_id: "seed-user-123",
      type: "explanation",
      body_text: "정답 근거를 간단히 정리한 댓글입니다.",
      vote_score: 0,
      reply_count: 0,
      created_at: "2026-07-13T05:10:00.000Z",
      ...PRIVATE_PROVENANCE,
    } as const;

    const comment = toPublicCommentPreview({
      row: rowWithPrivateProvenance,
      question: {
        public_id: "KVLE-2026-001",
        question: "공개 문제 본문",
        category: "내과",
        topic: "순환기",
      },
      authorNickname: "해설다시보기",
    });
    const response: CommentsListResponse = {
      comments: [comment],
      total: 1,
      allCount: 1,
      typeCounts: {
        memorization: 0,
        correction: 0,
        explanation: 1,
        question: 0,
        discussion: 0,
      },
      page: 1,
      pageSize: 20,
      totalPages: 1,
      sort: "recent",
      type: null,
      q: "",
    };

    expect(comment).toEqual({
      id: "comment-public-123",
      questionId: "KVLE-2026-001",
      userId: "seed-user-123",
      type: "explanation",
      bodyText: "정답 근거를 간단히 정리한 댓글입니다.",
      voteScore: 0,
      replyCount: 0,
      createdAt: "2026-07-13T05:10:00.000Z",
      questionPublicId: "KVLE-2026-001",
      questionPreview: "공개 문제 본문",
      category: "내과",
      topic: "순환기",
      authorNickname: "해설다시보기",
    });
    expectPrivateProvenanceAbsent(JSON.stringify(response));
  });

  it("renders an approved comment normally without provenance or an AI label", () => {
    const approvedCommentWithPrivateProvenance = {
      id: "comment-public-123",
      user_id: "seed-user-123",
      type: "explanation",
      body_text: "정답 근거를 간단히 정리한 댓글입니다.",
      body_html: "<p>정답 근거를 간단히 정리한 댓글입니다.</p>",
      image_urls: [],
      created_at: "2026-07-13T05:10:00.000Z",
      edit_count: 0,
      authorNickname: "해설다시보기",
      ...PRIVATE_PROVENANCE,
    } satisfies CommentItemData & typeof PRIVATE_PROVENANCE;
    const publicComment: CommentItemData = approvedCommentWithPrivateProvenance;
    const html = renderToStaticMarkup(
      createElement(CommentItem, {
        comment: publicComment,
        score: 0,
        myVote: null,
        status: "visible",
        isOwner: false,
        isAuthed: false,
        isReported: false,
        canDelete: false,
        authorBadges: [],
        onDelete: () => undefined,
        onReport: () => undefined,
        onVoteChange: () => undefined,
      }),
    );

    expect(html).toContain("정답 근거를 간단히 정리한 댓글입니다.");
    expect(html).toContain("@해설다시보기");
    expect(html).not.toContain("AI 초안");
    expect(html).not.toContain("운영자 검수");
    expectPrivateProvenanceAbsent(html);
  });
});