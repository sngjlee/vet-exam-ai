import type { MetadataRoute } from "next";
import { getIndexingEnabled, getSiteUrl, ROBOTS_PRIVATE_PATHS } from "../lib/seo";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  const indexingEnabled = getIndexingEnabled();

  if (!indexingEnabled) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
      host: siteUrl.origin,
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ROBOTS_PRIVATE_PATHS,
    },
    host: siteUrl.origin,
  };
}
