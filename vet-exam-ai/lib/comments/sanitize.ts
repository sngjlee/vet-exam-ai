import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

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

const ALLOWED_ATTR: string[] = [];

export function renderCommentMarkdown(bodyText: string): string {
  const rawHtml = marked.parse(bodyText, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}
