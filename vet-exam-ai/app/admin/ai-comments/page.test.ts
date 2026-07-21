import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadAiCommentCandidates: vi.fn(),
}));

vi.mock("./_lib/query", () => ({
  loadAiCommentCandidates: mocks.loadAiCommentCandidates,
}));vi.mock("./_components/ai-comment-card", () => ({ AiCommentCard: () => null }));
vi.mock("./_components/ai-comment-filters", () => ({ AiCommentFilters: () => null }));
vi.mock("./_components/ai-comment-pager", () => ({ AiCommentPager: () => null }));

import AdminAiCommentsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadAiCommentCandidates.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 20,
    total: 7,
    totalPages: 1,
    pendingTotal: 7,
  });
});

it("loads the unfiltered pending dashboard with one queue query", async () => {
  // Given: the default administrator queue search
  const searchParams = Promise.resolve({});

  // When: the server page is rendered
  await AdminAiCommentsPage({ searchParams });

  // Then: page rows and the pending summary share one query result
  expect(mocks.loadAiCommentCandidates).toHaveBeenCalledTimes(1);
});