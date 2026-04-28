import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "strong",
  "em",
  "u",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "blockquote",
  "br",
];

export function renderCommentMarkdown(bodyText: string): string {
  const rawHtml = marked.parse(bodyText, { async: false }) as string;
  return sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
  });
}
