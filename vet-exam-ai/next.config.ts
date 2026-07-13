import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Vercel defaults prerendered/static responses to
          // "Access-Control-Allow-Origin: *"; pin it to our own origin so no
          // third-party site can read API/page responses cross-origin.
          {
            key: "Access-Control-Allow-Origin",
            value: "https://www.kvle.app",
          },
          // Block MIME sniffing — uploads (e.g. comment images) must be
          // served strictly as their declared Content-Type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // No page on this site is meant to be embedded in a frame —
          // both headers together cover legacy and modern browsers.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
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

  // Route Sentry traffic through our own domain so ad-blockers (uBlock, Brave,
  // Privacy Badger, …) don't drop client events. Path is intentionally opaque
  // because EasyPrivacy/Brave rules also pattern-match "monitoring",
  // "tracking", "analytics" on first-party domains. Next.js auto-proxies
  // this route to sentry.io.
  tunnelRoute: "/api/_qx",
});
