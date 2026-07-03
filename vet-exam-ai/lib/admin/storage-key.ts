// Convert unsafe storage-key segment characters to UTF-8 byte hex.
// Matches the Python helper in `pipeline/_storage_key.py` (e.g. "해부" → "ed95b4ebb680").
// Supabase Storage rejects non-ASCII keys (`InvalidKey`), and path separators
// must not survive as-is because these filenames are meant to be one object key
// segment.
export function toStorageKey(input: string): string {
  return input.replace(/[^A-Za-z0-9._-]/g, (ch) => {
    const bytes = new TextEncoder().encode(ch);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  });
}
