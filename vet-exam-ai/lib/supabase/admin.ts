// Service-role Supabase client — server-only.
// NEVER import from a "use client" file or any code that ships to the browser.
// Bypasses ALL RLS. Use exclusively for auth admin APIs and system-level
// mutations that explicitly require it (e.g. password reset link issuance).

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin env vars missing — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient<Database>(url, key, {
    auth: {
      persistSession:    false,
      autoRefreshToken:  false,
    },
  });
}
