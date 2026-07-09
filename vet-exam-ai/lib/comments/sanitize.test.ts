import { describe, it, expect } from "vitest";
import { renderCommentMarkdown } from "./sanitize";

describe("renderCommentMarkdown", () => {
  it("renders inline markdown into allowed tags", () => {
    const html = renderCommentMarkdown("**bold** and *italic*");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("drops <script> tags and their contents", () => {
    const html = renderCommentMarkdown("hi\n\n<script>alert('xss')</script>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(");
    expect(html).toContain("hi");
  });

  it("strips disallowed tags but keeps their text (allowlist behavior)", () => {
    // '#' produces an <h1>, which is not in the allowlist. sanitize-html removes
    // the tag while preserving the text node.
    const html = renderCommentMarkdown("# Heading");
    expect(html).not.toContain("<h1");
    expect(html).toContain("Heading");
  });
});
