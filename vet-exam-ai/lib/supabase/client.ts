// Browser-side Supabase client.
// Use this in Client Components ("use client") and client-side hooks.
// Call createClient() each time — @supabase/ssr handles deduplication internally.

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
