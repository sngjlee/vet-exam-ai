export const DEFAULT_SITE_URL = "https://vet-exam-ai.vercel.app";

export const ROBOTS_PRIVATE_PATHS = [
  "/admin",
  "/admin/*",
  "/api",
  "/api/*",
  "/auth",
  "/auth/*",
  "/settings",
  "/profile/me",
];

export function getSiteUrl(): URL {
  return new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : DEFAULT_SITE_URL),
  );
}

export function getIndexingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_INDEXING_ENABLED === "true";
}
