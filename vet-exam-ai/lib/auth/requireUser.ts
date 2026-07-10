import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "../supabase/server";
import { jsonError, ApiError } from "../api/errors";
import type { Database } from "../supabase/types";

export type RequireUserResult =
  | { ok: true; supabase: SupabaseClient<Database>; user: User }
  | { ok: false; response: NextResponse };

/**
 * Shared 401 gate for route handlers. Creates the request-scoped Supabase client,
 * loads the authed user, and returns a ready-to-return 401 response when there is
 * none. Callers reuse the returned `supabase` client so no second client is made.
 *
 *   const auth = await requireUser();
 *   if (!auth.ok) return auth.response;
 *   const { supabase, user } = auth;
 *
 * Note: only for handlers that 401 anonymous callers. Endpoints that instead
 * return an empty 200 for anon (pins GET, reports-mine, votes-mine) keep their
 * own inline check.
 */
export async function requireUser(): Promise<RequireUserResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: jsonError(ApiError.AuthRequired, 401),
    };
  }
  return { ok: true, supabase, user };
}
