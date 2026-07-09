import { describe, it, expect } from "vitest";
import { findInvalidImageUrl, urlToStoragePath } from "./imageUrlValidate";

// Prefix derived from NEXT_PUBLIC_SUPABASE_URL set in vitest.config.ts.
const PREFIX =
  "https://test.supabase.co/storage/v1/object/public/comment-images/";
const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const OBJECT = `${"a".repeat(16)}.webp`;

describe("urlToStoragePath", () => {
  it("returns the storage path for a whitelisted public URL", () => {
    expect(urlToStoragePath(`${PREFIX}${OWNER}/202607/${OBJECT}`)).toBe(
      `${OWNER}/202607/${OBJECT}`,
    );
  });

  it("returns null for a foreign origin", () => {
    expect(urlToStoragePath("https://evil.example.com/x.webp")).toBeNull();
  });
});

describe("findInvalidImageUrl", () => {
  it("accepts a well-formed owner-scoped url", () => {
    const url = `${PREFIX}${OWNER}/202607/${OBJECT}`;
    expect(findInvalidImageUrl([url], OWNER)).toBeNull();
  });

  it("rejects a url whose owner segment is a different user (forgery guard)", () => {
    const url = `${PREFIX}${OTHER}/202607/${OBJECT}`;
    expect(findInvalidImageUrl([url], OWNER)).toBe(url);
  });

  it("rejects a url with a malformed object segment", () => {
    const url = `${PREFIX}${OWNER}/202607/not-a-webp.png`;
    expect(findInvalidImageUrl([url], OWNER)).toBe(url);
  });
});
