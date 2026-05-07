// Convert non-ASCII characters in a storage key to UTF-8 byte hex.
// Matches the Python helper in `pipeline/_storage_key.py` (e.g. "해부" → "ed95b4ebb680").
// Supabase Storage rejects non-ASCII keys (`InvalidKey`), so question_id slugs
// containing Korean characters must be hex-encoded before being used as paths.
export function toStorageKey(input: string): string {
  return input.replace(/[^\x20-\x7e]/g, (ch) => {
    const bytes = new TextEncoder().encode(ch);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  });
}
