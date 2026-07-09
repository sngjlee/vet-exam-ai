import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // Deterministic Supabase URL so lib/comments/imageUrlValidate (which derives
    // the public storage prefix from this env var, then caches it) has a stable
    // prefix during tests.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    },
  },
});
