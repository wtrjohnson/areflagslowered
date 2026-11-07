import type { MetadataRoute } from "next";
import { jurisdictionCatalog } from "../lib/jurisdictions.ts";
import { siteOrigin } from "../lib/site-url.ts";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  const lastModified = new Date("2026-11-07T00:00:00.000Z");
  return [
    { url: origin, lastModified, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/privacy`, lastModified, changeFrequency: "monthly", priority: 0.4 },
    ...jurisdictionCatalog.map((jurisdiction) => ({
      url: `${origin}/${jurisdiction.slug}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
