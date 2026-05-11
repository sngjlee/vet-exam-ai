// vet-exam-ai/lib/board/sanitize.ts
// Reuse sanitize-html config from the comment layer. Posts allow the same tags
// + image src plus `<h2>` and `<h3>` for headings.

import sanitizeHtml from "sanitize-html";

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "u", "s",
    "h2", "h3",
    "ul", "ol", "li",
    "blockquote", "code", "pre",
    "a", "img",
  ],
  allowedAttributes: {
    a: ["href", "rel", "target"],
    img: ["src", "alt"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
  },
};

export function sanitizePostHtml(input: string): string {
  return sanitizeHtml(input ?? "", SANITIZE_OPTIONS);
}

export function htmlToText(input: string): string {
  return sanitizeHtml(input ?? "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}
