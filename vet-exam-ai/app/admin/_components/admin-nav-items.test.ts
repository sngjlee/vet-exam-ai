import { describe, expect, it } from "vitest";
import { ADMIN_NAV_ITEMS } from "./admin-nav-items";

describe("ADMIN_NAV_ITEMS", () => {
  it("links the administrator to the AI comment review queue", () => {
    // Given: the complete administrator navigation
    // When: the AI comment review destination is selected
    const item = ADMIN_NAV_ITEMS.find(({ href }) => href === "/admin/ai-comments");

    // Then: the queue is discoverable with an operational label
    expect(item?.label).toBe("댓글 초안");
  });
});
