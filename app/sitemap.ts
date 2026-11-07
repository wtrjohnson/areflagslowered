import type { MetadataRoute } from "next";
import { jurisdictionCatalog } from "../lib/jurisdictions.ts";
import { siteOrigin } from "../lib/site-url.ts";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  const lastModified = new Date("2026-11-07T00:00:00.000Z");
  return [
    { url: origin, lastModified, changeFrequency: "daily", priority: 1 },
    ...["how-we-verify", "half-staff-vs-half-mast", "faq", "corrections", "privacy"].map((path) => ({ url: `${origin}/${path}`, lastModified, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...jurisdictionCatalog.map((jurisdiction) => ({
      url: `${origin}/${jurisdiction.slug}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
