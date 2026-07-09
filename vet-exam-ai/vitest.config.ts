import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const emptyStub = fileURLToPath(new URL("./test/stubs/empty.ts", import.meta.url));

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
    // `server-only`/`client-only` throw when imported outside Next's
    // react-server environment. Stub them so server modules are unit-testable.
    alias: {
      "server-only": emptyStub,
      "client-only": emptyStub,
    },
  },
});
