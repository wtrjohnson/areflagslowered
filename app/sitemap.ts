import type { MetadataRoute } from "next";
import { jurisdictionCatalog } from "../lib/jurisdictions.ts";
import { siteOrigin } from "../lib/site-url.ts";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  return [
    { url: origin, changeFrequency: "daily", priority: 1 },
    ...jurisdictionCatalog.map((jurisdiction) => ({
      url: `${origin}/${jurisdiction.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
