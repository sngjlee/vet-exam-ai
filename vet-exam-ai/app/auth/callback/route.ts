// Handles email-confirmation, OAuth, and password-reset redirects.
//
// Two flows are supported:
//   1. PKCE code flow: signup confirmation, OAuth — uses ?code=...
//      Requires the PKCE verifier cookie (set when the user initiated the flow
//      in this same browser).
//   2. OTP token_hash flow: password reset, magic link — uses
//      ?token_hash=...&type=recovery (or other EmailOtpType).
//      Works across devices/browsers — no cookie continuity required.
//
// The Supabase reset-password email template should be customized to point
// at this route with the token_hash form, so the recovery flow does not
// depend on the user opening the email in the same browser they requested
// the reset from.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (code || (tokenHash && type)) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
      console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
      console.error("[auth/callback] verifyOtp failed:", error.message);
    }
  }

  // Something went wrong — send back to login with an error hint.
  return NextResponse.redirect(`${origin}/auth/login?error=auth-callback-error`);
}
