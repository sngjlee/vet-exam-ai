// Supabase session proxy (Next.js 16 renamed "middleware" to "proxy").
// Refreshes the user's session AND gates non-approved signup users away from
// write-capable routes. Read-only browsing stays open for anyone signed-in.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATH_PREFIXES = [
  "/_next",
  // /api/* passes through; route handlers do their own auth and respond JSON.
  // Otherwise pending users get HTML 307 for JSON fetches (notifications poll,
  // comment counts) and silently break.
  "/api",
  "/auth/login",
  "/auth/callback",
  "/auth/pending-proof",
  "/auth/pending-review",
  "/auth/rejected",
  "/auth/reset",
];

const READ_ONLY_OK_PREFIXES = [
  "/",                  // landing
  "/questions",
  "/search",
  "/community",
  "/notifications",
];

const WRITE_GATED_EXACT = new Set<string>([
  "/dashboard",
  "/profile/me",
  "/profile/me/edit",
  "/settings",
]);

function statusToPath(status: string): string | null {
  switch (status) {
    case "pending_proof":  return "/auth/pending-proof";
    case "pending_review": return "/auth/pending-review";
    case "rejected":       return "/auth/rejected";
    default:               return null;
  }
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not remove — keeps the session token fresh.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Public prefixes (and internals) — never gate.
  if (PUBLIC_PATH_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
    return supabaseResponse;
  }

  if (!user) {
    // Not signed in — read-only routes pass; write routes redirect to login.
    const isWrite = WRITE_GATED_EXACT.has(path) || path.startsWith("/profile/");
    if (isWrite) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("signup_status")
    .eq("id", user.id)
    .maybeSingle();

  const status = profile?.signup_status ?? "pending_proof";
  if (status === "approved") return supabaseResponse;

  const target = statusToPath(status);
  if (!target) return supabaseResponse;

  const isReadOnly = READ_ONLY_OK_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
  if (isReadOnly) return supabaseResponse;

  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?)$).*)",
  ],
};
