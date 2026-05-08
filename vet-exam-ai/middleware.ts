import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATH_PREFIXES = [
  "/_next",
  "/api/auth",
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

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (PUBLIC_PATH_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => res.cookies.set({ name, value, ...options }));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const isWrite = WRITE_GATED_EXACT.has(path) || path.startsWith("/profile/");
    if (isWrite) {
      const url = req.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
    return res;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("signup_status")
    .eq("id", user.id)
    .maybeSingle();

  const status = profile?.signup_status ?? "pending_proof";
  if (status === "approved") return res;

  const target = statusToPath(status);
  if (!target) return res;

  const isReadOnly = READ_ONLY_OK_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
  if (isReadOnly) return res;

  const url = req.nextUrl.clone();
  url.pathname = target;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?)$).*)",
  ],
};
