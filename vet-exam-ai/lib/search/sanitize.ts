// Allowlist sanitizer for ts_headline output.
// Postgres returns "<mark>keyword</mark>" wrapping matched terms; we keep
// the <mark> element only and strip everything else (defense-in-depth even
// though the input is server-controlled, because we render via
// dangerouslySetInnerHTML).

import sanitizeHtml from "sanitize-html";

export function sanitizeHeadline(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: ["mark"],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  });
}
