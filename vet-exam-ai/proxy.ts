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

// IP ban gate is enforced on the narrow set of paths a banned visitor would
// hit to recover/create an account. Read-only browsing and authed app routes
// are not gated (suspend/RLS already cover account-level actions).
const IP_GATED_PATH_PREFIXES = [
  "/auth/login",
  "/auth/callback",
  "/auth/pending-proof",
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

  // IP ban gate — only fires for the three auth-entry paths in
  // IP_GATED_PATH_PREFIXES. /_next and /api are excluded because they are not
  // in that list (cheap .some() short-circuit). The gate must run BEFORE the
  // PUBLIC_PATH_PREFIXES early return below, because /auth/login etc. are also
  // in PUBLIC_PATH_PREFIXES and would otherwise pass through. Fail-open: if
  // the RPC errors we let the request through — a DB hiccup must not lock
  // everyone out of the login form.
  if (IP_GATED_PATH_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
    const xff = request.headers.get("x-forwarded-for");
    const ip  = xff?.split(",")[0]?.trim();
    if (ip) {
      const { data, error } = await supabase.rpc("is_ip_banned", { p_ip: ip });
      if (!error && data === true) {
        return new NextResponse(
          `<!doctype html><html lang="ko"><head><meta charset="utf-8">` +
          `<title>접근 차단</title>` +
          `<style>body{font-family:sans-serif;padding:2rem;max-width:480px;margin:auto;color:#222}h1{font-size:20px;margin-bottom:12px}p{line-height:1.6}</style>` +
          `</head><body>` +
          `<h1>접근이 차단된 IP입니다</h1>` +
          `<p>이 네트워크에서의 접근이 제한되었습니다. 운영자에게 문의해 주세요.</p>` +
          `</body></html>`,
          { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
    }
  }

  // Public prefixes (and internals) — never gate.
  if (PUBLIC_PATH_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
    return supabaseResponse;
  }

  if (!user) {
    // Not signed in — read-only routes pass; write routes redirect to login.
    const isWrite =
      WRITE_GATED_EXACT.has(path) ||
      path.startsWith("/profile/") ||
      path.startsWith("/board");
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
