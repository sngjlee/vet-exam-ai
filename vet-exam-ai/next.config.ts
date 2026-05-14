import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/comment-images/**",
          },
        ]
      : [],
  },
};

export default withSentryConfig(nextConfig, {
  org: "sngjlee",
  project: "javascript-nextjs",

  // SENTRY_AUTH_TOKEN env enables source-map upload during build.
  // Unset → upload is skipped, SDK still works at runtime.
  silent: !process.env.CI,

  // Upload all source maps in one pass after the build completes (Next.js 15.4.1+).
  useRunAfterProductionCompileHook: true,
});
